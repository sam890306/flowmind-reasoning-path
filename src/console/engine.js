// Simulation engine: a small mutable store that replays the campaign lifecycle
// from the architecture (create → provision → set up → research loop → finalize → verify → deliver).
// Swap `tick` and the actions for real calls to the agent service to go live.
import { useSyncExternalStore } from 'react'
import { SEEDS, GENERIC, REASONS, USERS, ENROLLMENTS, RUN_SNIPPETS } from './data'

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

export const ACTIVE = ['plan', 'implement', 'screen', 'promote']
const DUR = { plan: 5, implement: 11, screen: 8, promote: 7 }
const ROLE_OF = { plan: 'planner', implement: 'implementer', screen: 'reviewer', promote: 'agent2' }
const ROLE_SHARE = { agent2: 0.2, planner: 0.2, implementer: 0.45, reviewer: 0.15 }
const LIFE_DUR = { 1: 4, 2: 6, 3: 8, 5: 6, 6: 9 }
export const SLOTS = 9

export const S = {
  role: 'operator', me: 'you', campaigns: [], users: USERS.map((u) => ({ ...u, used: 0, status: 'active' })),
  enrollments: ENROLLMENTS.map((e) => ({ ...e })), slots: Array(SLOTS).fill(null), ledger: [], audit: [],
  tokens: [], refusals: 0, wall: 0,
}

let version = 0
const subs = new Set()
const emit = () => { version++; subs.forEach((f) => f()) }
export function useSim() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version)
  return S
}

/* ---------- metric helpers ---------- */
export const combine = (gs, dir = 'up') => dir === 'down' ? 1 - gs.reduce((a, g) => a * (1 - g), 1) : gs.reduce((a, g) => a * (1 + g), 1) - 1
export function fmtVal(m, g) {
  const v = m.dir === 'down' ? m.baseline * (1 - g) : m.baseline * (1 + g)
  return v.toLocaleString('en-US', { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }) + m.unit
}
export function fmtDelta(m, g) {
  if (g == null) return '—'
  const s = (Math.abs(g) * 100).toFixed(1) + '%'
  const up = g >= 0
  return m.dir === 'down' ? (up ? '−' : '+') + s : (up ? '+' : '−') + s
}
export const spentOf = (c) => Object.values(c.roles).reduce((a, b) => a + b, 0)
export const tPlus = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export const userOf = (id) => S.users.find((u) => u.id === id) || { name: id, handle: id }
export const cpuRange = (slot) => `${8 + slot * 8}–${15 + slot * 8}`

/* ---------- permissions ---------- */
export function can(action, c) {
  const r = S.role
  if (r === 'operator') return true
  if (r === 'viewer') return false
  if (action === 'create' || action === 'download') return true
  if (action === 'control') return c && c.owner === S.me
  return false
}
export const whyNot = (action) =>
  S.role === 'viewer' ? 'Viewers can only read. Ask an operator for the Member role.'
    : action === 'control' ? 'Members control only their own campaigns.' : 'Operators only.'

/* ---------- events ---------- */
function ev(c, src, text, extra = {}) {
  c.evn = (c.evn || 0) + 1
  c.events.push({ id: c.evn, t: c.elapsed, src, text, ...extra })
  if (c.events.length > 500) c.events.shift()
}
function audit(who, text, c) {
  S.audit.unshift({ id: S.audit.length, t: S.wall, who, text, camp: c?.id })
  if (S.audit.length > 80) S.audit.pop()
}
function charge(c, role, usd, status = 200) {
  if (status === 200) {
    c.roles[role] += usd
    const u = S.users.find((x) => x.id === c.owner)
    if (u) u.used += usd
  }
  if (rnd() < 0.35 || status !== 200) {
    S.ledger.unshift({ id: hex(6), t: S.wall, camp: c.id, role, tok: Math.round(usd * 5200 + rnd() * 900), usd, status })
    if (S.ledger.length > 40) S.ledger.pop()
  }
}

/* ---------- campaign construction ---------- */
function mk(s) {
  return {
    id: s.id, name: s.name, repo: s.repo, sha: s.sha || hex(7), goal: s.goal, metric: s.metric, owner: s.owner,
    node: s.node, job: s.job, gpus: s.gpus, cap: s.cap, clockH: s.clockH, slot: null,
    elapsed: 0, life: 1, lifeP: 0, fired: 0, paused: false, status: 'running',
    roles: { agent2: 0, planner: 0, implementer: 0, reviewer: 0 },
    hyps: [], queue: s.hyps.map((x) => ({ ...x })), generic: s.generic ?? 5, n: 0,
    events: [], series: [], questions: [], best: 0, screenTotal: 0, verified: null, verifiedFix: s.verifiedFix,
    ask: s.ask, asked: false, diff: s.diff, par: 3, act: 'Uploading repo snapshot', stopWhy: null, evalSha: hex(4) + '…' + hex(4),
  }
}

