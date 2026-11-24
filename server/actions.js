// What signed-in people (browser session or user-scoped CLI token) can do.
import crypto from 'node:crypto'
import { tx, q, bump } from './db.js'
import { HttpError, DEFAULTS } from './auth.js'
import { freeSlot } from './ingest.js'

const audit = (run, who, text, camp) => run('insert into audit (who, text, campaign_id) values ($1,$2,$3)', [who, text, camp || null])

async function event(run, c, text, kind = 'you', src = 'you') {
  const [r] = await run('update campaigns set event_seq = event_seq + 1, updated_at = now() where id = $1 returning event_seq', [c.id])
  await run('insert into events (campaign_id, seq, t, src, kind, text) values ($1,$2,$3,$4,$5,$6)', [c.id, r.event_seq, c.elapsed_s, src, kind, text])
}
const command = (run, c, user, type, payload = {}) =>
  run('insert into commands (campaign_id, type, payload, issued_by) values ($1,$2,$3,$4)', [c.id, type, JSON.stringify(payload), user.id])

export async function monthSpend(run, userId) {
  const [r] = await run(`select coalesce(sum(usd), 0) as s from usage where owner_id = $1 and status = 200 and at >= date_trunc('month', now())`, [userId])
  return r.s
}

export async function createCampaign(user, cfg) {
  if (!['member', 'operator'].includes(user.role)) throw new HttpError(403, 'Viewers can only read. Ask an operator for the Member role.')
  const name = String(cfg.name || '').trim(), repo = String(cfg.repo || '').trim(), goal = String(cfg.goal || '').trim()
  const cap = Number(cfg.cap), clockH = Number(cfg.clockH), gpus = Number(cfg.gpus || 0)
  if (!name || !repo || !goal) throw new HttpError(400, 'name, repo and goal are required')
  if (!(cap > 0)) throw new HttpError(400, 'cap must be a positive number of USD')
  if (!(clockH >= 4)) throw new HttpError(400, 'clockH must be at least 4 hours')
  return tx(async (run) => {
    await run('select 1 from lab where id = 1 for update') // serialise slot allocation
    const [lab] = await run('select slots from lab where id = 1')
    const slot = await freeSlot(run)
    if (slot == null) {
      await run('update lab set refusals = refusals + 1, version = version + 1 where id = 1')
      return { error: `All ${lab.slots} measurement slots are leased. The request was refused, not queued. Try again when a campaign delivers.`, status: 409 }
    }
    const [{ k: mine }] = await run(`select count(*)::int as k from campaigns where owner_id = $1 and phase <> 'delivered' and status = 'running'`, [user.id])
    if (mine >= user.max_active) return { error: `You already run ${mine} of ${user.max_active} allowed campaigns.`, status: 409 }
    const left = user.quota_usd - (await monthSpend(run, user.id))
    if (cap > left) return { error: `The cost cap is above what is left of your monthly quota ($${Math.max(0, left).toFixed(0)}).`, status: 409 }
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12).replace(/-$/, '') || 'campaign') + '-' + crypto.randomBytes(2).toString('hex')
    const metric = typeof cfg.metric === 'object' && cfg.metric
      ? { label: 'score', unit: '×', baseline: 1, dir: 'up', digits: 2, ...cfg.metric }
      : { label: String(cfg.metric || 'score'), unit: '×', baseline: 1, dir: 'up', digits: 2 }
    const [c] = await run(
      `insert into campaigns (id, owner_id, name, repo, sha, goal, metric, node, job, gpus, cap_usd, clock_h, slot, activity)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Waiting for agentd to pick up the request') returning *`,
      [id, user.id, name.slice(0, 200), repo.slice(0, 500), String(cfg.sha || '').slice(0, 80), goal.slice(0, 4000), JSON.stringify(metric),
        String(cfg.node || user.node || '').slice(0, 120), String(cfg.job || '').slice(0, 60), gpus, cap, clockH, slot])
    await event(run, c, `Campaign requested by ${user.name}`)
    await command(run, c, user, 'create', { name: c.name, repo: c.repo, sha: c.sha, goal: c.goal, metric, node: c.node, job: c.job, gpus, cap, clockH, slot, owner: user.handle })
    await audit(run, user.handle, 'created ' + id, id)
    await bump(run)
    return { id }
  })
}

