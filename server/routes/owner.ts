import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import { requireOwner } from '../auth.js';
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  rescheduleBooking,
} from '../booking-service.js';
import { getParam, parseBody } from '../http.js';
import {
  buildBusinessDetail,
  getBusinessRowByOwner,
  getOwnerBookings,
  getServices,
  type BusinessRow,
} from '../serializers.js';
import { getExceptions, getWeeklyHours, getWindowsForDate } from '../slots.js';
import { ApiError, nowIso, timeToMinutes, uid } from '../utils.js';

const businessSchema = z.object({
  name: z.string().trim().min(2, 'Business name is required.').max(100).optional(),
  category: z.string().trim().min(2).max(60).optional(),
  tagline: z.string().trim().max(140).optional(),
  description: z.string().trim().max(2400).optional(),
  address: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  timezone: z.string().trim().max(80).optional(),
  coverImage: z.string().trim().max(500).optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Accent color must be a hex color.')
    .optional(),
  approvalRequired: z.boolean().optional(),
});

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Service name is required.').max(100),
  description: z.string().trim().max(800).optional(),
  durationMinutes: z.number().int().min(5, 'Duration must be at least 5 minutes.').max(480),
  bufferMinutes: z.number().int().min(0).max(180),
  priceCents: z.number().int().min(0).max(10_000_000),
  isActive: z.boolean().optional(),
  houseCall: z.boolean().optional(),
});

const servicePatchSchema = serviceSchema.partial();

const availabilitySchema = z.object({
  weeklyHours: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      isOpen: z.boolean(),
      windows: z.array(
        z.object({
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        }),
      ),
    }),
  ),
});

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose a valid date.'),
  isClosed: z.boolean(),
  startMinute: z.number().int().min(0).max(1439).nullable().optional(),
  endMinute: z.number().int().min(1).max(1440).nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

const bookingActionSchema = z.object({
  action: z.enum(['confirm', 'cancel', 'complete', 'reschedule']),
  startsAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().max(300).optional(),
});

function validTimezone(zone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}

function getOwnerBusiness(db: DatabaseSync, ownerId: string): BusinessRow {
  const row = getBusinessRowByOwner(db, ownerId, ownerId);
  if (!row) throw new ApiError(404, 'You do not have a business profile yet.');
  return row;
}

function getOwnedService(db: DatabaseSync, businessId: string, serviceId: string) {
  const row = db
    .prepare('SELECT * FROM services WHERE id = ? AND business_id = ?')
    .get(serviceId, businessId) as
    | {
        id: string;
        business_id: string;
        name: string;
        description: string;
        duration_minutes: number;
        buffer_minutes: number;
        price_cents: number;
        is_active: number;
        house_call: number;
        sort_order: number;
        created_at: string;
      }
    | undefined;
  if (!row) throw new ApiError(404, 'Service not found.');
  return row;
}

function serializeServiceRow(row: ReturnType<typeof getOwnedService>) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    bufferMinutes: row.buffer_minutes,
    priceCents: row.price_cents,
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order,
    houseCall: Boolean(row.house_call),
  };
}

