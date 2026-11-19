import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { requireAuth, signUser } from './auth.js';
import { slots, validateReading } from './validation.js';

export const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try { const hash = await bcrypt.hash(password, 10); const r = await query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email', [name.trim(), email.toLowerCase().trim(), hash]); res.status(201).json({ user: r.rows[0], token: signUser(r.rows[0]) }); }
  catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'Email is already registered' : 'Unable to create account' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const r = await query('SELECT * FROM users WHERE email=$1', [(req.body.email || '').toLowerCase().trim()]);
  if (!r.rows[0] || !(await bcrypt.compare(req.body.password || '', r.rows[0].password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  const user = { id: r.rows[0].id, name: r.rows[0].name, email: r.rows[0].email }; res.json({ user, token: signUser(user) });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.use('/api/readings', requireAuth);
app.get('/api/readings', async (req, res) => { const r = await query('SELECT id, reading_date AS date, time_slot AS "timeSlot", value FROM readings WHERE user_id=$1 ORDER BY reading_date DESC, id DESC', [req.user.id]); res.json(r.rows); });
app.post('/api/readings', async (req, res) => {
  const errors = validateReading(req.body); if (errors.length) return res.status(400).json({ errors });
  const count = await query('SELECT count(*) FROM readings WHERE user_id=$1 AND reading_date=$2', [req.user.id, req.body.date]);
  if (Number(count.rows[0].count) >= 4) return res.status(400).json({ errors: ['Maximum 4 readings per day'] });
  try { const r = await query('INSERT INTO readings(user_id,reading_date,time_slot,value) VALUES($1,$2,$3,$4) RETURNING id, reading_date AS date, time_slot AS "timeSlot", value', [req.user.id, req.body.date, req.body.timeSlot, Number(req.body.value)]); res.status(201).json(r.rows[0]); }
  catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ errors: [e.code === '23505' ? 'Only one reading per slot per day' : 'Unable to save reading'] }); }
});
app.put('/api/readings/:id', async (req, res) => { const errors = validateReading(req.body); if (errors.length) return res.status(400).json({ errors }); try { const r = await query('UPDATE readings SET reading_date=$1,time_slot=$2,value=$3 WHERE id=$4 AND user_id=$5 RETURNING id, reading_date AS date, time_slot AS "timeSlot", value', [req.body.date, req.body.timeSlot, Number(req.body.value), req.params.id, req.user.id]); if (!r.rows[0]) return res.status(404).json({ error: 'Reading not found' }); res.json(r.rows[0]); } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ errors: [e.code === '23505' ? 'Only one reading per slot per day' : 'Unable to update reading'] }); } });
app.delete('/api/readings/:id', async (req, res) => { const r = await query('DELETE FROM readings WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]); if (!r.rows[0]) return res.status(404).json({ error: 'Reading not found' }); res.status(204).end(); });

app.use('/api/reports', requireAuth);
app.get('/api/reports/:kind', async (req, res) => {
  const { kind } = req.params; const selected = req.query.date; if (!/^\d{4}-\d{2}-\d{2}$/.test(selected)) return res.status(400).json({ error: 'A valid date is required' });
  let from, to; if (kind === 'daily') { from = to = selected; } else if (kind === 'month-to-date') { from = `${selected.slice(0, 7)}-01`; to = selected; } else if (kind === 'monthly') { const d = new Date(`${selected}T00:00:00`); const last = new Date(d.getFullYear(), d.getMonth(), 0); from = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-01`; to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`; } else return res.status(404).json({ error: 'Unknown report' });
  const r = await query('SELECT id, reading_date AS date, time_slot AS "timeSlot", value FROM readings WHERE user_id=$1 AND reading_date BETWEEN $2 AND $3 ORDER BY reading_date, id', [req.user.id, from, to]); const values = r.rows.map(x => x.value); res.json({ kind, from, to, readings: r.rows, count: values.length, highest: values.length ? Math.max(...values) : null, lowest: values.length ? Math.min(...values) : null, average: values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10 : null });
});

export { slots };