const CONTROL = {
  async pause(run, c, user) {
    if (c.paused) return
    await run('update campaigns set paused = true where id = $1', [c.id])
    await event(run, c, `Paused by ${user.name}`); await command(run, c, user, 'pause'); await audit(run, user.handle, 'paused ' + c.id, c.id)
  },
  async resume(run, c, user) {
    if (!c.paused) return
    await run('update campaigns set paused = false where id = $1', [c.id])
    await event(run, c, `Resumed by ${user.name}`); await command(run, c, user, 'resume'); await audit(run, user.handle, 'resumed ' + c.id, c.id)
  },
  async finalize(run, c, user) {
    if (c.phase !== 'research') throw new HttpError(409, 'Finalize is available during the research loop.')
    await event(run, c, `${user.name} asked to finalize now`); await command(run, c, user, 'finalize'); await audit(run, user.handle, 'finalized ' + c.id, c.id)
  },
  async steer(run, c, user, { text }) {
    text = String(text || '').trim().slice(0, 1000)
    if (!text) throw new HttpError(400, 'text is required')
    await event(run, c, 'Note to Agent 2: ' + text); await command(run, c, user, 'steer', { text }); await audit(run, user.handle, 'sent a note to ' + c.id, c.id)
  },
  async answer(run, c, user, { question, option }) {
    const [qu] = await run('select * from questions where campaign_id = $1 and qid = $2', [c.id, String(question)])
    if (!qu) throw new HttpError(404, 'No such question')
    if (qu.answer) throw new HttpError(409, 'That question was already answered.')
    option = String(option || '').slice(0, 200)
    if (qu.options.length && !qu.options.includes(option)) throw new HttpError(400, 'option must be one of: ' + qu.options.join(' | '))
    await run('update questions set answer = $3, answered_by = $4, answered_at = now() where campaign_id = $1 and qid = $2', [c.id, qu.qid, option, user.id])
    await event(run, c, 'Answered: ' + option); await command(run, c, user, 'answer', { question: qu.qid, option })
  },
  async raise_cap(run, c, user, { by }) {
    by = Number(by)
    if (!(by > 0) || by > 10000) throw new HttpError(400, '"by" must be a positive number of USD')
    const [owner] = await run('select * from users where id = $1', [c.owner_id])
    const spent = Object.values(c.spend).reduce((a, b) => a + b, 0)
    const left = owner.quota_usd - (await monthSpend(run, owner.id)) - (c.cap_usd - spent)
    if (by > left && user.role !== 'operator') throw new HttpError(409, `Only $${Math.max(0, left).toFixed(0)} of the monthly quota is uncommitted.`)
    const cap = c.cap_usd + by
    await run('update campaigns set cap_usd = $2 where id = $1', [c.id, cap])
    await event(run, c, `Cost cap raised by $${by} to $${cap}`); await command(run, c, user, 'raise_cap', { by, cap }); await audit(run, user.handle, `raised cap of ${c.id} by $${by}`, c.id)
  },
}

export async function control(user, campaignId, action, payload = {}) {
  if (!CONTROL[action]) throw new HttpError(404, 'Unknown action')
  return tx(async (run) => {
    const [c] = await run('select * from campaigns where id = $1 for update', [campaignId])
    if (!c) throw new HttpError(404, 'No such campaign')
    if (user.role !== 'operator' && !(user.role === 'member' && c.owner_id === user.id))
      throw new HttpError(403, user.role === 'viewer' ? 'Viewers can only read.' : 'Members control only their own campaigns.')
    if (c.phase === 'delivered' || c.status !== 'running') throw new HttpError(409, 'This campaign is no longer running.')
    await CONTROL[action](run, c, user, payload)
    await bump(run)
    return { ok: true }
  })
}

/* ---------- operator: people ---------- */
const needOp = (user) => { if (user.role !== 'operator') throw new HttpError(403, 'Operators only.') }