const SCRIPT = {
  1: (c) => [[0.3, 'service', `Repo snapshot received · ${c.repo}@${c.sha}`], [0.8, 'broker', `Slurm job ${c.job} checked: owner, ${c.gpus} GPU, end time`]],
  2: (c) => [[0.2, 'agentd', `Framework clone on branch campaign/${c.id}`], [0.55, 'agentd', 'venvs, namespace sandbox and run box ready'], [0.9, 'agentd', `CPU slot leased · CPUs ${cpuRange(c.slot ?? 0)}`]],
  3: (c) => [[0.2, 'agent2', 'Manifest written: build, test and measure commands'], [0.55, 'agent2', `Evaluator frozen · sha256 ${c.evalSha}`], [0.95, 'engine', `Baseline measured: ${fmtVal(c.metric, 0)}`]],
  5: (c) => [[0.3, 'engine', `Final review of ${c.hyps.filter((x) => x.stage === 'kept').length} promoted changes`], [0.9, 'agentd', 'Candidate patch assembled from the campaign branch']],
  6: (c) => [[0.15, 'verifier', 'Clean checkout, branch code never imported'], [0.45, 'verifier', `Held-out data copied to ${c.node} for this run only`], [0.8, 'verifier', 'Re-measuring the final patch']],
}

function leaseSlot(c) {
  const i = S.slots.indexOf(null)
  if (i < 0) return false
  S.slots[i] = c.id; c.slot = i
  return true
}

function advanceLife(c) {
  const dur = LIFE_DUR[c.life]
  if (c.life === 2 && c.slot == null) leaseSlot(c)
  c.lifeP += 1 / dur
  const script = SCRIPT[c.life](c)
  while (c.fired < script.length && c.lifeP >= script[c.fired][0]) {
    ev(c, script[c.fired][1], script[c.fired][2], { kind: 'life' })
    c.act = script[c.fired][2]
    c.fired++
  }
  if (c.life >= 5) charge(c, 'agent2', 0.08 + rnd() * 0.1)
  if (c.lifeP < 1) return
  c.lifeP = 0; c.fired = 0
  if (c.life === 3) c.series.push({ t: c.elapsed, best: 0 })
  if (c.life === 6) {
    c.verified = c.best > 0 ? (c.verifiedFix ?? c.best * (0.95 + rnd() * 0.04)) : 0
    c.life = 7; c.status = 'delivered'; c.deliveredAt = c.elapsed
    if (c.slot != null) { S.slots[c.slot] = null; c.slot = null }
    ev(c, 'verifier', `Verified on held-out data: ${fmtVal(c.metric, c.verified)} (${fmtDelta(c.metric, c.verified)})`, { kind: 'verified' })
    ev(c, 'service', 'Patch and REPORT.md published to the teammate', { kind: 'life' })
    c.act = 'Delivered'
    return
  }
  c.life++
  if (c.life === 4) c.act = 'Research loop running'
}

function genericTpl(c) {
  c.generic--
  return { ...GENERIC[(c.n + c.generic) % GENERIC.length] }
}

function propose(c, tpl) {
  const n = ++c.n
  const hy = {
    ...tpl, n, id: 'H-' + pad(n), parent: tpl.par ? 'H-' + pad(tpl.par) : null, stage: 'idea', p: 0, cost: 0,
    marks: { idea: c.elapsed }, screen: null, prom: null, commit: hex(7),
    workers: { plan: 'planner-' + (1 + (n % 2)), implement: 'implementer-' + (1 + (n % 3)), screen: 'reviewer-1', promote: 'agent2' },
  }
  c.hyps.push(hy)
  ev(c, 'agent2', `Idea ${hy.id}: ${hy.t}`, { hyp: hy.id, kind: 'idea' })
}

