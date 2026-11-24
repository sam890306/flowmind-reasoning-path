import { useEffect, useRef, useState } from 'react'
import { REASONS } from './data'

const P = {
  fleet: 'M3 5h7v6H3zM14 5h7v4h-7zM14 12h7v7h-7zM3 14h7v5H3z',
  results: 'M5 20V10m7 10V4m7 16v-7',
  access: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4',
  usage: 'M4 19h16M6 16V9m4 7V5m4 11v-5m4 5V8',
  plus: 'M12 5v14M5 12h14',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  cpu: 'M8 8h8v8H8zM4 10h4M4 14h4M16 10h4M16 14h4M10 4v4M14 4v4M10 16v4M14 16v4',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  coin: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v10M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1 1.800 3 2 3 .900 3 2-1.300 2-3 2c-1.400 0-2.500-.5-3-1.500',
  tree: 'M6 4v6a4 4 0 004 4h8M6 10v6a4 4 0 004 4h8M4 4h4M18 12h2v4h-2zM18 18h2v4h-2z',
  board: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v12h-4z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  q: 'M9.500 9a2.500 2.500 0 115 0c0 1.700-2.500 2-2.500 4M12 17h.010M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}
export const Icon = ({ n, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[n]} />
  </svg>
)

export const Pill = ({ tone = 'mute', children, dot, title }) => (
  <span className={`pill t-${tone}`} title={title}>{dot && <i className="dot" />}{children}</span>
)

export const stageTone = (st) => ({ idea: 'mute', plan: 'agent', implement: 'agent', screen: 'accent', promote: 'accent', kept: 'ok', discarded: 'bad' }[st])
export const stageLabel = (h) => ({ idea: 'Idea', plan: 'Planning', implement: 'Implementing', screen: 'Screening', promote: 'Re-measuring', kept: 'Promoted', discarded: REASONS[h.fate]?.label || 'Discarded' }[h.stage])

export function campStatus(c) {
  if (c.life === 7) return { tone: 'ok', label: 'Delivered' }
  if (c.paused) return { tone: 'warn', label: 'Paused' }
  if (c.questions.some((q) => !q.answer)) return { tone: 'warn', label: 'Needs your answer' }
  if (c.life === 6) return { tone: 'accent', label: 'Verifying' }
  if (c.life === 5) return { tone: 'accent', label: 'Finalizing' }
  if (c.life < 4) return { tone: 'agent', label: 'Setting up' }
  return { tone: 'live', label: 'Researching' }
}

export const Level = ({ k }) => <span className={`lvl lvl-${k}`}>{k}</span>

/** Number that eases to its new value. `fmt` turns the animated number into text. */
export function Num({ v, fmt = (x) => x.toFixed(0), ms = 700 }) {
  const [shown, setShown] = useState(v)
  const from = useRef(v)
  useEffect(() => {
    const a = from.current, t0 = performance.now()
    if (a === v || matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(v); from.current = v; return }
    let raf
    const loop = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3)
      setShown(a + (v - a) * e)
      if (k < 1) raf = requestAnimationFrame(loop); else from.current = v
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); from.current = v }
  }, [v, ms])
  return <span className="num">{fmt(shown)}</span>
}

export function Spark({ data, w = 120, h = 34, tone = 'accent' }) {
  if (data.length < 2) data = [0, 0]
  const max = Math.max(...data, 0.0001), min = Math.min(...data, 0)
  const x = (i) => (i / (data.length - 1)) * (w - 4) + 2
  const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8)
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg className={`spark t-${tone}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="trend">
      <path d={`${line}L${x(data.length - 1)},${h}L2,${h}Z`} className="spark-a" />
      <path d={line} className="spark-l" fill="none" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.6" className="spark-d" />
    </svg>
  )
}

export function Ring({ pct, size = 64, tone = 'accent', children }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct))
  return (
    <div className={`ring t-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  )
}

export const Bar = ({ pct, tone = 'accent', live }) => (
  <div className={`bar t-${tone}${live ? ' live' : ''}`}><i style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} /></div>
)

export const Avatar = ({ name }) => {
  const ini = name.split(' ').map((x) => x[0]).slice(0, 2).join('')
  const hue = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360
  return <span className="avatar" style={{ '--h': hue }}>{ini}</span>
}

export function Btn({ icon, children, kind = 'ghost', disabled, why, ...rest }) {
  return (
    <button type="button" className={`btn btn-${kind}`} {...rest} disabled={disabled} title={disabled ? why : rest.title}>
      {icon && <Icon n={icon} s={15} />}{children}
    </button>
  )
}

export function Copy({ text }) {
  const [ok, setOk] = useState(false)
  const ref = useRef(null)
  const go = () => {
    const done = () => { setOk(true); setTimeout(() => setOk(false), 1400) }
    try { navigator.clipboard.writeText(text).then(done, select) } catch { select() }
  }
  const select = () => { const r = document.createRange(); r.selectNodeContents(ref.current); const s = getSelection(); s.removeAllRanges(); s.addRange(r) }
  return (
    <div className="copy">
      <code ref={ref}>{text}</code>
      <button type="button" className="btn btn-ghost btn-sm" onClick={go}><Icon n={ok ? 'check' : 'copy'} s={14} />{ok ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

export const SRC = {
  agent2: ['Agent 2', 'agent'], engine: ['Run box', 'accent'], proxy: ['Model proxy', 'warn'], broker: ['Node broker', 'node'],
  verifier: ['Verifier', 'ok'], agentd: ['agentd', 'host'], service: ['Agent service', 'host'], tools: ['Tool server', 'mute'], you: ['Teammate', 'mate'],
}
