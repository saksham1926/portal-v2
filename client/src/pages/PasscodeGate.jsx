import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import mixpanel from 'mixpanel-browser'

export default function PasscodeGate() {
  const [code, setCode] = useState('')
  const [level, setLevel] = useState(0)
  const nav = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/passcode/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: code }),
    })
    const data = await res.json()
    if (res.ok) {
      // Store session and access level in sessionStorage so it resets on refresh.
      try {
        // Always store sessions in sessionStorage so they are cleared on refresh
        // and never persist across browser restarts.  If sessionStorage
        // isn’t available (for example, in very old browsers) we do not
        // attempt to fall back to localStorage because that would persist
        // the session and allow automatic logins on page reloads.
        sessionStorage.setItem('session', data.session)
        sessionStorage.setItem('accessLevel', String(data.level))
      } catch (err) {
        // Ignore storage errors silently.  The session will exist only
        // in memory and therefore expire on refresh.
      }
      mixpanel.identify(data.session)
      mixpanel.track('passcode_login', { level: data.level })
      nav('/wall')
    } else {
      alert(data.message || 'Invalid passcode')
    }
  }

  return (
    <div className="min-h-screen grid place-items-center text-white">
      <form onSubmit={submit} className="glass p-8 w-[min(92vw,420px)] space-y-4">
        <h2 className="text-2xl font-semibold">Enter Passcode</h2>
        <input className="w-full p-3 rounded bg-white/10 outline-none" placeholder="••••••••" value={code} onChange={e=>setCode(e.target.value)} />
        <button className="future-button w-full py-3" type="submit">Enter</button>
      </form>
    </div>
  )
}