import jwt from 'jsonwebtoken';
import { query } from './db.js';

const secret = () => process.env.JWT_SECRET || 'development-secret';
export function signUser(user) { return jwt.sign({ id: user.id, email: user.email }, secret(), { expiresIn: '7d' }); }
export async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, secret());
    const result = await query('SELECT id, name, email FROM users WHERE id=$1', [payload.id]);
    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid token' });
    req.user = result.rows[0]; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}
