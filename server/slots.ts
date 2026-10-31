import type { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import type { AvailabilityException, AvailabilityWindow, Slot, WeeklyHours } from '../shared/types.js';

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number;
  is_active: number;
}

interface RuleRow {
  weekday: number;
  start_minute: number;
  end_minute: number;
}

interface ExceptionRow {
  id: string;
  date: string;
  is_closed: number;
  start_minute: number | null;
  end_minute: number | null;
  note: string;
}

interface OccupiedRow {
  starts_at: string;
  ends_at: string;
  buffer_minutes: number;
}

const SLOT_STEP_MINUTES = 15;
const MIN_LEAD_MINUTES = 30;

export function getWeeklyHours(db: DatabaseSync, businessId: string): WeeklyHours[] {
  const rules = db
    .prepare(
      'SELECT weekday, start_minute, end_minute FROM availability_rules WHERE business_id = ? AND is_active = 1 ORDER BY weekday, start_minute',
    )
    .all(businessId) as unknown as RuleRow[];

  return Array.from({ length: 7 }, (_, weekday) => {
    const windows = rules
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ startMinute: r.start_minute, endMinute: r.end_minute }));
    return { weekday, isOpen: windows.length > 0, windows };
  });
}

export function getExceptions(db: DatabaseSync, businessId: string): AvailabilityException[] {
  const rows = db
    .prepare(
      'SELECT id, date, is_closed, start_minute, end_minute, note FROM availability_exceptions WHERE business_id = ? ORDER BY date',
    )
    .all(businessId) as unknown as ExceptionRow[];
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    isClosed: Boolean(r.is_closed),
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    note: r.note,
  }));
}

export function getWindowsForDate(
  db: DatabaseSync,
  businessId: string,
  date: string,
  timezone: string,
): { windows: AvailabilityWindow[]; exception: AvailabilityException | null } {
  const exception = db
    .prepare(
      'SELECT id, date, is_closed, start_minute, end_minute, note FROM availability_exceptions WHERE business_id = ? AND date = ?',
    )
    .get(businessId, date) as ExceptionRow | undefined;

  if (exception) {
    const mapped: AvailabilityException = {
      id: exception.id,
      date: exception.date,
      isClosed: Boolean(exception.is_closed),
      startMinute: exception.start_minute,
      endMinute: exception.end_minute,
      note: exception.note,
    };
    if (mapped.isClosed) return { windows: [], exception: mapped };
    if (mapped.startMinute != null && mapped.endMinute != null) {
      return { windows: [{ startMinute: mapped.startMinute, endMinute: mapped.endMinute }], exception: mapped };
    }
    return { windows: [], exception: mapped };
  }

  const dt = DateTime.fromISO(date, { zone: timezone });
  if (!dt.isValid) return { windows: [], exception: null };
  const weekday = dt.weekday % 7;
  const rules = db
    .prepare(
      'SELECT weekday, start_minute, end_minute FROM availability_rules WHERE business_id = ? AND weekday = ? AND is_active = 1 ORDER BY start_minute',
    )
    .all(businessId, weekday) as unknown as RuleRow[];
  return {
    windows: rules.map((r) => ({ startMinute: r.start_minute, endMinute: r.end_minute })),
    exception: null,
  };
}

