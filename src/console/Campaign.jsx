import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useSim, act, can, whyNot, spentOf, fmtVal, fmtDelta, tPlus, userOf, cpuRange, logFor, ACTIVE } from './engine'
import { HSTAGES, REASONS, HARD_LINES } from './data'
import { Icon, Pill, Num, Ring, Bar, Btn, Avatar, campStatus, Level, stageTone, stageLabel, SRC } from './ui'
import { LifeStrip } from './Fleet'

/* ------------------------------------------------------------------ */
/* Live architecture: which box is working right now, and what flows   */
/* ------------------------------------------------------------------ */
function Topology({ c }) {
  const stages = new Set(c.hyps.filter((h) => ACTIVE.includes(h.stage)).map((h) => h.stage))
  const on = !c.paused && c.life < 7
  const model = on && (c.life === 3 || stages.has('plan') || stages.has('implement'))
  const node = on && (c.life === 3 || stages.has('screen') || stages.has('promote'))
  const verify = on && c.life === 6
  const loop = on && c.life === 4
  const hot = { a2: on && c.life >= 3 && c.life <= 5, run: loop, proxy: model, api: model, broker: node || verify, worker: node, sess: node || verify, ver: verify, svc: on, wake: on, tools: on && c.life >= 3, mate: on }
  const N = ({ id, t, d, dashed, ...g }) => { const x = +g.x, y = +g.y, w = +g.w, h = +(g.h || 44); return (
    <g className={`tn${hot[id] ? ' hot' : ''}${dashed ? ' dashed' : ''}`}>
      <rect x={x} y={y} width={w} height={h} rx="8" />
      <text x={x + 10} y={y + 18} className="tn-t">{t}</text>
      <text x={x + 10} y={y + 33} className="tn-d">{d}</text>
      {hot[id] && <circle cx={x + w - 11} cy={y + 12} r="3" className="tn-led" />}
    </g>
  ) }
  const E = ({ d, k = 'ctl', act: a, n = 2, dur = 2.4 }) => (
    <g className={`te te-${k}${a ? ' hot' : ''}`}>
      <path d={d} fill="none" />
      {a && Array.from({ length: n }, (_, i) => (
        <circle key={i} r="3.2"><animateMotion dur={`${dur}s`} begin={`${(i * dur) / n}s`} repeatCount="indefinite" path={d} /></circle>
      ))}
    </g>
  )
  return (
    <div className="topo-wrap">
      <svg className="topo" viewBox="0 0 980 372" role="img" aria-label="Live architecture of this campaign">
        <g className="zone z-a"><rect x="6" y="28" width="178" height="336" rx="12" /><text x="18" y="50">A · Teammate</text></g>
        <g className="zone z-b"><rect x="212" y="28" width="500" height="336" rx="12" /><text x="224" y="50">B · Operator CPU host</text></g>
        <g className="zone z-c"><rect x="762" y="128" width="212" height="236" rx="12" /><text x="774" y="150">C · {c.node}</text></g>

        <E d="M184 96 H224" k="ctl" act={hot.mate} dur={3} n={1} />
        <E d="M224 112 H184" k="res" act={on && c.life >= 3} dur={2.6} n={1} />
        <E d="M330 118 V150" k="ctl" act={hot.wake} dur={1.8} n={1} />
        <E d="M300 206 V262" k="ctl" act={hot.tools} dur={1.6} />
        <E d="M400 290 H452" k="ctl" act={loop} dur={1.4} />
        <E d="M560 262 V206" k="model" act={model} dur={1.2} n={3} />
        <E d="M620 162 H740 V74 H770" k="model" act={model} dur={1.6} n={3} />
        <E d="M700 184 H740 V198 H774" k="ssh" act={node || verify} dur={1.5} />
        <E d="M640 280 H740 V290 H774" k="ssh" act={node} dur={1.3} n={3} />
        <E d="M774 312 H740 V302 H640" k="res" act={node} dur={1.7} />
        <E d="M470 206 V240 H730 V214 H774" k="ssh" act={verify} dur={1.8} n={3} />

        <N id="mate" x="18" y="66" w="154" h="60" t="Agent 1 · your Codex" d="plugin: watch · note" />
        <g className="tn-list"><text x="20" y="160">You get back</text><text x="20" y="180" className="d">· live feed and results</text><text x="20" y="197" className="d">· questions to answer</text><text x="20" y="214" className="d">· spend against quota</text><text x="20" y="231" className="d">· patch + REPORT.md</text></g>

        <N id="svc" x="224" y="66" w="476" h="52" t="Agent service · HTTPS :9445" d="accounts, intake, feed, artifacts, chargeback" />
        <text x="224" y="146" className="zone-sub">agentd · trusted daemon, outside every sandbox</text>
        <N id="wake" x="224" y="154" w="110" h="52" t="Wake loop" d="codex exec resume" />
        <N id="tools" x="342" y="154" w="110" h="52" t="Tool server" d="MCP · calls logged" />
        <N id="ver" x="460" y="154" w="110" h="52" t="Verifier" d="clean checkout" />
        <N id="proxy" x="578" y="154" w="122" h="52" t="Model proxy" d={`cap $${c.cap} · 402 / 403`} />
        <text x="224" y="254" className="zone-sub">campaign/{c.id}</text>
        <N id="a2" x="224" y="262" w="176" h="60" t="Agent 2 · persistent" d="sets up, watches, repairs" dashed />
        <N id="run" x="452" y="262" w="188" h="60" t="Run box · AutoResearch" d="ideas → screen → promote" dashed />
        <text x="224" y="348" className="zone-note">Held-out data stays on host-local disk. Only the verifier reads it.</text>

        <N id="api" x="770" y="46" w="204" h="52" t="Model API · external" d="reached only through the proxy" />
        <N id="sess" x="774" y="162" w="188" h="60" t={`Slurm job ${c.job}`} d={`node sessions · ${c.gpus} GPU leased`} />
        <N id="worker" x="774" y="262" w="188" h="60" t="Experiment worker" d="no network, no secrets" dashed />
        <text x="774" y="348" className="zone-note">check → correctness → collect (timed)</text>
      </svg>
      <ul className="topo-key">
        <li className="k-ctl">requests and control</li><li className="k-model">model calls</li><li className="k-ssh">SSH to compute</li><li className="k-res">results, feed</li>
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Score over time: step line = best promoted, dots = each screening   */
/* ------------------------------------------------------------------ */
function ScoreChart({ c, onPick }) {
  const W = 640, H = 230, L = 52, R = 14, T = 14, B = 28
  const dots = c.hyps.filter((h) => h.screen != null && h.marks.promote || (h.screen != null && h.marks.end))
  const tMax = Math.max(c.elapsed, 3600)
  const gMax = Math.max(c.best, ...dots.map((h) => h.screen), 0.05) * 1.18
  const gMin = Math.min(0, ...dots.map((h) => h.screen)) * 1.3
  const x = (t) => L + (t / tMax) * (W - L - R)
  const y = (g) => T + (1 - (g - gMin) / (gMax - gMin)) * (H - T - B)
  let d = '', prev = null
  c.series.forEach((p) => { d += prev == null ? `M${x(p.t)},${y(p.best)}` : `H${x(p.t)}V${y(p.best)}`; prev = p })
  if (prev) d += `H${x(c.elapsed)}`
  const ticks = [0, 1, 2, 3, 4].map((i) => gMin + ((gMax - gMin) * i) / 4)
  const hours = Array.from({ length: Math.floor(tMax / 3600) + 1 }, (_, i) => i).filter((i, _, a) => a.length < 9 || i % 2 === 0)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Best promoted score over time">
      {ticks.map((g, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="grid" /><text x={L - 8} y={y(g) + 4} textAnchor="end" className="ax">{fmtDelta(c.metric, g)}</text></g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero" />
      {hours.map((hh) => <text key={hh} x={x(hh * 3600)} y={H - 8} textAnchor="middle" className="ax">{hh}h</text>)}
      {d && <path d={`${d}V${y(gMin)}H${x(c.series[0].t)}Z`} className="area" />}
      {d && <path d={d} className="line" fill="none" />}
      {dots.map((h) => (
        <g key={h.id} className={`pt pt-${h.stage}`} onClick={() => onPick(h.id)} tabIndex={0} role="button" aria-label={`${h.id} screening ${fmtDelta(c.metric, h.screen)}`} onKeyDown={(e) => e.key === 'Enter' && onPick(h.id)}>
          <circle cx={x(h.marks.promote || h.marks.end)} cy={y(h.screen)} r="9" className="hit" />
          <circle cx={x(h.marks.promote || h.marks.end)} cy={y(h.screen)} r="4.5" />
          <title>{h.id} · {h.t} · screening {fmtDelta(c.metric, h.screen)}</title>
        </g>
      ))}
      {prev && <circle cx={x(c.elapsed)} cy={y(c.best)} r="4" className="tip" />}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Hypotheses: board and lineage tree                                  */
/* ------------------------------------------------------------------ */
function HypCard({ c, h, onPick }) {
  const live = ACTIVE.includes(h.stage)
  return (
    <motion.button layout layoutId={c.id + h.id} type="button" className={`hyp s-${h.stage}`} onClick={() => onPick(h.id)}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <span className="hyp-top"><b className="mono">{h.id}</b>{h.parent && <small className="mono">← {h.parent}</small>}
        {h.stage === 'kept' && <span className="c-ok num">{fmtDelta(c.metric, h.prom)}</span>}
        {h.stage === 'promote' && <span className="c-accent num">{fmtDelta(c.metric, h.screen)}</span>}
      </span>
      <span className="hyp-t">{h.t}</span>
      {live && <><Bar pct={h.p} tone={stageTone(h.stage)} live={!c.paused} /><small className="hyp-w mono">{h.workers[h.stage]}</small></>}
      {h.stage === 'discarded' && <small className="hyp-why"><Icon n="x" s={11} />{REASONS[h.fate].label}</small>}
    </motion.button>
  )
}

function Board({ c, onPick }) {
  return (
    <LayoutGroup>
      <div className="board-wrap">
        <div className="board">
          {HSTAGES.map((st) => {
            const list = c.hyps.filter((h) => h.stage === st.k)
            const shown = st.k === 'kept' || st.k === 'discarded' ? [...list].reverse() : list
            return (
              <section key={st.k} className={`col col-${st.k}`}>
                <header><b>{st.label}</b><span className="count">{list.length}</span><small>{st.hint}</small></header>
                <div className="col-b">
                  {shown.map((h) => <HypCard key={h.id} c={c} h={h} onPick={onPick} />)}
                  {!shown.length && <p className="empty">—</p>}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </LayoutGroup>
  )
}

function Tree({ c, onPick }) {
  const lay = useMemo(() => {
    const kids = { root: [] }
    c.hyps.forEach((h) => { kids[h.id] = [] })
    c.hyps.forEach((h) => (kids[h.parent && kids[h.parent] ? h.parent : 'root']).push(h.id))
    const pos = {}
    let row = 0
    const walk = (id, depth) => {
      const ch = kids[id]
      if (!ch.length) { pos[id] = { d: depth, r: row++ }; return }
      ch.forEach((k) => walk(k, depth + 1))
      pos[id] = { d: depth, r: (pos[ch[0]].r + pos[ch[ch.length - 1]].r) / 2 }
    }
    walk('root', 0)
    return { pos, rows: row, depth: Math.max(...Object.values(pos).map((p) => p.d)) }
  }, [c.hyps.length, c.id])
  const CW = 272, RH = 46, NW = 240, NH = 34
  const X = (d) => 12 + d * CW, Y = (r) => 14 + r * RH
  const W = X(lay.depth) + NW + 12, H = Y(lay.rows - 1) + NH + 14
  return (
    <div className="tree-wrap">
      <svg className="tree" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Lineage of hypotheses">
        {c.hyps.map((h) => {
          const a = lay.pos[h.parent && lay.pos[h.parent] ? h.parent : 'root'], b = lay.pos[h.id]
          if (!b) return null
          const x1 = X(a.d) + (a.d === 0 ? 96 : NW), y1 = Y(a.r) + NH / 2, x2 = X(b.d), y2 = Y(b.r) + NH / 2, mx = (x1 + x2) / 2
          return <path key={h.id} d={`M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`} className={`tl s-${h.stage}`} fill="none" />
        })}
        <g className="troot"><rect x={X(0)} y={Y(lay.pos.root.r)} width="96" height={NH} rx="8" /><text x={X(0) + 12} y={Y(lay.pos.root.r) + 21}>Baseline</text></g>
        {c.hyps.map((h) => {
          const p = lay.pos[h.id]
          if (!p) return null
          return (
            <g key={h.id} className={`tnode s-${h.stage}`} onClick={() => onPick(h.id)} tabIndex={0} role="button" aria-label={`${h.id} ${h.t}`} onKeyDown={(e) => e.key === 'Enter' && onPick(h.id)}>
              <rect x={X(p.d)} y={Y(p.r)} width={NW} height={NH} rx="8" />
              <text x={X(p.d) + 10} y={Y(p.r) + 14} className="tid">{h.id} · {stageLabel(h)}</text>
              <text x={X(p.d) + 10} y={Y(p.r) + 27} className="ttl">{h.t.length > 40 ? h.t.slice(0, 39) + '…' : h.t}</text>
              <title>{h.t}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Drawer: one hypothesis, from idea to verdict                        */
/* ------------------------------------------------------------------ */
function Drawer({ c, h, onClose, onPick }) {
  const m = c.metric
  const steps = ['plan', 'implement', 'screen', 'promote']
  const cur = h.stage === 'discarded' ? h.rejAt : h.stage
  const child = c.hyps.filter((x) => x.parent === h.id)
  const log = logFor(c, h)
  const scale = Math.max(Math.abs(h.screen || 0), Math.abs(h.prom || 0), 0.05)
  const MBar = ({ label, g, k }) => (
    <div className="mrow">
      <span><Level k={k} /></span>
      <div className="mbar"><i className={g < 0 ? 'neg' : ''} style={{ width: `${(Math.abs(g) / scale) * 100}%` }} /></div>
      <b className="num">{fmtDelta(m, g)}</b><small className="num">{fmtVal(m, g)}</small>
    </div>
  )
  return (
    <motion.div className="scrim scrim-r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside className="drawer" onClick={(e) => e.stopPropagation()} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }} aria-label={`Hypothesis ${h.id}`}>
        <header className="dr-h">
          <div><span className="mono muted">{h.id}{h.parent && <> · follows <button type="button" className="link" onClick={() => onPick(h.parent)}>{h.parent}</button></>}</span><h2>{h.t}</h2></div>
          <Btn icon="x" onClick={onClose} aria-label="Close" />
        </header>
        <div className="dr-b">
          <div className="dr-meta"><Pill tone={stageTone(h.stage)} dot={ACTIVE.includes(h.stage)}>{stageLabel(h)}</Pill><span className="muted">cost ${h.cost.toFixed(2)}</span><span className="muted">proposed {tPlus(h.marks.idea)}</span></div>

          {h.stage === 'discarded' && (
            <section className="verdict bad">
              <h3><Icon n="x" />Why it was discarded</h3>
              <p className="v-code">{REASONS[h.fate].label} <span className="muted">· stopped in {HSTAGES.find((s) => s.k === h.rejAt)?.label.toLowerCase() || h.rejAt}</span></p>
              <p>{h.rej.d}</p>
              <dl className="ev">{h.rej.ev.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}</dl>
              {h.rej.lesson && <p className="lesson"><b>What Agent 2 took from it</b>{h.rej.lesson}</p>}
              {child.length > 0 && <p className="follow">Follow-up: {child.map((x) => <button key={x.id} type="button" className="link" onClick={() => onPick(x.id)}>{x.id} · {x.t}</button>)}</p>}
            </section>
          )}
          {h.stage === 'kept' && (
            <section className="verdict ok">
              <h3><Icon n="check" />Promoted into the candidate patch</h3>
              <p>The gain held on the isolated re-measurement. It counts toward the campaign best and will be re-measured once more by the verifier on held-out data.</p>
            </section>
          )}

          <section><h3>Hypothesis</h3><p>{h.why}</p></section>
          <section><h3>Plan</h3><ol className="plan">{h.plan.map((p) => <li key={p}>{p}</li>)}</ol></section>

          <section>
            <h3>Path</h3>
            <ol className="path">
              {steps.map((st) => {
                const i = steps.indexOf(st), ci = steps.indexOf(cur)
                const state = !h.marks[st] ? 'todo' : h.stage === 'kept' || i < ci ? 'done' : h.stage === 'discarded' ? 'fail' : 'now'
                return (
                  <li key={st} className={state}>
                    <i>{state === 'done' ? <Icon n="check" s={11} /> : state === 'fail' ? <Icon n="x" s={11} /> : ''}</i>
                    <b>{HSTAGES.find((s) => s.k === st).label}</b>
                    <small>{h.marks[st] ? `${tPlus(h.marks[st])} · ${h.workers[st]}` : 'not reached'}</small>
                    {state === 'now' && <Bar pct={h.p} tone={stageTone(st)} live={!c.paused} />}
                  </li>
                )
              })}
            </ol>
          </section>

          {(h.screen != null || h.prom != null) && (
            <section>
              <h3>Measurements <span className="muted">against baseline {fmtVal(m, 0)}</span></h3>
              {h.screen != null && <MBar k="screening" g={h.screen} />}
              {h.prom != null && <MBar k="promoted" g={h.prom} />}
              {h.stage === 'kept' && <p className="muted small">Verified level is measured once, on the final patch, by the trusted verifier.</p>}
            </section>
          )}

          <section>
            <h3>Files touched</h3>
            <ul className="files">{h.files.map(([f, a, d]) => <li key={f}><span className="mono">{f}</span><span className="num"><b className="c-ok">+{a}</b> <b className="c-bad">−{d}</b></span></li>)}</ul>
          </section>

          {log.length > 0 && (
            <section>
              <h3>Run log</h3>
              <pre className="log">{log.map((l, i) => <span key={i} className={l.bad ? 'c-bad' : l.ok ? 'c-ok' : ''}>{l.x}{'\n'}</span>)}{ACTIVE.includes(h.stage) && !c.paused && <span className="caret">▍</span>}</pre>
            </section>
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Feed, questions, steer                                              */
/* ------------------------------------------------------------------ */
function Feed({ c, onPick }) {
  const [f, setF] = useState('all')
  const [note, setNote] = useState('')
  const ctl = can('control', c)
  const evs = c.events.filter((e) => f === 'all' ? e.kind !== 'ambient' : f === 'verdicts' ? ['discard', 'promoted', 'verified', 'lesson'].includes(e.kind) : f === 'agent' ? e.src === 'agent2' || e.src === 'you' : true).slice(-60).reverse()
  const open = c.questions.filter((q) => !q.answer)
  const send = (e) => { e.preventDefault(); if (note.trim()) { act.steer(c, note.trim()); setNote('') } }
  return (
    <section className="card feed">
      <header className="card-h">
        <h2><i className={`dot ${c.paused || c.life === 7 ? '' : 'live'}`} />Live feed</h2>
        <div className="seg" role="tablist" aria-label="Filter feed">
          {[['all', 'Key events'], ['verdicts', 'Verdicts'], ['agent', 'Agent 2'], ['raw', 'Everything']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
      </header>
      {open.map((q) => (
        <div key={q.id} className="ask">
          <p><Icon n="q" /><span><b>Agent 2 asks</b>{q.text}</span></p>
          <div>{q.opts.map((o) => <Btn key={o} kind="soft" disabled={!ctl} why={whyNot('control')} onClick={() => act.answer(c, q, o)}>{o}</Btn>)}</div>
        </div>
      ))}
      <ol className="evs">
        <AnimatePresence initial={false}>
          {evs.map((e) => (
            <motion.li key={e.id} layout="position" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className={`ev-i k-${e.kind || 'x'}`}>
              <time className="mono">{tPlus(e.t)}</time>
              <span className={`src t-${SRC[e.src][1]}`}>{SRC[e.src][0]}</span>
              <span className="ev-t">{e.text}{e.hyp && <button type="button" className="link" onClick={() => onPick(e.hyp)}>open {e.hyp}</button>}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {c.life < 7 && (
        <form className="steer" onSubmit={send}>
          <input id="steer" value={note} onChange={(e) => setNote(e.target.value)} placeholder={ctl ? 'Steer Agent 2, e.g. “focus on the min / max kernels”' : whyNot('control')} disabled={!ctl} aria-label="Note to Agent 2" />
          <button type="submit" className="btn btn-primary" disabled={!ctl || !note.trim()}><Icon n="send" s={15} />Send note</button>
        </form>
      )}
    </section>
  )
}

function Spend({ c }) {
  const share = { agent2: 0.2, planner: 0.2, implementer: 0.45, reviewer: 0.15 }
  const names = { agent2: 'Agent 2', planner: 'Planners', implementer: 'Implementers', reviewer: 'Reviewers' }
  const ctl = can('control', c)
  return (
    <div className="two">
      <section className="card">
        <header className="card-h"><h2><Icon n="coin" />Spend by role</h2><span className="muted">reserved by the proxy before every call</span></header>
        <div className="roles">
          {Object.keys(share).map((k) => {
            const cap = c.cap * share[k], p = c.roles[k] / cap
            return (
              <div key={k} className="role">
                <span>{names[k]}</span><Bar pct={p} tone={p > 0.85 ? 'warn' : k === 'agent2' ? 'agent' : 'accent'} />
                <b className="num">${c.roles[k].toFixed(2)}</b><small className="num">of ${cap.toFixed(0)}</small>
              </div>
            )
          })}
        </div>
        <footer className="card-f">
          <span className="muted">Over a role cap the proxy answers 402. Past the deadline, 403.</span>
          {c.life < 7 && <Btn kind="soft" icon="plus" disabled={!ctl} why={whyNot('control')} onClick={() => act.raiseCap(c, 50)}>Raise cap by $50</Btn>}
        </footer>
      </section>
      <section className="card">
        <header className="card-h"><h2><Icon n="cpu" />Compute and guard rails</h2></header>
        <dl className="kv">
          <div><dt>Node</dt><dd className="mono">{c.node}</dd></div>
          <div><dt>Slurm job</dt><dd className="mono">{c.job} · owned by {userOf(c.owner).handle}</dd></div>
          <div><dt>GPUs leased</dt><dd>{c.gpus}</dd></div>
          <div><dt>CPU slot</dt><dd className="mono">{c.slot != null ? `CPUs ${cpuRange(c.slot)} on host B` : 'released'}</dd></div>
          <div><dt>Branch</dt><dd className="mono">campaign/{c.id}</dd></div>
          <div><dt>Evaluator</dt><dd className="mono">{c.life >= 3 ? `frozen · sha256 ${c.evalSha}` : 'frozen at set-up'}</dd></div>
        </dl>
        <ul className="lines">{HARD_LINES.map(([t, d]) => <li key={t}><Icon n="lock" s={14} /><span><b>{t}</b>{d}</span></li>)}</ul>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export default function Campaign({ c, go }) {
  useSim()
  const [tab, setTab] = useState('live')
  const [view, setView] = useState('board')
  const [sel, setSel] = useState(null)
  const st = campStatus(c)
  const ctl = can('control', c)
  const own = userOf(c.owner)
  const spent = spentOf(c)
  const kept = c.hyps.filter((h) => h.stage === 'kept')
  const dead = c.hyps.filter((h) => h.stage === 'discarded')
  const live = c.hyps.filter((h) => ACTIVE.includes(h.stage))
  const selH = sel && c.hyps.find((h) => h.id === sel)
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && setSel(null)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [])
  const why = {}
  dead.forEach((h) => { why[h.fate] = (why[h.fate] || 0) + 1 })
  const left = Math.max(0, c.clockH * 3600 - c.elapsed)
  const score = c.life === 7 ? c.verified : c.best
  return (
    <>
      <div className="head">
        <div>
          <button type="button" className="crumb" onClick={() => go('fleet')}><Icon n="back" s={14} />Campaigns</button>
          <h1>{c.name} <Pill tone={st.tone} dot>{st.label}</Pill></h1>
          <p className="sub">{c.goal}</p>
          <p className="meta mono"><span>{c.id}</span><span>{c.repo}@{c.sha}</span><span className="own"><Avatar name={own.name} />{own.name}</span></p>
        </div>
        <div className="head-a">
          {c.life < 7 ? (
            <>
              <Btn icon={c.paused ? 'play' : 'pause'} disabled={!ctl} why={whyNot('control')} onClick={() => act.pause(c)}>{c.paused ? 'Resume' : 'Pause'}</Btn>
              <Btn icon="flag" kind="soft" disabled={!ctl || c.life !== 4} why={ctl ? 'Available during the research loop' : whyNot('control')} onClick={() => act.finalize(c)}>Finalize now</Btn>
            </>
          ) : <Btn icon="results" kind="primary" onClick={() => go('r-' + c.id)}>Open result</Btn>}
        </div>
      </div>

      <section className="card pad"><LifeStrip c={c} big /></section>

      <section className="kpis">
        <div className="kpi hero">
          <span className="lab">{c.metric.label} <Level k={c.life === 7 ? 'verified' : 'promoted'} /></span>
          <strong><Num v={score} fmt={(g) => fmtVal(c.metric, g)} /></strong>
          <small><b className="c-ok">{fmtDelta(c.metric, score)}</b> vs baseline {fmtVal(c.metric, 0)}</small>
        </div>
        <div className="kpi row"><Ring pct={spent / c.cap} tone={spent / c.cap > 0.85 ? 'warn' : 'accent'}><b>{Math.round((spent / c.cap) * 100)}%</b></Ring><div><span className="lab">Spend</span><strong>$<Num v={spent} /></strong><small>of ${c.cap} cap</small></div></div>
        <div className="kpi row"><Ring pct={c.elapsed / (c.clockH * 3600)} tone="agent"><Icon n="clock" /></Ring><div><span className="lab">Clock</span><strong>{tPlus(c.elapsed).slice(2)}</strong><small>{c.life === 7 ? 'finished' : `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m left of ${c.clockH}h`}</small></div></div>
        <div className="kpi">
          <span className="lab">Hypotheses</span>
          <strong><Num v={c.hyps.length} /></strong>
          <small><b className="c-ok">{kept.length} kept</b> · <b className="c-accent">{live.length} live</b> · <b className="c-bad">{dead.length} discarded</b></small>
        </div>
      </section>

      <div className="tabs" role="tablist">
        {[['live', 'Live'], ['hyp', `Hypotheses · ${c.hyps.length}`], ['spend', 'Spend and compute']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'live' && (
        <>
          <section className="card">
            <header className="card-h"><h2><Icon n="bolt" />Where the work is right now</h2><span className="muted now-act">{c.paused ? 'Paused' : c.act}</span></header>
            <Topology c={c} />
          </section>
          <div className="two wide-l">
            <Feed c={c} onPick={setSel} />
            <div className="stack">
              <section className="card">
                <header className="card-h"><h2><Icon n="results" />Score over time</h2><span className="muted">line: best promoted · dots: each screening</span></header>
                <ScoreChart c={c} onPick={setSel} />
              </section>
              <section className="card">
                <header className="card-h"><h2>In flight</h2><button type="button" className="more" onClick={() => setTab('hyp')}>All hypotheses</button></header>
                <div className="inflight">
                  {live.map((h) => (
                    <button key={h.id} type="button" className="fl" onClick={() => setSel(h.id)}>
                      <span><b className="mono">{h.id}</b><Pill tone={stageTone(h.stage)}>{stageLabel(h)}</Pill></span>
                      <span className="fl-t">{h.t}</span><Bar pct={h.p} tone={stageTone(h.stage)} live={!c.paused} />
                    </button>
                  ))}
                  {!live.length && <p className="empty">{c.life === 7 ? 'Campaign delivered. Nothing is running.' : 'Nothing in the research loop at this step.'}</p>}
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {tab === 'hyp' && (
        <>
          <section className="card">
            <header className="card-h">
              <h2>Why ideas were discarded</h2>
              <span className="muted">{dead.length} of {c.hyps.length} so far · click any card for the evidence</span>
            </header>
            <div className="whys">
              {Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <div key={k} className="why"><span>{REASONS[k].label}</span><Bar pct={n / dead.length} tone="bad" /><b className="num">{n}</b></div>
              ))}
              {!dead.length && <p className="empty">No idea has been discarded yet.</p>}
            </div>
          </section>
          <section className="card">
            <header className="card-h">
              <h2>Hypotheses</h2>
              <div className="seg">
                <button type="button" className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}><Icon n="board" s={14} />Board</button>
                <button type="button" className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}><Icon n="tree" s={14} />Lineage</button>
              </div>
            </header>
            {view === 'board' ? <Board c={c} onPick={setSel} /> : <Tree c={c} onPick={setSel} />}
          </section>
        </>
      )}

      {tab === 'spend' && <Spend c={c} />}

      <AnimatePresence>{selH && <Drawer key="d" c={c} h={selH} onClose={() => setSel(null)} onPick={setSel} />}</AnimatePresence>
    </>
  )
}
