import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/sweety_test';
process.env.JWT_SECRET = 'test-only-secret';
const { app } = await import('../src/app.js');
const { query, pool, initDb } = await import('../src/db.js');

let alice, bob, aliceReading;
const reading = (overrides = {}) => ({ date: '2026-11-15', timeSlot: 'Morning', value: 100, ...overrides });
async function signup(name, email) { const r = await request(app).post('/api/auth/signup').send({ name, email, password: 'secret123' }); assert.equal(r.status, 201); return r.body; }
function auth(token) {
  const headers = req => req.set('Authorization', `Bearer ${token}`);
  return { get: path => headers(request(app).get(path)), post: path => headers(request(app).post(path)), put: path => headers(request(app).put(path)), delete: path => headers(request(app).delete(path)) };
}

before(async () => { await initDb(); });
beforeEach(async () => { await query('DELETE FROM users WHERE email LIKE $1', ['test-%@example.com']); alice = await signup('Alice', 'test-alice@example.com'); bob = await signup('Bob', 'test-bob@example.com'); });
after(async () => { await query('DELETE FROM users WHERE email LIKE $1', ['test-%@example.com']); await pool.end(); });

test('health, signup and login work without storing plaintext passwords', async () => {
  assert.deepEqual((await request(app).get('/api/health')).body, { ok: true });
  const login = await request(app).post('/api/auth/login').send({ email: 'TEST-ALICE@EXAMPLE.COM', password: 'secret123' });
  assert.equal(login.status, 200); assert.ok(login.body.token); assert.equal(login.body.user.email, 'test-alice@example.com');
  const row = await query('SELECT password_hash FROM users WHERE email=$1', ['test-alice@example.com']); assert.notEqual(row.rows[0].password_hash, 'secret123');
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'test-alice@example.com', password: 'wrong-password' })).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).body.user.email, 'test-alice@example.com');
  assert.equal((await request(app).get('/api/reports/daily?date=2026-11-15')).status, 401);
});

test('reading validation rejects missing, non-whole, out-of-range, future, duplicate and fifth readings', async () => {
  for (const body of [{ date: '2026-11-15', timeSlot: 'Morning' }, reading({ value: 40.5 }), reading({ value: 39 }), reading({ date: '2999-01-01' })]) {
    const r = await auth(alice.token).post('/api/readings').send(body); assert.equal(r.status, 400); assert.ok(r.body.errors.length);
  }
  assert.equal((await auth(alice.token).post('/api/readings').send(reading())).status, 201);
  assert.equal((await auth(alice.token).post('/api/readings').send(reading())).status, 409);
  for (const [i, slot] of ['After breakfast', 'After lunch', 'After dinner'].entries()) assert.equal((await auth(alice.token).post('/api/readings').send(reading({ timeSlot: slot, value: 110 + i }))).status, 201);
  assert.equal((await auth(alice.token).post('/api/readings').send(reading({ date: '2026-11-15', timeSlot: 'Morning' }))).status, 400);
});

test('CRUD is isolated between users', async () => {
  const created = await auth(alice.token).post('/api/readings').send(reading()); aliceReading = created.body;
  assert.equal((await auth(bob.token).get('/api/readings')).body.length, 0);
  assert.equal((await auth(bob.token).put(`/api/readings/${aliceReading.id}`).send(reading({ value: 200 }))).status, 404);
  assert.equal((await auth(bob.token).delete(`/api/readings/${aliceReading.id}`)).status, 404);
  assert.equal((await auth(alice.token).put(`/api/readings/${aliceReading.id}`).send(reading({ value: 125 }))).body.value, 125);
  assert.equal((await auth(alice.token).delete(`/api/readings/${aliceReading.id}`)).status, 204);
});

test('daily, month-to-date and previous-month reports calculate boundaries and averages', async () => {
  for (const r of [reading({ date: '2026-09-30', value: 90 }), reading({ date: '2026-10-01', timeSlot: 'After breakfast', value: 100 }), reading({ date: '2026-10-15', value: 200 }), reading({ date: '2026-10-15', timeSlot: 'After dinner', value: 201 }), reading({ date: '2026-11-01', value: 400 })]) await auth(alice.token).post('/api/readings').send(r);
  const daily = (await auth(alice.token).get('/api/reports/daily?date=2026-10-15')).body; assert.equal(daily.count, 2); assert.equal(daily.average, 200.5); assert.equal(daily.from, '2026-10-15');
  const mtd = (await auth(alice.token).get('/api/reports/month-to-date?date=2026-10-15')).body; assert.equal(mtd.count, 3); assert.equal(mtd.lowest, 100); assert.equal(mtd.highest, 201);
  const monthly = (await auth(alice.token).get('/api/reports/monthly?date=2026-10-15')).body; assert.equal(monthly.from, '2026-09-01'); assert.equal(monthly.to, '2026-09-30'); assert.equal(monthly.count, 1); assert.equal(monthly.average, 90);
  const empty = (await auth(bob.token).get('/api/reports/daily?date=2026-10-15')).body; assert.equal(empty.count, 0); assert.equal(empty.average, null);
});

test('calendar dates are saved and returned unchanged across daily and month boundaries', async () => {
  const created = await auth(alice.token).post('/api/readings').send(reading({ date: '2026-11-19', value: 150 }));
  assert.equal(created.status, 201); assert.equal(created.body.date, '2026-11-19');
  const list = (await auth(alice.token).get('/api/readings')).body;
  assert.equal(list.find(r => r.id === created.body.id).date, '2026-11-19');
  assert.equal((await auth(alice.token).get('/api/reports/daily?date=2026-11-19')).body.count, 1);
  assert.equal((await auth(alice.token).get('/api/reports/daily?date=2026-11-18')).body.count, 0);
  const boundary = await auth(alice.token).post('/api/readings').send(reading({ date: '2026-10-31', timeSlot: 'After breakfast', value: 160 }));
  assert.equal(boundary.body.date, '2026-10-31');
  const october = (await auth(alice.token).get('/api/reports/monthly?date=2026-11-15')).body;
  assert.equal(october.from, '2026-10-01'); assert.equal(october.to, '2026-10-31'); assert.equal(october.readings.some(r => r.date === '2026-10-31'), true); assert.equal(october.readings.some(r => r.date === '2026-11-19'), false);
});
