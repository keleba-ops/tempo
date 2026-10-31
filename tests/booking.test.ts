import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import type { User } from '../shared/types.js';
import { cancelBooking, createBooking, rescheduleBooking, sendDueReminders } from '../server/booking-service.js';
import { initSchema } from '../server/schema.js';
import { getBookingRow } from '../server/serializers.js';
import { getSlots } from '../server/slots.js';

const ZONE = 'America/Los_Angeles';
const DATE = DateTime.now().setZone(ZONE).plus({ days: 4 }).toISODate()!;

function addUser(db: DatabaseSync, id: string, role: 'owner' | 'customer', inApp = 0, emailPref = 0) {
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, email_notifications, in_app_notifications, created_at)
     VALUES (?, ?, ?, 'x', ?, ?, ?, ?)`,
  ).run(id, id === 'owner-1' ? 'Maya Owner' : 'Alex Customer', `${id}@test.local`, role, emailPref, inApp, new Date().toISOString());
}

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  addUser(db, 'owner-1', 'owner');
  addUser(db, 'customer-1', 'customer', 0, 0);
  addUser(db, 'watcher-1', 'customer', 1, 0);
  db.prepare(
    `INSERT INTO businesses (id, owner_id, name, slug, category, timezone, approval_required, created_at)
     VALUES ('biz-1', 'owner-1', 'Test Studio', 'test-studio', 'Barbering', ?, 1, ?)`,
  ).run(ZONE, new Date().toISOString());
  db.prepare(
    `INSERT INTO services (id, business_id, name, description, duration_minutes, buffer_minutes, price_cents, is_active, sort_order, created_at)
     VALUES ('svc-1', 'biz-1', 'Signature Cut', '', 30, 10, 5000, 1, 1, ?)`,
  ).run(new Date().toISOString());
  const weekday = DateTime.fromISO(DATE, { zone: ZONE }).weekday % 7;
  db.prepare(
    `INSERT INTO availability_rules (id, business_id, weekday, start_minute, end_minute, is_active)
     VALUES ('rule-1', 'biz-1', ?, 540, 720, 1)`,
  ).run(weekday);
  db.prepare(
    `INSERT INTO favorites (id, user_id, business_id, created_at) VALUES ('fav-1', 'watcher-1', 'biz-1', ?)`,
  ).run(new Date().toISOString());
  return db;
}

const customer: User = {
  id: 'customer-1',
  name: 'Alex Customer',
  email: 'customer-1@test.local',
  role: 'customer',
  emailNotifications: false,
  inAppNotifications: false,
  phone: '+267 74 000 000',
  address: 'Plot 2210, Extension 12',
  city: 'Gaborone',
};

test('a booking is held transactionally and double-booking is rejected', async () => {
  const db = setup();
  const service = { id: 'svc-1', name: 'Signature Cut', duration_minutes: 30, buffer_minutes: 10, price_cents: 5000, is_active: 1 };
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const slots = getSlots(db, { business, service, date: DATE }).slots;
  assert.ok(slots.length > 2);

  const booking = await createBooking(db, customer, {
    serviceId: 'svc-1',
    startsAt: slots[0].startsAt,
    notes: 'Test note',
  });
  assert.equal(booking.status, 'pending');
  assert.equal(booking.service.durationMinutes, 30);
  assert.equal(booking.notes, 'Test note');

  await assert.rejects(
    () => createBooking(db, customer, { serviceId: 'svc-1', startsAt: slots[0].startsAt }),
    (error: Error & { status?: number }) => error.status === 409,
  );

  const row = getBookingRow(db, booking.id);
  assert.equal(row?.status, 'pending');
  db.close();
});

test('rescheduling excludes the current booking and respects the change policy', async () => {
  const db = setup();
  const service = { id: 'svc-1', name: 'Signature Cut', duration_minutes: 30, buffer_minutes: 10, price_cents: 5000, is_active: 1 };
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const slots = getSlots(db, { business, service, date: DATE }).slots;
  const booking = await createBooking(db, customer, { serviceId: 'svc-1', startsAt: slots[0].startsAt });
  const later = slots.find((slot) => slot.startMinute >= 10 * 60)!.startsAt;

  const updated = await rescheduleBooking(db, customer, booking.id, later, false);
  assert.equal(updated.startsAt, later);

  const withoutCurrent = getSlots(db, {
    business,
    service,
    date: DATE,
    excludeBookingId: booking.id,
  });
  assert.ok(withoutCurrent.slots.some((slot) => slot.startsAt === later));
  db.close();
});

test('cancelling reopens the slot and alerts customers who favorited the business', async () => {
  const db = setup();
  const service = { id: 'svc-1', name: 'Signature Cut', duration_minutes: 30, buffer_minutes: 10, price_cents: 5000, is_active: 1 };
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const slots = getSlots(db, { business, service, date: DATE }).slots;
  const booking = await createBooking(db, customer, { serviceId: 'svc-1', startsAt: slots[0].startsAt });

  await cancelBooking(db, customer, booking.id, 'Something came up', false);
  const row = getBookingRow(db, booking.id);
  assert.equal(row?.status, 'cancelled');
  assert.equal(row?.cancellation_reason, 'Something came up');

  const notifications = db
    .prepare(`SELECT type, title FROM notifications WHERE user_id = 'watcher-1'`)
    .all() as unknown as { type: string; title: string }[];
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'slot_opened');
  assert.match(notifications[0].title, /opened/i);

  const reopened = getSlots(db, { business, service, date: DATE });
  assert.ok(reopened.slots.some((slot) => slot.startsAt === slots[0].startsAt));
  db.close();
});

test('confirmed appointments inside 24 hours receive exactly one reminder', async () => {
  const db = setup();
  db.prepare(`UPDATE users SET in_app_notifications = 1 WHERE id = 'customer-1'`).run();
  const start = DateTime.now().plus({ hours: 2 }).toUTC();
  const end = start.plus({ minutes: 30 });
  db.prepare(
    `INSERT INTO bookings (id, business_id, service_id, customer_id, starts_at, ends_at, status, notes, price_cents, created_at, updated_at)
     VALUES ('bk-reminder', 'biz-1', 'svc-1', 'customer-1', ?, ?, 'confirmed', '', 5000, ?, ?)`,
  ).run(start.toISO()!, end.toISO()!, new Date().toISOString(), new Date().toISOString());

  const sent = await sendDueReminders(db);
  assert.equal(sent, 1);
  const row = db.prepare(`SELECT reminder_sent_at FROM bookings WHERE id = 'bk-reminder'`).get() as {
    reminder_sent_at: string | null;
  };
  assert.ok(row.reminder_sent_at);
  const notes = db
    .prepare(`SELECT type FROM notifications WHERE user_id = 'customer-1' AND type = 'reminder'`)
    .all() as unknown as { type: string }[];
  assert.equal(notes.length, 1);

  const second = await sendDueReminders(db);
  assert.equal(second, 0);
  db.close();
});

test('house-call bookings store the customer address and contact details', async () => {
  const db = setup();
  db.prepare(`UPDATE services SET house_call = 1 WHERE id = 'svc-1'`).run();
  const service = { id: 'svc-1', name: 'Signature Cut', duration_minutes: 30, buffer_minutes: 10, price_cents: 5000, is_active: 1 };
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const slots = getSlots(db, { business, service, date: DATE }).slots;

  const booking = await createBooking(db, customer, {
    serviceId: 'svc-1',
    startsAt: slots[0].startsAt,
    locationType: 'house_call',
    serviceAddress: 'Plot 2210, Extension 12',
    serviceCity: 'Gaborone',
    contactPhone: '+267 74 555 018',
  });

  assert.equal(booking.locationType, 'house_call');
  assert.equal(booking.serviceAddress, 'Plot 2210, Extension 12');
  assert.equal(booking.serviceCity, 'Gaborone');
  assert.equal(booking.contactPhone, '+267 74 555 018');
  assert.equal(booking.service.houseCall, true);
  db.close();
});

test('a house-call booking requires an address', async () => {
  const db = setup();
  db.prepare(`UPDATE services SET house_call = 1 WHERE id = 'svc-1'`).run();
  const service = { id: 'svc-1', name: 'Signature Cut', duration_minutes: 30, buffer_minutes: 10, price_cents: 5000, is_active: 1 };
  const business = { id: 'biz-1', name: 'Test Studio', slug: 'test-studio', timezone: ZONE };
  const slots = getSlots(db, { business, service, date: DATE }).slots;

  await assert.rejects(
    () =>
      createBooking(db, customer, {
        serviceId: 'svc-1',
        startsAt: slots[0].startsAt,
        locationType: 'house_call',
        contactPhone: '+267 74 555 018',
      }),
    (error: Error & { status?: number }) => error.status === 400,
  );
  db.close();
});
