import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Role, User } from '../shared/types.js';
import { nowIso, uid } from './utils.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    sessionToken?: string;
  }
}

export const SESSION_COOKIE = 'tempo_session';
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  email_notifications: number;
  in_app_notifications: number;
  phone: string;
  address: string;
  city: string;
  business_id: string | null;
  business_slug: string | null;
}

const USER_SELECT = `
  SELECT u.*, b.id AS business_id, b.slug AS business_slug
  FROM users u
  LEFT JOIN businesses b ON b.owner_id = u.id
`;

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailNotifications: Boolean(row.email_notifications),
    inAppNotifications: Boolean(row.in_app_notifications),
    phone: row.phone,
    address: row.address,
    city: row.city,
    ...(row.business_id ? { businessId: row.business_id, businessSlug: row.business_slug ?? undefined } : {}),
  };
}

export function findUserByEmail(db: DatabaseSync, email: string): UserRow | undefined {
  return db.prepare(`${USER_SELECT} WHERE u.email = ? COLLATE NOCASE`).get(email.trim()) as UserRow | undefined;
}

export function findUserById(db: DatabaseSync, id: string): UserRow | undefined {
  return db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) as UserRow | undefined;
}

export function createSession(db: DatabaseSync, userId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uid(),
    userId,
    tokenHash(token),
    expiresAt,
    nowIso(),
  );
  return token;
}

export function destroySession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: process.env.CORS_ORIGIN ? 'none' : 'lax',
    secure: Boolean(process.env.CORS_ORIGIN) || (process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https')),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function attachUser(db: DatabaseSync) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Cookie for same-origin use; Bearer token for the cross-origin PWA (Safari blocks third-party cookies).
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined;
    const token = bearer || req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const row = db
      .prepare(
        `${USER_SELECT}
         JOIN sessions s ON s.user_id = u.id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash(token), nowIso()) as UserRow | undefined;
    if (row) {
      req.user = mapUser(row);
      req.sessionToken = token;
    } else {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    const err = new Error('Please sign in to continue.') as Error & { status: number };
    err.status = 401;
    return next(err);
  }
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    const err = new Error('Please sign in to continue.') as Error & { status: number };
    err.status = 401;
    return next(err);
  }
  if (req.user.role !== 'customer') {
    const err = new Error('This action is for customer accounts.') as Error & { status: number };
    err.status = 403;
    return next(err);
  }
  next();
}

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    const err = new Error('Please sign in to continue.') as Error & { status: number };
    err.status = 401;
    return next(err);
  }
  if (req.user.role !== 'owner') {
    const err = new Error('This action is for business owners.') as Error & { status: number };
    err.status = 403;
    return next(err);
  }
  next();
}
