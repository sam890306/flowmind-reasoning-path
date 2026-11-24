// A stand-in for the real agent service. It plays sample campaigns through the lifecycle
// (create → provision → set up → research loop → finalize → verify → deliver), pushes every
// change to the console through POST /api/agent/ingest, and obeys the command queue.
// It doubles as a reference implementation of the agent side of the contract.
import { SEEDS, GENERIC, REASONS, RUN_SNIPPETS } from './sample-data.js'

let seed = 20261124
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (a) => a[Math.floor(rnd() * a.length)]
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('')
const pad = (n) => String(n).padStart(3, '0')

const ACTIVE = ['plan', 'implement', 'screen', 'promote']
const DUR = { plan: 5, implement: 11, screen: 8, promote: 7 }
const ROLE_OF = { plan: 'planner', implement: 'implementer', screen: 'reviewer', promote: 'agent2' }
const LIFE_DUR = { 1: 4, 2: 6, 3: 8, 5: 6, 6: 9 }
const PHASE = [null, 'create', 'provision', 'setup', 'research', 'finalize', 'verify', 'delivered']

const combine = (gs, dir = 'up') => dir === 'down' ? 1 - gs.reduce((a, g) => a * (1 - g), 1) : gs.reduce((a, g) => a * (1 + g), 1) - 1
const fmtVal = (m, g) => (m.dir === 'down' ? m.baseline * (1 - g) : m.baseline * (1 + g)).toLocaleString('en-US', { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }) + m.unit
const fmtDelta = (m, g) => { const s = (Math.abs(g) * 100).toFixed(1) + '%'; return m.dir === 'down' ? (g >= 0 ? '−' : '+') + s : (g >= 0 ? '+' : '−') + s }
const cpuRange = (slot) => `${8 + slot * 8}–${15 + slot * 8}`
const spentOf = (c) => Object.values(c.roles).reduce((a, b) => a + b, 0)

function ev(c, src, text, extra = {}) {
  c.evn++
  c.out.events.push({ id: 'e' + c.evn, t: c.elapsed, src, text, kind: extra.kind, hyp: extra.hyp })
}
function charge(c, role, usd, status = 200, hyp) {
  if (status === 200) c.roles[role] += usd
  c.out.usage.push({ id: hex(10), role, hyp, tokens: Math.round(usd * 5200 + rnd() * 900), usd: Math.round(usd * 1e4) / 1e4, status })
}

function mk(s) {
  return {
    id: s.id, name: s.name, repo: s.repo, sha: s.sha || hex(7), goal: s.goal, metric: s.metric, owner: s.owner,
    node: s.node, job: s.job, gpus: s.gpus, cap: s.cap, clockH: s.clockH, slot: s.slot ?? null,
    elapsed: 0, life: 1, lifeP: 0, fired: 0, paused: false, roles: { agent2: 0, planner: 0, implementer: 0, reviewer: 0 },
    hyps: [], queue: (s.hyps || []).map((x) => ({ ...x })), generic: s.generic ?? 5, n: 0, evn: s.evn || 0,
    best: 0, verified: null, verifiedFix: s.verifiedFix, ask: s.ask, asked: false, diff: s.diff, par: 3,
    act: 'Uploading repo snapshot', stopWhy: null, evalSha: hex(4) + '…' + hex(4),
    out: { events: [], usage: [], questions: [] }, sent: { state: {}, hyps: {}, logs: {} },
  }
}

const SCRIPT = {
  1: (c) => [[0.3, 'service', `Repo snapshot received · ${c.repo}@${c.sha}`], [0.8, 'broker', `Slurm job ${c.job} checked: owner, ${c.gpus} GPU, end time`]],
  2: (c) => [[0.2, 'agentd', `Framework clone on branch campaign/${c.id}`], [0.55, 'agentd', 'venvs, namespace sandbox and run box ready'], [0.9, 'agentd', `CPU slot leased · CPUs ${cpuRange(c.slot ?? 0)}`]],
  3: (c) => [[0.2, 'agent2', 'Manifest written: build, test and measure commands'], [0.55, 'agent2', `Evaluator frozen · sha256 ${c.evalSha}`], [0.95, 'engine', `Baseline measured: ${fmtVal(c.metric, 0)}`]],
  5: (c) => [[0.3, 'engine', `Final review of ${c.hyps.filter((x) => x.stage === 'kept').length} promoted changes`], [0.9, 'agentd', 'Candidate patch assembled from the campaign branch']],
  6: (c) => [[0.15, 'verifier', 'Clean checkout, branch code never imported'], [0.45, 'verifier', `Held-out data copied to ${c.node} for this run only`], [0.8, 'verifier', 'Re-measuring the final patch']],
}

