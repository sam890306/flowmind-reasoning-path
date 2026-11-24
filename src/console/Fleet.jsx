import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSim, act, can, whyNot, spentOf, fmtVal, fmtDelta, tPlus, userOf, cpuRange, ACTIVE } from './store'
import { LIFE } from './data'
import { Icon, Pill, Num, Spark, Bar, Btn, Avatar, campStatus, Level } from './ui'

export const LifeStrip = ({ c, big }) => (
  <ol className={`life${big ? ' big' : ''}`}>
    {LIFE.map((l, i) => {
      const st = i < c.life || c.life === 7 ? 'done' : i === c.life ? 'now' : 'todo'
      return (
        <li key={l.k} className={st} title={`${l.k} · ${l.d}`}>
          <span className="life-n">{st === 'done' ? <Icon n="check" s={11} /> : i + 1}</span>
          {big && <span className="life-t"><b>{l.k}</b><small>{l.where}</small></span>}
          {st === 'now' && <i className="life-p" style={{ width: `${(c.life === 4 ? 0.5 : c.lifeP) * 100}%` }} />}
        </li>
      )
    })}
  </ol>
)

function Card({ c, go }) {
  const st = campStatus(c)
  const kept = c.hyps.filter((h) => h.stage === 'kept').length
  const dead = c.hyps.filter((h) => h.stage === 'discarded').length
  const live = c.hyps.filter((h) => ACTIVE.includes(h.stage)).length
  const spent = spentOf(c)
  const own = userOf(c.owner)
  const ctl = can('control', c)
  return (
    <motion.article layout className={`card camp${c.paused ? ' paused' : ''}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
      <header className="camp-h">
        <div className="camp-t">
          <a href={`#c-${c.id}`} onClick={(e) => { e.preventDefault(); go('c-' + c.id) }}>{c.name}</a>
          <small className="mono">{c.id} · {c.repo.split('/').slice(-2).join('/')}</small>
        </div>
        <Pill tone={st.tone} dot>{st.label}</Pill>
      </header>

      <div className="camp-score">
        <div>
          <span className="lab">{c.metric.label}</span>
          <strong><Num v={c.best} fmt={(g) => fmtVal(c.metric, g)} /></strong>
          <span className="delta">{fmtDelta(c.metric, c.best)} vs baseline <Level k="promoted" /></span>
        </div>
        <Spark data={c.series.map((p) => p.best)} tone="ok" w={130} h={44} />
      </div>

      <LifeStrip c={c} />
      <p className="camp-act"><i className={`dot ${c.paused ? '' : 'live'}`} /><span>{c.paused ? 'Paused' : c.act}</span></p>

      <dl className="camp-kv">
        <div><dt>Hypotheses</dt><dd><b className="c-ok">{kept}</b> kept · <b className="c-accent">{live}</b> live · <b className="c-bad">{dead}</b> discarded</dd></div>
        <div><dt>Spend</dt><dd>${spent.toFixed(0)} of ${c.cap}<Bar pct={spent / c.cap} tone={spent / c.cap > 0.85 ? 'warn' : 'accent'} /></dd></div>
        <div><dt>Clock</dt><dd>{tPlus(c.elapsed)} of {c.clockH}h<Bar pct={c.elapsed / (c.clockH * 3600)} tone="agent" /></dd></div>
        <div><dt>Compute</dt><dd className="mono">{c.node} · job {c.job}{c.slot != null && <> · CPUs {cpuRange(c.slot)}</>}</dd></div>
      </dl>

      <footer className="camp-f">
        <span className="own"><Avatar name={own.name} />{own.name}</span>
        <span className="acts">
          <Btn icon={c.paused ? 'play' : 'pause'} disabled={!ctl} why={whyNot('control')} onClick={() => act.pause(c)} aria-label={c.paused ? 'Resume' : 'Pause'} />
          <Btn icon="arrow" kind="soft" onClick={() => go('c-' + c.id)}>Open</Btn>
        </span>
      </footer>
    </motion.article>
  )
}

function Wizard({ onClose, go }) {
  const s = useSim()
  const me = userOf(s.me)
  const [f, setF] = useState({ name: '', repo: '', goal: '', metric: '', job: '', node: me.node || '', gpus: 1, cap: 250, clockH: 6 })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onClose])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const left = Math.max(0, me.quota - me.used)
  const free = s.slots.filter((x) => x === null).length
  const bad = busy || !f.name.trim() || !f.repo.trim() || !f.goal.trim() || !f.metric.trim() || Number(f.clockH) < 4 || Number(f.cap) <= 0 || Number(f.cap) > left
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const r = await act.create({ ...f, gpus: Number(f.gpus), cap: Number(f.cap), clockH: Number(f.clockH) })
    setBusy(false)
    if (r.error) return setErr(r.error)
    onClose(); go('c-' + r.id)
  }
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.form className="modal" onSubmit={submit} onClick={(e) => e.stopPropagation()} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} aria-label="New campaign">
        <header><h2>New campaign</h2><Btn icon="x" onClick={onClose} aria-label="Close" /></header>
        <p className="sub">You hand over a repo and a goal. The agent service picks the request up, sets up AutoResearch on its own branch and runs experiments on your Slurm job. No API key needed.</p>
        <div className="form">
          <label className="span2" htmlFor="w-name">Name<input id="w-name" value={f.name} onChange={set('name')} placeholder="tokenizer encode speed" autoFocus /></label>
          <label className="span2" htmlFor="w-repo">Repo (git URL or snapshot)<input id="w-repo" className="mono" value={f.repo} onChange={set('repo')} placeholder="git.example.com/team/project" /></label>
          <label className="span2" htmlFor="w-goal">Goal<textarea id="w-goal" rows={2} value={f.goal} onChange={set('goal')} placeholder="What should get better, and what must not change." /></label>
          <label htmlFor="w-metric">Metric to improve<input id="w-metric" value={f.metric} onChange={set('metric')} placeholder="encode speedup" /></label>
          <label htmlFor="w-node">GPU node<input id="w-node" className="mono" value={f.node} onChange={set('node')} /></label>
          <label htmlFor="w-job">Running Slurm job<input id="w-job" className="mono" value={f.job} onChange={set('job')} /></label>
          <label htmlFor="w-gpus">GPUs in the job<input id="w-gpus" type="number" min="0" max="8" value={f.gpus} onChange={set('gpus')} /></label>
          <label htmlFor="w-cap">Cost cap (USD)<input id="w-cap" type="number" min="20" value={f.cap} onChange={set('cap')} /><small className={Number(f.cap) > left ? 'c-bad' : ''}>${left.toFixed(0)} left in your monthly quota</small></label>
          <label htmlFor="w-clock">Wall clock (hours)<input id="w-clock" type="number" min="4" value={f.clockH} onChange={set('clockH')} /><small className={Number(f.clockH) < 4 ? 'c-bad' : ''}>At least 4 hours</small></label>
        </div>
        <div className="preflight">
          <span className={free ? 'c-ok' : 'c-bad'}><Icon n={free ? 'check' : 'x'} s={14} />{free} of {s.slots.length} measurement slots free</span>
          <span className="c-ok"><Icon n="check" s={14} />Token scoped to your campaigns</span>
          <span className="c-ok"><Icon n="lock" s={14} />Evaluator frozen at set-up</span>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <footer><Btn onClick={onClose}>Cancel</Btn><button type="submit" className="btn btn-primary" disabled={bad}><Icon n="bolt" s={15} />{busy ? 'Launching…' : 'Launch campaign'}</button></footer>
      </motion.form>
    </motion.div>
  )
}

