import { DateTime } from 'luxon';

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return crypto.randomUUID();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatMoney(cents: number): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  const amount = new Intl.NumberFormat('en-BW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
  return `P ${amount}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function formatTimeInZone(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone).toFormat('h:mm a');
}

export function formatDateInZone(iso: string, timezone: string, withWeekday = true): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(timezone)
    .toFormat(withWeekday ? 'ccc, LLL d' : 'LLL d, yyyy');
}

export function formatDateTimeInZone(iso: string, timezone: string): string {
  return `${formatDateInZone(iso, timezone)} · ${formatTimeInZone(iso, timezone)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

export function localDateInZone(date: DateTime, timezone: string): string {
  return date.setZone(timezone).toISODate()!;
}

export function startOfLocalDayUtc(date: string, timezone: string): DateTime {
  return DateTime.fromISO(date, { zone: timezone }).startOf('day').toUTC();
}

export function bookingEndIso(startIso: string, durationMinutes: number): string {
  return DateTime.fromISO(startIso, { zone: 'utc' }).plus({ minutes: durationMinutes }).toUTC().toISO()!;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
