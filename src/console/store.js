// Client store: polls the API, adapts its documents to the shapes the components render,
// and sends actions. Nothing here is simulated; with no data the console shows empty states.
import { useSyncExternalStore } from 'react'

export const ACTIVE = ['plan', 'implement', 'screen', 'promote']
const PHASES = ['enroll', 'create', 'provision', 'setup', 'research', 'finalize', 'verify', 'delivered']

export const S = {
  status: 'loading', // loading | signedout | pending | unconfigured | ready
  config: null, authError: null, online: true, toast: null,
  role: 'viewer', me: null, profile: null, lab: { name: 'AutoResearch', slots: 9, coresPerSlot: 8, cpuBase: 8 },
  campaigns: [], users: [], enrollments: [], slots: [], ledger: [], audit: [], tokens: [], refusals: 0, refusedCalls: 0, agentSeenAt: null,
}

let version = 0, serverVersion = null, openId = null, detailFor = null, detailVersion = null, timer = null, raw = null
const details = {}
const subs = new Set()
const emit = () => { version++; subs.forEach((f) => f()) }
export function useSim() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version)
  return S
}

async function call(method, path, body) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: { 'x-requested-with': 'autoresearch', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.code, data })
  return data
}

/* ---------- API documents → component shapes ---------- */
const adaptHyp = (h) => ({
  ...h, t: h.title, p: h.progress ?? 0, prom: h.promoted, cost: h.cost ?? 0, plan: h.plan || [], files: h.files || [], marks: h.marks || {}, workers: h.workers || {},
  rejAt: h.rejection?.at, rej: h.rejection ? { d: h.rejection.summary, ev: h.rejection.evidence || [], lesson: h.rejection.lesson } : null,
})
function adaptCampaign(c) {
  const d = details[c.id]
  return {
    ...c, life: PHASES.indexOf(c.phase), lifeP: c.phaseProgress, act: c.activity, hyps: c.hypotheses.map(adaptHyp),
    roles: { agent2: 0, planner: 0, implementer: 0, reviewer: 0, ...c.spend },
    questions: c.questions.map((x) => ({ ...x, opts: x.options || [] })),
    events: d?.events || [], logs: d?.logs || {}, diff: d?.patchExcerpt || null, diffTruncated: d?.patchTruncated, reportText: d?.report || null,
    over: c.status !== 'running', live: c.status === 'running' && c.phase !== 'delivered',
  }
}
function apply(state) {
  Object.assign(S, {
    status: 'ready', online: true, role: state.me.role, me: state.me.id, profile: state.me, lab: state.lab, agentSeenAt: state.lab.agentSeenAt,
    users: state.users.map((u) => ({ quota: 0, used: 0, maxActive: 0, node: '', ...u })),
    enrollments: state.enrollments, slots: state.slots, refusals: state.lab.refusals, refusedCalls: state.refusedCalls,
    ledger: state.usage.map((l) => ({ id: l.id, camp: l.campaign, role: l.role, tok: l.tokens, usd: l.usd, status: l.status, at: l.at })),
    audit: state.audit, tokens: state.tokens, campaigns: state.campaigns.map(adaptCampaign),
  })
}

async function refresh(force) {
  try {
    const st = await call('GET', '/state' + (serverVersion != null && !force ? '?v=' + serverVersion : ''))
    const changed = !st.unchanged
    if (changed) { serverVersion = st.version; raw = st }
    let detailChanged = false
    if (openId && (detailFor !== openId || detailVersion !== serverVersion)) {
      try { details[openId] = await call('GET', '/campaigns/' + encodeURIComponent(openId)); detailChanged = true } catch { /* the campaign may be gone */ }
      detailFor = openId; detailVersion = serverVersion
    }
    const wasOffline = !S.online
    S.online = true
    if ((changed || detailChanged) && raw) apply(raw)
    else if (S.agentSeenAt !== st.agentSeenAt && st.unchanged) S.agentSeenAt = st.agentSeenAt
    else if (!wasOffline) return
    emit()
  } catch (e) {
    if (e.status === 401) { stop(); S.status = 'signedout' }
    else if (e.code === 'pending') S.status = 'pending'
    else if (e.code === 'not_configured') { stop(); S.status = 'unconfigured'; S.config = e.data.config }
    else S.online = false
    emit()
  }
}

function stop() { clearInterval(timer); timer = null }
function start() {
  stop()
  timer = setInterval(() => { if (!document.hidden) refresh() }, 2000)
}