export default function Fleet({ go }) {
  const s = useSim()
  const [open, setOpen] = useState(false)
  const [mine, setMine] = useState(false)
  const run = s.campaigns.filter((c) => c.live && (!mine || c.owner === s.me))
  const stopped = s.campaigns.filter((c) => c.over)
  const total = s.slots.length, L = s.lab
  const done = s.campaigns.filter((c) => c.life === 7)
  const all = s.campaigns.filter((c) => c.live)
  const spend = s.campaigns.reduce((a, c) => a + spentOf(c), 0)
  const tested = s.campaigns.reduce((a, c) => a + c.hyps.filter((h) => h.stage === 'kept' || h.stage === 'discarded').length, 0)
  const liveH = all.reduce((a, c) => a + c.hyps.filter((h) => ACTIVE.includes(h.stage)).length, 0)
  const used = s.slots.filter((x) => x !== null).length
  return (
    <>
      <div className="head">
        <div>
          <h1>Campaigns</h1>
          <p className="sub">Each campaign is one persistent agent working one repo toward one metric, on its owner's compute.</p>
        </div>
        <div className="head-a">
          <label className="check" htmlFor="mine"><input id="mine" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Only mine</label>
          <Btn icon="plus" kind="primary" disabled={!can('create')} why={whyNot('create')} onClick={() => setOpen(true)}>New campaign</Btn>
        </div>
      </div>

      <section className="kpis">
        <div className="kpi"><span className="lab">Running now</span><strong><Num v={all.length} /></strong><small>{liveH} hypotheses in flight</small></div>
        <div className="kpi"><span className="lab">Hypotheses settled</span><strong><Num v={tested} /></strong><small>kept or discarded, with a reason</small></div>
        <div className="kpi"><span className="lab">Verified deliveries</span><strong><Num v={done.length} /></strong><small>patch + REPORT.md handed back</small></div>
        <div className="kpi"><span className="lab">Lab spend this month</span><strong>$<Num v={spend} /></strong><small>through the model proxy</small></div>
      </section>

      <section className="card rack">
        <header className="card-h">
          <h2><Icon n="cpu" />Measurement slots</h2>
          <span className="muted">{L.coresPerSlot} pinned cores each, CPUs {L.cpuBase}–{L.cpuBase + total * L.coresPerSlot - 1} · with all {total} leased, a new campaign is refused, not queued{s.refusals > 0 && ` · ${s.refusals} refused`}</span>
        </header>
        <div className="slots">
          {s.slots.map((id, i) => {
            const c = id && s.campaigns.find((x) => x.id === id)
            return (
              <button key={i} type="button" className={`slot${c ? ' on' : ''}${c?.paused ? ' paused' : ''}`} disabled={!c} onClick={() => c && go('c-' + c.id)} title={c ? `${c.name} · open` : 'Free slot'}>
                <span className="slot-cpus mono">{cpuRange(i)}</span>
                <span className="cores">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ animationDelay: `${(k * 137 + i * 61) % 900}ms` }} />)}</span>
                <span className="slot-n">{c ? c.name : 'free'}</span>
              </button>
            )
          })}
        </div>
        <Bar pct={used / total} tone={used >= total ? 'bad' : 'accent'} />
      </section>

      <section className="grid-camps">
        <AnimatePresence>{run.map((c) => <Card key={c.id} c={c} go={go} />)}</AnimatePresence>
        {can('create') && (
          <button type="button" className="card camp-new" onClick={() => setOpen(true)}>
            <span className="plus"><Icon n="plus" s={22} /></span>
            <b>Start another campaign</b>
            <small>{total - used} slots free</small>
          </button>
        )}
      </section>

      {!s.campaigns.length && !can('create') && <section className="card locked"><Icon n="fleet" s={22} /><b>No campaigns yet</b><p className="muted">Campaigns started by members of the lab will show up here.</p></section>}

      {stopped.length > 0 && (
        <section className="card">
          <header className="card-h"><h2><Icon n="x" />Stopped before delivery</h2></header>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Campaign</th><th>Owner</th><th>State</th><th>Why</th><th>Spend</th></tr></thead>
              <tbody>
                {stopped.map((c) => (
                  <tr key={c.id} onClick={() => go('c-' + c.id)} className="rowlink">
                    <td><b>{c.name}</b><small className="mono">{c.id}</small></td><td>{userOf(c.owner).name}</td>
                    <td><Pill tone={campStatus(c).tone}>{campStatus(c).label}</Pill></td><td className="muted">{c.stopWhy || '—'}</td><td className="num">${spentOf(c).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="card">
          <header className="card-h"><h2><Icon n="results" />Delivered</h2><a className="more" href="#results" onClick={(e) => { e.preventDefault(); go('results') }}>All results</a></header>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Campaign</th><th>Owner</th><th>Verified score</th><th>Change</th><th>Spend</th><th>Duration</th></tr></thead>
              <tbody>
                {done.map((c) => (
                  <tr key={c.id} onClick={() => go('r-' + c.id)} className="rowlink">
                    <td><b>{c.name}</b><small className="mono">{c.id}</small></td>
                    <td>{userOf(c.owner).name}</td>
                    <td className="num">{fmtVal(c.metric, c.verified)} <Level k="verified" /></td>
                    <td className="num c-ok">{fmtDelta(c.metric, c.verified)}</td>
                    <td className="num">${spentOf(c).toFixed(0)}</td>
                    <td className="num">{tPlus(c.elapsed).slice(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AnimatePresence>{open && <Wizard onClose={() => setOpen(false)} go={go} />}</AnimatePresence>
    </>
  )
}
