import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSim, act, can, whyNot, spentOf, fmtVal, fmtDelta, tPlus, userOf, watchCampaign } from './store'
import { REASONS } from './data'
import { Icon, Pill, Num, Bar, Btn, Level, Copy, Avatar } from './ui'

function report(c) {
  const m = c.metric
  const kept = c.hyps.filter((h) => h.stage === 'kept'), dead = c.hyps.filter((h) => h.stage === 'discarded')
  return [
    `# REPORT · ${c.name}`,
    '',
    `Goal: ${c.goal}`,
    `Repo: ${c.repo}@${c.sha} · branch campaign/${c.id}`,
    '',
    '## Verified result',
    `${m.label}: ${fmtVal(m, 0)} → ${fmtVal(m, c.verified)} (${fmtDelta(m, c.verified)})`,
    `Measured by the trusted verifier on a clean checkout with held-out data.`,
    `Screening total ${fmtDelta(m, c.screenTotal)}, promoted total ${fmtDelta(m, c.best)}. Only the verified number is the reported score.`,
    '',
    `## What is in the patch (${kept.length})`,
    ...kept.map((h) => `- ${h.id} ${h.t} · promoted ${fmtDelta(m, h.prom)}`),
    '',
    `## What was tried and dropped (${dead.length})`,
    ...dead.map((h) => `- ${h.id} ${h.t} · ${REASONS[h.fate].label}`),
    '',
    '## Run',
    `${c.hyps.length} hypotheses · $${spentOf(c).toFixed(2)} of $${c.cap} · ${tPlus(c.elapsed).slice(2)} of ${c.clockH}h · closed: ${c.stopWhy}`,
  ].join('\n')
}

