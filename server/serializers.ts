import type { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import type {
  Booking,
  BusinessDetail,
  BusinessSummary,
  Role,
  Service,
  User,
} from '../shared/types.js';
import { getExceptions, getWeeklyHours } from './slots.js';

export interface BusinessRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  cover_image: string;
  accent_color: string;
  approval_required: number;
  rating: number;
  review_count: number;
  owner_name: string;
  starting_price: number;
  service_count: number;
  is_favorite: number;
}

interface ServiceDbRow {
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
}

export interface BookingRow {
  id: string;
  status: Booking['status'];
  starts_at: string;
  ends_at: string;
  notes: string;
  price_cents: number;
  cancellation_reason: string;
  created_at: string;
  location_type: 'business' | 'house_call';
  service_address: string;
  service_city: string;
  contact_phone: string;
  service_id: string;
  service_name: string;
  service_duration: number;
  service_buffer: number;
  service_price: number;
  service_house_call: number;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  business_timezone: string;
  business_cover: string;
  business_address: string;
  business_city: string;
}

const BUSINESS_SELECT = `
  SELECT b.*, u.name AS owner_name,
    COALESCE((SELECT MIN(s.price_cents) FROM services s WHERE s.business_id = b.id AND s.is_active = 1), 0) AS starting_price,
    (SELECT COUNT(*) FROM services s WHERE s.business_id = b.id AND s.is_active = 1) AS service_count,
    EXISTS (SELECT 1 FROM favorites f WHERE f.business_id = b.id AND f.user_id = ?) AS is_favorite
  FROM businesses b
  JOIN users u ON u.id = b.owner_id
`;

export function getBusinessRowBySlug(
  db: DatabaseSync,
  slug: string,
  viewerId: string | null = null,
): BusinessRow | undefined {
  return db.prepare(`${BUSINESS_SELECT} WHERE b.slug = ?`).get(viewerId || '', slug) as BusinessRow | undefined;
}

export function getBusinessRowById(
  db: DatabaseSync,
  id: string,
  viewerId: string | null = null,
): BusinessRow | undefined {
  return db.prepare(`${BUSINESS_SELECT} WHERE b.id = ?`).get(viewerId || '', id) as BusinessRow | undefined;
}

export function getBusinessRowByOwner(
  db: DatabaseSync,
  ownerId: string,
  viewerId: string | null = null,
): BusinessRow | undefined {
  return db.prepare(`${BUSINESS_SELECT} WHERE b.owner_id = ?`).get(viewerId || '', ownerId) as BusinessRow | undefined;
}

export function listBusinessRows(db: DatabaseSync, viewerId: string | null = null): BusinessRow[] {
  return db
    .prepare(`${BUSINESS_SELECT} ORDER BY b.rating DESC, b.review_count DESC, b.created_at ASC`)
    .all(viewerId || '') as unknown as BusinessRow[];
}

export function mapService(row: ServiceDbRow): Service {
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

export function getServices(
  db: DatabaseSync,
  businessId: string,
  includeInactive = false,
): Service[] {
  const rows = db
    .prepare(
      `SELECT * FROM services WHERE business_id = ? ${includeInactive ? '' : 'AND is_active = 1'} ORDER BY sort_order, created_at`,
    )
    .all(businessId) as unknown as ServiceDbRow[];
  return rows.map(mapService);
}

export function mapBusinessSummary(row: BusinessRow): BusinessSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    tagline: row.tagline,
    city: row.city,
    address: row.address,
    country: row.country,
    timezone: row.timezone,
    coverImage: row.cover_image,
    accentColor: row.accent_color,
    rating: row.rating,
    reviewCount: row.review_count,
    approvalRequired: Boolean(row.approval_required),
    startingPriceCents: row.starting_price,
    serviceCount: row.service_count,
    isFavorite: Boolean(row.is_favorite),
  };
}

export function buildBusinessDetail(
  db: DatabaseSync,
  row: BusinessRow,
  viewer: User | null = null,
  includeInactive = false,
): BusinessDetail {
  const favoriteServices = viewer
    ? (db
        .prepare(
          `SELECT sw.service_id FROM service_watchlist sw
           JOIN services s ON s.id = sw.service_id
           WHERE sw.user_id = ? AND s.business_id = ?`,
        )
        .all(viewer.id, row.id) as unknown as { service_id: string }[]).map((r) => r.service_id)
    : [];

  return {
    ...mapBusinessSummary(row),
    description: row.description,
    phone: row.phone,
    email: row.email,
    ownerName: row.owner_name,
    services: getServices(db, row.id, includeInactive),
    weeklyHours: getWeeklyHours(db, row.id),
    exceptions: getExceptions(db, row.id),
    favoriteServices,
  };
}

