// HTTP entry for every /api/* request. Runs as one Vercel function (api/index.js) and under server/dev.js locally.
import { ConfigError, q } from './db.js'
import { HttpError, authenticate, googleStart, googleCallback, googleConfigured, devLogin, devLoginEnabled, endSession, createToken } from './auth.js'
import { buildState, campaignDetail, artifact } from './state.js'
import { applyBatch, pendingCommands, ackCommand } from './ingest.js'
import { createCampaign, control, decideEnrollment, updateUser, updateSelf, revokeToken } from './actions.js'

function send(res, status, body, headers = {}) {
  res.statusCode = status
  res.setHeader('cache-control', 'no-store')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  if (typeof body === 'string') return res.end(body)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const chunks = []
  let size = 0
  for await (const ch of req) {
    size += ch.length
    if (size > 4_500_000) throw new HttpError(413, 'Body too large (4.5 MB limit per batch)')
    chunks.push(ch)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new HttpError(400, 'Body must be JSON') }
}

const configStatus = () => ({
  database: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
  sessionSecret: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
  google: googleConfigured(),
  operators: Boolean(process.env.OPERATOR_EMAILS),
  devLogin: devLoginEnabled(),
})

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x')
    // Vercel rewrites /api/(.*) to /api?__path=$1 so one function serves every route.
    const path = '/' + (url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '')
    const query = Object.fromEntries(url.searchParams)
    const seg = path.split('/').filter(Boolean)
    const m = req.method

    if (path === '/health') return send(res, 200, { ok: true })
    if (path === '/config') return send(res, 200, configStatus())
    if (path === '/auth/google' && m === 'GET') return googleStart(req, res)
    if (path === '/auth/google/callback' && m === 'GET') return await googleCallback(req, res, query)
    if (path === '/auth/logout' && m === 'POST') { endSession(res); return send(res, 200, { ok: true }) }
    if (path === '/auth/dev' && m === 'POST') { const u = await devLogin(res, await readBody(req)); return send(res, 200, { ok: true, id: u.id }) }

    const auth = await authenticate(req)
    if (!auth) throw new HttpError(401, 'Sign in first', 'unauthenticated')
    const { user } = auth
    // Browser sessions must send a custom header on writes; cross-site forms cannot, so this blocks CSRF.
    if (auth.via === 'session' && m !== 'GET' && req.headers['x-requested-with'] !== 'autoresearch') throw new HttpError(403, 'Missing X-Requested-With header')

    /* agent scope: ingest and the command queue */
    if (seg[0] === 'agent') {
      if (auth.scope !== 'agent') throw new HttpError(403, 'This endpoint needs an agent-scoped token (Access → Tokens).')
      if (path === '/agent/ingest' && m === 'POST') return send(res, 200, await applyBatch(auth, await readBody(req)))
      if (path === '/agent/commands' && m === 'GET') return send(res, 200, { commands: await pendingCommands(query) })
      if (seg[1] === 'commands' && seg[3] === 'ack' && m === 'POST') return send(res, 200, await ackCommand(seg[2], await readBody(req)))
      throw new HttpError(404, 'Not found')
    }

    if (path === '/me' && m === 'GET') return send(res, 200, { id: user.id, email: user.email, name: user.name, handle: user.handle, role: user.role, picture: user.picture, asked: user.asked, node: user.node, scope: auth.scope })
    if (path === '/me' && m === 'PATCH') return send(res, 200, await updateSelf(user, await readBody(req)))
    if (user.role === 'pending') throw new HttpError(403, 'Your access request is waiting for an operator.', 'pending')

    if (path === '/state' && m === 'GET') return send(res, 200, await buildState(user, query.v))
    if (seg[0] === 'campaigns' && seg.length === 2 && m === 'GET') return send(res, 200, await campaignDetail(seg[1]))
    if (seg[0] === 'campaigns' && seg.length === 3 && m === 'GET' && (seg[2] === 'patch' || seg[2] === 'report')) {
      if (user.role === 'viewer') throw new HttpError(403, 'Viewers cannot download deliverables.')
      const name = seg[2] === 'patch' ? 'final.patch' : 'REPORT.md'
      return send(res, 200, await artifact(seg[1], seg[2]), { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` })
    }

    if (auth.scope !== 'user') throw new HttpError(403, 'Agent tokens can only read state and use /api/agent/*.')
    if (path === '/campaigns' && m === 'POST') {
      const r = await createCampaign(user, await readBody(req))
      return r.error ? send(res, r.status, { error: r.error }) : send(res, 201, r)
    }
    if (seg[0] === 'campaigns' && seg.length === 3 && m === 'POST') return send(res, 200, await control(user, seg[1], seg[2], await readBody(req)))
    if (seg[0] === 'enrollments' && seg.length === 2 && m === 'POST') return send(res, 200, await decideEnrollment(user, seg[1], await readBody(req)))
    if (seg[0] === 'users' && seg.length === 2 && m === 'PATCH') return send(res, 200, await updateUser(user, seg[1], await readBody(req)))
    if (path === '/tokens' && m === 'POST') {
      const b = await readBody(req), t = await createToken(user, b)
      await q('insert into audit (who, text) values ($1,$2)', [user.handle, `created ${b.scope} token ${t.id}`])
      await q('update lab set version = version + 1 where id = 1')
      return send(res, 201, t)
    }
    if (seg[0] === 'tokens' && seg.length === 2 && m === 'DELETE') return send(res, 200, await revokeToken(user, seg[1]))

    throw new HttpError(404, 'Not found')
  } catch (e) {
    if (res.headersSent) return res.end()
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, code: e.code })
    if (e instanceof ConfigError) return send(res, 503, { error: e.message, code: 'not_configured', config: configStatus() })
    console.error(e)
    send(res, 500, { error: 'Internal error' })
  }
}