function Detail({ c, go }) {
  const m = c.metric
  const [tab, setTab] = useState('patch')
  useEffect(() => { watchCampaign(c.id) }, [c.id])
  const kept = c.hyps.filter((h) => h.stage === 'kept'), dead = c.hyps.filter((h) => h.stage === 'discarded')
  const top = Math.max(c.screenTotal, c.best, c.verified, 0.01)
  const files = {}
  kept.forEach((h) => h.files.forEach(([f, a, d]) => { files[f] = files[f] || [0, 0]; files[f][0] += a; files[f][1] += d }))
  const dl = can('download')
  const ladder = [['screening', c.screenTotal, "sum of the engine's first measurements"], ['promoted', c.best, 'isolated re-measurements on the pinned slot'], ['verified', c.verified, 'trusted verifier, clean checkout, held-out data']]
  return (
    <>
      <div className="head">
        <div>
          <button type="button" className="crumb" onClick={() => go('results')}><Icon n="back" s={14} />Results</button>
          <h1>{c.name} <Pill tone="ok" dot>Delivered</Pill></h1>
          <p className="sub">{c.goal}</p>
        </div>
        <div className="head-a"><Btn icon="arrow" onClick={() => go('c-' + c.id)}>Open the run</Btn></div>
      </div>

      <section className="card verdict-hero">
        <div className="vh-l">
          <span className="lab">{m.label} <Level k="verified" /></span>
          <motion.strong initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
            <Num v={c.verified} fmt={(g) => fmtDelta(m, g)} ms={1300} />
          </motion.strong>
          <p>{fmtVal(m, 0)} <Icon n="arrow" s={14} /> <b>{fmtVal(m, c.verified)}</b></p>
          <small className="muted">Only the verified number counts as the reported score.</small>
        </div>
        <div className="ladder">
          {ladder.map(([k, g, d], i) => (
            <motion.div key={k} className="rung" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.18 }}>
              <span><Level k={k} /><small>{d}</small></span>
              <div className={`mbar lv-${k}`}><motion.i initial={{ width: 0 }} animate={{ width: `${(g / top) * 100}%` }} transition={{ delay: 0.3 + i * 0.18, duration: 0.8 }} /></div>
              <b className="num">{fmtDelta(m, g)}</b>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="kpis">
        <div className="kpi"><span className="lab">In the patch</span><strong>{kept.length}</strong><small>promoted changes</small></div>
        <div className="kpi"><span className="lab">Tried and dropped</span><strong>{dead.length}</strong><small>each with a recorded reason</small></div>
        <div className="kpi"><span className="lab">Spend</span><strong>${spentOf(c).toFixed(0)}</strong><small>of ${c.cap} cap</small></div>
        <div className="kpi"><span className="lab">Duration</span><strong>{tPlus(c.elapsed).slice(2)}</strong><small>of {c.clockH}h · {c.stopWhy}</small></div>
      </section>

      <div className="two">
        <section className="card">
          <header className="card-h"><h2><Icon n="check" />What made it in</h2></header>
          <ul className="contrib">
            {kept.map((h) => (
              <li key={h.id}><span><b className="mono">{h.id}</b>{h.t}</span><Bar pct={h.prom / Math.max(...kept.map((x) => x.prom))} tone="ok" /><b className="num c-ok">{fmtDelta(m, h.prom)}</b></li>
            ))}
            {!kept.length && <p className="empty">No change survived promotion. The verified result equals the baseline.</p>}
          </ul>
        </section>
        <section className="card">
          <header className="card-h"><h2><Icon n="x" />What did not, and why</h2></header>
          <ul className="grave">
            {dead.map((h) => (
              <li key={h.id}><span><b className="mono">{h.id}</b>{h.t}</span><Pill tone="bad">{REASONS[h.fate].label}</Pill><small>{h.rej?.lesson || h.rej?.d}</small></li>
            ))}
            {!dead.length && <p className="empty">Nothing was discarded.</p>}
          </ul>
        </section>
      </div>

      <section className="card">
        <header className="card-h">
          <h2><Icon n="doc" />Deliverables</h2>
          <div className="seg">{[['patch', 'Patch'], ['report', 'REPORT.md'], ['get', 'Download']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        </header>
        {tab === 'patch' && (
          <>
            <ul className="files">{Object.entries(files).map(([f, [a, d]]) => <li key={f}><span className="mono">{f}</span><span className="num"><b className="c-ok">+{a}</b> <b className="c-bad">−{d}</b></span></li>)}</ul>
            {c.diff && <pre className="diff">{c.diff.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}>{l}{'\n'}</span>)}</pre>}
            {c.diff && c.diffTruncated && <p className="muted pad-s">Showing the first part of the patch. Use Download for all of it.</p>}
            {!c.diff && <p className="muted pad-s">{c.hasPatch ? 'Loading the patch…' : 'The agent service did not attach a patch to this delivery.'}</p>}
          </>
        )}
        {tab === 'report' && <pre className="report">{c.reportText || report(c)}</pre>}
        {tab === 'get' && (
          <div className="pad-s stack">
            {dl ? (
              <>
                <div className="row-a"><Btn kind="primary" icon="doc" disabled={!c.hasPatch} why="No patch was attached" onClick={() => act.fetchArtifact(c, 'patch')}>Download patch</Btn><Btn icon="doc" disabled={!c.hasReport} why="No report was attached" onClick={() => act.fetchArtifact(c, 'report')}>Download REPORT.md</Btn></div>
                <p className="muted">Or fetch both from your node with the CLI:</p>
                <Copy text={`autoresearch download ${c.id} --out ./results/${c.id}`} />
                <Copy text={`git apply ./results/${c.id}/final.patch`} />
              </>
            ) : <p className="err">{whyNot('download')}</p>}
          </div>
        )}
      </section>
    </>
  )
}

export default function Results({ go, pick }) {
  const s = useSim()
  if (pick) return <Detail c={pick} go={go} />
  const done = s.campaigns.filter((c) => c.life === 7)
  const run = s.campaigns.filter((c) => c.live)
  return (
    <>
      <div className="head"><div><h1>Results</h1><p className="sub">Three levels of evidence. Screening and promoted numbers guide the search; only the verified number is reported.</p></div></div>
      <section className="levels">
        <div><Level k="screening" /><span>engine's first measurement</span></div>
        <div><Level k="promoted" /><span>isolated re-measurement</span></div>
        <div><Level k="verified" /><span>trusted verifier on a clean checkout, held-out data</span></div>
      </section>
      {!done.length && <section className="card locked"><Icon n="results" s={22} /><b>No verified result yet</b><p className="muted">A campaign appears here once the verifier has re-measured its final patch on held-out data.</p></section>}
      <section className="grid-res">
        {done.map((c, i) => (
          <motion.button key={c.id} type="button" className="card res" onClick={() => go('r-' + c.id)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <span className="res-h"><b>{c.name}</b><Level k="verified" /></span>
            <strong className="c-ok">{fmtDelta(c.metric, c.verified)}</strong>
            <span className="muted">{c.metric.label}: {fmtVal(c.metric, 0)} → {fmtVal(c.metric, c.verified)}</span>
            <span className="res-f"><span className="own"><Avatar name={userOf(c.owner).name} />{userOf(c.owner).name}</span><span className="muted num">{c.hyps.filter((h) => h.stage === 'kept').length} kept · {c.hyps.filter((h) => h.stage === 'discarded').length} dropped · ${spentOf(c).toFixed(0)}</span></span>
          </motion.button>
        ))}
      </section>
      <section className="card">
        <header className="card-h"><h2>Still running</h2><span className="muted">no verified number yet</span></header>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Campaign</th><th>Screening total</th><th>Promoted total</th><th>Verified</th></tr></thead>
            <tbody>
              {run.map((c) => (
                <tr key={c.id} className="rowlink" onClick={() => go('c-' + c.id)}>
                  <td><b>{c.name}</b><small className="mono">{c.id}</small></td>
                  <td className="num">{fmtDelta(c.metric, c.screenTotal)}</td>
                  <td className="num c-ok">{fmtDelta(c.metric, c.best)}</td>
                  <td className="muted">after finalize</td>
                </tr>
              ))}
              {!run.length && <tr><td colSpan={4} className="muted">No campaign is running.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
