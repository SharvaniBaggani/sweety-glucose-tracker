import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import { query, pool, initDb } from '../src/db.js';

// The fixed fictional email and conflict-safe inserts make this safe to rerun.
const email = 'demo@sweety.example';
await initDb();
const passwordHash = await bcrypt.hash('DemoPass123!', 10);
const userResult = await query(`INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3)
  ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`, ['Demo Patient', email, passwordHash]);
const userId = userResult.rows[0].id;
const readings = [
  ['2026-11-01', 'Morning', 108], ['2026-11-01', 'After breakfast', 142],
  ['2026-11-02', 'Morning', 101], ['2026-11-02', 'After dinner', 136]
];
for (const [date, slot, value] of readings) {
  await query(`INSERT INTO readings(user_id,reading_date,time_slot,value) VALUES($1,$2,$3,$4)
    ON CONFLICT (user_id,reading_date,time_slot) DO NOTHING`, [userId, date, slot, value]);
}
console.log('Demo data is ready for demo@sweety.example.');
await pool.end();