function advanceLife(c) {
  c.lifeP += 1 / LIFE_DUR[c.life]
  const script = SCRIPT[c.life](c)
  while (c.fired < script.length && c.lifeP >= script[c.fired][0]) {
    ev(c, script[c.fired][1], script[c.fired][2], { kind: 'life' })
    c.act = script[c.fired][2]
    c.fired++
  }
  if (c.life >= 5) charge(c, 'agent2', 0.08 + rnd() * 0.1)
  if (c.lifeP < 1) return
  c.lifeP = 0; c.fired = 0
  if (c.life === 6) {
    c.verified = c.best > 0 ? (c.verifiedFix ?? c.best * (0.95 + rnd() * 0.04)) : 0
    c.life = 7
    ev(c, 'verifier', `Verified on held-out data: ${fmtVal(c.metric, c.verified)} (${fmtDelta(c.metric, c.verified)})`, { kind: 'verified' })
    ev(c, 'service', 'Patch and REPORT.md published to the teammate', { kind: 'life' })
    c.act = 'Delivered'
    return
  }
  c.life++
  if (c.life === 4) c.act = 'Research loop running'
}

function propose(c, tpl) {
  const n = ++c.n
  const hy = {
    ...tpl, n, id: 'H-' + pad(n), parent: tpl.par ? 'H-' + pad(tpl.par) : null, stage: 'idea', p: 0,
    marks: { idea: c.elapsed }, screen: null, prom: null, commit: hex(7),
    workers: { plan: 'planner-' + (1 + (n % 2)), implement: 'implementer-' + (1 + (n % 3)), screen: 'reviewer-1', promote: 'agent2' },
  }
  c.hyps.push(hy)
  ev(c, 'agent2', `Idea ${hy.id}: ${hy.t}`, { hyp: hy.id, kind: 'idea' })
}

function discard(c, hy, at) {
  hy.rejAt = at; hy.stage = 'discarded'; hy.p = 1; hy.marks.end = c.elapsed
  const r = REASONS[hy.fate]
  ev(c, hy.fate === 'BUDGET' ? 'proxy' : hy.fate === 'EVALUATOR' ? 'agentd' : 'engine', `${hy.id} discarded · ${r.label}`, { hyp: hy.id, kind: 'discard' })
  if (hy.fate === 'BUDGET') charge(c, 'implementer', 31.4, 402, hy.id)
  if (hy.rej?.lesson) ev(c, 'agent2', `Lesson from ${hy.id}: ${hy.rej.lesson}`, { hyp: hy.id, kind: 'lesson' })
}

function transition(c, hy) {
  const m = c.metric
  hy.p = 0
  if (hy.stage === 'plan') {
    hy.stage = 'implement'; hy.marks.implement = c.elapsed
    ev(c, 'engine', `${hy.id} plan approved by ${hy.workers.screen}; ${hy.workers.implement} is building it`, { hyp: hy.id })
  } else if (hy.stage === 'implement') {
    if (['BUILD', 'EVALUATOR', 'BUDGET'].includes(hy.fate)) return discard(c, hy, 'implement')
    hy.stage = 'screen'; hy.marks.screen = c.elapsed
    ev(c, 'broker', `${hy.id} committed ${hy.commit}; SSH session to ${c.node} for check, correctness, collect`, { hyp: hy.id })
  } else if (hy.stage === 'screen') {
    if (hy.g != null) hy.screen = hy.g
    if (REASONS[hy.fate]?.at === 'screen') return discard(c, hy, 'screen')
    hy.stage = 'promote'; hy.marks.promote = c.elapsed
    ev(c, 'engine', `${hy.id} screening ${fmtDelta(m, hy.screen)}; queued for isolated re-measurement`, { hyp: hy.id, kind: 'screening' })
  } else if (hy.stage === 'promote') {
    hy.prom = hy.gp
    if (hy.fate === 'NOT_REPRODUCED') return discard(c, hy, 'promote')
    hy.stage = 'kept'; hy.p = 1; hy.marks.end = c.elapsed
    c.best = combine(c.hyps.filter((x) => x.stage === 'kept').map((x) => x.prom), m.dir)
    ev(c, 'engine', `${hy.id} promoted at ${fmtDelta(m, hy.prom)}. Campaign best is now ${fmtVal(m, c.best)}`, { hyp: hy.id, kind: 'promoted' })
  }
}