export function getSlots(
  db: DatabaseSync,
  opts: {
    business: BusinessRow;
    service: ServiceRow;
    date: string;
    excludeBookingId?: string;
    now?: DateTime;
  },
): { slots: Slot[]; windows: AvailabilityWindow[]; exception: AvailabilityException | null } {
  const { business, service, date } = opts;
  const now = (opts.now ?? DateTime.now()).toUTC();
  const dayStart = DateTime.fromISO(date, { zone: business.timezone }).startOf('day');
  if (!dayStart.isValid) return { slots: [], windows: [], exception: null };

  // Never serve times in the past.
  if (dayStart.plus({ days: 1 }) <= now) return { slots: [], windows: [], exception: null };

  const { windows, exception } = getWindowsForDate(db, business.id, date, business.timezone);
  if (windows.length === 0) return { slots: [], windows, exception };

  const queryStart = dayStart.minus({ days: 1 }).toUTC().toISO()!;
  const queryEnd = dayStart.plus({ days: 2 }).toUTC().toISO()!;

  const occupied = db
    .prepare(
      `SELECT b.starts_at, b.ends_at, s.buffer_minutes
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE b.business_id = ?
         AND b.status IN ('pending', 'confirmed')
         AND b.starts_at >= ? AND b.starts_at < ?
         ${opts.excludeBookingId ? 'AND b.id != ?' : ''}
       ORDER BY b.starts_at`,
    )
    .all(
      ...(opts.excludeBookingId
        ? [business.id, queryStart, queryEnd, opts.excludeBookingId]
        : [business.id, queryStart, queryEnd]),
    ) as unknown as OccupiedRow[];

  const nowMs = now.toMillis();
  const minStartMs = nowMs + MIN_LEAD_MINUTES * 60_000;
  const durationMs = service.duration_minutes * 60_000;
  const candidateBufferMs = service.buffer_minutes * 60_000;
  const slots: Slot[] = [];

  for (const window of windows) {
    const windowStart = dayStart.plus({ minutes: window.startMinute });
    const windowEnd = dayStart.plus({ minutes: window.endMinute });

    for (let minute = window.startMinute; minute + service.duration_minutes <= window.endMinute; minute += SLOT_STEP_MINUTES) {
      const start = dayStart.plus({ minutes: minute });
      const end = start.plus({ minutes: service.duration_minutes });
      const startMs = start.toMillis();
      const endMs = end.toMillis();

      if (startMs < minStartMs) continue;

      const collides = occupied.some((booking) => {
        const bStart = DateTime.fromISO(booking.starts_at, { zone: 'utc' }).toMillis();
        const bEnd = DateTime.fromISO(booking.ends_at, { zone: 'utc' }).toMillis() + booking.buffer_minutes * 60_000;
        return startMs < bEnd && endMs + candidateBufferMs > bStart;
      });
      if (collides) continue;

      const hour = start.hour;
      slots.push({
        startsAt: start.toUTC().toISO()!,
        label: start.toFormat('h:mm a'),
        startMinute: minute,
        period: hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening',
      });
    }
  }

  // Keep chronological order after any exception windows are considered.
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { slots, windows, exception };
}

export function getSlotDays(
  db: DatabaseSync,
  opts: {
    business: BusinessRow;
    service: ServiceRow;
    from?: string;
    days?: number;
    now?: DateTime;
  },
): {
  date: string;
  dayLabel: string;
  dateLabel: string;
  monthLabel: string;
  isToday: boolean;
  count: number;
}[] {
  const { business, service } = opts;
  const now = opts.now ?? DateTime.now();
  const today = now.setZone(business.timezone).startOf('day');
  const from = opts.from
    ? DateTime.fromISO(opts.from, { zone: business.timezone }).startOf('day')
    : today;
  const count = Math.min(Math.max(opts.days ?? 14, 1), 60);
  const start = from < today ? today : from;

  return Array.from({ length: count }, (_, index) => {
    const day = start.plus({ days: index });
    const date = day.toISODate()!;
    const result = getSlots(db, { business, service, date, now });
    return {
      date,
      dayLabel: day.toFormat('ccc'),
      dateLabel: day.toFormat('d'),
      monthLabel: day.toFormat('LLL'),
      isToday: day.hasSame(today, 'day'),
      count: result.slots.length,
    };
  });
}

export function findNextAvailable(
  db: DatabaseSync,
  business: BusinessRow,
  service: ServiceRow | undefined,
  now = DateTime.now(),
  daysToScan = 14,
): string | null {
  if (!service) return null;
  const today = now.setZone(business.timezone).startOf('day');
  for (let i = 0; i < daysToScan; i++) {
    const date = today.plus({ days: i }).toISODate()!;
    const { slots } = getSlots(db, { business, service, date, now });
    if (slots.length) return slots[0].startsAt;
  }
  return null;
}
