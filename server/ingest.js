// Agent → console. One idempotent batch endpoint plus the command queue the agent polls.
import { tx, q, bump } from './db.js'
import { HttpError } from './auth.js'

export const PHASES = ['create', 'provision', 'setup', 'research', 'finalize', 'verify', 'delivered']
const STAGES = ['idea', 'plan', 'implement', 'screen', 'promote', 'kept', 'discarded']
const TIMED = ['plan', 'implement', 'screen', 'promote']
const str = (v, max = 4000) => (v == null ? null : String(v).slice(0, max))
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export const combine = (gs, dir = 'up') =>
  dir === 'down' ? 1 - gs.reduce((a, g) => a * (1 - g), 1) : gs.reduce((a, g) => a * (1 + g), 1) - 1

// API field → column, with a coercion. Only fields present in the batch are written.
const STATE_COLS = {
  name: ['name', (v) => str(v, 200)], repo: ['repo', (v) => str(v, 500)], sha: ['sha', (v) => str(v, 80)], goal: ['goal', str],
  metric: ['metric', (v) => JSON.stringify(v)], node: ['node', (v) => str(v, 120)], job: ['job', (v) => str(v, 60)], gpus: ['gpus', num],
  cap: ['cap_usd', num], clockH: ['clock_h', num], slot: ['slot', num], par: ['par', num], phaseProgress: ['phase_progress', num],
  paused: ['paused', Boolean], activity: ['activity', (v) => str(v, 500)], stopWhy: ['stop_why', (v) => str(v, 500)],
  evalSha: ['eval_sha', (v) => str(v, 120)], elapsed: ['elapsed_s', num], screenTotal: ['screen_total', num], verified: ['verified', num],
  patch: ['patch', (v) => str(v, 3_000_000)], report: ['report', (v) => str(v, 1_000_000)],
}

export async function freeSlot(run) {
  const [lab] = await run('select slots from lab where id = 1')
  const used = new Set((await run(`select slot from campaigns where slot is not null and phase <> 'delivered' and status = 'running'`)).map((r) => r.slot))
  for (let i = 0; i < lab.slots; i++) if (!used.has(i)) return i
  return null
}

