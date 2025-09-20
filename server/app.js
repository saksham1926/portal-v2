import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
// We previously used a JSON file for local persistence, but this had two
// major drawbacks in a serverless environment: the `/tmp` directory is
// reset whenever Netlify spins up a new function instance, and data is
// lost on every deploy. To solve this we migrate storage to Supabase.
// Supabase provides a hosted Postgres database with a REST API. We read
// and write data using HTTP calls to Supabase's REST endpoint.

// Native Node 18 includes the Fetch API, so we don't need an extra
// dependency to perform HTTP requests.
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import Mixpanel from 'mixpanel';

// Load environment variables from .env if present. Netlify automatically injects
// variables from the project’s environment settings at runtime, but this makes
// local development convenient.
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Determine where to store our JSON data. On Netlify functions the working
// directory is read-only, so default to /tmp for runtime writes. During
// local development you can point DATABASE_PATH to something else.
const dataPath = process.env.DATABASE_PATH || '/tmp/portal.json';

// Path to seed data bundled with the function. If no seed file exists we
// initialise a blank structure.
const seedPath = path.resolve(__dirname, '../data/portal.json');

// Define the initial shape of our data. Admin credentials come from
// environment variables; passcodes, events, sessions and ratings start
// empty. Feel free to extend this object if you add more tables.
function initialData() {
  return {
    admin: {
      username: process.env.ADMIN_USERNAME || 'admin',
      password_hash: process.env.ADMIN_PASSWORD_HASH || '',
      theme: 'rainfall'
    },
    passcodes: [],
    events: [],
    sessions: [],
    ratings: []
  };
}

// Load the data from JSON. If the file doesn't exist we attempt to copy
// from a bundled seed. If that also fails we fall back to our initial
// structure. Any parse errors will reset to initial structure as well.
function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch (err) {
        // Parsing failed. We'll fall back to initial structure below.
        data = null;
      }
      // If we parsed the data successfully, override the admin credentials
      // with any environment variables provided. This ensures that updating
      // ADMIN_USERNAME or ADMIN_PASSWORD_HASH in the Netlify dashboard
      // immediately takes effect without needing to delete the persisted file.
      if (data && typeof data === 'object') {
        if (!data.admin) data.admin = {};
        if (process.env.ADMIN_USERNAME) {
          data.admin.username = process.env.ADMIN_USERNAME;
        }
        if (process.env.ADMIN_PASSWORD_HASH) {
          data.admin.password_hash = process.env.ADMIN_PASSWORD_HASH;
        }
        // Persist any overrides so subsequent invocations use the updated values.
        try {
          fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        } catch (err) {
          // ignore write errors
        }
        return data;
      }
    }
    // If a seed exists copy it to the destination and return it
    if (fs.existsSync(seedPath)) {
      const seedRaw = fs.readFileSync(seedPath, 'utf-8');
      fs.writeFileSync(dataPath, seedRaw);
      return JSON.parse(seedRaw);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load data:', err);
  }
  // Fall back to initial structure
  const data = initialData();
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (err) {
    // ignore write errors – /tmp may be readonly in some environments
  }
  return data;
}

// Persist the data back to disk. If it fails we log the error but do not
// throw; the function will still return normally but changes will be lost.
function saveData(data) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to save data:', err);
  }
}

const mixpanel = process.env.MIXPANEL_TOKEN ? Mixpanel.init(process.env.MIXPANEL_TOKEN) : null;
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const tw = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

