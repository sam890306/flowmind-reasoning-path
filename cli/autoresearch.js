#!/usr/bin/env node
// autoresearch: command line client for the AutoResearch console.
// People use it with a user token; the agent service uses the `agent` subcommands with an agent token.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const CONFIG = process.env.AUTORESEARCH_CONFIG || path.join(os.homedir(), '.config', 'autoresearch', 'config.json')

const HELP = `autoresearch <command> [options]

Setup
  login --url <console url> --token <token>   Save credentials (create a token under Access → Tokens)
  whoami                                      Show who the token belongs to
  logout                                      Forget saved credentials

Campaigns (user token)
  list [--json]                               Campaigns with phase, score and spend
  status <id> [--json]                        One campaign: hypotheses and latest events
  create --name --repo --goal --metric [--node --job --gpus --cap --clock]
  pause | resume | finalize <id>
  steer <id> "<note for Agent 2>"
  answer <id> <question-id> "<option>"
  raise-cap <id> <usd>
  download <id> [--out <dir>]                 final.patch and REPORT.md

Agent service (agent token)
  agent push <batch.json | ->                 Send one ingest batch
  agent stream <campaign> [--flush 1000]      Read NDJSON records on stdin and send them in batches
  agent commands [--campaign <id>] [--follow] [--json]
  agent ack <command-id> [--reject "<why>"]
  agent simulate [--seeds all|none|id,id] [--interval 1500] [--owner <email>] [--once]

Global options: --url, --token, --profile <name> (or AUTORESEARCH_URL / AUTORESEARCH_TOKEN / AUTORESEARCH_PROFILE)
The record format for push and stream is documented in docs/DATA_CONTRACT.md.`

function parse(argv) {
  const pos = [], opt = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-' || !a.startsWith('--')) { pos.push(a); continue }
    const eq = a.indexOf('=')
    if (eq > 0) opt[a.slice(2, eq)] = a.slice(eq + 1)
    else if (i + 1 < argv.length && (!argv[i + 1].startsWith('--'))) opt[a.slice(2)] = argv[++i]
    else opt[a.slice(2)] = true
  }
  return { pos, opt }
}

const { pos, opt } = parse(process.argv.slice(2))
const die = (msg) => { console.error('autoresearch: ' + msg); process.exit(1) }
const profile = opt.profile || process.env.AUTORESEARCH_PROFILE || 'default'

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')) } catch { return {} }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true, mode: 0o700 })
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
  fs.chmodSync(CONFIG, 0o600)
}
function creds() {
  const saved = loadConfig()[profile] || {}
  const url = (opt.url || process.env.AUTORESEARCH_URL || saved.url || '').replace(/\/$/, '')
  const token = opt.token || process.env.AUTORESEARCH_TOKEN || saved.token
  if (!url || !token) die('not logged in. Run: autoresearch login --url <console url> --token <token>')
  return { url, token }
}

async function api(method, route, body, raw) {
  const { url, token } = creds()
  let res
  try {
    res = await fetch(url + route, {
      method, headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) { throw new Error(`cannot reach ${url}: ${e.cause?.code || e.message}`) }
  if (raw && res.ok) return res.text()
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 200) } }
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status })
  return data
}

