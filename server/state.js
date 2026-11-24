// Read side: everything the console renders, shaped per role.
import { q } from './db.js'
import { HttpError } from './auth.js'

const pubUser = (u, used, full) => ({
  id: u.id, name: u.name, handle: u.handle, role: u.role, picture: u.picture,
  ...(full ? { email: u.email, quota: u.quota_usd, maxActive: u.max_active, node: u.node, used: used || 0, status: u.status } : {}),
})

const pubCampaign = (c) => ({
  id: c.id, owner: c.owner_id, name: c.name, repo: c.repo, sha: c.sha, goal: c.goal, metric: c.metric, node: c.node, job: c.job, gpus: c.gpus,
  cap: c.cap_usd, clockH: c.clock_h, slot: c.slot, par: c.par, phase: c.phase, phaseProgress: c.phase_progress, status: c.status, paused: c.paused,
  activity: c.activity, stopWhy: c.stop_why, evalSha: c.eval_sha, elapsed: c.elapsed_s, best: c.best, screenTotal: c.screen_total, verified: c.verified,
  spend: c.spend, series: c.series, hasPatch: c.has_patch, hasReport: c.has_report, createdAt: c.created_at, updatedAt: c.updated_at, deliveredAt: c.delivered_at,
  hypotheses: [], questions: [], pendingCommands: 0,
})

const CAMP_COLS = `id, owner_id, name, repo, sha, goal, metric, node, job, gpus, cap_usd, clock_h, slot, par, phase, phase_progress, status, paused,
  activity, stop_why, eval_sha, elapsed_s, best, screen_total, verified, spend, series, created_at, updated_at, delivered_at,
  patch is not null as has_patch, report is not null as has_report`

export async function labInfo() {
  const [lab] = await q('select * from lab where id = 1')
  return { name: lab.name, slots: lab.slots, coresPerSlot: lab.cores_per_slot, cpuBase: lab.cpu_base, refusals: lab.refusals, agentSeenAt: lab.agent_seen_at, version: lab.version }
}

export async function buildState(user, sinceVersion) {
  const lab = await labInfo()
  if (sinceVersion != null && Number(sinceVersion) === lab.version) return { unchanged: true, version: lab.version, agentSeenAt: lab.agentSeenAt }
  const op = user.role === 'operator', full = user.role !== 'viewer'

  const [users, usedRows, camps, hyps, quests, pend] = await Promise.all([
    q(`select * from users where role <> 'pending' and status = 'active' order by created_at`),
    q(`select owner_id, sum(usd) as s from usage where status = 200 and at >= date_trunc('month', now()) group by 1`),
    q(`select ${CAMP_COLS} from campaigns order by created_at desc`),
    q('select campaign_id, doc from hypotheses order by campaign_id, n'),
    q('select campaign_id, qid, t, text, options, answer from questions order by at'),
    q(`select campaign_id, count(*)::int as k from commands where status = 'pending' group by 1`),
  ])
  const used = Object.fromEntries(usedRows.map((r) => [r.owner_id, r.s]))
  const byId = {}
  const campaigns = camps.map((c) => (byId[c.id] = pubCampaign(c)))
  for (const h of hyps) byId[h.campaign_id]?.hypotheses.push(h.doc)
  for (const x of quests) byId[x.campaign_id]?.questions.push({ id: x.qid, t: x.t, text: x.text, options: x.options, answer: x.answer })
  for (const p of pend) if (byId[p.campaign_id]) byId[p.campaign_id].pendingCommands = p.k

  const slots = Array(lab.slots).fill(null)
  for (const c of campaigns) if (c.slot != null && c.slot < lab.slots && c.phase !== 'delivered' && c.status === 'running') slots[c.slot] = c.id

  const mine = new Set(campaigns.filter((c) => c.owner === user.id).map((c) => c.id))
  const usage = (await q(
    `select call_id, campaign_id, role, tokens, usd, status, at from usage where ($1::boolean or owner_id = $2) order by at desc limit 40`, [op, user.id]))
    .map((l) => ({ id: l.call_id, campaign: l.campaign_id, role: l.role, tokens: l.tokens, usd: l.usd, status: l.status, at: l.at }))
  const [{ k: refusedCalls }] = await q(`select count(*)::int as k from usage where status <> 200 and at >= date_trunc('month', now()) and ($1::boolean or owner_id = $2)`, [op, user.id])

  const tokens = (await q(
    `select t.id, t.name, t.scope, t.created_at, t.last_used_at, u.handle from tokens t join users u on u.id = t.user_id
      where t.revoked_at is null and ($1::boolean or t.user_id = $2) order by t.created_at desc`, [op, user.id]))
    .map((t) => ({ id: t.id, name: t.name, scope: t.scope, user: t.handle, createdAt: t.created_at, lastUsedAt: t.last_used_at }))

  return {
    version: lab.version, lab,
    me: pubUser(user, used[user.id], true),
    users: users.map((u) => pubUser(u, used[u.id], full || u.id === user.id)),
    enrollments: op ? (await q(`select * from users where role = 'pending' and status = 'active' order by created_at`))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, handle: u.handle, node: u.node, asked: u.asked, at: u.created_at })) : [],
    slots, campaigns, usage, refusedCalls, tokens,
    audit: op ? (await q('select id, who, text, campaign_id, at from audit order by id desc limit 80')).map((a) => ({ id: a.id, who: a.who, text: a.text, campaign: a.campaign_id, at: a.at })) : [],
    mine: [...mine],
  }
}

export async function campaignDetail(id) {
  const [c] = await q('select id, left(patch, 20000) as excerpt, length(patch) as patch_len, report from campaigns where id = $1', [id])
  if (!c) throw new HttpError(404, 'No such campaign')
  const [events, logs] = await Promise.all([
    q(`select seq, t, src, kind, text, hyp from (select * from events where campaign_id = $1 order by seq desc limit 500) e order by seq`, [id]),
    q(`select hid, stage, text, level from (select * from hyp_logs where campaign_id = $1 order by at desc, seq desc limit 4000) l order by hid, seq`, [id]),
  ])
  const byHyp = {}
  for (const l of logs) (byHyp[l.hid] ||= []).push({ stage: l.stage, text: l.text, level: l.level })
  return {
    id, events: events.map((e) => ({ id: e.seq, t: e.t, src: e.src, kind: e.kind, text: e.text, hyp: e.hyp })),
    logs: byHyp, patchExcerpt: c.excerpt, patchTruncated: c.patch_len > 20000, report: c.report,
  }
}

export async function artifact(id, which) {
  const col = which === 'patch' ? 'patch' : 'report'
  const [c] = await q(`select ${col} as body from campaigns where id = $1`, [id])
  if (!c) throw new HttpError(404, 'No such campaign')
  if (c.body == null) throw new HttpError(404, `The ${which} has not been delivered yet`)
  return c.body
}
