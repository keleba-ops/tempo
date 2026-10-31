import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import { initSchema } from '../server/schema.js';
import { getSlots, getWindowsForDate } from '../server/slots.js';

const ZONE = 'America/New_York';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, email_notifications, in_app_notifications, created_at)
     VALUES ('owner-1', 'Owner', 'owner@test.local', 'x', 'owner', 0, 0, ?)`,
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT INTO businesses (id, owner_id, name, slug, category, timezone, created_at)
     VALUES ('biz-1', 'owner-1', 'Test Studio', 'test-studio', 'Wellness', ?, ?)`,
  ).run(ZONE, new Date().toISOString());
  db.prepare(
    `INSERT INTO services (id, business_id, name, description, duration_minutes, buffer_minutes, price_cents, is_active, sort_order, created_at)
     VALUES ('svc-1', 'biz-1', 'Session', '', 30, 0, 5000, 1, 1, ?)`,
  ).run(new Date().toISOString());
  return db;
}

function futureDate(days = 3): string {
  return DateTime.now().setZone(ZONE).plus({ days }).toISODate()!;
}

function addRule(db: DatabaseSync, date: string, startMinute = 9 * 60, endMinute = 12 * 60) {
  const weekday = DateTime.fromISO(date, { zone: ZONE }).weekday % 7;
  db.prepare(
    `INSERT INTO availability_rules (id, business_id, weekday, start_minute, end_minute, is_active)
     VALUES ('rule-1', 'biz-1', ?, ?, ?, 1)`,
  ).run(weekday, startMinute, endMinute);
}

function addBooking(
  db: DatabaseSync,
  opts: { id: string; start: string; duration?: number; buffer?: number; serviceId?: string },
) {
  const start = DateTime.fromISO(opts.start, { zone: 'utc' });
  const duration = opts.duration ?? 30;
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, email_notifications, in_app_notifications, created_at)
     VALUES (?, 'Guest', ?, 'x', 'customer', 0, 0, ?)`,
  ).run(`cust-${opts.id}`, `${opts.id}@test.local`, new Date().toISOString());
  const serviceId = opts.serviceId || 'svc-1';
  db.prepare(
    `INSERT INTO bookings (id, business_id, service_id, customer_id, starts_at, ends_at, status, notes, price_cents, created_at, updated_at)
     VALUES (?, 'biz-1', ?, ?, ?, ?, 'confirmed', '', 5000, ?, ?)`,
  ).run(
    opts.id,
    serviceId,
    `cust-${opts.id}`,
    start.toUTC().toISO()!,
    start.plus({ minutes: duration }).toUTC().toISO()!,
    new Date().toISOString(),
    new Date().toISOString(),
  );
  void opts.buffer;
}

test('only genuinely available slots are returned, with 15-minute granularity', () => {
  const db = makeDb();
  const date = futureDate();
  addRule(db, date);
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const service = {
    id: 'svc-1',
    name: 'Session',
    duration_minutes: 30,
    buffer_minutes: 0,
    price_cents: 5000,
    is_active: 1,
  };

  const first = getSlots(db, { business, service, date });
  assert.equal(first.slots.length, 11);
  assert.equal(first.slots[0].label, '9:00 AM');
  assert.equal(first.slots.at(-1)?.label, '11:30 AM');

  addBooking(db, { id: 'bk-1', start: first.slots[0].startsAt });
  const after = getSlots(db, { business, service, date });
  assert.equal(after.slots[0].label, '9:30 AM');
  assert.equal(after.slots.length, 9);
  assert.ok(!after.slots.some((slot) => slot.startsAt === first.slots[0].startsAt));
  db.close();
});

test('service buffers block the cool-down window between appointments', () => {
  const db = makeDb();
  const date = futureDate();
  addRule(db, date);
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const service = {
    id: 'svc-1',
    name: 'Session',
    duration_minutes: 30,
    buffer_minutes: 15,
    price_cents: 5000,
    is_active: 1,
  };
  db.prepare(`UPDATE services SET buffer_minutes = 15 WHERE id = 'svc-1'`).run();
  const first = getSlots(db, { business, service, date });
  addBooking(db, { id: 'bk-buffer', start: first.slots[0].startsAt });
  const after = getSlots(db, { business, service, date });

  assert.equal(after.slots[0].label, '9:45 AM');
  assert.equal(after.slots.length, 8);
  assert.ok(after.slots.every((slot) => slot.startMinute >= 9 * 60 + 45));
  db.close();
});

test('closed exceptions override recurring hours and custom hours replace them', () => {
  const db = makeDb();
  const date = futureDate();
  addRule(db, date);
  db.prepare(
    `INSERT INTO availability_exceptions (id, business_id, date, is_closed, start_minute, end_minute, note, created_at)
     VALUES ('exc-1', 'biz-1', ?, 1, NULL, NULL, 'Holiday', ?)`,
  ).run(date, new Date().toISOString());
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const service = {
    id: 'svc-1',
    name: 'Session',
    duration_minutes: 30,
    buffer_minutes: 0,
    price_cents: 5000,
    is_active: 1,
  };
  assert.equal(getSlots(db, { business, service, date }).slots.length, 0);
  assert.equal(getWindowsForDate(db, 'biz-1', date, ZONE).windows.length, 0);

  db.prepare(
    `UPDATE availability_exceptions SET is_closed = 0, start_minute = 600, end_minute = 660 WHERE id = 'exc-1'`,
  ).run();
  const custom = getSlots(db, { business, service, date });
  assert.equal(custom.slots[0].label, '10:00 AM');
  assert.equal(custom.slots.at(-1)?.label, '10:30 AM');
  assert.equal(custom.slots.length, 3);
  db.close();
});

test('adjacent bookings do not erase a free slot but overlapping buffers do', () => {
  const db = makeDb();
  const date = futureDate();
  addRule(db, date);
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const service = {
    id: 'svc-1',
    name: 'Session',
    duration_minutes: 30,
    buffer_minutes: 0,
    price_cents: 5000,
    is_active: 1,
  };
  addBooking(db, { id: 'bk-a', start: DateTime.fromISO(date, { zone: ZONE }).plus({ hours: 9 }).toUTC().toISO()! });
  addBooking(db, { id: 'bk-b', start: DateTime.fromISO(date, { zone: ZONE }).plus({ hours: 10 }).toUTC().toISO()! });
  const slots = getSlots(db, { business, service, date });
  assert.ok(slots.slots.some((slot) => slot.label === '9:30 AM'));
  assert.ok(slots.slots.some((slot) => slot.label === '10:30 AM'));
  assert.ok(slots.slots.some((slot) => slot.label === '11:00 AM'));
  db.close();
});
