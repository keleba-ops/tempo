import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  findUserByEmail,
  findUserById,
  hashPassword,
  mapUser,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { getParam, parseBody } from '../http.js';
import { notifyUser } from '../notifications.js';
import { getBusinessRowBySlug } from '../serializers.js';
import { ApiError, nowIso, slugify, uid } from '../utils.js';
import { createFailureGuard, weakPasswordReason } from '../security.js';

// Burns the same time as a real check so unknown emails can't be told apart by response speed.
const DUMMY_HASH = hashPassword('not-a-real-password');
const loginFailures = createFailureGuard({ windowMs: 15 * 60_000, max: 8 }); // per device + email
// Account-wide ceiling across all IPs: slows distributed guessing while staying high enough that a
// stranger can't realistically keep the real owner locked out (it expires after an hour).
const accountFailures = createFailureGuard({ windowMs: 60 * 60_000, max: 50 });

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name.').max(80),
  email: z.string().trim().email('Please enter a valid email address.').max(160),
  password: z.string().min(8, 'Your password needs at least 8 characters.').max(200),
  role: z.enum(['owner', 'customer']),
  businessName: z.string().trim().max(100).optional(),
  timezone: z.string().trim().max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.'),
});

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
});

const prefsSchema = z.object({
  emailNotifications: z.boolean(),
  inAppNotifications: z.boolean(),
});

function uniqueSlug(db: DatabaseSync, input: string): string {
  const base = slugify(input) || 'studio';
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM businesses WHERE slug = ?').get(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

function validTimezone(zone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}

export function authRouter(db: DatabaseSync): Router {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    const input = parseBody(registerSchema, req.body);
    if (input.role === 'owner' && !input.businessName?.trim()) {
      throw new ApiError(400, 'Please add your business name to create an owner account.');
    }
    const weak = weakPasswordReason(input.password, input.email);
    if (weak) throw new ApiError(400, weak);
    if (findUserByEmail(db, input.email)) {
      throw new ApiError(409, 'An account with that email already exists. Try signing in instead.');
    }

    const userId = uid();
    const passwordHash = hashPassword(input.password);
    const timestamp = nowIso();
    const timezone = input.timezone && validTimezone(input.timezone) ? input.timezone : 'Africa/Gaborone';

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, email_notifications, in_app_notifications, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
      ).run(userId, input.name.trim(), input.email.trim().toLowerCase(), passwordHash, input.role, timestamp);

      if (input.role === 'owner') {
        const businessId = uid();
        const name = input.businessName!.trim();
        db.prepare(
          `INSERT INTO businesses
            (id, owner_id, name, slug, category, tagline, description, address, city, country, phone, email, timezone,
             cover_image, accent_color, approval_required, rating, review_count, created_at)
           VALUES (?, ?, ?, ?, 'Services', 'A new place to book time.', '', '', '', 'Botswana', '', ?, ?, '/images/studio.jpg', '#b65b3d', 0, 5.0, 0, ?)`,
        ).run(
          businessId,
          userId,
          name,
          uniqueSlug(db, name),
          input.email.trim().toLowerCase(),
          timezone,
          timestamp,
        );

        for (let weekday = 1; weekday <= 5; weekday++) {
          db.prepare(
            'INSERT INTO availability_rules (id, business_id, weekday, start_minute, end_minute, is_active) VALUES (?, ?, ?, 540, 1020, 1)',
          ).run(uid(), businessId, weekday);
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // no-op
      }
      throw error;
    }

    const token = createSession(db, userId);
    setSessionCookie(res, token);
    const row = findUserById(db, userId)!;
    res.status(201).json({ user: mapUser(row), token });
  });

  router.post('/auth/login', (req, res) => {
    const input = parseBody(loginSchema, req.body);
    const row = findUserByEmail(db, input.email);
    const accountKey = input.email.trim().toLowerCase();
    const guardKey = `${req.ip}|${accountKey}`;
    const wait = Math.max(loginFailures.blockedFor(guardKey), accountFailures.blockedFor(accountKey));
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw new ApiError(429, 'Too many failed sign-in attempts. Please wait a few minutes and try again.');
    }
    const ok = verifyPassword(input.password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) {
      loginFailures.fail(guardKey);
      accountFailures.fail(accountKey);
      throw new ApiError(401, 'That email and password do not match. Please try again.');
    }
    loginFailures.clear(guardKey);
    accountFailures.clear(accountKey);
    const token = createSession(db, row.id);
    setSessionCookie(res, token);
    res.json({ user: mapUser(row), token });
  });

  router.post('/auth/logout', (req, res) => {
    if (req.sessionToken) destroySession(db, req.sessionToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    const business = req.user.role === 'owner' ? getBusinessRowBySlug(db, req.user.businessSlug || '', req.user.id) : null;
    res.json({
      user: {
        ...req.user,
        ...(business ? { businessId: business.id, businessSlug: business.slug } : {}),
      },
    });
  });

  router.patch('/me', requireAuth, (req, res) => {
    const input = parseBody(profileSchema, req.body);
    const current = findUserById(db, req.user!.id)!;
    db.prepare('UPDATE users SET name = ?, phone = ?, address = ?, city = ? WHERE id = ?').run(
      (input.name ?? current.name).trim(),
      input.phone?.trim() ?? current.phone,
      input.address?.trim() ?? current.address,
      input.city?.trim() ?? current.city,
      req.user!.id,
    );
    const row = findUserById(db, req.user!.id)!;
    res.json({ user: mapUser(row) });
  });

  router.patch('/me/preferences', requireAuth, (req, res) => {
    const input = parseBody(prefsSchema, req.body);
    db.prepare('UPDATE users SET email_notifications = ?, in_app_notifications = ? WHERE id = ?').run(
      input.emailNotifications ? 1 : 0,
      input.inAppNotifications ? 1 : 0,
      req.user!.id,
    );
    const row = findUserById(db, req.user!.id)!;
    res.json({ user: mapUser(row) });
  });

  router.get('/me/notifications', requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, type, title, body, action_url, is_read, created_at, business_id, booking_id
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(req.user!.id) as unknown as {
      id: string;
      type: string;
      title: string;
      body: string;
      action_url: string;
      is_read: number;
      created_at: string;
      business_id: string | null;
      booking_id: string | null;
    }[];
    const unread = db
      .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user!.id) as { count: number };
    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        actionUrl: r.action_url,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at,
        businessId: r.business_id,
        bookingId: r.booking_id,
      })),
      unreadCount: unread.count,
    });
  });

  router.get('/me/emails', requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, to_email, subject, kind, status, created_at, html
         FROM email_outbox WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .all(req.user!.id) as unknown as {
      id: string;
      to_email: string;
      subject: string;
      kind: string;
      status: string;
      created_at: string;
      html: string;
    }[];
    res.json({
      emails: rows.map((r) => ({
        id: r.id,
        toEmail: r.to_email,
        subject: r.subject,
        kind: r.kind,
        status: r.status,
        createdAt: r.created_at,
        html: r.html,
      })),
    });
  });

  router.patch('/me/notifications/:id/read', requireAuth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
      getParam(req.params.id),
      req.user!.id,
    );
    res.json({ ok: true });
  });

  router.post('/me/notifications/read-all', requireAuth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  router.delete('/me/notifications', requireAuth, (req, res) => {
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  return router;
}