export function ownerRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use(requireOwner);

  router.get('/business', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    res.json({
      business: buildBusinessDetail(db, business, req.user!, true),
      services: getServices(db, business.id, true),
    });
  });

  router.put('/business', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const input = parseBody(businessSchema, req.body);
    if (input.timezone && !validTimezone(input.timezone)) {
      throw new ApiError(400, 'That timezone is not recognized.');
    }
    if (input.email && input.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new ApiError(400, 'Please enter a valid contact email.');
    }
    const current = business;
    db.prepare(
      `UPDATE businesses SET name = ?, category = ?, tagline = ?, description = ?, address = ?, city = ?, country = ?,
        phone = ?, email = ?, timezone = ?, cover_image = ?, accent_color = ?, approval_required = ? WHERE id = ?`,
    ).run(
      input.name ?? current.name,
      input.category ?? current.category,
      input.tagline ?? current.tagline,
      input.description ?? current.description,
      input.address ?? current.address,
      input.city ?? current.city,
      input.country ?? current.country,
      input.phone ?? current.phone,
      input.email ?? current.email,
      input.timezone ?? current.timezone,
      input.coverImage ?? current.cover_image,
      input.accentColor ?? current.accent_color,
      input.approvalRequired === undefined ? current.approval_required : input.approvalRequired ? 1 : 0,
      current.id,
    );
    const updated = getOwnerBusiness(db, req.user!.id);
    res.json({ business: buildBusinessDetail(db, updated, req.user!, true) });
  });

  router.get('/overview', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const detail = buildBusinessDetail(db, business, req.user!, true);
    const now = DateTime.now().setZone(business.timezone);
    const today = now.toISODate()!;
    const todayStart = now.startOf('day').toUTC().toISO()!;
    const todayEnd = now.plus({ days: 1 }).startOf('day').toUTC().toISO()!;
    const monthStart = now.startOf('month').toUTC().toISO()!;
    const monthEnd = now.plus({ months: 1 }).startOf('month').toUTC().toISO()!;

    const upcoming = getOwnerBookings(db, business.id, { scope: 'upcoming' });
    const pending = getOwnerBookings(db, business.id, { status: 'pending' });
    const todayBookings = getOwnerBookings(db, business.id, { from: todayStart, to: todayEnd }).filter(
      (b) => b.status !== 'cancelled',
    );

    const revenue = db
      .prepare(
        `SELECT COALESCE(SUM(price_cents), 0) AS total FROM bookings
         WHERE business_id = ? AND status IN ('confirmed', 'completed') AND starts_at >= ? AND starts_at < ?`,
      )
      .get(business.id, monthStart, monthEnd) as { total: number };
    const completed = db
      .prepare(
        `SELECT COUNT(*) AS count FROM bookings WHERE business_id = ? AND status = 'completed' AND starts_at >= ? AND starts_at < ?`,
      )
      .get(business.id, monthStart, monthEnd) as { count: number };
    const newCustomers = db
      .prepare(
        `SELECT COUNT(DISTINCT customer_id) AS count FROM bookings
         WHERE business_id = ? AND created_at >= ? AND status != 'cancelled'`,
      )
      .get(business.id, monthStart) as { count: number };

    // Occupancy across the next seven days, based on open hours and booked service minutes.
    const weekStart = now.startOf('day');
    const weekEnd = weekStart.plus({ days: 7 });
    const rangeStart = weekStart.toUTC().toISO()!;
    const rangeEnd = weekEnd.toUTC().toISO()!;
    let capacityMinutes = 0;
    for (let i = 0; i < 7; i++) {
      const date = weekStart.plus({ days: i }).toISODate()!;
      const { windows } = getWindowsForDate(db, business.id, date, business.timezone);
      capacityMinutes += windows.reduce((total, w) => total + (w.endMinute - w.startMinute), 0);
    }
    const booked = db
      .prepare(
        `SELECT COALESCE(SUM(s.duration_minutes), 0) AS minutes FROM bookings bk
         JOIN services s ON s.id = bk.service_id
         WHERE bk.business_id = ? AND bk.status IN ('pending', 'confirmed') AND bk.starts_at >= ? AND bk.starts_at < ?`,
      )
      .get(business.id, rangeStart, rangeEnd) as { minutes: number };
    const occupancyPercent =
      capacityMinutes > 0 ? Math.min(100, Math.round((booked.minutes / capacityMinutes) * 100)) : 0;

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const day = weekStart.plus({ days: i });
      const dayStartIso = day.toUTC().toISO()!;
      const dayEndIso = day.plus({ days: 1 }).toUTC().toISO()!;
      const count = (db
        .prepare(
          `SELECT COUNT(*) AS count FROM bookings WHERE business_id = ? AND starts_at >= ? AND starts_at < ? AND status IN ('pending', 'confirmed')`,
        )
        .get(business.id, dayStartIso, dayEndIso) as { count: number }).count;
      return {
        date: day.toISODate()!,
        label: day.toFormat('ccc'),
        count,
      };
    });

    res.json({
      business: detail,
      stats: {
        upcoming: upcoming.length,
        pending: pending.length,
        revenueMonthCents: revenue.total,
        completedMonth: completed.count,
        newCustomersMonth: newCustomers.count,
        occupancyPercent,
      },
      today: todayBookings,
      upcoming: upcoming.slice(0, 6),
      pending: pending.slice(0, 5),
      weekDays,
      todayDate: today,
    });
  });

  router.get('/bookings', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const scopeParam = getParam(req.query.scope as string | string[] | undefined);
    const status = getParam(req.query.status as string | string[] | undefined);
    const from = getParam(req.query.from as string | string[] | undefined) || undefined;
    const to = getParam(req.query.to as string | string[] | undefined) || undefined;
    const scope = scopeParam === 'upcoming' || scopeParam === 'past' ? scopeParam : 'all';
    res.json({
      bookings: getOwnerBookings(db, business.id, {
        scope,
        status: status || 'all',
        from,
        to,
      }),
      timezone: business.timezone,
    });
  });

  router.patch('/bookings/:id', async (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const input = parseBody(bookingActionSchema, req.body);
    const bookingId = req.params.id;
    const row = db.prepare('SELECT id, business_id FROM bookings WHERE id = ?').get(bookingId) as
      | { id: string; business_id: string }
      | undefined;
    if (!row || row.business_id !== business.id) throw new ApiError(404, 'Booking not found.');

    if (input.action === 'confirm') {
      const booking = await confirmBooking(db, business.id, req.user!, bookingId);
      return res.json({ booking });
    }
    if (input.action === 'complete') {
      const booking = await completeBooking(db, business.id, bookingId);
      return res.json({ booking });
    }
    if (input.action === 'cancel') {
      await cancelBooking(db, req.user!, bookingId, input.reason || '', true);
      return res.json({ ok: true });
    }
    if (!input.startsAt) throw new ApiError(400, 'Choose a new time for the appointment.');
    const booking = await rescheduleBooking(db, req.user!, bookingId, input.startsAt, true);
    res.json({ booking });
  });

  router.get('/services', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    res.json({ services: getServices(db, business.id, true) });
  });

  router.post('/services', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const input = parseBody(serviceSchema, req.body);
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max FROM services WHERE business_id = ?').get(business.id) as {
      max: number;
    };
    const id = uid();
    db.prepare(
      `INSERT INTO services (id, business_id, name, description, duration_minutes, buffer_minutes, price_cents, is_active, house_call, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      business.id,
      input.name,
      input.description || '',
      input.durationMinutes,
      input.bufferMinutes,
      input.priceCents,
      input.isActive === false ? 0 : 1,
      input.houseCall ? 1 : 0,
      max.max + 1,
      nowIso(),
    );
    res.status(201).json({ service: serializeServiceRow(getOwnedService(db, business.id, id)) });
  });

  router.patch('/services/:id', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const existing = getOwnedService(db, business.id, req.params.id);
    const input = parseBody(servicePatchSchema, req.body);
    db.prepare(
      `UPDATE services SET name = ?, description = ?, duration_minutes = ?, buffer_minutes = ?, price_cents = ?, is_active = ?, house_call = ? WHERE id = ? AND business_id = ?`,
    ).run(
      input.name ?? existing.name,
      input.description ?? existing.description,
      input.durationMinutes ?? existing.duration_minutes,
      input.bufferMinutes ?? existing.buffer_minutes,
      input.priceCents ?? existing.price_cents,
      input.isActive === undefined ? existing.is_active : input.isActive ? 1 : 0,
      input.houseCall === undefined ? existing.house_call : input.houseCall ? 1 : 0,
      existing.id,
      business.id,
    );
    res.json({ service: serializeServiceRow(getOwnedService(db, business.id, existing.id)) });
  });

  router.delete('/services/:id', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const existing = getOwnedService(db, business.id, req.params.id);
    db.prepare('UPDATE services SET is_active = 0 WHERE id = ? AND business_id = ?').run(
      existing.id,
      business.id,
    );
    res.json({ ok: true, archived: true });
  });

  router.get('/availability', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    res.json({
      timezone: business.timezone,
      weeklyHours: getWeeklyHours(db, business.id),
      exceptions: getExceptions(db, business.id),
    });
  });

  router.put('/availability', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const input = parseBody(availabilitySchema, req.body);
    const seen = new Set<number>();
    for (const day of input.weeklyHours) {
      if (seen.has(day.weekday)) throw new ApiError(400, 'Each weekday can only appear once.');
      seen.add(day.weekday);
      if (!day.isOpen && day.windows.length > 0) {
        throw new ApiError(400, 'A closed day cannot have working hours.');
      }
      const sorted = [...day.windows].sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 0; i < sorted.length; i++) {
        const w = sorted[i];
        if (w.endMinute <= w.startMinute) {
          throw new ApiError(400, 'Each time range must end after it starts.');
        }
        if (i > 0 && sorted[i - 1].endMinute > w.startMinute) {
          throw new ApiError(400, 'Working-hour ranges cannot overlap.');
        }
      }
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM availability_rules WHERE business_id = ?').run(business.id);
      for (const day of input.weeklyHours) {
        if (!day.isOpen) continue;
        for (const w of day.windows) {
          db.prepare(
            'INSERT INTO availability_rules (id, business_id, weekday, start_minute, end_minute, is_active) VALUES (?, ?, ?, ?, ?, 1)',
          ).run(uid(), business.id, day.weekday, w.startMinute, w.endMinute);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // no-op
      }
      throw err;
    }

    res.json({ weeklyHours: getWeeklyHours(db, business.id) });
  });

  router.post('/availability/exceptions', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const input = parseBody(exceptionSchema, req.body);
    if (!DateTime.fromISO(input.date).isValid) throw new ApiError(400, 'Please choose a valid date.');
    if (!input.isClosed) {
      if (input.startMinute == null || input.endMinute == null) {
        throw new ApiError(400, 'Add opening and closing times for this date.');
      }
      if (input.endMinute <= input.startMinute) {
        throw new ApiError(400, 'Closing time must be after opening time.');
      }
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM availability_exceptions WHERE business_id = ? AND date = ?').run(
        business.id,
        input.date,
      );
      db.prepare(
        `INSERT INTO availability_exceptions (id, business_id, date, is_closed, start_minute, end_minute, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uid(),
        business.id,
        input.date,
        input.isClosed ? 1 : 0,
        input.isClosed ? null : input.startMinute ?? null,
        input.isClosed ? null : input.endMinute ?? null,
        input.note || '',
        nowIso(),
      );
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // no-op
      }
      throw err;
    }
    res.status(201).json({ exceptions: getExceptions(db, business.id) });
  });

  router.delete('/availability/exceptions/:id', (req, res) => {
    const business = getOwnerBusiness(db, req.user!.id);
    const row = db
      .prepare('SELECT id FROM availability_exceptions WHERE id = ? AND business_id = ?')
      .get(req.params.id, business.id) as { id: string } | undefined;
    if (!row) throw new ApiError(404, 'Exception not found.');
    db.prepare('DELETE FROM availability_exceptions WHERE id = ?').run(row.id);
    res.json({ exceptions: getExceptions(db, business.id) });
  });

  return router;
}