export async function applyBatch(auth, body) {
  const id = str(body?.campaign, 80)
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new HttpError(400, '"campaign" must be an id like "pandas-7f3a"')
  const state = body.state || {}
  const counts = { hypotheses: 0, events: 0, logs: 0, usage: 0, questions: 0 }

  await tx(async (run) => {
    let [c] = await run('select * from campaigns where id = $1 for update', [id])
    if (!c) {
      if (!state.name) throw new HttpError(404, `Unknown campaign "${id}". Send state.name (and state.owner) to register it.`)
      let owner = auth.user
      if (state.owner) {
        const [u] = await run('select * from users where lower(email) = lower($1) or handle = $1 or id = $1', [String(state.owner)])
        if (!u) throw new HttpError(400, `state.owner "${state.owner}" is not an enrolled user (use their email or handle)`)
        owner = u
      }
      const slot = state.slot ?? (await freeSlot(run))
      ;[c] = await run('insert into campaigns (id, owner_id, name, slot) values ($1,$2,$3,$4) returning *', [id, owner.id, str(state.name, 200), slot])
      await run('insert into audit (who, text, campaign_id) values ($1,$2,$3)', ['agent', `registered ${id} for ${owner.handle}`, id])
    }

    /* campaign state */
    const sets = [], vals = [id]
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
    for (const [k, [col, coerce]] of Object.entries(STATE_COLS)) if (state[k] !== undefined) set(col, coerce(state[k]))
    if (state.status !== undefined) {
      if (!['running', 'failed', 'cancelled'].includes(state.status)) throw new HttpError(400, 'state.status must be running, failed or cancelled')
      set('status', state.status)
    }
    if (state.phase !== undefined) {
      if (!PHASES.includes(state.phase)) throw new HttpError(400, `state.phase must be one of ${PHASES.join(', ')}`)
      set('phase', state.phase)
      if (state.phase !== c.phase && state.phaseProgress === undefined) set('phase_progress', 0)
      if (state.phase === 'delivered' && c.phase !== 'delivered') sets.push('delivered_at = now()')
    }
    if (state.best !== undefined) { set('best', num(state.best) ?? 0); sets.push('best_reported = true') }
    const phase = state.phase ?? c.phase, status = state.status ?? c.status
    if ((phase === 'delivered' || status !== 'running') && state.slot === undefined) sets.push('slot = null')
    const elapsed = num(state.elapsed) ?? c.elapsed_s
    let series = c.series
    if (phase === 'research' && !series.length) series = [{ t: elapsed, best: 0 }]

    /* hypotheses: merge the patch into the stored document */
    let keptChanged = false
    for (const h of (body.hypotheses || []).slice(0, 200)) {
      const hid = str(h.id, 40)
      if (!hid) throw new HttpError(400, 'every hypothesis needs an "id"')
      if (h.stage && !STAGES.includes(h.stage)) throw new HttpError(400, `hypothesis ${hid}: stage must be one of ${STAGES.join(', ')}`)
      const [row] = await run('select doc from hypotheses where campaign_id = $1 and hid = $2', [id, hid])
      const old = row?.doc
      let n = old?.n
      if (!n) {
        n = Number(/(\d+)$/.exec(hid)?.[1])
        if (!n) n = (await run('select count(*)::int as k from hypotheses where campaign_id = $1', [id]))[0].k + 1
      }
      const doc = {
        id: hid, n, parent: null, title: hid, why: '', plan: [], files: [], stage: 'idea', progress: 0, cost: 0,
        marks: {}, screen: null, promoted: null, commit: null, workers: {}, fate: null, rejection: null,
        ...old, ...h, id: hid, n,
        marks: { ...old?.marks, ...h.marks }, workers: { ...old?.workers, ...h.workers },
        rejection: h.rejection || old?.rejection ? { ...old?.rejection, ...h.rejection } : null,
      }
      if (doc.marks.idea == null) doc.marks.idea = elapsed
      if (!old || old.stage !== doc.stage) {
        if (TIMED.includes(doc.stage) && h.marks?.[doc.stage] == null) doc.marks[doc.stage] = elapsed
        if (h.progress === undefined) doc.progress = 0
        if (doc.stage === 'kept' || doc.stage === 'discarded') {
          if (h.marks?.end == null) doc.marks.end = elapsed
          doc.progress = 1
        }
        if (doc.stage === 'discarded') {
          doc.rejection = { at: old && TIMED.includes(old.stage) ? old.stage : 'screen', summary: '', evidence: [], lesson: null, ...doc.rejection }
          doc.fate = doc.fate || 'NO_GAIN'
        }
        if (doc.stage === 'kept' || old?.stage === 'kept') keptChanged = true
      } else if (doc.stage === 'kept' && h.promoted !== undefined) keptChanged = true
      await run(
        `insert into hypotheses (campaign_id, hid, n, stage, doc) values ($1,$2,$3,$4,$5)
         on conflict (campaign_id, hid) do update set stage = excluded.stage, doc = excluded.doc, updated_at = now()`,
        [id, hid, n, doc.stage, JSON.stringify(doc)])
      counts.hypotheses++
    }

    /* derived score: compound the promoted gains unless the agent reports "best" itself */
    if (keptChanged) {
      const kept = (await run(`select doc from hypotheses where campaign_id = $1 and stage = 'kept' order by n`, [id])).map((r) => r.doc)
      const metric = state.metric || c.metric
      set('screen_total', combine(kept.map((k) => k.screen ?? 0), metric.dir))
      if (!c.best_reported && state.best === undefined) {
        const best = combine(kept.map((k) => k.promoted ?? 0), metric.dir)
        set('best', best)
        const last = [...kept].sort((a, b) => (b.marks.end ?? 0) - (a.marks.end ?? 0))[0]
        series = [...series, { t: elapsed, best, hyp: last?.id }]
      }
    }
    if (state.best !== undefined && series[series.length - 1]?.best !== num(state.best)) series = [...series, { t: elapsed, best: num(state.best) ?? 0 }]
    if (Array.isArray(body.series)) series = body.series.map((p) => ({ t: num(p.t) ?? 0, best: num(p.best) ?? 0, hyp: p.hyp }))
    if (series !== c.series) set('series', JSON.stringify(series.slice(-500)))

    /* feed events: seq is assigned here; an optional "id" makes a re-sent event a no-op */
    let seq = c.event_seq
    for (const e of (body.events || []).slice(0, 500)) {
      if (!e.text) continue
      const r = await run(
        `insert into events (campaign_id, seq, key, t, src, kind, text, hyp) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (campaign_id, key) where key is not null do nothing returning seq`,
        [id, seq + 1, str(e.id, 80), num(e.t) ?? elapsed, str(e.src, 40) || 'service', str(e.kind, 40), str(e.text, 2000), str(e.hyp, 40)])
      if (r.length) { seq++; counts.events++ }
    }
    if (seq !== c.event_seq) set('event_seq', seq)

    /* per-hypothesis run log */
    const logSeq = {}
    for (const l of (body.logs || []).slice(0, 1000)) {
      const hid = str(l.hyp, 40)
      if (!hid || !l.text) continue
      if (logSeq[hid] == null) logSeq[hid] = (await run('select coalesce(max(seq), 0) as m from hyp_logs where campaign_id = $1 and hid = $2', [id, hid]))[0].m
      const s = num(l.seq) ?? ++logSeq[hid]
      logSeq[hid] = Math.max(logSeq[hid], s)
      const r = await run(
        `insert into hyp_logs (campaign_id, hid, seq, stage, text, level) values ($1,$2,$3,$4,$5,$6) on conflict do nothing returning seq`,
        [id, hid, s, str(l.stage, 40), str(l.text, 2000), str(l.level, 10)])
      counts.logs += r.length
    }

    /* model-proxy usage → spend by role, cost per hypothesis */
    const spend = { ...c.spend }
    let spendChanged = false
    for (const u of (body.usage || []).slice(0, 1000)) {
      const callId = str(u.id, 80)
      if (!callId) throw new HttpError(400, 'every usage row needs a unique "id" (the proxy call id)')
      const usd = num(u.usd) ?? 0, status = num(u.status) ?? 200, role = str(u.role, 40) || 'agent2'
      const r = await run(
        `insert into usage (campaign_id, call_id, owner_id, role, hyp, tokens, usd, status) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning call_id`,
        [id, callId, c.owner_id, role, str(u.hyp, 40), num(u.tokens) ?? 0, usd, status])
      if (!r.length) continue
      counts.usage++
      if (status !== 200) continue
      spend[role] = (spend[role] || 0) + usd; spendChanged = true
      if (u.hyp) await run(
        `update hypotheses set doc = jsonb_set(doc, '{cost}', to_jsonb(coalesce((doc->>'cost')::float8, 0) + $3::float8)) where campaign_id = $1 and hid = $2`,
        [id, u.hyp, usd])
    }
    if (spendChanged) set('spend', JSON.stringify(spend))

    /* questions from Agent 2 */
    for (const qu of (body.questions || []).slice(0, 50)) {
      const qid = str(qu.id, 40)
      if (!qid || !qu.text) throw new HttpError(400, 'every question needs "id" and "text"')
      const r = await run(
        `insert into questions (campaign_id, qid, t, text, options) values ($1,$2,$3,$4,$5) on conflict do nothing returning qid`,
        [id, qid, num(qu.t) ?? elapsed, str(qu.text, 1000), JSON.stringify((qu.options || []).map((o) => str(o, 200)))])
      counts.questions += r.length
    }

    sets.push('updated_at = now()')
    await run(`update campaigns set ${sets.join(', ')} where id = $1`, vals)
    await run('update lab set agent_seen_at = now() where id = 1')
    await bump(run)
  })
  return { ok: true, campaign: id, applied: counts }
}