function discard(c, hy, at) {
  hy.rejAt = at; hy.stage = 'discarded'; hy.p = 1; hy.marks.end = c.elapsed
  const r = REASONS[hy.fate]
  ev(c, hy.fate === 'BUDGET' ? 'proxy' : hy.fate === 'EVALUATOR' ? 'agentd' : 'engine',
    `${hy.id} discarded · ${r.label}`, { hyp: hy.id, kind: 'discard' })
  if (hy.fate === 'BUDGET') charge(c, 'implementer', 31.4, 402)
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
    const kept = c.hyps.filter((x) => x.stage === 'kept')
    c.best = combine(kept.map((x) => x.prom), m.dir)
    c.screenTotal = combine(kept.map((x) => x.screen), m.dir)
    c.series.push({ t: c.elapsed, best: c.best, hyp: hy.id })
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
  while (ideas().length < 2 && (c.queue.length || c.generic > 0)) propose(c, c.queue.length ? c.queue.shift() : genericTpl(c))
  let active = c.hyps.filter((x) => ACTIVE.includes(x.stage))
  while (active.length < c.par && ideas().length) {
    const hy = ideas()[0]
    hy.stage = 'plan'; hy.marks.plan = c.elapsed
    active.push(hy)
  }
  if (!active.length) return toFinalize(c, 'idea queue exhausted')
  for (const hy of active) {
    hy.p += (1 / DUR[hy.stage]) * (0.7 + rnd() * 0.6)
    const usd = (hy.stage === 'implement' ? 0.5 : 0.22) * (0.6 + rnd() * 0.8) * (c.cap / 400)
    hy.cost += usd
    charge(c, ROLE_OF[hy.stage], usd)
    if (hy.p >= 1) transition(c, hy)
  }
  charge(c, 'agent2', 0.05 + rnd() * 0.08)
  const lead = active.find((x) => x.stage !== 'discarded' && x.stage !== 'kept') || active[0]
  c.act = { plan: 'Planning', implement: 'Implementing', screen: 'Screening', promote: 'Re-measuring', kept: 'Promoted', discarded: 'Reviewing' }[lead.stage] + ' ' + lead.id + ' · ' + lead.t
  if (c.ask && !c.asked && c.n >= c.ask.n) {
    c.asked = true
    c.questions.push({ id: 'q' + c.n, t: c.elapsed, text: c.ask.text, opts: c.ask.opts, answer: null })
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

export function tick() {
  S.wall += 1
  S.campaigns.forEach(step)
  emit()
}

/* ---------- actions ---------- */
export const act = {
  setRole(r) { S.role = r; emit() },
  pause(c) { c.paused = !c.paused; ev(c, 'you', c.paused ? 'Paused by teammate' : 'Resumed by teammate', { kind: 'you' }); audit(S.role, (c.paused ? 'paused ' : 'resumed ') + c.id, c); emit() },
  finalize(c) { if (c.life === 4) { toFinalize(c, 'teammate asked'); audit(S.role, 'finalized ' + c.id, c); emit() } },
  steer(c, text) { ev(c, 'you', 'Note to Agent 2: ' + text, { kind: 'you' }); c.pendingAck = text; audit(S.role, 'sent a note to ' + c.id, c); emit() },
  answer(c, q, opt) { q.answer = opt; ev(c, 'you', 'Answered: ' + opt, { kind: 'you' }); ev(c, 'agent2', `Got it, going with “${opt}”.`, { kind: 'steer' }); emit() },
  raiseCap(c, by) { c.cap += by; ev(c, 'you', `Cost cap raised by $${by} to $${c.cap}`, { kind: 'you' }); audit(S.role, `raised cap of ${c.id} by $${by}`, c); emit() },
  create(cfg) {
    const me = userOf(S.me)
    const mine = S.campaigns.filter((c) => c.owner === S.me && c.life < 7).length
    if (S.slots.indexOf(null) < 0) { S.refusals++; emit(); return { error: 'All 9 measurement slots are leased. The request was refused, not queued. Try again when a campaign delivers.' } }
    if (mine >= me.maxActive) return { error: `You already run ${mine} of ${me.maxActive} allowed campaigns.` }
    const id = (cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12) || 'campaign') + '-' + hex(4)
    const c = mk({
      id, name: cfg.name, repo: cfg.repo, goal: cfg.goal, owner: S.me, node: cfg.node, job: Number(cfg.job) || 4814000 + Math.floor(rnd() * 900),
      gpus: Number(cfg.gpus), cap: Number(cfg.cap), clockH: Number(cfg.clockH), hyps: [], generic: 9,
      metric: { label: cfg.metric, unit: '×', baseline: 1, dir: 'up', digits: 2 },
    })
    S.campaigns.unshift(c)
    ev(c, 'you', 'Campaign created from the plugin: autoresearch create', { kind: 'you' })
    audit(S.role, 'created ' + id, c)
    emit()
    return { id }
  },
  enroll(e, ok) {
    S.enrollments = S.enrollments.filter((x) => x.id !== e.id)
    if (ok) {
      const viewer = e.asked.startsWith('Viewer')
      S.users.push({ id: e.handle, name: e.name, handle: e.handle, role: viewer ? 'viewer' : 'member', quota: viewer ? 0 : 800, maxActive: viewer ? 0 : 1, node: e.node, used: 0, status: 'active' })
      S.tokens.push({ id: 'tok_' + hex(6), user: e.handle, scope: 'v2 · campaigns:own', made: 'just now' })
    }
    audit('operator', (ok ? 'approved' : 'denied') + ' enrollment of ' + e.handle)
    emit()
  },
  setUser(u, patch) { Object.assign(u, patch); audit('operator', `updated ${u.handle}: ${Object.entries(patch).map(([k, v]) => k + '=' + v).join(', ')}`); emit() },
  revoke(t) { S.tokens = S.tokens.filter((x) => x.id !== t.id); audit('operator', 'revoked token ' + t.id); emit() },
}

/* ---------- derived: per-hypothesis log ---------- */
export function logFor(c, hy) {
  const f = hy.files?.[0]?.[0] || 'src/'
  const L = {
    plan: [`${hy.workers.plan} › reading profile and prior lessons`, `${hy.workers.plan} › drafting plan (${hy.plan.length} steps)`, `${hy.workers.screen} › plan review: approved`],
    implement: [`${hy.workers.implement} › sandbox up (no network, scoped token)`, `${hy.workers.implement} › editing ${f}`, `${hy.workers.implement} › unit tests: pass`, `guard › diff checked against frozen evaluator manifest`, `git › commit ${hy.commit} on campaign/${c.id}`],
    screen: [`ssh ${c.node} › remote_worker.py: host, boot id, job owner, GPUs ok`, 'stage=check › build ok', 'stage=correctness › comparing against reference', 'stage=collect (timed) › run 1/5', 'stage=collect (timed) › run 3/5', 'stage=collect (timed) › run 5/5', 'engine › status.json read back'],
    promote: [`lease › pinned to CPUs ${cpuRange(c.slot ?? 0)}`, 'isolated re-measurement › fresh baseline 1/3', 'isolated re-measurement › candidate 2/3', 'isolated re-measurement › candidate 3/3', 'engine › comparing against noise band'],
  }
  const order = ['plan', 'implement', 'screen', 'promote']
  const out = []
  const cur = hy.stage === 'discarded' ? hy.rejAt : hy.stage
  for (const st of order) {
    if (!hy.marks[st]) break
    const done = hy.stage === 'kept' || order.indexOf(st) < order.indexOf(cur) || hy.stage === 'discarded'
    const n = done ? L[st].length : Math.max(1, Math.ceil(hy.p * L[st].length))
    L[st].slice(0, n).forEach((x) => out.push({ st, x }))
  }
  if (hy.stage === 'discarded') out.push({ st: 'end', x: `✗ ${REASONS[hy.fate].label}`, bad: true })
  if (hy.stage === 'kept') out.push({ st: 'end', x: `✓ promoted at ${fmtDelta(c.metric, hy.prom)}`, ok: true })
  return out
}

/* ---------- boot: replay the seeds so the console opens mid-flight ---------- */
function boot() {
  for (const s of SEEDS) {
    const c = mk(s)
    S.campaigns.push(c)
    if (s.warm === 'done') { let g = 0; while (c.life < 7 && g++ < 3000) step(c) }
    else for (let i = 0; i < s.warm; i++) step(c)
  }
  S.users.forEach((u) => { u.used += { you: 310, mira: 420, jonas: 205, priya: 96 }[u.id] || 0 })
  S.users.filter((u) => u.role !== 'viewer').forEach((u) => S.tokens.push({ id: 'tok_' + hex(6), user: u.handle, scope: u.role === 'operator' ? 'v2 · lab:admin' : 'v2 · campaigns:own', made: pick(['3 days ago', '2 weeks ago', '5 weeks ago']) }))
  S.audit = []
  ;[['operator', 'set quota of praman to $800'], ['mokafor', 'created hnsw-22c9'], ['jlindqvist', 'created serve-a8d1'], ['operator', 'approved enrollment of jlindqvist']].forEach(([w, t]) => audit(w, t))
}
boot()
