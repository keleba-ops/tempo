import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Baseline hardening headers. Also stops API responses (tokens, personal data) being cached. */
export function securityHeaders(isProd: boolean): RequestHandler {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

interface Bucket { count: number; resetAt: number }

/**
 * Small in-memory fixed-window rate limiter (single-process deployment, so no shared store needed).
 * `key` picks what to count by (default: client IP). Returns 429 with Retry-After when exceeded.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message: string;
  key?: (req: Request) => string | undefined;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const id = (opts.key ? opts.key(req) : req.ip) ?? req.ip ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: opts.message });
    }
    next();
  };
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'admin123', 'welcome1', 'letmein1', 'abc12345', '11111111', 'demo1234', 'tempo123', 'botswana',
]);

/** Returns a user-facing message if the password is too weak, otherwise null. */
export function weakPasswordReason(password: string, email: string): string | null {
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'That password is too common. Please choose something harder to guess.';
  if (lower === email.trim().toLowerCase() || lower === email.split('@')[0]?.toLowerCase()) {
    return 'Your password should not be your email address.';
  }
  if (/^(.)\1+$/.test(password)) return 'Please choose a password with more variety.';
  return null;
}

/**
 * Failed-attempt tracker for sign-in. Keyed on (client IP + email), counts only failures and is cleared on
 * success, so a stranger spamming someone's email can lock out only their own IP, never the real owner.
 */
export function createFailureGuard(opts: { windowMs: number; max: number }) {
  const entries = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of entries) if (b.resetAt <= now) entries.delete(k);
  }, 60_000);
  sweep.unref();
  const live = (key: string) => {
    const b = entries.get(key);
    return b && b.resetAt > Date.now() ? b : undefined;
  };
  return {
    /** Seconds until retry is allowed, or 0 if not blocked. */
    blockedFor(key: string): number {
      const b = live(key);
      return b && b.count >= opts.max ? Math.ceil((b.resetAt - Date.now()) / 1000) : 0;
    },
    fail(key: string) {
      const b = live(key) ?? { count: 0, resetAt: Date.now() + opts.windowMs };
      b.count += 1;
      entries.set(key, b);
    },
    clear(key: string) {
      entries.delete(key);
    },
  };
}
