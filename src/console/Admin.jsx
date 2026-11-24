import { AnimatePresence, motion } from 'framer-motion'
import { useSim, act, spentOf, userOf } from './engine'
import { PERMS, HARD_LINES } from './data'
import { Icon, Pill, Num, Bar, Btn, Avatar } from './ui'

const roleTone = { operator: 'agent', member: 'accent', viewer: 'mute' }

function Locked({ what }) {
  return (
    <section className="card locked">
      <Icon n="lock" s={22} />
      <b>{what} is for operators</b>
      <p className="muted">Switch “View as” to Operator in the top bar to see what an operator sees.</p>
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
          <header className="card-h"><h2>Waiting for approval</h2><span className="muted">self-enrolled from a cluster node with a munge proof</span></header>
          <ul className="enr">
            <AnimatePresence>
              {s.enrollments.map((e) => (
                <motion.li key={e.id} layout exit={{ opacity: 0, height: 0 }}>
                  <span className="own"><Avatar name={e.name} /><span><b>{e.name}</b><small className="mono">{e.handle} · {e.node}</small></span></span>
                  <span className="mono muted">{e.proof}</span>
                  <span>asks for <b>{e.asked}</b></span>
                  <span className="acts"><Btn onClick={() => act.enroll(e, false)}>Deny</Btn><Btn kind="primary" icon="check" onClick={() => act.enroll(e, true)}>Approve</Btn></span>
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
                    <td className="num">{u.maxActive}</td>
                    <td className="mono">{u.node}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!op && <footer className="card-f"><span className="muted">You are viewing as <b>{s.role}</b> ({me.handle}). Only operators can change roles and quotas.</span></footer>}
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

      {op ? (
        <div className="two">
          <section className="card">
            <header className="card-h"><h2>Tokens</h2><span className="muted">scoped, revocable, stored 0600 on the teammate's node</span></header>
            <ul className="toks">
              <AnimatePresence>
                {s.tokens.map((t) => (
                  <motion.li key={t.id} layout exit={{ opacity: 0, x: 20 }}><span className="mono">{t.id}…</span><span>{t.user}</span><span className="muted">{t.scope}</span><span className="muted">{t.made}</span><Btn onClick={() => act.revoke(t)}>Revoke</Btn></motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
          <section className="card">
            <header className="card-h"><h2>Audit log</h2><span className="muted">newest first</span></header>
            <ol className="audit">
              <AnimatePresence initial={false}>
                {s.audit.slice(0, 14).map((a) => <motion.li key={a.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><b>{a.who}</b><span>{a.text}</span></motion.li>)}
              </AnimatePresence>
            </ol>
          </section>
        </div>
      ) : <Locked what="Tokens and the audit log" />}
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
        <div className="kpi hero"><span className="lab">{op ? 'Lab spend this month' : 'Your spend this month'}</span><strong>$<Num v={total} /></strong><small>of ${quota} quota</small><Bar pct={total / quota} tone={total / quota > 0.85 ? 'warn' : 'accent'} live /></div>
        <div className="kpi"><span className="lab">Campaigns charged</span><strong>{camps.length}</strong><small>{camps.filter((c) => c.life < 7).length} running</small></div>
        <div className="kpi"><span className="lab">Refused by the proxy</span><strong>{s.ledger.filter((l) => l.status !== 200).length + s.campaigns.filter((c) => c.hyps.some((h) => h.fate === 'BUDGET' && h.stage === 'discarded')).length}</strong><small>402 over cap · 403 past deadline</small></div>
        <div className="kpi"><span className="lab">Slot requests refused</span><strong>{s.refusals}</strong><small>when all 9 slots are leased</small></div>
      </section>

      <div className="two">
        <section className="card">
          <header className="card-h"><h2>{op ? 'By person' : 'Your quota'}</h2></header>
          <ul className="people">
            {users.map((u) => (
              <li key={u.id}><span className="own"><Avatar name={u.name} />{u.name}</span><Bar pct={u.used / u.quota} tone={u.used / u.quota > 0.85 ? 'warn' : 'accent'} /><b className="num">${u.used.toFixed(0)}</b><small className="num">of ${u.quota}</small></li>
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
        <header className="card-h"><h2><i className="dot live" />Proxy ledger</h2><span className="muted">one line per upstream model call, sampled</span></header>
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
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
