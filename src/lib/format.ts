import { DateTime } from 'luxon';

export function money(cents: number): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  const amount = new Intl.NumberFormat('en-BW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
  return `P ${amount}`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone).toFormat('h:mm a');
}

export function formatTimeRange(startIso: string, endIso: string, timezone: string): string {
  return `${formatTime(startIso, timezone)} – ${formatTime(endIso, timezone)}`;
}

export function formatDate(iso: string, timezone: string, style: 'short' | 'long' | 'full' = 'long'): string {
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone);
  if (style === 'short') return dt.toFormat('LLL d');
  if (style === 'full') return dt.toFormat('cccc, LLLL d, yyyy');
  return dt.toFormat('ccc, LLL d');
}

export function formatDateTime(iso: string, timezone: string): string {
  return `${formatDate(iso, timezone)} · ${formatTime(iso, timezone)}`;
}

export function relativeDay(iso: string, timezone: string): string {
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone);
  const today = DateTime.now().setZone(timezone);
  if (dt.hasSame(today, 'day')) return 'Today';
  if (dt.hasSame(today.plus({ days: 1 }), 'day')) return 'Tomorrow';
  if (dt.hasSame(today.minus({ days: 1 }), 'day')) return 'Yesterday';
  return dt.toFormat('ccc, LLL d');
}

export function timeAgo(iso: string): string {
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  const diff = DateTime.now().diff(dt, ['minutes', 'hours', 'days']).toObject();
  const minutes = Math.abs(diff.minutes || 0);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = Math.abs(diff.hours || 0);
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.abs(diff.days || 0);
  if (days < 7) return `${Math.round(days)}d ago`;
  return dt.toFormat('LLL d');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

export function statusLabel(status: string): string {
  if (status === 'pending') return 'Awaiting approval';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return status;
}

export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTimeInput(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate()!;
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function periodLabel(hour: number): string {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}