export const BOOKING_SELECT = `
  SELECT bk.*,
    s.id AS service_id, s.name AS service_name, s.duration_minutes AS service_duration,
    s.buffer_minutes AS service_buffer, s.price_cents AS service_price, s.house_call AS service_house_call,
    c.id AS customer_id, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
    b.id AS business_id, b.name AS business_name, b.slug AS business_slug,
    b.timezone AS business_timezone, b.cover_image AS business_cover,
    b.address AS business_address, b.city AS business_city
  FROM bookings bk
  JOIN services s ON s.id = bk.service_id
  JOIN users c ON c.id = bk.customer_id
  JOIN businesses b ON b.id = bk.business_id
`;

export function mapBooking(row: BookingRow, viewerRole: Role = 'customer'): Booking {
  const active = row.status === 'pending' || row.status === 'confirmed';
  const cutoff = DateTime.fromISO(row.starts_at, { zone: 'utc' }).minus({ hours: 12 });
  const withinPolicy = DateTime.now() < cutoff;
  return {
    id: row.id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    notes: row.notes,
    priceCents: row.price_cents,
    createdAt: row.created_at,
    cancellationReason: row.cancellation_reason,
    canCancel: active && (viewerRole === 'owner' || withinPolicy),
    canReschedule: active && (viewerRole === 'owner' || withinPolicy),
    locationType: row.location_type || 'business',
    serviceAddress: row.service_address || '',
    serviceCity: row.service_city || '',
    contactPhone: row.contact_phone || '',
    service: {
      id: row.service_id,
      name: row.service_name,
      durationMinutes: row.service_duration,
      bufferMinutes: row.service_buffer,
      priceCents: row.service_price,
      houseCall: Boolean(row.service_house_call),
    },
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone || '',
    },
    business: {
      id: row.business_id,
      name: row.business_name,
      slug: row.business_slug,
      timezone: row.business_timezone,
      coverImage: row.business_cover,
      address: row.business_address,
      city: row.business_city,
    },
  };
}

export function getBookingRow(db: DatabaseSync, id: string): BookingRow | undefined {
  return db.prepare(`${BOOKING_SELECT} WHERE bk.id = ?`).get(id) as BookingRow | undefined;
}

export function getCustomerBookings(
  db: DatabaseSync,
  customerId: string,
  scope: 'upcoming' | 'past' | 'all' = 'all',
  viewerRole: Role = 'customer',
): Booking[] {
  const now = new Date().toISOString();
  let filter = '';
  if (scope === 'upcoming') {
    filter = `AND bk.starts_at >= '${now.replaceAll("'", "''")}' AND bk.status IN ('pending', 'confirmed')`;
  } else if (scope === 'past') {
    filter = `AND (bk.starts_at < '${now.replaceAll("'", "''")}' OR bk.status IN ('cancelled', 'completed'))`;
  }
  const rows = db
    .prepare(`${BOOKING_SELECT} WHERE bk.customer_id = ? ${filter} ORDER BY bk.starts_at ${scope === 'past' ? 'DESC' : 'ASC'}`)
    .all(customerId) as unknown as BookingRow[];
  return rows.map((r) => mapBooking(r, viewerRole));
}

export function getOwnerBookings(
  db: DatabaseSync,
  businessId: string,
  opts: { scope?: 'upcoming' | 'past' | 'all'; status?: string; from?: string; to?: string } = {},
): Booking[] {
  const clauses = ['bk.business_id = ?'];
  const params: (string | number)[] = [businessId];
  if (opts.status && opts.status !== 'all') {
    clauses.push('bk.status = ?');
    params.push(opts.status);
  }
  if (opts.scope === 'upcoming') {
    clauses.push(`bk.starts_at >= ? AND bk.status IN ('pending', 'confirmed')`);
    params.push(new Date().toISOString());
  } else if (opts.scope === 'past') {
    clauses.push(`(bk.starts_at < ? OR bk.status IN ('cancelled', 'completed'))`);
    params.push(new Date().toISOString());
  }
  if (opts.from) {
    clauses.push('bk.starts_at >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    clauses.push('bk.starts_at < ?');
    params.push(opts.to);
  }
  const rows = db
    .prepare(`${BOOKING_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY bk.starts_at ASC`)
    .all(...params) as unknown as BookingRow[];
  return rows.map((r) => mapBooking(r, 'owner'));
}
