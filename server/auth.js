import crypto from 'node:crypto'
import { q, ConfigError } from './db.js'

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code }
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
export const rid = (prefix, n = 8) => prefix + crypto.randomBytes(n).toString('hex')
const isProd = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
export const devLoginEnabled = () => process.env.AUTH_DEV_LOGIN === '1' && process.env.VERCEL_ENV !== 'production'

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) throw new ConfigError('SESSION_SECRET is not set (use at least 32 random characters)')
  return s
}

/* ---------- signed values (compact HS256 token) ---------- */
function sign(payload, ttlS) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlS }))
  return body + '.' + b64u(crypto.createHmac('sha256', secret()).update(body).digest())
}
function unsign(token) {
  if (!token || !token.includes('.')) return null
  const [body, mac] = token.split('.')
  const want = b64u(crypto.createHmac('sha256', secret()).update(body).digest())
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    return p.exp > Date.now() / 1000 ? p : null
  } catch { return null }
}

/* ---------- cookies ---------- */
export function cookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
function setCookie(res, name, value, maxAge) {
  const prev = res.getHeader('set-cookie') || []
  const c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProd() || process.env.VERCEL ? '; Secure' : ''}`
  res.setHeader('set-cookie', [...(Array.isArray(prev) ? prev : [prev]), c])
}

const SESSION = 'ar_session', OAUTH = 'ar_oauth', WEEK = 7 * 24 * 3600

export function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0]
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`
}

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const list = (v) => (v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)

/* ---------- Google OAuth 2.0, authorization code flow with PKCE ---------- */
export function googleStart(req, res) {
  if (!googleConfigured()) throw new ConfigError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set')
  const state = b64u(crypto.randomBytes(16)), verifier = b64u(crypto.randomBytes(32))
  setCookie(res, OAUTH, sign({ state, verifier }, 600), 600)
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: baseUrl(req) + '/api/auth/google/callback', response_type: 'code',
    scope: 'openid email profile', state, code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256', prompt: 'select_account',
  })
  const hd = list(process.env.ALLOWED_EMAIL_DOMAINS)
  if (hd.length === 1) p.set('hd', hd[0])
  redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + p)
}

export async function googleCallback(req, res, query) {
  const fail = (why) => redirect(res, baseUrl(req) + '/console.html?auth_error=' + encodeURIComponent(why))
  const saved = unsign(cookies(req)[OAUTH])
  setCookie(res, OAUTH, '', 0)
  if (query.error) return fail(query.error)
  if (!saved || !query.code || saved.state !== query.state) return fail('state_mismatch')
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: baseUrl(req) + '/api/auth/google/callback', grant_type: 'authorization_code', code_verifier: saved.verifier,
    }),
  }).then((r) => r.json())
  if (!tok.id_token) return fail('token_exchange_failed')
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read without a signature check.
  const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString())
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !/^(https:\/\/)?accounts\.google\.com$/.test(claims.iss)) return fail('bad_token')
  if (!claims.email || !claims.email_verified) return fail('email_not_verified')
  const domains = list(process.env.ALLOWED_EMAIL_DOMAINS)
  if (domains.length && !domains.includes(claims.email.split('@')[1].toLowerCase())) return fail('domain_not_allowed')
  const user = await upsertLogin({ sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture })
  if (user.status !== 'active') return fail('account_' + user.status)
  startSession(res, user)
  redirect(res, baseUrl(req) + '/console.html')
}

export async function devLogin(res, { email, name }) {
  if (!devLoginEnabled()) throw new HttpError(404, 'Not found')
  if (!email) throw new HttpError(400, 'email is required')
  const user = await upsertLogin({ sub: null, email, name })
  startSession(res, user)
  return user
}

export const startSession = (res, user) => setCookie(res, SESSION, sign({ uid: user.id }, WEEK), WEEK)
export const endSession = (res) => setCookie(res, SESSION, '', 0)

function redirect(res, to) { res.statusCode = 302; res.setHeader('location', to); res.end() }

export const DEFAULTS = { operator: { quota: 1500, max: 3 }, member: { quota: 800, max: 1 }, viewer: { quota: 0, max: 0 } }

async function upsertLogin({ sub, email, name, picture }) {
  email = email.toLowerCase()
  const operator = list(process.env.OPERATOR_EMAILS).includes(email)
  let [u] = sub ? await q('select * from users where google_sub = $1', [sub]) : []
  if (!u) [u] = await q('select * from users where email = $1', [email])
  if (!u) {
    let handle = email.split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'user'
    if ((await q('select 1 from users where handle = $1', [handle])).length) handle += '-' + crypto.randomBytes(2).toString('hex')
    const role = operator ? 'operator' : 'pending'
    const d = DEFAULTS[role] || { quota: 0, max: 0 }
    ;[u] = await q(
      `insert into users (id, google_sub, email, name, picture, handle, role, quota_usd, max_active, last_login_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) returning *`,
      [rid('u_'), sub, email, name || handle, picture || null, handle, role, d.quota, d.max])
    await q('insert into audit (who, text) values ($1, $2)', [handle, operator ? 'signed in as operator (OPERATOR_EMAILS)' : 'signed in and asked for access'])
    await q('update lab set version = version + 1 where id = 1')
    return u
  }
  const promote = operator && u.role !== 'operator'
  ;[u] = await q(
    `update users set google_sub = coalesce(google_sub, $2), name = coalesce($3, name), picture = coalesce($4, picture), last_login_at = now(),
       role = case when $5 then 'operator' else role end,
       quota_usd = case when $5 then greatest(quota_usd, $6) else quota_usd end,
       max_active = case when $5 then greatest(max_active, $7) else max_active end
     where id = $1 returning *`,
    [u.id, sub, name || null, picture || null, promote, DEFAULTS.operator.quota, DEFAULTS.operator.max])
  return u
}

/* ---------- API tokens (CLI and agent) ---------- */
export async function createToken(user, { name, scope }) {
  if (!['user', 'agent'].includes(scope)) throw new HttpError(400, 'scope must be "user" or "agent"')
  if (scope === 'agent' && user.role !== 'operator') throw new HttpError(403, 'Only operators can create agent tokens')
  if (user.role === 'viewer' || user.role === 'pending') throw new HttpError(403, 'Your role cannot create tokens')
  const id = rid('tok_', 6), secretPart = b64u(crypto.randomBytes(24)), value = `art_${id.slice(4)}_${secretPart}`
  await q('insert into tokens (id, user_id, name, scope, hash) values ($1,$2,$3,$4,$5)', [id, user.id, String(name || 'cli').slice(0, 60), scope, sha256(value)])
  return { id, value }
}

/** Resolves the caller from a bearer token or the session cookie. Returns { user, via, scope } or null. */
export async function authenticate(req) {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) {
    const [t] = await q(
      `update tokens set last_used_at = now() where hash = $1 and revoked_at is null returning user_id, scope, id`, [sha256(h.slice(7).trim())])
    if (!t) return null
    const [user] = await q('select * from users where id = $1', [t.user_id])
    return user && user.status === 'active' ? { user, via: 'token', scope: t.scope, tokenId: t.id } : null
  }
  const s = unsign(cookies(req)[SESSION])
  if (!s) return null
  const [user] = await q('select * from users where id = $1', [s.uid])
  return user && user.status === 'active' ? { user, via: 'session', scope: 'user' } : null
}