function toFinalize(c, why) {
  c.hyps.filter((x) => ACTIVE.includes(x.stage) || x.stage === 'idea').forEach((x) => {
    x.fate = 'CUT'; x.rej = { d: `The campaign moved to finalize (${why}) before this idea finished.`, ev: [['Reached', x.stage]], lesson: null }
    x.rejAt = x.stage; x.stage = 'discarded'; x.marks.end = c.elapsed
  })
  c.queue = []; c.generic = 0; c.life = 5; c.lifeP = 0; c.fired = 0; c.stopWhy = why
  ev(c, 'agentd', `Research loop closed: ${why}. Finalizing.`, { kind: 'life' })
  c.act = 'Final review'
}

function research(c) {
  const ideas = () => c.hyps.filter((x) => x.stage === 'idea')
  while (ideas().length < 2 && (c.queue.length || c.generic > 0)) {
    if (c.queue.length) propose(c, c.queue.shift())
    else { c.generic--; propose(c, { ...GENERIC[c.n % GENERIC.length] }) }
  }
  const active = c.hyps.filter((x) => ACTIVE.includes(x.stage))
  while (active.length < c.par && ideas().length) {
    const hy = ideas()[0]
    hy.stage = 'plan'; hy.marks.plan = c.elapsed
    active.push(hy)
  }
  if (!active.length) return toFinalize(c, 'idea queue exhausted')
  for (const hy of active) {
    hy.p += (1 / DUR[hy.stage]) * (0.7 + rnd() * 0.6)
    const usd = (hy.stage === 'implement' ? 0.5 : 0.22) * (0.6 + rnd() * 0.8) * (c.cap / 400)
    charge(c, ROLE_OF[hy.stage], usd, 200, hy.id)
    if (hy.p >= 1) transition(c, hy)
  }
  charge(c, 'agent2', 0.05 + rnd() * 0.08)
  const lead = active.find((x) => x.stage !== 'discarded' && x.stage !== 'kept') || active[0]
  c.act = { plan: 'Planning', implement: 'Implementing', screen: 'Screening', promote: 'Re-measuring', kept: 'Promoted', discarded: 'Reviewing' }[lead.stage] + ' ' + lead.id + ' · ' + lead.t
  if (c.ask && !c.asked && c.n >= c.ask.n) {
    c.asked = true
    c.out.questions.push({ id: 'q' + c.n, t: c.elapsed, text: c.ask.text, options: c.ask.opts })
    ev(c, 'agent2', 'Question for the teammate: ' + c.ask.text, { kind: 'question' })
  }
  if (c.pendingAck) {
    ev(c, 'agent2', `Steer received. Reprioritising and adding an idea for: “${c.pendingAck}”`, { kind: 'steer' })
    propose(c, { ...GENERIC[c.n % GENERIC.length], t: 'Teammate steer: ' + c.pendingAck, why: 'Requested by the teammate through a steer note.', par: null })
    c.pendingAck = null
  }
  const r = rnd()
  if (r < 0.1) ev(c, 'broker', `scontrol show job ${c.job} · ${Math.max(1, Math.round(c.clockH - c.elapsed / 3600))}h left · ${c.gpus} GPU ok`, { kind: 'ambient' })
  else if (r < 0.22) ev(c, 'tools', `MCP ${pick(RUN_SNIPPETS.tools)} · logged`, { kind: 'ambient' })
  if (spentOf(c) >= c.cap * 0.97) toFinalize(c, 'cost cap reached')
  else if (c.elapsed >= c.clockH * 3600 - 1800) toFinalize(c, 'deadline minus reserves')
}

function step(c) {
  if (c.life === 7 || c.paused) return
  c.elapsed += 45
  if (c.life === 4) research(c)
  else advanceLife(c)
}