export async function decideEnrollment(op, userId, { approve, role }) {
  needOp(op)
  return tx(async (run) => {
    const [u] = await run(`select * from users where id = $1 and role = 'pending' for update`, [userId])
    if (!u) throw new HttpError(404, 'No pending request for that user')
    if (!approve) {
      await run(`update users set status = 'denied' where id = $1`, [u.id])
      await audit(run, op.handle, 'denied enrollment of ' + u.handle)
    } else {
      role = ['viewer', 'member', 'operator'].includes(role) ? role : u.asked === 'viewer' ? 'viewer' : 'member'
      const d = DEFAULTS[role]
      await run('update users set role = $2, quota_usd = $3, max_active = $4 where id = $1', [u.id, role, d.quota, d.max])
      await audit(run, op.handle, `approved enrollment of ${u.handle} as ${role}`)
    }
    await bump(run)
    return { ok: true }
  })
}

export async function updateUser(op, userId, patch) {
  needOp(op)
  return tx(async (run) => {
    const [u] = await run('select * from users where id = $1 for update', [userId])
    if (!u) throw new HttpError(404, 'No such user')
    const sets = [], vals = [u.id], notes = []
    const set = (col, v, label) => { vals.push(v); sets.push(`${col} = $${vals.length}`); notes.push(`${label}=${v}`) }
    if (patch.role !== undefined) {
      if (!['viewer', 'member', 'operator'].includes(patch.role)) throw new HttpError(400, 'role must be viewer, member or operator')
      if (u.id === op.id) throw new HttpError(409, 'You cannot change your own role.')
      set('role', patch.role, 'role')
      if (patch.role === 'viewer') { set('quota_usd', 0, 'quota'); set('max_active', 0, 'maxActive') }
      else if (u.role === 'viewer' || u.role === 'pending') { set('quota_usd', DEFAULTS[patch.role].quota, 'quota'); set('max_active', DEFAULTS[patch.role].max, 'maxActive') }
    }
    if (patch.quota !== undefined) set('quota_usd', Math.max(0, Number(patch.quota) || 0), 'quota')
    if (patch.maxActive !== undefined) set('max_active', Math.max(0, Math.min(20, Number(patch.maxActive) || 0)), 'maxActive')
    if (patch.node !== undefined) set('node', String(patch.node).slice(0, 120), 'node')
    if (patch.handle !== undefined) {
      const handle = String(patch.handle).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)
      if (!handle) throw new HttpError(400, 'handle must use letters, digits, dot, dash or underscore')
      if ((await run('select 1 from users where handle = $1 and id <> $2', [handle, u.id])).length) throw new HttpError(409, 'That handle is taken.')
      set('handle', handle, 'handle')
    }
    if (patch.status !== undefined) {
      if (!['active', 'disabled'].includes(patch.status)) throw new HttpError(400, 'status must be active or disabled')
      if (u.id === op.id) throw new HttpError(409, 'You cannot disable yourself.')
      set('status', patch.status, 'status')
    }
    if (!sets.length) return { ok: true }
    await run(`update users set ${sets.join(', ')} where id = $1`, vals)
    await audit(run, op.handle, `updated ${u.handle}: ${notes.join(', ')}`)
    await bump(run)
    return { ok: true }
  })
}

export async function updateSelf(user, patch) {
  const node = patch.node !== undefined ? String(patch.node).slice(0, 120) : user.node
  const asked = user.role === 'pending' && ['viewer', 'member'].includes(patch.asked) ? patch.asked : user.asked
  await q('update users set node = $2, asked = $3 where id = $1', [user.id, node, asked])
  await q('update lab set version = version + 1 where id = 1')
  return { ok: true }
}

export async function revokeToken(user, tokenId) {
  const [t] = await q('select * from tokens where id = $1 and revoked_at is null', [tokenId])
  if (!t || (t.user_id !== user.id && user.role !== 'operator')) throw new HttpError(404, 'No such token')
  await q('update tokens set revoked_at = now() where id = $1', [t.id])
  await q('insert into audit (who, text) values ($1,$2)', [user.handle, 'revoked token ' + t.id])
  await q('update lab set version = version + 1 where id = 1')
  return { ok: true }
}
