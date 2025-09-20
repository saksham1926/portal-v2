import React, { useEffect, useState } from 'react'
import dayjs from 'dayjs'

export default function Wall() {
  const [events, setEvents] = useState([])

  useEffect(() => {
    // Read the viewer’s access level from sessionStorage first.  Fall back to
    // localStorage for backwards compatibility.  Default to 0 (show all) if
    // nothing is stored.
    const storedLevel = sessionStorage.getItem('accessLevel') ?? localStorage.getItem('accessLevel') ?? '0'
    const level = Number(storedLevel) || 0
    fetch('/api/events?level='+level).then(r=>r.json()).then(data => {
      setEvents(Array.isArray(data) ? data : [])
    }).catch(() => setEvents([]))
  }, [])

  return (
    <div className="min-h-screen text-white p-6 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-6">Family Events & Itineraries</h1>
      <div className="grid md:grid-cols-2 gap-6">
        {events.map(ev => (
          <div key={ev.id} className="glass p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{ev.title}</h3>
              <span className="text-white/60">{dayjs(ev.date).format('DD MMM YYYY')}</span>
            </div>
            <p className="mt-2 text-white/80">{ev.description}</p>
            {ev.driveFolderId && (
              <a className="underline mt-2 inline-block" target="_blank" href={`https://drive.google.com/drive/folders/${ev.driveFolderId}`}>Open Google Drive folder</a>
            )}
            {ev.bookingUrl && (
              <a className="underline mt-2 ml-4 inline-block" target="_blank" href={ev.bookingUrl}>Booking voucher</a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}