const PH = { create: 'creating', provision: 'provisioning', setup: 'setting up', research: 'researching', finalize: 'finalizing', verify: 'verifying', delivered: 'delivered' }
const spent = (c) => Object.values(c.spend).reduce((a, b) => a + b, 0)
const delta = (m, g) => g == null ? '—' : (m.dir === 'down' ? (g >= 0 ? '-' : '+') : (g >= 0 ? '+' : '-')) + (Math.abs(g) * 100).toFixed(1) + '%'
const tplus = (s) => `T+${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)))
  for (const r of rows) console.log(r.map((x, i) => String(x).padEnd(w[i])).join('  ').trimEnd())
}
const need = (v, what) => v ?? die(`missing ${what}. See: autoresearch help`)

async function readStdin() {
  const chunks = []
  for await (const ch of process.stdin) chunks.push(ch)
  return Buffer.concat(chunks).toString('utf8')
}

const commands = {
  help() { console.log(HELP) },

  async login() {
    const url = need(opt.url || process.env.AUTORESEARCH_URL, '--url').replace(/\/$/, ''), token = need(opt.token || process.env.AUTORESEARCH_TOKEN, '--token')
    const cfg = loadConfig()
    cfg[profile] = { url, token }
    saveConfig(cfg)
    const me = await api('GET', '/api/me')
    console.log(`Logged in to ${url} as ${me.name} (${me.handle}, ${me.role}, ${me.scope} token). Saved to ${CONFIG} [${profile}]`)
  },
  logout() { const cfg = loadConfig(); delete cfg[profile]; saveConfig(cfg); console.log('Credentials removed.') },
  async whoami() { const me = await api('GET', '/api/me'); console.log(`${me.name} <${me.email}> · handle ${me.handle} · role ${me.role} · ${me.scope} token`) },

  async list() {
    const s = await api('GET', '/api/state')
    if (opt.json) return console.log(JSON.stringify(s.campaigns, null, 2))
    const who = Object.fromEntries(s.users.map((u) => [u.id, u.handle]))
    table([['ID', 'NAME', 'OWNER', 'STATE', 'SCORE', 'SPEND', 'CLOCK'], ...s.campaigns.map((c) => [
      c.id, c.name, who[c.owner] || '?', c.status !== 'running' ? c.status : c.paused ? 'paused' : PH[c.phase],
      delta(c.metric, c.phase === 'delivered' ? c.verified : c.best), `$${spent(c).toFixed(0)}/$${c.cap}`, `${tplus(c.elapsed)}/${c.clockH}h`])])
  },

  async status() {
    const id = need(pos[1], 'campaign id')
    const s = await api('GET', '/api/state'), c = s.campaigns.find((x) => x.id === id) || die('no such campaign: ' + id)
    const d = await api('GET', '/api/campaigns/' + id)
    if (opt.json) return console.log(JSON.stringify({ ...c, events: d.events }, null, 2))
    console.log(`${c.name}  [${c.id}]  ${c.status !== 'running' ? c.status : c.paused ? 'paused' : PH[c.phase]}`)
    console.log(`${c.metric.label}: ${delta(c.metric, c.phase === 'delivered' ? c.verified : c.best)} (${c.phase === 'delivered' ? 'verified' : 'promoted'}) · $${spent(c).toFixed(2)} of $${c.cap} · ${tplus(c.elapsed)} of ${c.clockH}h`)
    console.log(c.activity + '\n')
    table([['HYP', 'STAGE', 'SCREEN', 'PROMOTED', 'TITLE'], ...c.hypotheses.map((h) => [h.id, h.stage === 'discarded' ? `discarded:${h.fate}` : h.stage, delta(c.metric, h.screen), delta(c.metric, h.promoted), h.title])])
    for (const qu of c.questions.filter((x) => !x.answer)) console.log(`\nQuestion ${qu.id}: ${qu.text}\n  options: ${qu.options.join(' | ')}`)
    console.log('')
    for (const e of d.events.filter((x) => x.kind !== 'ambient').slice(-12)) console.log(`${tplus(e.t)}  ${e.src.padEnd(8)} ${e.text}`)
  },

  async create() {
    const r = await api('POST', '/api/campaigns', {
      name: need(opt.name, '--name'), repo: need(opt.repo, '--repo'), goal: need(opt.goal, '--goal'), metric: opt.metric || 'score',
      node: opt.node, job: opt.job, gpus: Number(opt.gpus || 0), cap: Number(opt.cap || 250), clockH: Number(opt.clock || 6), sha: opt.sha,
    })
    console.log(r.id)
  },
  pause: () => control('pause'), resume: () => control('resume'), finalize: () => control('finalize'),
  steer: () => control('steer', { text: need(pos[2], 'the note text') }),
  answer: () => control('answer', { question: need(pos[2], 'question id'), option: need(pos[3], 'the chosen option') }),
  'raise-cap': () => control('raise_cap', { by: Number(need(pos[2], 'amount in USD')) }),

  async download() {
    const id = need(pos[1], 'campaign id'), out = opt.out || path.join('results', id)
    fs.mkdirSync(out, { recursive: true })
    for (const [which, name] of [['patch', 'final.patch'], ['report', 'REPORT.md']]) {
      try { fs.writeFileSync(path.join(out, name), await api('GET', `/api/campaigns/${id}/${which}`, null, true)); console.log(path.join(out, name)) }
      catch (e) { console.error(`${name}: ${e.message}`); process.exitCode = 1 }
    }
  },

  async agent() {
    const sub = pos[1]
    if (sub === 'push') {
      const src = need(pos[2], 'a batch file or - for stdin')
      const body = JSON.parse(src === '-' ? await readStdin() : fs.readFileSync(src, 'utf8'))
      for (const b of Array.isArray(body) ? body : [body]) console.log(JSON.stringify(await api('POST', '/api/agent/ingest', b)))
    } else if (sub === 'stream') return stream(need(pos[2], 'campaign id'))
    else if (sub === 'commands') {
      const route = '/api/agent/commands' + (opt.campaign ? '?campaign=' + encodeURIComponent(opt.campaign) : '')
      const seen = new Set()
      for (;;) {
        const { commands: list } = await api('GET', route)
        for (const m of list) {
          if (seen.has(m.id)) continue
          seen.add(m.id)
          console.log(opt.json || opt.follow ? JSON.stringify(m) : `#${m.id}  ${m.campaign}  ${m.type}  ${JSON.stringify(m.payload)}  by ${m.issuedBy}`)
        }
        if (!opt.follow) break
        await new Promise((r) => setTimeout(r, Number(opt.interval || 2000)))
      }
    } else if (sub === 'ack') {
      await api('POST', `/api/agent/commands/${need(pos[2], 'command id')}/ack`, opt.reject ? { status: 'rejected', note: opt.reject === true ? undefined : opt.reject } : { status: 'done' })
      console.log('ok')
    } else if (sub === 'simulate') {
      const { simulate } = await import('./simulate.js')
      await simulate(api, opt)
    } else die('unknown agent command. See: autoresearch help')
  },
}

