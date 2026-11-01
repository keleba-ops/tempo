import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import {
  clearSessionCookie,
  createSession,
  destroyOtherSessions,
  destroySession,
  findUserByEmail,
  findUserById,
  hashPassword,
  mapUser,
  requireAuth,
  setSessionCookie,
} from '../auth.js';
import { getParam, parseBody } from '../http.js';
import { notifyUser } from '../notifications.js';
import { getBusinessRowBySlug } from '../serializers.js';
import { ApiError, nowIso, slugify, uid } from '../utils.js';
import { deliverEmail } from '../email.js';
import crypto from 'node:crypto';
import { createFailureGuard, rateLimit } from '../security.js';
import { generateCode, hashCode, hashPin, isWeakPin, verifyPin } from '../pin.js';

// Burns the same time as a real check so unknown emails can't be told apart by response speed.
const DUMMY_HASH = hashPin('000000');
const loginFailures = createFailureGuard({ windowMs: 15 * 60_000, max: 8 }); // per device + email
// Account-wide ceiling across all IPs: slows distributed guessing while staying high enough that a
// stranger can't realistically keep the real owner locked out (it expires after an hour).
const accountFailures = createFailureGuard({ windowMs: 60 * 60_000, max: 30 });
// Random per-browser device IDs (sent as X-Device-Id) that have signed in successfully to an account. The
// account-wide ceiling never applies to these, so the owner's own browser can't be locked out by strangers
// guessing elsewhere, and a stranger can't claim the exemption without holding that secret ID. In-memory.
const knownDevices = new Map<string, Set<string>>();
function deviceId(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.headers['x-device-id'];
  const id = typeof raw === 'string' ? raw.trim() : '';
  return /^[a-f0-9]{32,64}$/.test(id) ? id : null;
}
function rememberDevice(account: string, id: string | null) {
  if (!id) return;
  const set = knownDevices.get(account) ?? new Set<string>();
  set.add(id);
  if (set.size > 10) set.delete(set.values().next().value as string);
  knownDevices.delete(account);
  knownDevices.set(account, set);
  if (knownDevices.size > 5000) knownDevices.delete(knownDevices.keys().next().value as string);
}

const pinField = z.string().regex(/^\d{6}$/, 'Your PIN must be exactly 6 digits.');
const codeField = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.');
const emailField = z.string().trim().email('Please enter a valid email address.').max(160);

const registerStartSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name.').max(80),
  email: emailField,
  role: z.enum(['owner', 'customer']),
  businessName: z.string().trim().max(100).optional(),
  timezone: z.string().trim().max(80).optional(),
});
const registerVerifySchema = z.object({ email: emailField, code: codeField, pin: pinField });
const recoverStartSchema = z.object({ email: emailField });
const recoverVerifySchema = z.object({ email: emailField, code: codeField, pin: pinField });

const loginSchema = z.object({
  email: emailField,
  pin: z.string().regex(/^\d{6}$/, 'Enter your 6-digit PIN.'),
});