export async function boot() {
  const err = new URLSearchParams(location.search).get('auth_error')
  if (err) { S.authError = err; history.replaceState(null, '', location.pathname + location.hash) }
  try { S.config = await call('GET', '/config') } catch { S.config = null }
  try {
    S.profile = await call('GET', '/me')
    S.me = S.profile.id; S.role = S.profile.role
  } catch (e) {
    S.status = e.code === 'not_configured' ? 'unconfigured' : e.status === 401 ? 'signedout' : 'unconfigured'
    if (e.data?.config) S.config = e.data.config
    return emit()
  }
  if (S.profile.role === 'pending') S.status = 'pending'
  await refresh(true)
  start()
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) refresh() })
}

export function watchCampaign(id) {
  if (openId === id) return
  openId = id
  if (id && S.status === 'ready') refresh(true)
}

/* ---------- metric helpers ---------- */
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
export const userOf = (id) => S.users.find((u) => u.id === id) || { name: 'Former member', handle: 'unknown', quota: 0, used: 0, maxActive: 0 }
export const cpuRange = (slot) => `${S.lab.cpuBase + slot * S.lab.coresPerSlot}–${S.lab.cpuBase + (slot + 1) * S.lab.coresPerSlot - 1}`
export const ago = (iso) => {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`
}
export const agentUp = () => S.agentSeenAt && Date.now() - new Date(S.agentSeenAt).getTime() < 60_000

/* ---------- permissions (mirrors the server; the server is the one that enforces) ---------- */
export function can(action, c) {
  const r = S.role
  if (action === 'control' && c?.over) return false
  if (r === 'operator') return true
  if (r === 'viewer') return false
  if (action === 'create' || action === 'download') return true
  if (action === 'control') return c && c.owner === S.me
  return false
}
export const whyNot = (action) =>
  S.role === 'viewer' ? 'Viewers can only read. Ask an operator for the Member role.'
    : action === 'control' ? 'Members control only their own campaigns.' : 'Operators only.'

/* ---------- actions ---------- */
async function run(fn) {
  try { const r = await fn(); await refresh(true); return r }
  catch (e) {
    if (e.status === 401) { S.status = 'signedout'; emit(); return { error: e.message } }
    S.toast = { id: Date.now(), text: e.message }
    emit()
    return { error: e.message }
  }
}
const post = (c, action, body) => run(() => call('POST', `/campaigns/${encodeURIComponent(c.id)}/${action}`, body || {}))

export const act = {
  dismissToast() { S.toast = null; emit() },
  pause: (c) => post(c, c.paused ? 'resume' : 'pause'),
  finalize: (c) => post(c, 'finalize'),
  steer: (c, text) => post(c, 'steer', { text }),
  answer: (c, q, option) => post(c, 'answer', { question: q.id, option }),
  raiseCap: (c, by) => post(c, 'raise_cap', { by }),
  async create(cfg) {
    try { const r = await call('POST', '/campaigns', cfg); await refresh(true); return r }
    catch (e) { return { error: e.message } }
  },
  enroll: (e, approve, role) => run(() => call('POST', '/enrollments/' + e.id, { approve, role })),
  setUser: (u, patch) => run(() => call('PATCH', '/users/' + u.id, patch)),
  revoke: (t) => run(() => call('DELETE', '/tokens/' + t.id)),
  async createToken(name, scope) {
    try { const r = await call('POST', '/tokens', { name, scope }); refresh(true); return r }
    catch (e) { return { error: e.message } }
  },
  async setAsked(asked) { await call('PATCH', '/me', { asked }).catch(() => {}); S.profile = { ...S.profile, asked }; emit() },
  async devLogin(email, name) {
    try { await call('POST', '/auth/dev', { email, name }); location.reload() } catch (e) { S.authError = e.message; emit() }
  },
  async signOut() { await call('POST', '/auth/logout').catch(() => {}); location.reload() },
  async fetchArtifact(c, which) {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(c.id)}/${which}`, { credentials: 'same-origin' })
    if (!res.ok) { S.toast = { id: Date.now(), text: (await res.json().catch(() => ({}))).error || 'Download failed' }; emit(); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await res.blob())
    a.download = which === 'patch' ? `${c.id}.patch` : `${c.id}-REPORT.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  },
}

/* ---------- per-hypothesis run log, as pushed by the agent ---------- */
export const logFor = (c, hy) => (c.logs[hy.id] || []).map((l) => ({ st: l.stage, x: l.text, bad: l.level === 'bad', ok: l.level === 'ok' }))