/* ---------- run log per hypothesis ---------- */
function logLines(c, hy) {
  const f = hy.files?.[0]?.[0] || 'src/'
  const L = {
    plan: [`${hy.workers.plan} › reading profile and prior lessons`, `${hy.workers.plan} › drafting plan (${hy.plan.length} steps)`, `${hy.workers.screen} › plan review: approved`],
    implement: [`${hy.workers.implement} › sandbox up (no network, scoped token)`, `${hy.workers.implement} › editing ${f}`, `${hy.workers.implement} › unit tests: pass`, 'guard › diff checked against frozen evaluator manifest', `git › commit ${hy.commit} on campaign/${c.id}`],
    screen: [`ssh ${c.node} › remote_worker.py: host, boot id, job owner, GPUs ok`, 'stage=check › build ok', 'stage=correctness › comparing against reference', 'stage=collect (timed) › run 1/5', 'stage=collect (timed) › run 3/5', 'stage=collect (timed) › run 5/5', 'engine › status.json read back'],
    promote: [`lease › pinned to CPUs ${cpuRange(c.slot ?? 0)}`, 'isolated re-measurement › fresh baseline 1/3', 'isolated re-measurement › candidate 2/3', 'isolated re-measurement › candidate 3/3', 'engine › comparing against noise band'],
  }
  const out = []
  const cur = hy.stage === 'discarded' ? hy.rejAt : hy.stage
  for (const st of ACTIVE) {
    if (hy.marks[st] == null) break
    const done = hy.stage === 'kept' || hy.stage === 'discarded' || ACTIVE.indexOf(st) < ACTIVE.indexOf(cur)
    const n = done ? L[st].length : Math.max(1, Math.ceil(hy.p * L[st].length))
    L[st].slice(0, n).forEach((text) => out.push({ stage: st, text }))
  }
  if (hy.stage === 'discarded') out.push({ stage: 'end', text: `✗ ${REASONS[hy.fate].label}`, level: 'bad' })
  if (hy.stage === 'kept') out.push({ stage: 'end', text: `✓ promoted at ${fmtDelta(c.metric, hy.prom)}`, level: 'ok' })
  return out
}

/* ---------- internal state → ingest batch (only what changed since the last push) ---------- */
const apiHyp = (h) => ({
  id: h.id, parent: h.parent, title: h.t, why: h.why, plan: h.plan, files: h.files, stage: h.stage, progress: Math.min(1, h.p),
  marks: h.marks, screen: h.screen, promoted: h.prom, commit: h.commit, workers: h.workers,
  fate: h.stage === 'discarded' ? h.fate : null,
  rejection: h.stage === 'discarded' ? { at: h.rejAt, summary: h.rej?.d || '', evidence: h.rej?.ev || [], lesson: h.rej?.lesson || null } : null,
})

function report(c) {
  const m = c.metric, kept = c.hyps.filter((h) => h.stage === 'kept'), dead = c.hyps.filter((h) => h.stage === 'discarded')
  return [`# REPORT · ${c.name}`, '', `Goal: ${c.goal}`, `Repo: ${c.repo}@${c.sha} · branch campaign/${c.id}`, '', '## Verified result',
    `${m.label}: ${fmtVal(m, 0)} → ${fmtVal(m, c.verified)} (${fmtDelta(m, c.verified)})`, 'Measured by the trusted verifier on a clean checkout with held-out data.', '',
    `## What is in the patch (${kept.length})`, ...kept.map((h) => `- ${h.id} ${h.t} · promoted ${fmtDelta(m, h.prom)}`), '',
    `## What was tried and dropped (${dead.length})`, ...dead.map((h) => `- ${h.id} ${h.t} · ${REASONS[h.fate].label}`), '',
    '## Run', `${c.hyps.length} hypotheses · $${spentOf(c).toFixed(2)} of $${c.cap} · closed: ${c.stopWhy}`].join('\n')
}

function batchFor(c, owner) {
  const full = {
    name: c.name, repo: c.repo, sha: c.sha, goal: c.goal, metric: c.metric, owner, node: c.node, job: String(c.job), gpus: c.gpus, cap: c.cap,
    clockH: c.clockH, par: c.par, phase: PHASE[c.life], phaseProgress: c.life === 4 ? 0.5 : c.lifeP, paused: c.paused, activity: c.act,
    stopWhy: c.stopWhy, evalSha: c.life >= 3 ? c.evalSha : null, elapsed: c.elapsed, verified: c.verified,
    ...(c.life === 7 ? { patch: c.diff || null, report: report(c) } : {}),
  }
  if (owner == null) delete full.owner
  const state = {}
  for (const [k, v] of Object.entries(full)) {
    const j = JSON.stringify(v)
    if (c.sent.state[k] !== j) { state[k] = v; c.sent.state[k] = j }
  }
  const hypotheses = []
  const logs = []
  for (const h of c.hyps) {
    const doc = apiHyp(h), j = JSON.stringify(doc)
    if (c.sent.hyps[h.id] !== j) { hypotheses.push(doc); c.sent.hyps[h.id] = j }
    const lines = logLines(c, h), from = c.sent.logs[h.id] || 0
    lines.slice(from).forEach((l, i) => logs.push({ hyp: h.id, seq: from + i + 1, ...l }))
    c.sent.logs[h.id] = lines.length
  }
  const b = { campaign: c.id, state, hypotheses, events: c.out.events, logs, usage: c.out.usage, questions: c.out.questions }
  c.out = { events: [], usage: [], questions: [] }
  return b
}

