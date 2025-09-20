import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import mixpanel from 'mixpanel-browser'

mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN || '', { debug: false })

export default function Landing() {
  const [typing, setTyping] = useState('a personal wall')
  const audioRef = useRef(null)

  useEffect(() => {
    const phrases = ['a personal wall', 'Coldplay × Beatles vibes', 'glass • chrome • future']
    let i = 0
    const id = setInterval(() => { i = (i + 1) % phrases.length; setTyping(phrases[i]) }, 2400)
    mixpanel.track('landing_view')
    return () => clearInterval(id)
  }, [])

  const play = () => {
    if (audioRef.current) audioRef.current.play().catch(() => {})
  }

  return (
    <div className="min-h-screen bg-glass text-white relative overflow-hidden" onMouseMove={play}>
      <div className="rain"></div>
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-10">
        <source src="/assets/abstract-bg.mp4" type="video/mp4"/>
      </video>
      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-28">
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-5xl md:text-7xl font-extrabold tracking-tight"
        >
          ONE•STOP <span className="text-chrome">{'//'} RS</span>
        </motion.h1>
        <p className="mt-6 text-xl md:text-2xl text-white/80 typing">{typing}</p>

        <div className="mt-12 flex gap-4 flex-wrap">
          <Link to="/passcode" className="future-button px-6 py-3">Enter with Passcode</Link>
          <Link to="/admin" className="future-button px-6 py-3">Admin Login</Link>
          <a className="future-button px-6 py-3" href="https://wa.me/9846452228" target="_blank">WhatsApp</a>
        </div>

        <p className="mt-10 text-white/60">Theme: Rainfall • Background music: Beethoven – Für Elise (low)</p>
      </div>
      <audio ref={audioRef} src="/assets/fur-elise.mp3" loop></audio>
      <audio src="/assets/rain.mp3" loop autoPlay></audio>
    </div>
  )
}