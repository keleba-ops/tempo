import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.js';

// PINs are only 6 digits, so a stolen database copy could be brute-forced offline. The pepper (a server-side secret
// kept out of the database) is mixed in before hashing, so the hashes are useless without it.
// Fails closed: in production there is no default, and a short secret is refused at startup.
const PEPPER = process.env.PIN_PEPPER ?? (process.env.NODE_ENV === 'production' ? '' : 'tempo-dev-pepper-change-me');
if (process.env.NODE_ENV === 'production' && PEPPER.length < 32) {
  throw new Error('PIN_PEPPER must be set to a random secret of at least 32 characters in production.');
}

const pre = (pin: string) => crypto.createHmac('sha256', PEPPER).update(pin).digest('hex');
export const hashPin = (pin: string): string => hashPassword(pre(pin));
export const verifyPin = (pin: string, stored: string): boolean => verifyPassword(pre(pin), stored);

/** 6-digit code that is emailed for sign-up and recovery. */
export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
export const hashCode = (email: string, code: string): string =>
  crypto.createHmac('sha256', PEPPER).update(`${email.trim().toLowerCase()}|${code}`).digest('hex');

/** The weak ones are the obvious ones: repeats, runs, repeated pairs/triples and common patterns. */
export function isWeakPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const step = (n: number) => d.every((x, i) => i === 0 || x - d[i - 1]! === n);
  if (step(1) || step(-1)) return true;
  return ['000000', '696969', '112233', '121314', '159753', '147258', '789456', '100000', '200000', '123321', '654123', '123123', '246810'].includes(pin);
}
