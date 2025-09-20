# RS One-Stop Wall (v1)

A personal "Facebook-like" wall with passcode access levels and an admin console.

## Quickstart (Local)
1. **Server** (in one terminal)
   ```bash
   cd server
   npm i
   cp .env.example .env
   # (optional) set SENDGRID_API_KEY, TWILIO creds, MIXPANEL_TOKEN
   node server.js
   ```
2. **Client** (another terminal)
   ```bash
   cd client
   npm i
   cp .env.example .env
   npm run dev
   ```
3. Open `http://localhost:5173`

**Default admin**: `saksham1926` / `timbaktu1234` (set in server/.env). First login will set a hash.

## Deployment (Netlify)
- Connect this repo to Netlify, set build command per `netlify.toml`.
- For server APIs, you can run the Express server separately (Render/Fly/Heroku) or convert endpoints to Netlify Functions in /netlify/functions (future v2). For now, Netlify dev proxy is configured for local.

## Features
- Passcode logins with levels (1-4)
- Events & itineraries, per-level visibility
- Google Drive folder link per event (use the folder ID); add Drive Picker later
- Booking voucher link per event
- Mixpanel tracking (`VITE_MIXPANEL_TOKEN` / `MIXPANEL_TOKEN`)
- Admin password reset via OTP (SendGrid email). (Configure server/.env)
- Announcements via email & SMS (SendGrid + Twilio)
- WhatsApp button to `wa.me/9846452228`
- Futuristic glass UI, chrome buttons, rain theme, background audio (placeholders present)
- Ratings on logout endpoint `/api/rate` (call from UI as needed)

## To-Do / Next
- Implement Google Drive Picker with OAuth (needs keys).
- Migrate Express APIs to Netlify Functions for all-in-one Netlify hosting.
- Replace placeholder media with licensed/public-domain files.
- Harden security (JWTs, HTTPS-only cookies).