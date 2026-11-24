import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSim, act, spentOf, userOf, ago } from './store'
import { PERMS, HARD_LINES } from './data'
import { Icon, Pill, Num, Bar, Btn, Avatar, Copy } from './ui'

const roleTone = { operator: 'agent', member: 'accent', viewer: 'mute' }

function Locked({ what }) {
  return (
    <section className="card locked">
      <Icon n="lock" s={22} />
      <b>{what} is for operators</b>
      <p className="muted">Ask an operator of this lab if you need it.</p>
    </section>
  )
}

function Tokens() {
  const s = useSim()
  const op = s.role === 'operator'
  const [name, setName] = useState('')
  const [scope, setScope] = useState('user')
  const [made, setMade] = useState(null)
  const [err, setErr] = useState(null)
  if (s.role === 'viewer') return <Locked what="Creating tokens" />
  const create = async (e) => {
    e.preventDefault()
    setErr(null)
    const r = await act.createToken(name.trim() || (scope === 'agent' ? 'agent service' : 'cli'), scope)
    if (r.error) return setErr(r.error)
    setMade({ ...r, scope }); setName('')
  }
  return (
    <section className="card">
      <header className="card-h"><h2><Icon n="key" />Tokens</h2><span className="muted">{op ? 'for the CLI and the agent service · every token in the lab' : 'for the CLI · yours'}</span></header>
      <form className="tok-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. laptop or agentd on host B" aria-label="Token name" maxLength={60} />
        {op && <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope"><option value="user">user · acts as me</option><option value="agent">agent · ingest and commands</option></select>}
        <button type="submit" className="btn btn-primary"><Icon n="plus" s={15} />Create</button>
      </form>
      {err && <p className="err pad-s">{err}</p>}
      {made && (
        <div className="tok-made">
          <p><b>Copy this token now.</b> It is shown once and stored only as a hash.</p>
          <Copy text={made.value} />
          <Copy text={`autoresearch login --url ${location.origin} --token ${made.value}${made.scope === 'agent' ? ' --profile agent' : ''}`} />
          <Btn onClick={() => setMade(null)}>Done</Btn>
        </div>
      )}
      <ul className="toks">
        <AnimatePresence>
          {s.tokens.map((t) => (
            <motion.li key={t.id} layout exit={{ opacity: 0, x: 20 }}><span className="mono">{t.id}</span><span>{t.name}<small className="muted"> · {t.user}</small></span><span className="muted">{t.scope}</span><span className="muted">used {ago(t.lastUsedAt)}</span><Btn onClick={() => act.revoke(t)}>Revoke</Btn></motion.li>
          ))}
        </AnimatePresence>
        {!s.tokens.length && <li className="muted">No tokens yet. Create one to use the CLI.</li>}
      </ul>
    </section>
  )
}

export function Access() {
  const s = useSim()
  const op = s.role === 'operator'
  const me = userOf(s.me)
  return (
    <>
      <div className="head"><div><h1>Access</h1><p className="sub">Who is enrolled in the lab, what each role may do, and what was done.</p></div></div>

      {op && s.enrollments.length > 0 && (
        <section className="card">
          <header className="card-h"><h2>Waiting for approval</h2><span className="muted">signed in with Google and asked for access</span></header>
          <ul className="enr">
            <AnimatePresence>
              {s.enrollments.map((e) => (
                <motion.li key={e.id} layout exit={{ opacity: 0, height: 0 }}>
                  <span className="own"><Avatar name={e.name} /><span><b>{e.name}</b><small className="mono">{e.email}</small></span></span>
                  <span className="mono muted">Google · verified email · {ago(e.at)}</span>
                  <span>asks for <b>{e.asked === 'viewer' ? 'Viewer' : 'Member'}</b></span>
                  <span className="acts"><Btn onClick={() => act.enroll(e, false)}>Deny</Btn><Btn onClick={() => act.enroll(e, true, 'viewer')}>As viewer</Btn><Btn kind="primary" icon="check" onClick={() => act.enroll(e, true, 'member')}>As member</Btn></span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      <section className="card">
        <header className="card-h"><h2>Members</h2><span className="muted">{s.users.length} enrolled</span></header>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Person</th><th>Role</th><th>Monthly quota</th><th>Used this month</th><th>Max active</th><th>Home node</th></tr></thead>
            <tbody>
              {s.users.map((u) => {
                const self = u.id === s.me
                if (!op && !self && s.role === 'viewer') return <tr key={u.id}><td><span className="own"><Avatar name={u.name} />{u.name}</span></td><td><Pill tone={roleTone[u.role]}>{u.role}</Pill></td><td colSpan={4} className="muted">hidden for viewers</td></tr>
                return (
                  <tr key={u.id}>
                    <td><span className="own"><Avatar name={u.name} /><span><b>{u.name}{self && ' (you)'}</b><small className="mono">{u.handle}</small></span></span></td>
                    <td>{op && !self
                      ? <select aria-label={`Role of ${u.name}`} value={u.role} onChange={(e) => act.setUser(u, { role: e.target.value })}><option value="operator">operator</option><option value="member">member</option><option value="viewer">viewer</option></select>
                      : <Pill tone={roleTone[self ? s.role : u.role]}>{self ? s.role : u.role}</Pill>}</td>
                    <td className="num">{op
                      ? <span className="stepper"><button type="button" aria-label="Lower quota" onClick={() => act.setUser(u, { quota: Math.max(0, u.quota - 100) })}>−</button>${u.quota}<button type="button" aria-label="Raise quota" onClick={() => act.setUser(u, { quota: u.quota + 100 })}>+</button></span>
                      : `$${u.quota}`}</td>
                    <td className="num"><span className="usedcell">${u.used.toFixed(0)}<Bar pct={u.quota ? u.used / u.quota : 0} tone={u.quota && u.used / u.quota > 0.85 ? 'warn' : 'accent'} /></span></td>
                    <td className="num">{op && u.role !== 'viewer'
                      ? <span className="stepper"><button type="button" aria-label="Fewer campaigns" onClick={() => act.setUser(u, { maxActive: Math.max(0, u.maxActive - 1) })}>−</button>{u.maxActive}<button type="button" aria-label="More campaigns" onClick={() => act.setUser(u, { maxActive: u.maxActive + 1 })}>+</button></span>
                      : u.maxActive}</td>
                    <td className="mono">{u.node || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!op && <footer className="card-f"><span className="muted">You are a <b>{s.role}</b> ({me.handle}). Only operators can change roles and quotas.</span></footer>}
      </section>

      <div className="two">
        <section className="card">
          <header className="card-h"><h2>What each role can do</h2></header>
          <div className="tbl-wrap">
            <table className="tbl matrix">
              <thead><tr><th>Permission</th><th>Viewer</th><th>Member</th><th>Operator</th></tr></thead>
              <tbody>
                {PERMS.map(([p, v, m, o]) => (
                  <tr key={p}><td>{p}</td>{[['viewer', v], ['member', m], ['operator', o]].map(([r, ok]) => <td key={r} className={s.role === r ? 'me' : ''}>{ok ? <span className="c-ok"><Icon n="check" s={15} /></span> : <span className="muted">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <header className="card-h"><h2><Icon n="lock" />Enforced in code, not by prompts</h2></header>
          <ul className="lines">{HARD_LINES.map(([t, d]) => <li key={t}><Icon n="check" s={14} /><span><b>{t}</b>{d}</span></li>)}</ul>
        </section>
      </div>

      <div className="two">
        <Tokens />
        {op ? (
          <section className="card">
            <header className="card-h"><h2>Audit log</h2><span className="muted">newest first</span></header>
            <ol className="audit">
              <AnimatePresence initial={false}>
                {s.audit.slice(0, 14).map((a) => <motion.li key={a.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><b>{a.who}</b><span>{a.text}</span><time className="muted">{ago(a.at)}</time></motion.li>)}
              </AnimatePresence>
            </ol>
          </section>
        ) : <Locked what="The audit log" />}
      </div>
    </>
  )
}

export function Usage({ go }) {
  const s = useSim()
  const op = s.role === 'operator'
  const me = userOf(s.me)
  const users = op ? s.users.filter((u) => u.quota > 0) : [me]
  const camps = s.campaigns.filter((c) => op || c.owner === s.me)
  const total = users.reduce((a, u) => a + u.used, 0), quota = users.reduce((a, u) => a + u.quota, 0)
  const top = Math.max(...camps.map(spentOf), 1)
  const roles = [['agent2', 'Agent 2', 'agent'], ['planner', 'Planners', 'accent'], ['implementer', 'Implementers', 'ok'], ['reviewer', 'Reviewers', 'warn']]
  const ledger = s.ledger.filter((l) => op || s.campaigns.find((c) => c.id === l.camp)?.owner === s.me)
  return (
    <>
      <div className="head"><div><h1>Usage</h1><p className="sub">{op ? 'Lab-wide spend and chargeback, read from the model proxy ledgers.' : 'Your spend against your monthly quota. Spend is on the service key; you never hold an API key.'}</p></div></div>

      <section className="kpis">
        <div className="kpi hero"><span className="lab">{op ? 'Lab spend this month' : 'Your spend this month'}</span><strong>$<Num v={total} /></strong><small>of ${quota} quota</small><Bar pct={quota ? total / quota : 0} tone={total / quota > 0.85 ? 'warn' : 'accent'} live /></div>
        <div className="kpi"><span className="lab">Campaigns charged</span><strong>{camps.length}</strong><small>{camps.filter((c) => c.live).length} running</small></div>
        <div className="kpi"><span className="lab">Refused by the proxy</span><strong>{s.refusedCalls}</strong><small>402 over cap · 403 past deadline</small></div>
        <div className="kpi"><span className="lab">Slot requests refused</span><strong>{s.refusals}</strong><small>when all {s.slots.length} slots are leased</small></div>
      </section>

      <div className="two">
        <section className="card">
          <header className="card-h"><h2>{op ? 'By person' : 'Your quota'}</h2></header>
          <ul className="people">
            {users.map((u) => (
              <li key={u.id}><span className="own"><Avatar name={u.name} />{u.name}</span><Bar pct={u.quota ? u.used / u.quota : 0} tone={u.quota && u.used / u.quota > 0.85 ? 'warn' : 'accent'} /><b className="num">${u.used.toFixed(0)}</b><small className="num">of ${u.quota}</small></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <header className="card-h"><h2>By campaign and role</h2>
            <ul className="legend">{roles.map(([k, l, t]) => <li key={k} className={`t-${t}`}><i />{l}</li>)}</ul>
          </header>
          <ul className="stackbars">
            {camps.map((c) => (
              <li key={c.id}>
                <button type="button" className="link" onClick={() => go('c-' + c.id)}>{c.name}</button>
                <div className="sbar" style={{ width: `${(spentOf(c) / top) * 100}%` }}>{roles.map(([k, , t]) => <i key={k} className={`t-${t}`} style={{ flex: c.roles[k] || 0.001 }} />)}</div>
                <b className="num">${spentOf(c).toFixed(0)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <header className="card-h"><h2><i className="dot live" />Proxy ledger</h2><span className="muted">latest upstream model calls reported by the agent service</span></header>
        <div className="tbl-wrap">
          <table className="tbl ledger">
            <thead><tr><th>Call</th><th>Campaign</th><th>Role</th><th>Tokens</th><th>Cost</th><th>Status</th></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {ledger.slice(0, 12).map((l) => (
                  <motion.tr key={l.id} initial={{ opacity: 0, backgroundColor: 'var(--flash)' }} animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 0.9 }}>
                    <td className="mono">{l.id}</td><td className="mono">{l.camp}</td><td>{l.role}</td><td className="num">{l.tok.toLocaleString('en-US')}</td><td className="num">${l.usd.toFixed(2)}</td>
                    <td><Pill tone={l.status === 200 ? 'ok' : 'bad'}>{l.status}</Pill></td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {!ledger.length && <tr><td colSpan={6} className="muted">No model calls have been reported yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
