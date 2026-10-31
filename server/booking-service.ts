import type { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import type { User } from '../shared/types.js';
import { notifyUser } from './notifications.js';
import { getSlots, type BusinessRow, type ServiceRow } from './slots.js';
import { getBookingRow, mapBooking, type BookingRow } from './serializers.js';
import {
  ApiError,
  formatDateInZone,
  formatDateTimeInZone,
  formatMoney,
  formatTimeInZone,
  nowIso,
  uid,
} from './utils.js';

export const CANCELLATION_POLICY_HOURS = 12;

interface ServiceWithBusiness extends ServiceRow {
  house_call: number;
  business_id: string;
  business_name: string;
  business_slug: string;
  business_timezone: string;
  business_approval_required: number;
  owner_id: string;
  owner_name: string;
}

function loadService(db: DatabaseSync, serviceId: string): ServiceWithBusiness {
  const row = db
    .prepare(
      `SELECT s.id, s.name, s.duration_minutes, s.buffer_minutes, s.price_cents, s.is_active, s.house_call,
        b.id AS business_id, b.name AS business_name, b.slug AS business_slug,
        b.timezone AS business_timezone, b.approval_required AS business_approval_required,
        u.id AS owner_id, u.name AS owner_name
       FROM services s
       JOIN businesses b ON b.id = s.business_id
       JOIN users u ON u.id = b.owner_id
       WHERE s.id = ?`,
    )
    .get(serviceId) as ServiceWithBusiness | undefined;
  if (!row) throw new ApiError(404, 'That service could not be found.');
  if (!row.is_active) throw new ApiError(400, 'That service is not currently available.');
  return row;
}

function businessRef(service: ServiceWithBusiness): BusinessRow {
  return {
    id: service.business_id,
    name: service.business_name,
    slug: service.business_slug,
    timezone: service.business_timezone,
  };
}

function localDate(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone).toISODate()!;
}

function withImmediate<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore a rollback failure and surface the original error.
    }
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw new ApiError(409, 'That time was just booked by someone else. Please choose another slot.');
    }
    throw error;
  }
}

function locationLabel(row: BookingRow): string {
  if (row.location_type === 'house_call') {
    return `House call · ${row.service_address}, ${row.service_city}`;
  }
  return `${row.business_name} · ${row.business_address}, ${row.business_city}`;
}

function bookingDetails(row: BookingRow): { label: string; value: string }[] {
  return [
    { label: 'Service', value: row.service_name },
    { label: 'When', value: formatDateTimeInZone(row.starts_at, row.business_timezone) },
    { label: row.location_type === 'house_call' ? 'House call' : 'Where', value: locationLabel(row) },
    { label: 'With', value: row.business_name },
    { label: 'Total (BWP)', value: formatMoney(row.service_price) },
  ];
}

function assertCustomerPolicy(row: BookingRow): void {
  const cutoff = DateTime.fromISO(row.starts_at, { zone: 'utc' }).minus({ hours: CANCELLATION_POLICY_HOURS });
  if (DateTime.now() >= cutoff) {
    throw new ApiError(
      400,
      `Online changes close ${CANCELLATION_POLICY_HOURS} hours before the appointment. Please contact the business directly.`,
    );
  }
}

