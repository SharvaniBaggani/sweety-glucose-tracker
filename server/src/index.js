import dotenv from 'dotenv'; dotenv.config();
import { app } from './app.js'; import { initDb, pool } from './db.js';
const port = process.env.PORT || 4000;
initDb().then(() => app.listen(port, () => console.log(`Sweety API listening on ${port}`))).catch(e => { console.error(e); pool.end(); process.exit(1); });
