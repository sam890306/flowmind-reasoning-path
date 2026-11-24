import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSim, act, boot, watchCampaign, agentUp, ago } from './store'
import { Icon, Pill, Avatar } from './ui'
import Gate from './Gate'
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

function UserMenu({ me, role }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('mousedown', off); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', off); removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="user" ref={ref}>
      <button type="button" className="user-b" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {me.picture ? <img src={me.picture} alt="" referrerPolicy="no-referrer" /> : <Avatar name={me.name} />}
        <span>{me.name}</span><Pill tone={role === 'operator' ? 'agent' : role === 'member' ? 'accent' : 'mute'}>{role}</Pill>
      </button>
      {open && (
        <div className="user-m" role="menu">
          <p><b>{me.name}</b><small>{me.email}</small><small className="mono">handle {me.handle}</small></p>
          <button type="button" role="menuitem" onClick={act.signOut}><Icon n="out" s={15} />Sign out</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const s = useSim()
  const [route, setRoute] = useState(readHash)
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    boot()
    const on = () => setRoute(readHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { if (theme) document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { watchCampaign(route.startsWith('c-') || route.startsWith('r-') ? route.slice(2) : null) }, [route])
  useEffect(() => {
    if (!s.toast) return
    const id = setTimeout(act.dismissToast, 6000)
    return () => clearTimeout(id)
  }, [s.toast])

  if (s.status !== 'ready') return <Gate />

  const go = (r) => { location.hash = r; setRoute(r); window.scrollTo(0, 0) }
  const camp = route.startsWith('c-') ? s.campaigns.find((c) => 'c-' + c.id === route) : null
  const res = route.startsWith('r-') ? s.campaigns.find((c) => 'r-' + c.id === route) : null
  const section = camp ? 'fleet' : res ? 'results' : NAV.some((n) => n[0] === route) ? route : 'fleet'
  const running = s.campaigns.filter((c) => c.live).length
  const asks = s.campaigns.reduce((a, c) => a + (c.live ? c.questions.filter((q) => !q.answer).length : 0), 0)
  const dark = theme ? theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches
  const up = agentUp(), used = s.slots.filter((x) => x !== null).length

  return (
    <div className="shell">
      <div className="aurora" aria-hidden="true" />
      <nav className="rail" aria-label="Sections">
        <a className="brand" href="#fleet" onClick={() => go('fleet')}>
          <span className="logo"><i /><i /><i /></span>
          <span className="brand-t">AutoResearch<small>{s.lab.name}</small></span>
        </a>
        <div className="rail-nav">
          {NAV.map(([k, label, icon]) => (
            <button key={k} type="button" className={`rail-i${section === k ? ' on' : ''}`} onClick={() => go(k)} aria-current={section === k ? 'page' : undefined}>
              <Icon n={icon} s={18} /><span>{label}</span>
              {k === 'fleet' && running > 0 && <b className="count">{running}</b>}
              {k === 'access' && s.role === 'operator' && s.enrollments.length > 0 && <b className="count warn">{s.enrollments.length}</b>}
            </button>
          ))}
        </div>
        <div className="rail-foot">
          <div className="host" title={s.agentSeenAt ? `Last contact ${new Date(s.agentSeenAt).toLocaleString()}` : 'The agent service has not connected to this console yet'}>
            <span className="host-h"><i className={`dot ${up ? 'live' : 'off'}`} />Agent service</span>
            <span className="host-r">{up ? `connected · ${used}/${s.slots.length} slots` : s.agentSeenAt ? `last seen ${ago(s.agentSeenAt)}` : 'not connected yet'}</span>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="top">
          <div className="top-l">
            {!s.online && <Pill tone="warn" dot>Reconnecting…</Pill>}
            {asks > 0 && <Pill tone="warn" dot>{asks} question{asks > 1 ? 's' : ''} from Agent 2</Pill>}
          </div>
          <div className="top-r">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Switch theme">{dark ? 'Light' : 'Dark'}</button>
            <UserMenu me={s.profile} role={s.role} />
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

      <AnimatePresence>
        {s.toast && (
          <motion.div key={s.toast.id} className="toast" role="alert" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
            <span>{s.toast.text}</span><button type="button" onClick={act.dismissToast} aria-label="Dismiss"><Icon n="x" s={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
