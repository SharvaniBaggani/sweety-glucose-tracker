import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
// PostgreSQL DATE is a calendar value, not a moment in time. Keep it as YYYY-MM-DD
// so timezone conversion cannot move a reading to the previous day.
pg.types.setTypeParser(1082, value => value);
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/sweety' });
export const query = (text, params) => pool.query(text, params);

export async function initDb() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
  );`);
  await query(`CREATE TABLE IF NOT EXISTS readings (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reading_date DATE NOT NULL, time_slot TEXT NOT NULL, value INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, reading_date, time_slot)
  );`);
}