async function sendFreedSlotAlerts(db: DatabaseSync, row: BookingRow, excludeUserId: string): Promise<void> {
  const service = db
    .prepare('SELECT * FROM services WHERE id = ?')
    .get(row.service_id) as ServiceRow | undefined;
  if (!service) return;
  const business = db
    .prepare('SELECT id, name, slug, timezone FROM businesses WHERE id = ?')
    .get(row.business_id) as BusinessRow | undefined;
  if (!business) return;

  const date = localDate(row.starts_at, business.timezone);
  const { slots } = getSlots(db, { business, service, date });
  const freedSlot = slots.find((slot) => slot.startsAt === row.starts_at);
  if (!freedSlot) return;

  const watcherRows = db
    .prepare(
      `SELECT DISTINCT user_id FROM (
        SELECT user_id FROM favorites WHERE business_id = ?
        UNION
        SELECT sw.user_id FROM service_watchlist sw
        JOIN services s ON s.id = sw.service_id
        WHERE s.business_id = ? AND s.id = ?
      )`,
    )
    .all(business.id, business.id, service.id) as unknown as { user_id: string }[];

  const owner = db.prepare('SELECT owner_id FROM businesses WHERE id = ?').get(business.id) as
    | { owner_id: string }
    | undefined;

  const niceDate = DateTime.fromISO(date, { zone: business.timezone }).toFormat('cccc, LLLL d');
  const openingText = `A ${freedSlot.label} appointment with ${service.name} just opened`;

  await Promise.allSettled(
    watcherRows
      .map((r) => r.user_id)
      .filter((id) => id !== excludeUserId && id !== row.customer_id && id !== owner?.owner_id)
      .map((userId) =>
        notifyUser(db, {
          userId,
          type: 'slot_opened',
          title: `A new time opened at ${business.name}`,
          body: `${openingText} on ${niceDate}. Favorites get first look.`,
          actionUrl: `/b/${business.slug}`,
          businessId: business.id,
          bookingId: row.id,
          email: {
            subject: `An opening just appeared at ${business.name}`,
            kind: 'slot_opened',
            kicker: 'A favorite has availability',
            heading: 'A little room opened up.',
            intro: `Someone just cancelled at ${business.name}. ${openingText} on ${niceDate}. If it works for you, it is yours to book.`,
            details: [
              { label: 'Business', value: business.name },
              { label: 'Date', value: niceDate },
              { label: 'Opening', value: freedSlot.label },
              { label: 'Service', value: service.name },
            ],
            ctaLabel: 'Book this opening',
            footnote: 'You are receiving this because you favorited this business or asked to watch this service.',
          },
        }),
      ),
  );
}