const empty = (b) => !Object.keys(b.state).length && !b.hypotheses.length && !b.events.length && !b.logs.length && !b.usage.length && !b.questions.length

/** Split a large catch-up batch so each request stays small. State and hypotheses go last. */
function chunks(b, size = 300) {
  const out = []
  const n = Math.max(b.events.length, b.logs.length, b.usage.length)
  for (let i = 0; i + size < n; i += size) out.push({ campaign: b.campaign, state: i === 0 && b.state.name ? { name: b.state.name, owner: b.state.owner } : {}, events: b.events.slice(i, i + size), logs: b.logs.slice(i, i + size), usage: b.usage.slice(i, i + size) })
  const last = Math.floor(Math.max(0, n - 1) / size) * size
  out.push({ ...b, events: b.events.slice(last), logs: b.logs.slice(last), usage: b.usage.slice(last) })
  return out
}

export async function simulate(api, opts) {
  const interval = Number(opts.interval || 1500)
  const want = opts.seeds === 'none' ? [] : opts.seeds && opts.seeds !== 'all' ? SEEDS.filter((s) => String(opts.seeds).split(',').includes(s.id)) : SEEDS
  const owner = opts.owner || null
  const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a)
  const camps = []

  const push = async (c) => {
    const b = batchFor(c, c.external ? null : owner)
    if (empty(b)) return
    for (const part of chunks(b)) await api('POST', '/api/agent/ingest', part)
  }

  for (const s of want) {
    const c = mk(s)
    camps.push(c)
    if (s.warm === 'done') { let g = 0; while (c.life < 7 && g++ < 3000) step(c) }
    else for (let i = 0; i < s.warm; i++) step(c)
    await push(c)
    log(`seeded ${c.id} · ${PHASE[c.life]} · ${c.hyps.length} hypotheses`)
  }
  if (opts.once) return

  const handle = async (m) => {
    let c = camps.find((x) => x.id === m.campaign)
    const p = m.payload || {}
    if (m.type === 'create') {
      if (!c) {
        c = mk({ id: m.campaign, name: p.name, repo: p.repo, sha: p.sha, goal: p.goal, metric: p.metric, node: p.node || 'gpu-a100-07', job: p.job || 4814000 + Math.floor(rnd() * 900), gpus: p.gpus, cap: p.cap, clockH: p.clockH, slot: p.slot, hyps: [], generic: 9 })
        c.external = true
        camps.push(c)
      }
      return 'done'
    }
    if (!c) return ['rejected', 'this agent does not run that campaign']
    if (m.type === 'pause') { c.paused = true; c.sent.state.paused = 'true' }
    else if (m.type === 'resume') { c.paused = false; c.sent.state.paused = 'false' }
    else if (m.type === 'finalize') { if (c.life === 4) toFinalize(c, 'teammate asked'); else return ['rejected', 'not in the research loop'] }
    else if (m.type === 'steer') c.pendingAck = p.text
    else if (m.type === 'answer') ev(c, 'agent2', `Got it, going with “${p.option}”.`, { kind: 'steer' })
    else if (m.type === 'raise_cap') { c.cap = p.cap; c.sent.state.cap = JSON.stringify(p.cap) }
    return 'done'
  }

  log(`running ${camps.length} campaigns · tick ${interval} ms · Ctrl-C to stop`)
  for (;;) {
    try {
      const { commands } = await api('GET', '/api/agent/commands')
      for (const m of commands) {
        const r = await handle(m)
        const [status, note] = Array.isArray(r) ? r : [r]
        await api('POST', `/api/agent/commands/${m.id}/ack`, { status, note })
        log(`command #${m.id} ${m.type} ${m.campaign} → ${status}${note ? ' (' + note + ')' : ''}`)
      }
      for (const c of camps) {
        step(c)
        await push(c)
      }
    } catch (e) {
      log('retrying after error:', e.message)
    }
    await new Promise((r) => setTimeout(r, interval))
  }
}