/* ---------- command queue: console → agent ---------- */
export async function pendingCommands({ campaign, limit = 50 } = {}) {
  await q('update lab set agent_seen_at = now() where id = 1')
  const rows = await q(
    `select m.id, m.campaign_id, m.type, m.payload, m.created_at, u.handle as issued_by
       from commands m left join users u on u.id = m.issued_by
      where m.status = 'pending' and ($1::text is null or m.campaign_id = $1) order by m.id limit $2`,
    [campaign || null, Math.min(Number(limit) || 50, 200)])
  return rows.map((r) => ({ id: r.id, campaign: r.campaign_id, type: r.type, payload: r.payload, issuedBy: r.issued_by, createdAt: r.created_at }))
}

export async function ackCommand(id, { status = 'done', note } = {}) {
  if (!['done', 'rejected'].includes(status)) throw new HttpError(400, 'status must be "done" or "rejected"')
  return tx(async (run) => {
    const [m] = await run(`update commands set status = $2, note = $3, acked_at = now() where id = $1 and status = 'pending' returning *`, [Number(id), status, str(note, 500)])
    if (!m) throw new HttpError(404, 'No pending command with that id')
    if (status === 'rejected') {
      const [c] = await run('update campaigns set event_seq = event_seq + 1 where id = $1 returning event_seq, elapsed_s', [m.campaign_id])
      if (c) await run(
        `insert into events (campaign_id, seq, t, src, kind, text) values ($1,$2,$3,'agentd','life',$4)`,
        [m.campaign_id, c.event_seq, c.elapsed_s, `Could not ${m.type.replace('_', ' ')}: ${note || 'rejected by agentd'}`])
      if (m.type === 'create') await run(`update campaigns set status = 'failed', slot = null, stop_why = $2, activity = 'Refused by agentd' where id = $1`, [m.campaign_id, str(note, 500) || 'refused by agentd'])
      if (m.type === 'pause' || m.type === 'resume') await run('update campaigns set paused = $2 where id = $1', [m.campaign_id, m.type === 'resume'])
    }
    await bump(run)
    return { ok: true }
  })
}