export async function createBooking(
  db: DatabaseSync,
  customer: User,
  input: {
    serviceId: string;
    startsAt: string;
    notes?: string;
    locationType?: 'business' | 'house_call';
    serviceAddress?: string;
    serviceCity?: string;
    contactPhone?: string;
  },
) {
  const service = loadService(db, input.serviceId);
  const business = businessRef(service);
  const locationType = input.locationType === 'house_call' ? 'house_call' : 'business';
  const serviceAddress = (input.serviceAddress || '').trim().slice(0, 300);
  const serviceCity = (input.serviceCity || '').trim().slice(0, 120);
  const contactPhone = (input.contactPhone || customer.phone || '').trim().slice(0, 40);

  if (locationType === 'house_call') {
    if (!service.house_call) {
      throw new ApiError(400, 'This service is only available at the business location.');
    }
    if (!serviceAddress || !serviceCity) {
      throw new ApiError(400, 'Please add the address where the appointment should take place.');
    }
    if (!contactPhone) {
      throw new ApiError(400, 'Please add a phone number for your house call.');
    }
  }
  const wants = DateTime.fromISO(input.startsAt, { zone: 'utc' });
  if (!wants.isValid) throw new ApiError(400, 'Please choose a valid appointment time.');
  const start = wants.toUTC().startOf('minute');
  const startsAt = start.toISO()!;
  const date = start.setZone(business.timezone).toISODate()!;

  const { slots } = getSlots(db, { business, service, date });
  if (!slots.some((slot) => slot.startsAt === startsAt)) {
    throw new ApiError(409, 'That time is no longer available. Please choose another slot.');
  }

  const status = service.business_approval_required ? 'pending' : 'confirmed';
  const id = uid();
  const endsAt = start.plus({ minutes: service.duration_minutes }).toUTC().toISO()!;
  const timestamp = nowIso();

  withImmediate(db, () => {
    // Validate again inside the write transaction so two requests cannot pass concurrently.
    const checked = getSlots(db, { business, service, date });
    if (!checked.slots.some((slot) => slot.startsAt === startsAt)) {
      throw new ApiError(409, 'That time was just taken. Please choose another slot.');
    }
    db.prepare(
      `INSERT INTO bookings
        (id, business_id, service_id, customer_id, starts_at, ends_at, status, notes, price_cents,
         location_type, service_address, service_city, contact_phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      business.id,
      service.id,
      customer.id,
      startsAt,
      endsAt,
      status,
      (input.notes || '').trim().slice(0, 800),
      service.price_cents,
      locationType,
      locationType === 'house_call' ? serviceAddress : '',
      locationType === 'house_call' ? serviceCity : '',
      contactPhone || customer.phone || '',
      timestamp,
      timestamp,
    );
  });

  const row = getBookingRow(db, id)!;
  const when = formatDateTimeInZone(startsAt, business.timezone);
  const isPending = status === 'pending';

  await notifyUser(db, {
    userId: customer.id,
    type: isPending ? 'booking_requested' : 'booking_confirmed',
    title: isPending ? `Request sent to ${business.name}` : `You're booked at ${business.name}`,
    body: isPending
      ? `${service.name} on ${when}. ${business.name} will review your request shortly.`
      : `${service.name} on ${when}. We've emailed your confirmation and will remind you before your visit.`,
    actionUrl: '/account/bookings',
    businessId: business.id,
    bookingId: id,
    email: {
      subject: isPending
        ? `Your request to ${business.name} was received`
        : `Confirmed: ${service.name} at ${business.name}`,
      kind: isPending ? 'booking_requested' : 'booking_confirmed',
      kicker: isPending ? 'Request received' : 'You are confirmed',
      heading: isPending ? 'Your request is in.' : "You're on the books.",
      intro: isPending
        ? `${business.name} reviews new bookings personally. We'll email you as soon as they confirm your appointment.`
        : `You're all set at ${business.name}. Here are the details for your calendar.`,
      details: bookingDetails(row),
      ctaLabel: isPending ? 'View your request' : 'View appointment',
    },
  });

  await notifyUser(db, {
    userId: service.owner_id,
    type: isPending ? 'booking_request' : 'new_booking',
    title: isPending ? 'New booking request' : 'New appointment booked',
    body: `${customer.name} booked ${service.name} on ${when}.`,
    actionUrl: '/owner/bookings',
    businessId: business.id,
    bookingId: id,
    email: {
      subject: `${isPending ? 'New request' : 'New booking'}: ${customer.name} · ${service.name}`,
      kind: 'owner_new_booking',
      kicker: isPending ? 'Needs your approval' : 'New on your calendar',
      heading: isPending ? 'A booking needs your nod.' : 'A new appointment landed.',
      intro: `${customer.name} chose ${service.name} on ${when}.`,
      details: [
        ...bookingDetails(row),
        { label: 'Customer', value: `${customer.name} (${customer.email})` },
        ...(contactPhone || customer.phone
          ? [{ label: 'Contact phone', value: contactPhone || customer.phone }]
          : []),
      ],
      ctaLabel: isPending ? 'Review request' : 'Open your calendar',
    },
  });

  return mapBooking(row, 'customer');
}

export async function rescheduleBooking(
  db: DatabaseSync,
  actor: User,
  bookingId: string,
  startsAtInput: string,
  isOwner: boolean,
): Promise<ReturnType<typeof mapBooking>> {
  const row = getBookingRow(db, bookingId);
  if (!row) throw new ApiError(404, 'Booking not found.');
  if (row.status !== 'pending' && row.status !== 'confirmed') {
    throw new ApiError(400, 'Only active bookings can be rescheduled.');
  }
  if (!isOwner) {
    if (row.customer_id !== actor.id) throw new ApiError(403, 'You cannot change this booking.');
    assertCustomerPolicy(row);
  }

  const service = loadService(db, row.service_id);
  const business = businessRef(service);
  const wants = DateTime.fromISO(startsAtInput, { zone: 'utc' });
  if (!wants.isValid) throw new ApiError(400, 'Please choose a valid new time.');
  const start = wants.toUTC().startOf('minute');
  const newStartsAt = start.toISO()!;
  const date = start.setZone(business.timezone).toISODate()!;
  const { slots } = getSlots(db, { business, service, date, excludeBookingId: bookingId });
  if (!slots.some((slot) => slot.startsAt === newStartsAt)) {
    throw new ApiError(409, 'That new time is not available. Please pick another slot.');
  }

  const endsAt = start.plus({ minutes: service.duration_minutes }).toUTC().toISO()!;
  const newStatus = isOwner ? 'confirmed' : row.status;
  const oldWhen = formatDateTimeInZone(row.starts_at, business.timezone);
  const newWhen = formatDateTimeInZone(newStartsAt, business.timezone);

  withImmediate(db, () => {
    const checked = getSlots(db, { business, service, date, excludeBookingId: bookingId });
    if (!checked.slots.some((slot) => slot.startsAt === newStartsAt)) {
      throw new ApiError(409, 'That new time was just taken. Please pick another slot.');
    }
    db.prepare(
      `UPDATE bookings SET starts_at = ?, ends_at = ?, status = ?, rescheduled_from = ?, reminder_sent_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(newStartsAt, endsAt, newStatus, row.starts_at, nowIso(), bookingId);
  });

  const updated = getBookingRow(db, bookingId)!;

  if (isOwner) {
    await notifyUser(db, {
      userId: row.customer_id,
      type: 'booking_rescheduled',
      title: `${business.name} moved your appointment`,
      body: `${service.name} is now ${newWhen} (previously ${oldWhen}).`,
      actionUrl: '/account/bookings',
      businessId: business.id,
      bookingId,
      email: {
        subject: `Your appointment at ${business.name} has moved`,
        kind: 'booking_rescheduled',
        kicker: 'A small change',
        heading: 'Your appointment has moved.',
        intro: `${business.name} adjusted your booking. Your new details are below.`,
        details: [
          { label: 'Service', value: service.name },
          { label: 'New time', value: newWhen },
          { label: 'Previous time', value: oldWhen },
          { label: 'Total', value: formatMoney(service.price_cents) },
        ],
        ctaLabel: 'View appointment',
      },
    });
  } else {
    await notifyUser(db, {
      userId: row.customer_id,
      type: 'booking_rescheduled',
      title: 'Your appointment was rescheduled',
      body: `${service.name} is now ${newWhen}.`,
      actionUrl: '/account/bookings',
      businessId: business.id,
      bookingId,
      email: {
        subject: `Rescheduled: ${service.name} at ${business.name}`,
        kind: 'booking_rescheduled',
        kicker: 'You are all set',
        heading: 'New time, same great plan.',
        intro: `Your appointment at ${business.name} has been moved to ${newWhen}.`,
        details: bookingDetails(updated),
        ctaLabel: 'View appointment',
      },
    });
    await notifyUser(db, {
      userId: service.owner_id,
      type: 'booking_rescheduled',
      title: `${row.customer_name} rescheduled`,
      body: `${service.name} moved from ${oldWhen} to ${newWhen}.`,
      actionUrl: '/owner/bookings',
      businessId: business.id,
      bookingId,
      email: {
        subject: `${row.customer_name} moved their appointment`,
        kind: 'owner_booking_rescheduled',
        kicker: 'Calendar update',
        heading: 'A customer moved their booking.',
        intro: `${row.customer_name} moved ${service.name} from ${oldWhen} to ${newWhen}.`,
        details: bookingDetails(updated),
        ctaLabel: 'Open your calendar',
      },
    });
  }

  return mapBooking(updated, isOwner ? 'owner' : 'customer');
}

export async function cancelBooking(
  db: DatabaseSync,
  actor: User,
  bookingId: string,
  reason: string,
  isOwner: boolean,
): Promise<void> {
  const row = getBookingRow(db, bookingId);
  if (!row) throw new ApiError(404, 'Booking not found.');
  if (row.status !== 'pending' && row.status !== 'confirmed') {
    throw new ApiError(400, 'This booking cannot be cancelled.');
  }
  if (!isOwner) {
    if (row.customer_id !== actor.id) throw new ApiError(403, 'You cannot change this booking.');
    assertCustomerPolicy(row);
  }

  const cleanReason = reason.trim().slice(0, 300);
  db.prepare(
    `UPDATE bookings SET status = 'cancelled', cancellation_reason = ?, updated_at = ? WHERE id = ?`,
  ).run(cleanReason, nowIso(), bookingId);

  const when = formatDateTimeInZone(row.starts_at, row.business_timezone);
  if (isOwner) {
    await notifyUser(db, {
      userId: row.customer_id,
      type: 'booking_cancelled',
      title: `${row.business_name} cancelled your appointment`,
      body: `${row.service_name} on ${when} has been cancelled.${cleanReason ? ` Reason: ${cleanReason}` : ' Please rebook whenever you are ready.'}`,
      actionUrl: `/b/${row.business_slug}`,
      businessId: row.business_id,
      bookingId,
      email: {
        subject: `Your appointment at ${row.business_name} was cancelled`,
        kind: 'booking_cancelled',
        kicker: 'Appointment update',
        heading: 'Your appointment was cancelled.',
        intro: `${row.business_name} had to cancel your ${row.service_name} appointment on ${when}. We're sorry for the inconvenience — they'd love to see you another time.`,
        details: [
          { label: 'Service', value: row.service_name },
          { label: 'Was scheduled', value: when },
          ...(cleanReason ? [{ label: 'Note from the business', value: cleanReason }] : []),
        ],
        ctaLabel: 'Find another time',
      },
    });
  } else {
    const ownerId = getOwnerId(db, row.business_id);
    if (ownerId) {
      await notifyUser(db, {
        userId: ownerId,
        type: 'booking_cancelled',
        title: `${row.customer_name} cancelled`,
        body: `${row.service_name} on ${when} was cancelled.${cleanReason ? ` Reason: ${cleanReason}` : ''} The slot is open again.`,
        actionUrl: '/owner/bookings',
        businessId: row.business_id,
        bookingId,
        email: {
          subject: `${row.customer_name} cancelled their appointment`,
          kind: 'owner_booking_cancelled',
          kicker: 'Calendar update',
          heading: 'A slot just opened on your calendar.',
          intro: `${row.customer_name} cancelled ${row.service_name} on ${when}. Your availability has been updated automatically.`,
          details: [
            { label: 'Customer', value: `${row.customer_name} (${row.customer_email})` },
            { label: 'Was scheduled', value: when },
            ...(cleanReason ? [{ label: 'Customer note', value: cleanReason }] : []),
          ],
          ctaLabel: 'Open your calendar',
        },
      });
    }

    await notifyUser(db, {
      userId: row.customer_id,
      type: 'booking_cancelled',
      title: 'Your appointment was cancelled',
      body: `${row.service_name} on ${when} is cancelled. We let ${row.business_name} know.`,
      actionUrl: `/b/${row.business_slug}`,
      businessId: row.business_id,
      bookingId,
    }).catch(() => {});
  }

  await sendFreedSlotAlerts(db, row, actor.id);
}

function getOwnerId(db: DatabaseSync, businessId: string): string | null {
  const row = db.prepare('SELECT owner_id FROM businesses WHERE id = ?').get(businessId) as
    | { owner_id: string }
    | undefined;
  return row?.owner_id || null;
}

export async function confirmBooking(
  db: DatabaseSync,
  businessId: string,
  owner: User,
  bookingId: string,
): Promise<ReturnType<typeof mapBooking>> {
  const row = getBookingRow(db, bookingId);
  if (!row) throw new ApiError(404, 'Booking not found.');
  if (row.business_id !== businessId) throw new ApiError(403, 'This booking belongs to another business.');
  if (row.status !== 'pending') throw new ApiError(400, 'Only pending requests can be confirmed.');

  db.prepare(`UPDATE bookings SET status = 'confirmed', updated_at = ? WHERE id = ?`).run(nowIso(), bookingId);
  const updated = getBookingRow(db, bookingId)!;
  const when = formatDateTimeInZone(row.starts_at, row.business_timezone);

  await notifyUser(db, {
    userId: row.customer_id,
    type: 'booking_confirmed',
    title: `Your appointment at ${row.business_name} is confirmed`,
    body: `${row.service_name} on ${when} is confirmed. We'll send a reminder before your visit.`,
    actionUrl: '/account/bookings',
    businessId,
    bookingId,
    email: {
      subject: `Confirmed: ${row.service_name} at ${row.business_name}`,
      kind: 'booking_confirmed',
      kicker: 'You are confirmed',
      heading: 'Your spot is saved.',
      intro: `${row.business_name} confirmed your appointment. Here are the details you need.`,
      details: bookingDetails(updated),
      ctaLabel: 'View appointment',
      footnote: `Need to make a change? You can reschedule or cancel online up to ${CANCELLATION_POLICY_HOURS} hours before your appointment.`,
    },
  });

  void owner;
  return mapBooking(updated, 'owner');
}

export async function completeBooking(
  db: DatabaseSync,
  businessId: string,
  bookingId: string,
): Promise<ReturnType<typeof mapBooking>> {
  const row = getBookingRow(db, bookingId);
  if (!row) throw new ApiError(404, 'Booking not found.');
  if (row.business_id !== businessId) throw new ApiError(403, 'This booking belongs to another business.');
  if (row.status !== 'confirmed' && row.status !== 'pending') {
    throw new ApiError(400, 'Only active bookings can be completed.');
  }
  db.prepare(`UPDATE bookings SET status = 'completed', updated_at = ? WHERE id = ?`).run(nowIso(), bookingId);
  return mapBooking(getBookingRow(db, bookingId)!, 'owner');
}

export async function sendDueReminders(db: DatabaseSync, now = DateTime.now()): Promise<number> {
  const horizon = now.plus({ hours: 24 }).toUTC().toISO()!;
  const rows = db
    .prepare(
      `SELECT * FROM bookings WHERE status = 'confirmed' AND reminder_sent_at IS NULL AND starts_at > ? AND starts_at <= ?`,
    )
    .all(now.toUTC().toISO()!, horizon) as unknown as { id: string }[];

  let sent = 0;
  for (const item of rows) {
    const row = getBookingRow(db, item.id);
    if (!row) continue;
    const when = formatDateTimeInZone(row.starts_at, row.business_timezone);
    const time = formatTimeInZone(row.starts_at, row.business_timezone);
    const date = formatDateInZone(row.starts_at, row.business_timezone);
    await notifyUser(db, {
      userId: row.customer_id,
      type: 'reminder',
      title: `A reminder for ${row.service_name}`,
      body: `Your appointment with ${row.business_name} is coming up on ${when}.`,
      actionUrl: '/account/bookings',
      businessId: row.business_id,
      bookingId: row.id,
      email: {
        subject: `Reminder: ${row.service_name} at ${row.business_name} on ${date}`,
        kind: 'reminder',
        kicker: 'Coming up soon',
        heading: `See you at ${time}.`,
        intro: `A gentle reminder that your appointment at ${row.business_name} is coming up.`,
        details: bookingDetails(row),
        ctaLabel: 'View appointment',
        footnote: `Need to make a change? You can reschedule or cancel online up to ${CANCELLATION_POLICY_HOURS} hours before your appointment.`,
      },
    });
    db.prepare('UPDATE bookings SET reminder_sent_at = ? WHERE id = ?').run(nowIso(), row.id);
    sent++;
  }
  return sent;
}