const changePinSchema = z.object({ currentPin: pinField, newPin: pinField });

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  // Only the owner's first-run "Where is your business?" step sets this, so a personal address is never copied implicitly.
  applyToBusiness: z.boolean().optional(),
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

  const isProd = process.env.NODE_ENV === 'production';
  const emailKey = (req: { body?: { email?: unknown } }) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 160);
  // Per (device + email): 1 code a minute, 5 an hour. Per email overall: 15 an hour, so nobody can flood an inbox.
  const startMinute = rateLimit({ windowMs: 60_000, max: 1, message: 'Please wait a minute before requesting another code.', key: (req) => `${req.ip}|${emailKey(req)}` });
  const startHour = rateLimit({ windowMs: 3_600_000, max: 5, message: 'Too many codes requested. Please try again in an hour.', key: (req) => `${req.ip}|${emailKey(req)}` });
  const startEmail = rateLimit({ windowMs: 3_600_000, max: 15, message: 'Too many codes requested for this email. Please try again later.', key: emailKey });

  /** Emails a fresh 6-digit code (older ones for the same purpose stop working). Returns false if it could not be delivered. */
  async function issueCode(email: string, purpose: 'signup' | 'recover', payload: string, userId: string | null, name: string | null): Promise<boolean> {
    const ts = nowIso();
    db.prepare('UPDATE email_codes SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL').run(ts, email, purpose);
    const code = generateCode();
    const id = uid();
    db.prepare(
      'INSERT INTO email_codes (id, email, purpose, code_hash, payload, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    ).run(id, email, purpose, hashCode(email, code), payload, new Date(Date.now() + 10 * 60_000).toISOString(), ts);
    const status = await deliverEmail(db, {
      userId,
      to: email,
      subject: 'Your Tempo verification code',
      kind: `${purpose}_code`,
      redact: [code],
      content: {
        kicker: purpose === 'signup' ? 'Welcome to Tempo' : 'Reset your PIN',
        heading: name ? `Hi ${name.split(' ')[0]}, here is your code` : 'Here is your code',
        intro: purpose === 'signup'
          ? 'Enter this code in Tempo to verify your email and choose your 6-digit PIN. It expires in 10 minutes.'
          : 'Enter this code in Tempo to choose a new 6-digit PIN. It expires in 10 minutes.',
        details: [{ label: 'Verification code', value: code }],
        footnote: 'If you did not request this, you can ignore this email. Never share this code with anyone.',
      },
    });
    // Outside production the code is logged to a preview file, which is enough for development.
    const delivered = status === 'sent' || (!isProd && status === 'logged');
    if (!delivered) db.prepare('UPDATE email_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), id);
    return delivered;
  }

  /** Checks an emailed code. Wrong guesses are counted against the code, which dies after 5 tries. Returns its payload. */
  function consumeCode(email: string, purpose: 'signup' | 'recover', code: string): string {
    const row = db
      .prepare(
        `SELECT id, code_hash, payload, attempts FROM email_codes
         WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email, purpose, nowIso()) as { id: string; code_hash: string; payload: string; attempts: number } | undefined;
    if (!row) throw new ApiError(400, 'That code has expired or was never requested. Please request a new one.');
    if (row.attempts >= 5) throw new ApiError(429, 'Too many wrong codes. Please request a new code.');
    const expected = Buffer.from(row.code_hash, 'hex');
    const given = Buffer.from(hashCode(email, code), 'hex');
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      throw new ApiError(400, 'That code is not right. Please check it and try again.');
    }
    db.prepare('UPDATE email_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id);
    return row.payload;
  }

  router.post('/auth/register/start', startMinute, startHour, startEmail, async (req, res) => {
    const input = parseBody(registerStartSchema, req.body);
    if (input.role === 'owner' && !input.businessName?.trim()) {
      throw new ApiError(400, 'Please add your business name to create an owner account.');
    }
    const email = input.email.trim().toLowerCase();
    const existing = findUserByEmail(db, email);
    if (existing) {
      // Same answer as a new sign-up, so this can't be used to discover who has an account: the owner gets a notice instead of a code.
      const status = await deliverEmail(db, {
        userId: existing.id,
        to: email,
        subject: 'You already have a Tempo account',
        kind: 'signup_existing',
        content: {
          kicker: 'Tempo',
          heading: 'You already have an account',
          intro: 'Someone (hopefully you) tried to create a Tempo account with this email. Sign in with your 6-digit PIN, or choose "Forgot your PIN?" in the sign-in window if you need a new one.',
          footnote: 'If this was not you, you can ignore this email. Your account has not been changed.',
        },
      });
      if (!(status === 'sent' || (!isProd && status === 'logged'))) {
        throw new ApiError(503, 'We could not send your email right now. Please try again in a few minutes.');
      }
      return res.json({ ok: true });
    }
    const payload = JSON.stringify({
      name: input.name.trim(),
      role: input.role,
      businessName: input.businessName?.trim() ?? '',
      timezone: input.timezone && validTimezone(input.timezone) ? input.timezone : 'Africa/Gaborone',
    });
    if (!(await issueCode(email, 'signup', payload, null, input.name.trim()))) {
      throw new ApiError(503, 'We could not send your code right now. Please try again in a few minutes.');
    }
    res.json({ ok: true });
  });

  router.post('/auth/register/verify', (req, res) => {
    const input = parseBody(registerVerifySchema, req.body);
    const email = input.email.trim().toLowerCase();
    if (isWeakPin(input.pin)) throw new ApiError(422, 'Choose a PIN that is not easy to guess (not 123456, 111111 and so on).');
    const data = JSON.parse(consumeCode(email, 'signup', input.code)) as {
      name: string; role: 'owner' | 'customer'; businessName: string; timezone: string;
    };
    if (findUserByEmail(db, email)) {
      throw new ApiError(409, 'An account with that email already exists. Try signing in instead.');
    }

    const userId = uid();
    const timestamp = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, email_notifications, in_app_notifications, created_at, must_change_password)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?, 0)`,
      ).run(userId, data.name, email, hashPin(input.pin), data.role, timestamp);

      if (data.role === 'owner') {
        const businessId = uid();
        db.prepare(
          `INSERT INTO businesses
            (id, owner_id, name, slug, category, tagline, description, address, city, country, phone, email, timezone,
             cover_image, accent_color, approval_required, rating, review_count, created_at)
           VALUES (?, ?, ?, ?, 'Services', 'A new place to book time.', '', '', '', 'Botswana', '', ?, ?, '/images/studio.jpg', '#b65b3d', 0, 5.0, 0, ?)`,
        ).run(businessId, userId, data.businessName, uniqueSlug(db, data.businessName), email, data.timezone, timestamp);
        for (let weekday = 1; weekday <= 5; weekday++) {
          db.prepare(
            'INSERT INTO availability_rules (id, business_id, weekday, start_minute, end_minute, is_active) VALUES (?, ?, ?, 540, 1020, 1)',
          ).run(uid(), businessId, weekday);
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* no-op */ }
      throw error;
    }

    const token = createSession(db, userId);
    setSessionCookie(res, token);
    res.status(201).json({ user: mapUser(findUserById(db, userId)!), token });
  });

  // Always answers "ok" so it can't be used to discover who has an account.
  router.post('/auth/recover/start', startMinute, startHour, startEmail, async (req, res) => {
    const input = parseBody(recoverStartSchema, req.body);
    const email = input.email.trim().toLowerCase();
    const row = findUserByEmail(db, email);
    if (row) {
      // Delivery failure is not reported either: a different answer here would reveal that the account exists.
      const ok = await issueCode(email, 'recover', '', row.id, row.name);
      if (!ok) console.error('[tempo] recovery code could not be delivered');
    }
    res.json({ ok: true });
  });

  router.post('/auth/recover/verify', (req, res) => {
    const input = parseBody(recoverVerifySchema, req.body);
    const email = input.email.trim().toLowerCase();
    if (isWeakPin(input.pin)) throw new ApiError(422, 'Choose a PIN that is not easy to guess (not 123456, 111111 and so on).');
    const row = findUserByEmail(db, email);
    if (!row) throw new ApiError(400, 'That code has expired or was never requested. Please request a new one.');
    consumeCode(email, 'recover', input.code);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPin(input.pin), row.id);
    destroyOtherSessions(db, row.id, undefined); // signs out every device
    loginFailures.clear(`${req.ip}|${email}`);
    accountFailures.clear(email);
    const token = createSession(db, row.id);
    setSessionCookie(res, token);
    res.json({ user: mapUser(findUserById(db, row.id)!), token });
  });

  router.post('/auth/login', (req, res) => {
    const input = parseBody(loginSchema, req.body);
    const row = findUserByEmail(db, input.email);
    const accountKey = input.email.trim().toLowerCase();
    const guardKey = `${req.ip}|${accountKey}`;
    const device = deviceId(req);
    const accountWait = device && knownDevices.get(accountKey)?.has(device) ? 0 : accountFailures.blockedFor(accountKey);
    const wait = Math.max(loginFailures.blockedFor(guardKey), accountWait);
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw new ApiError(429, 'Too many failed sign-in attempts. Please wait a few minutes and try again.');
    }
    const ok = verifyPin(input.pin, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) {
      loginFailures.fail(guardKey);
      accountFailures.fail(accountKey);
      throw new ApiError(401, 'That email and PIN do not match. Please try again.');
    }
    loginFailures.clear(guardKey);
    accountFailures.clear(accountKey);
    rememberDevice(accountKey, device);
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
    if (input.applyToBusiness && row.role === 'owner' && row.business_id) {
      // First-run setup only, and only fills blanks: never overwrites an address the owner already set.
      db.prepare(
        `UPDATE businesses SET address = CASE WHEN address = '' THEN ? ELSE address END,
                               city = CASE WHEN city = '' THEN ? ELSE city END WHERE id = ?`,
      ).run(row.address, row.city, row.business_id);
    }
    res.json({ user: mapUser(row) });
  });

  router.post('/auth/change-pin', requireAuth, (req, res) => {
    const input = parseBody(changePinSchema, req.body);
    const row = findUserById(db, req.user!.id)!;
    const key = `chpin|${row.id}`;
    const wait = loginFailures.blockedFor(key);
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.');
    }
    if (!verifyPin(input.currentPin, row.password_hash)) {
      loginFailures.fail(key);
      throw new ApiError(400, 'Your current PIN is not correct.');
    }
    loginFailures.clear(key);
    if (input.newPin === input.currentPin) throw new ApiError(422, 'Your new PIN must be different from the current one.');
    if (isWeakPin(input.newPin)) throw new ApiError(422, 'Choose a PIN that is not easy to guess (not 123456, 111111 and so on).');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPin(input.newPin), row.id);
    destroyOtherSessions(db, row.id, req.sessionToken); // other devices are signed out
    res.json({ user: mapUser(findUserById(db, row.id)!) });
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
