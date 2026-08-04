import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db, type Role, type UserRow } from './db.js';

const accessSecret = process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-me-please';
const refreshSecret = process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me-please';
const secure = process.env.NODE_ENV === 'production';

export type AuthUser = Pick<UserRow, 'id' | 'name' | 'email' | 'role'>;

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

const cookieBase = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };

export function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueSession(res: Response, user: AuthUser) {
  const payload = { sub: String(user.id), role: user.role, email: user.email, name: user.name };
  const accessToken = jwt.sign(payload, accessSecret, { expiresIn: '30m' });
  const refreshToken = jwt.sign({ sub: String(user.id), nonce: crypto.randomUUID() }, refreshSecret, { expiresIn: '7d' });
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ? OR expires_at < CURRENT_TIMESTAMP').run(user.id);
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, tokenHash(refreshToken), expires.toISOString());
  res.cookie('rasoi_access', accessToken, { ...cookieBase, maxAge: 30 * 60 * 1000 });
  res.cookie('rasoi_refresh', refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearSession(res: Response, refreshToken?: string) {
  if (refreshToken) db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash(refreshToken));
  res.clearCookie('rasoi_access', cookieBase);
  res.clearCookie('rasoi_refresh', cookieBase);
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.rasoi_access;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, accessSecret) as jwt.JwtPayload;
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(Number(decoded.sub)) as AuthUser | undefined;
    if (!user) return res.status(401).json({ error: 'Account not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have access to this resource' });
    next();
  };
}

export function rotateRefresh(req: Request, res: Response): AuthUser | undefined {
  const token = req.cookies?.rasoi_refresh;
  if (!token) return undefined;
  try {
    const decoded = jwt.verify(token, refreshSecret) as jwt.JwtPayload;
    const session = db.prepare('SELECT id FROM refresh_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP').get(tokenHash(token));
    if (!session) return undefined;
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(Number(decoded.sub)) as AuthUser | undefined;
    if (!user) return undefined;
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash(token));
    issueSession(res, user);
    return user;
  } catch {
    return undefined;
  }
}
