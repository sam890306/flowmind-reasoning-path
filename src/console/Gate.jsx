// Screens shown before the console itself: sign in, waiting for approval, and "not configured yet".
import { useState } from 'react'
import { useSim, act } from './store'
import { Icon, Btn } from './ui'

const AUTH_ERRORS = {
  domain_not_allowed: 'That Google account is outside the domains allowed for this lab.',
  email_not_verified: 'Google reports that this email address is not verified.',
  account_denied: 'An operator declined this account’s access request.',
  account_disabled: 'This account has been disabled by an operator.',
  access_denied: 'Sign-in was cancelled.',
  state_mismatch: 'The sign-in attempt expired. Try again.',
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.600 1.200 9.100 3.600l6.800-6.800C35.800 2.400 30.300 0 24 0 14.600 0 6.500 5.400 2.600 13.200l7.900 6.100C12.400 13.600 17.700 9.500 24 9.500z" />
    <path fill="#4285F4" d="M46.500 24.500c0-1.600-.1-3.100-.4-4.500H24v9h12.700c-.6 3-2.300 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z" />
    <path fill="#FBBC05" d="M10.500 28.700A14.500 14.500 0 019.700 24c0-1.600.3-3.200.8-4.700l-7.900-6.100A24 24 0 000 24c0 3.900.9 7.500 2.600 10.800l7.900-6.100z" />
    <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-5 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
  </svg>
)

const Frame = ({ children }) => (
  <div className="gate">
    <div className="aurora" aria-hidden="true" />
    <main className="gate-card">
      <div className="brand"><span className="logo"><i /><i /><i /></span><span className="brand-t">AutoResearch<small>Console</small></span></div>
      {children}
    </main>
  </div>
)

function DevLogin() {
  const [email, setEmail] = useState('')
  return (
    <form className="gate-dev" onSubmit={(e) => { e.preventDefault(); if (email.trim()) act.devLogin(email.trim(), email.split('@')[0]) }}>
      <label htmlFor="dev-email">Development sign-in (AUTH_DEV_LOGIN is on)</label>
      <div><input id="dev-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /><Btn kind="soft" type="submit">Sign in</Btn></div>
    </form>
  )
}

export default function Gate() {
  const s = useSim()
  const cfg = s.config

  if (s.status === 'loading') return <Frame><p className="muted">Loading…</p></Frame>

  if (s.status === 'unconfigured') {
    const rows = [
      ['database', 'DATABASE_URL', 'Postgres connection string'],
      ['sessionSecret', 'SESSION_SECRET', '32+ random characters that sign the session cookie'],
      ['google', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET', 'OAuth client for Google sign-in'],
      ['operators', 'OPERATOR_EMAILS', 'who becomes an operator on first sign-in'],
    ]
    return (
      <Frame>
        <h1>Finish setting up this deployment</h1>
        <p className="sub">{cfg ? 'The console is deployed but some settings are missing. Add them as environment variables and redeploy.' : 'The API did not answer. Check that the deployment includes the /api function.'}</p>
        {cfg && <ul className="gate-list">{rows.map(([k, name, what]) => (
          <li key={k} className={cfg[k] ? 'ok' : 'todo'}><Icon n={cfg[k] ? 'check' : 'x'} s={15} /><span><b className="mono">{name}</b>{what}</span></li>
        ))}</ul>}
        <p className="muted small">See README.md, “Deploy to Vercel”.</p>
      </Frame>
    )
  }

  if (s.status === 'pending') {
    const p = s.profile
    return (
      <Frame>
        <h1>Waiting for an operator</h1>
        <p className="sub">You are signed in as <b>{p.email}</b>. An operator of this lab has to approve your access before you can see campaigns.</p>
        <div className="gate-ask">
          <span>I am asking for</span>
          <div className="seg">
            {[['member', 'Member · run campaigns'], ['viewer', 'Viewer · read only']].map(([k, l]) => (
              <button key={k} type="button" className={p.asked === k ? 'on' : ''} onClick={() => act.setAsked(k)}>{l}</button>
            ))}
          </div>
        </div>
        <p className="muted small">This page updates by itself once you are approved.</p>
        <Btn icon="out" onClick={act.signOut}>Sign out</Btn>
      </Frame>
    )
  }

  return (
    <Frame>
      <h1>Sign in to the lab console</h1>
      <p className="sub">Campaigns, live hypotheses, verified results and spend for your AutoResearch lab.</p>
      {s.authError && <p className="err" role="alert">{AUTH_ERRORS[s.authError] || `Sign-in failed (${s.authError}).`}</p>}
      {cfg?.google
        ? <a className="btn btn-google" href="/api/auth/google"><GoogleMark />Continue with Google</a>
        : <p className="err">Google sign-in is not configured for this deployment yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).</p>}
      {cfg?.devLogin && <DevLogin />}
      <p className="muted small">New accounts wait for an operator’s approval. Access is by role: viewer, member or operator.</p>
    </Frame>
  )
}