// Supabase configuration. Set SUPABASE_URL to your project’s URL (e.g.
// https://xyzcompany.supabase.co) and SUPABASE_ANON_KEY to your anon API
// key in the Netlify environment variables. The anon key is safe to
// expose client-side for public tables. Do NOT use the service key here.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Helper to call the Supabase REST API. The `method` should be one of
// GET, POST, PATCH, or DELETE. For GET requests the `query` string is
// appended to the URL. For POST/PATCH requests the `body` is sent as
// JSON. A Promise is returned that resolves to the parsed JSON
// response. Errors throw an exception with the response text.
async function sbRequest({ method = 'GET', table, query = '', body = null, prefer = '' }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase URL or key not configured');
  }
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (query) {
    // Ensure query begins with '?' or proper encoding
    url += `?${query}`;
  }
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${text}`);
  }
  // Supabase returns an array for select/insert by default
  const data = await res.json();
  return data;
}

// Convenience wrappers around sbRequest for common operations
async function sbSelect(table, filter = '', columns = '*') {
  // Build filter string. If columns param is provided, include select
  let query = '';
  if (columns) query = `select=${encodeURIComponent(columns)}`;
  if (filter) {
    query += (query ? '&' : '') + filter;
  }
  return await sbRequest({ method: 'GET', table, query });
}
async function sbInsert(table, row) {
  // Use Prefer return=representation so Supabase returns the inserted row
  const result = await sbRequest({ method: 'POST', table, body: row, prefer: 'return=representation' });
  return result[0] || null;
}
async function sbUpsert(table, row, conflictColumn) {
  // Upsert: `Prefer: resolution=merge-duplicates` will update existing row on conflict
  const prefer = conflictColumn ? `return=representation,resolution=merge-duplicates` : 'return=representation';
  const result = await sbRequest({ method: 'POST', table, body: row, prefer });
  return result[0] || null;
}
async function sbDelete(table, filter) {
  // filter should be a filter string e.g. 'id=eq.some-id'
  await sbRequest({ method: 'DELETE', table, query: filter });
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// Middleware to require an admin session header for protected endpoints. For v1
// the session management is very simple. In future versions you may want to
// implement JWTs or other auth methods.
function requireAdmin(req, res, next) {
  const s = req.headers['x-admin-session'];
  if (!s) return res.status(401).json({ message: 'admin session required' });
  return next();
}

// --- Admin Auth ---
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  // Check credentials against environment variables. If ADMIN_USERNAME or
  // ADMIN_PASSWORD_HASH are not set, fall back to defaults defined in
  // initialData().
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || '';
  const hash = hashPassword(password || '');
  if (username !== expectedUser) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (expectedHash && hash !== expectedHash) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  // If no password hash is set in environment and a password is provided,
  // we cannot persist this password because there is no persistent store
  // for admin credentials in Supabase yet. Reject login for security.
  if (!expectedHash) {
    return res.status(401).json({ message: 'Admin password not configured' });
  }
  const session = nanoid();
  if (mixpanel) mixpanel.track('admin_login', { distinct_id: session });
  // Insert session into Supabase for stats. We ignore errors here because
  // analytics aren’t critical to login flow.
  (async () => {
    try {
      await sbInsert('sessions', { id: session, type: 'admin', code_level: null, created_at: new Date().toISOString(), ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '', ua: req.headers['user-agent'] || '' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to record admin session', err);
    }
  })();
  return res.json({ session });
});

app.post('/api/admin/reset', async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Clear the existing admin password hash. The OTP flow will set a new one.
  const data = loadData();
  data.admin.password_hash = '';
  saveData(data);
  if (process.env.SENDGRID_API_KEY) {
    await sgMail.send({ to: email, from: process.env.OTP_FROM_EMAIL, subject: 'Your Admin OTP', text: `Your OTP is ${otp}` });
  }
  // Store the OTP in memory. In production you should use a persistent store like Redis.
  app.set('otp', otp);
  return res.json({ ok: true });
});

app.post('/api/admin/verify-otp', (req, res) => {
  const { otp, newPassword } = req.body;
  const expected = app.get('otp');
  if (otp !== expected) return res.status(400).json({ message: 'Invalid OTP' });
  const data = loadData();
  data.admin.password_hash = hashPassword(newPassword || '');
  saveData(data);
  return res.json({ ok: true });
});

// --- Passcodes ---
// List all passcodes. Results are ordered by ascending level for a stable UI.
app.get('/api/passcodes', async (req, res) => {
  try {
    const rows = await sbSelect('passcodes', '', 'passcode,level');
    rows.sort((a, b) => (a.level || 0) - (b.level || 0));
    return res.json(rows);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch passcodes', err);
    return res.status(500).json({ message: 'Failed to fetch passcodes' });
  }
});
// Create or update a passcode. Uses upsert to either insert a new row or update
// the existing one if a conflict on the primary key occurs. Level is
// constrained between 1 and 4.
app.post('/api/passcodes', async (req, res) => {
  const { passcode, level } = req.body;
  if (!passcode) return res.status(400).json({ message: 'passcode required' });
  const lvl = Math.max(1, Math.min(4, Number(level) || 1));
  try {
    await sbUpsert('passcodes', { passcode, level: lvl }, 'passcode');
    return res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to upsert passcode', err);
    return res.status(500).json({ message: 'Failed to save passcode' });
  }
});
// Delete a passcode by its value. Returns success regardless of whether a row
// was actually deleted to maintain idempotency.
app.delete('/api/passcodes/:passcode', async (req, res) => {
  const code = req.params.passcode;
  try {
    await sbDelete('passcodes', `passcode=eq.${encodeURIComponent(code)}`);
    return res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete passcode', err);
    return res.status(500).json({ message: 'Failed to delete passcode' });
  }
});

// --- Passcode Login ---
app.post('/api/passcode/login', async (req, res) => {
  const { passcode } = req.body;
  if (!passcode) return res.status(400).json({ message: 'passcode required' });
  try {
    // Look up the passcode in the database. Use filter eq to match exactly.
    const rows = await sbSelect('passcodes', `passcode=eq.${encodeURIComponent(passcode)}`, 'passcode,level');
    const entry = rows[0];
    if (!entry) return res.status(401).json({ message: 'Invalid passcode' });
    const session = nanoid();
    const now = new Date().toISOString();
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString();
    const ua = req.headers['user-agent'] || '';
    // Insert the session into the sessions table for analytics and audit. We don't
    // need to await this call because failure shouldn't block login; we log
    // errors silently.
    (async () => {
      try {
        await sbInsert('sessions', { id: session, type: 'passcode', code_level: entry.level, created_at: now, ip, ua });
      } catch (err) {
        console.error('Failed to record passcode session', err);
      }
    })();
    if (mixpanel) mixpanel.track('passcode_login', { distinct_id: session, level: entry.level });
    return res.json({ session, level: entry.level });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Passcode login failed', err);
    return res.status(500).json({ message: 'Passcode login failed' });
  }
});

// --- Events ---
// List events visible to a given level. If no level is provided, all events are
// returned. We sort descending by date so recent events appear first.
app.get('/api/events', async (req, res) => {
  const lvl = Number(req.query.level || 0);
  try {
    const rows = await sbSelect('events', '', 'id,title,date,level,description,driveFolderId,bookingUrl');
    let list = rows;
    if (lvl) {
      list = list.filter(ev => (ev.level || 1) <= lvl);
    }
    list = list.slice().sort((a, b) => {
      const da = a.date || '';
      const dbb = b.date || '';
      return dbb.localeCompare(da);
    });
    return res.json(list);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch events', err);
    return res.status(500).json({ message: 'Failed to fetch events' });
  }
});
// Create an event. Generates a nanoid as the primary key. Ensures level is
// within 1–4. Returns the created event id.
app.post('/api/events', async (req, res) => {
  const { title, date, level, description, driveFolderId, bookingUrl } = req.body;
  const id = nanoid();
  const lvl = Math.max(1, Math.min(4, Number(level) || 1));
  const row = { id, title: title || '', date: date || '', level: lvl, description: description || '', driveFolderId: driveFolderId || '', bookingUrl: bookingUrl || '' };
  try {
    await sbInsert('events', row);
    return res.json({ id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to create event', err);
    return res.status(500).json({ message: 'Failed to create event' });
  }
});
// Delete an event by id.
app.delete('/api/events/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await sbDelete('events', `id=eq.${encodeURIComponent(id)}`);
    return res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete event', err);
    return res.status(500).json({ message: 'Failed to delete event' });
  }
});

// --- Announcements (email + SMS) ---
app.post('/api/announce', async (req, res) => {
  const { title, message, emails, phones } = req.body;
  const emailList = (emails || '').split(',').map(s => s.trim()).filter(Boolean);
  const phoneList = (phones || '').split(',').map(s => s.trim()).filter(Boolean);

  if (sgMail && emailList.length) {
    await sgMail.send({
      to: emailList,
      from: process.env.OTP_FROM_EMAIL,
      subject: title || 'Announcement',
      text: message || ''
    });
  }
  if (tw && phoneList.length) {
    await Promise.all(phoneList.map(p => tw.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: p, body: (title ? title + ': ' : '') + (message || '') })));
  }
  return res.json({ ok: true, sentEmail: emailList.length, sentSms: phoneList.length });
});

// --- Ratings ---
app.post('/api/rate', async (req, res) => {
  const { session_id, stars, feedback } = req.body;
  if (!session_id) return res.status(400).json({ message: 'session_id required' });
  const rating = {
    id: nanoid(),
    session_id,
    stars: Math.min(5, Math.max(1, Number(stars) || 5)),
    feedback: feedback || '',
    created_at: new Date().toISOString()
  };
  try {
    await sbInsert('ratings', rating);
    return res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to create rating', err);
    return res.status(500).json({ message: 'Failed to record rating' });
  }
});

export default app;