async function control(action, body) {
  await api('POST', `/api/campaigns/${need(pos[1], 'campaign id')}/${action}`, body || {})
  console.log('ok')
}

// NDJSON on stdin, one record per line, e.g.
//   {"type":"state","phase":"research","elapsed":4140,"activity":"Screening H-003"}
//   {"type":"hypothesis","id":"H-003","stage":"screen"}
//   {"type":"event","src":"engine","kind":"promoted","text":"H-003 promoted","hyp":"H-003"}
//   {"type":"log","hyp":"H-003","stage":"screen","text":"stage=check › build ok"}
//   {"type":"usage","id":"call-81f3","role":"implementer","tokens":5200,"usd":0.61,"hyp":"H-003"}
//   {"type":"question","id":"q1","text":"Raise repeats?","options":["Yes","No"]}
async function stream(campaign) {
  const KEY = { hypothesis: 'hypotheses', event: 'events', log: 'logs', usage: 'usage', question: 'questions' }
  let batch = null, sending = Promise.resolve(), lines = 0
  const fresh = () => ({ campaign, state: {}, hypotheses: [], events: [], logs: [], usage: [], questions: [] })
  const flush = () => {
    if (!batch) return sending
    const b = batch
    batch = null
    sending = sending.then(() => api('POST', '/api/agent/ingest', b)).catch((e) => { console.error('ingest failed: ' + e.message); process.exitCode = 1 })
    return sending
  }
  const timer = setInterval(flush, Number(opt.flush || 1000))
  for await (const line of readline.createInterface({ input: process.stdin })) {
    if (!line.trim()) continue
    let rec
    try { rec = JSON.parse(line) } catch { console.error('skipping a line that is not JSON: ' + line.slice(0, 80)); continue }
    const { type, ...rest } = rec
    batch ||= fresh()
    if (type === 'state') Object.assign(batch.state, rest)
    else if (KEY[type]) batch[KEY[type]].push(rest)
    else { console.error(`skipping unknown record type "${type}"`); continue }
    lines++
    if (batch.events.length + batch.logs.length + batch.usage.length >= 300) flush()
  }
  clearInterval(timer)
  await flush()
  console.error(`sent ${lines} records for ${campaign}`)
}

const cmd = pos[0] || 'help'
if (!commands[cmd]) die(`unknown command "${cmd}". See: autoresearch help`)
try { await commands[cmd]() } catch (e) { die(e.message) }
