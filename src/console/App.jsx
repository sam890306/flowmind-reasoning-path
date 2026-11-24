import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSim, tick, act, S, SLOTS } from './engine'
import { Icon, Pill } from './ui'
import Fleet from './Fleet'
import Campaign from './Campaign'
import Results from './Results'
import { Access, Usage } from './Admin'

const NAV = [
  ['fleet', 'Campaigns', 'fleet'],
  ['results', 'Results', 'results'],
  ['usage', 'Usage', 'usage'],
  ['access', 'Access', 'access'],
]

const readHash = () => (location.hash || '#fleet').slice(1)

export default function App() {
  const s = useSim()
  const [route, setRoute] = useState(readHash)
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    const on = () => setRoute(readHash())
    addEventListener('hashchange', on)
    const id = setInterval(tick, 1100)
    return () => { removeEventListener('hashchange', on); clearInterval(id) }
  }, [])
  useEffect(() => { if (theme) document.documentElement.dataset.theme = theme }, [theme])

  const go = (r) => { location.hash = r; setRoute(r); window.scrollTo(0, 0) }
  const camp = route.startsWith('c-') ? s.campaigns.find((c) => 'c-' + c.id === route) : null
  const res = route.startsWith('r-') ? s.campaigns.find((c) => 'r-' + c.id === route) : null
  const section = camp ? 'fleet' : res ? 'results' : NAV.some((n) => n[0] === route) ? route : 'fleet'
  const running = s.campaigns.filter((c) => c.life < 7).length
  const asks = s.campaigns.reduce((a, c) => a + c.questions.filter((q) => !q.answer).length, 0)
  const dark = theme ? theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches

  return (
    <div className="shell">
      <div className="aurora" aria-hidden="true" />
      <nav className="rail" aria-label="Sections">
        <a className="brand" href="#fleet" onClick={() => go('fleet')}>
          <span className="logo"><i /><i /><i /></span>
          <span className="brand-t">AutoResearch<small>Flowmind Lab</small></span>
        </a>
        <div className="rail-nav">
          {NAV.map(([k, label, icon]) => (
            <button key={k} type="button" className={`rail-i${section === k ? ' on' : ''}`} onClick={() => go(k)} aria-current={section === k ? 'page' : undefined}>
              <Icon n={icon} s={18} /><span>{label}</span>
              {k === 'fleet' && <b className="count">{running}</b>}
              {k === 'access' && s.role === 'operator' && s.enrollments.length > 0 && <b className="count warn">{s.enrollments.length}</b>}
            </button>
          ))}
        </div>
        <div className="rail-foot">
          <div className="host">
            <span className="host-h"><i className="dot live" />Operator host</span>
            <span className="host-r">agentd up · {SLOTS - s.slots.filter((x) => x === null).length}/{SLOTS} slots</span>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="top">
          <div className="top-l">
            <Pill tone="mute" title="Every campaign, score and name on this page is sample data replayed by a local simulator.">Sample data · simulated live</Pill>
            {asks > 0 && <Pill tone="warn" dot>{asks} question{asks > 1 ? 's' : ''} from Agent 2</Pill>}
          </div>
          <div className="top-r">
            <label className="viewas" htmlFor="role">
              <span>View as</span>
              <select id="role" value={s.role} onChange={(e) => act.setRole(e.target.value)}>
                <option value="operator">Operator</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Switch theme">{dark ? 'Light' : 'Dark'}</button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main key={camp ? route : res ? route : section} className="page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            {camp ? <Campaign c={camp} go={go} />
              : section === 'fleet' ? <Fleet go={go} />
              : section === 'results' ? <Results go={go} pick={res} />
              : section === 'usage' ? <Usage go={go} />
              : <Access />}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}

export { S }
