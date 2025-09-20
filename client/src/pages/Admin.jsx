import React, { useEffect, useState } from 'react'
import mixpanel from 'mixpanel-browser'

// Use sessionStorage rather than localStorage for admin sessions.  This ensures
// a fresh login is required whenever the browser session ends (e.g. on refresh
// or new tab) and avoids pre‑filled credentials being persisted across
// deployments.  Falling back to an empty string when the key is absent
// maintains the previous behaviour of returning '' when no session is stored.
function useAdminSession() {
  // Always use sessionStorage for the admin session.  If the key is not
  // present, return an empty string.  We avoid falling back to
  // localStorage here so that a hard refresh or new tab always requires
  // re‑authentication, preventing automatic logins.
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem('adminSession') || '';
    } catch (err) {
      return '';
    }
  });
  return [token, setToken];
}

export default function Admin() {
  const [token, setToken] = useAdminSession();
  // Do not prefill the password field.  Initialising it to an empty string
  // enforces that the admin must enter their password on every login attempt.
  const [form, setForm] = useState({ username: 'saksham1926', password: '' });
  const [events, setEvents] = useState([])
  const [passcodes, setPasscodes] = useState([])
  const [ann, setAnn] = useState({ title: '', message: '', emails: '', phones: '' })
  const authed = !!token

  // On mount, clear any stale adminSession stored in localStorage.  Older
  // versions of the portal persisted the admin session in localStorage,
  // causing automatic logins even after a refresh.  Removing these keys
  // ensures a fresh login is required every time.  We also clear
  // sessionStorage to enforce a logout if the page is loaded in a new tab.
  useEffect(() => {
    try {
      localStorage.removeItem('adminSession');
    } catch (_) {
      // ignore errors
    }
    try {
      sessionStorage.removeItem('adminSession');
    } catch (_) {
      // ignore errors
    }
  }, []);

  const login = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) })
    const data = await res.json()
    if (res.ok) {
      // Store the admin session in sessionStorage so it is cleared on refresh.
      try {
        sessionStorage.setItem('adminSession', data.session);
      } catch (err) {
        // ignore storage errors; session will be stored in memory only
      }
      setToken(data.session)
      mixpanel.identify('admin_'+data.session)
      mixpanel.track('admin_login')
      load()
    } else { alert(data.message || 'Login failed') }
  }

  const load = async () => {
    try {
      const [evRes, pcRes] = await Promise.all([
        fetch('/api/events').then(r => r.json()),
        fetch('/api/passcodes').then(r => r.json()),
      ]);
      // Some API calls may return an object with an error message instead of an
      // array.  Ensure the values passed to setState are always arrays to
      // prevent `.map` from being called on non‑array types.
      const evList = Array.isArray(evRes) ? evRes : [];
      const pcList = Array.isArray(pcRes) ? pcRes : [];
      setEvents(evList);
      setPasscodes(pcList);
    } catch (err) {
      // If fetching fails entirely, reset events and passcodes to empty arrays
      setEvents([]);
      setPasscodes([]);
    }
  }

  useEffect(()=>{ if (authed) load() }, [authed])

  const addEvent = async () => {
    const title = prompt('Event title?')
    if (!title) return
    const date = prompt('Date (YYYY-MM-DD)?', new Date().toISOString().slice(0,10))
    const level = Number(prompt('Min access level (1-4)?', '1')||'1')
    const description = prompt('Description?') || ''
    const driveFolderId = prompt('Google Drive folder ID (optional)') || ''
    const bookingUrl = prompt('Booking.com voucher link (optional)') || ''
    await fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, date, level, description, driveFolderId, bookingUrl }) })
    load()
  }

  const addPasscode = async () => {
    const passcode = prompt('New passcode?')
    const level = Number(prompt('Level 1-4?','1')||'1')
    await fetch('/api/passcodes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ passcode, level })})
    load()
  }

  const announce = async () => {
    await fetch('/api/announce', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(ann) })
    alert('Announcement triggered (email/SMS if configured).')
    setAnn({ title:'', message:'', emails:'', phones:'' })
  }

  if (!authed) {
    return (
      <div className="min-h-screen grid place-items-center text-white">
        <form onSubmit={login} className="glass p-8 w-[min(92vw,480px)] space-y-3">
          <h2 className="text-3xl font-bold">Admin Console</h2>
          <p className="text-white/70">Matrix spaceship mode • JAZZ MAXX OUT</p>
          <input className="w-full p-3 rounded bg-white/10" placeholder="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>
          <input className="w-full p-3 rounded bg-white/10" placeholder="password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
          <button className="future-button w-full py-3">Enter</button>
          <a className="underline block mt-2" href="#" onClick={async (e)=>{e.preventDefault(); const email=prompt('Email to send OTP to?','saksham1926@gmail.com'); const r=await fetch('/api/admin/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); alert('If configured, OTP sent.');}}>Forgot password?</a>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white p-6">
      <h1 className="text-4xl font-extrabold">Admin Dashboard</h1>
      <p className="text-white/70">Control center • themes • tracking • passcodes • events</p>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="glass p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Events</h2>
            <button className="future-button px-4 py-2" onClick={addEvent}>Add event</button>
          </div>
          <ul className="mt-4 space-y-2">
            {/* Only render the list when events is an array to avoid runtime errors */}
            {Array.isArray(events) && events.map(e => (
              <li key={e.id} className="flex items-center justify-between">
                <span>{e.title} • L{e.level} • {e.date}</span>
                <button className="underline text-sm" onClick={async()=>{await fetch('/api/events/'+e.id,{method:'DELETE'}); load()}}>Delete</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Passcodes</h2>
            <button className="future-button px-4 py-2" onClick={addPasscode}>Add passcode</button>
          </div>
          <ul className="mt-4 space-y-2">
            {/* Only render the list when passcodes is an array to avoid runtime errors */}
            {Array.isArray(passcodes) && passcodes.map(p => (
              <li key={p.passcode} className="flex items-center justify-between">
                <span>{p.passcode} • L{p.level}</span>
                <button className="underline text-sm" onClick={async()=>{await fetch('/api/passcodes/'+encodeURIComponent(p.passcode),{method:'DELETE'}); load()}}>Delete</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h2 className="text-2xl font-semibold mb-3">Announcements</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <input className="p-3 rounded bg-white/10" placeholder="Title" value={ann.title} onChange={e=>setAnn({...ann,title:e.target.value})}/>
            <input className="p-3 rounded bg-white/10" placeholder="Email list (comma separated)" value={ann.emails} onChange={e=>setAnn({...ann,emails:e.target.value})}/>
            <input className="p-3 rounded bg-white/10" placeholder="Phone list (comma separated)" value={ann.phones} onChange={e=>setAnn({...ann,phones:e.target.value})}/>
            <textarea className="p-3 rounded bg-white/10 md:col-span-2" placeholder="Message" value={ann.message} onChange={e=>setAnn({...ann,message:e.target.value})}></textarea>
          </div>
          <button className="future-button px-6 py-3 mt-3" onClick={announce}>Send Announcement</button>
        </div>
      </div>
    </div>
  )
}