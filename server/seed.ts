import type { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import { hashPassword } from './auth.js';
import { notifyUser } from './notifications.js';
import { nowIso, uid } from './utils.js';

export const DEMO_PASSWORD = 'demo1234';

interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'customer';
  phone: string;
  address: string;
  city: string;
}

interface SeedBusiness {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  address: string;
  city: string;
  timezone: string;
  coverImage: string;
  accentColor: string;
  approvalRequired: boolean;
  rating: number;
  reviewCount: number;
  phone: string;
  email: string;
}

function at(days: number, hour: number, minute: number, zone: string, base = DateTime.now()): string {
  return base.setZone(zone).plus({ days }).set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toISO()!;
}

function isOpenOn(db: DatabaseSync, businessId: string, date: string, zone: string): boolean {
  const exception = db
    .prepare('SELECT is_closed FROM availability_exceptions WHERE business_id = ? AND date = ?')
    .get(businessId, date) as { is_closed: number } | undefined;
  if (exception) return !exception.is_closed;
  const weekday = DateTime.fromISO(date, { zone }).weekday % 7;
  const rule = db
    .prepare('SELECT 1 FROM availability_rules WHERE business_id = ? AND weekday = ? AND is_active = 1 LIMIT 1')
    .get(businessId, weekday) as { 1: number } | undefined;
  return Boolean(rule);
}

/** Find the next (or previous) matching weekday when the business is actually open. */
function findWeekday(
  db: DatabaseSync,
  businessId: string,
  zone: string,
  targetWeekday: number,
  direction: 1 | -1 = 1,
  minDays = 1,
): string {
  let cursor = DateTime.now().setZone(zone).plus({ days: direction * minDays }).startOf('day');
  for (let i = 0; i < 60; i++) {
    const date = cursor.toISODate()!;
    if (cursor.weekday % 7 === targetWeekday && isOpenOn(db, businessId, date, zone)) return date;
    cursor = cursor.plus({ days: direction });
  }
  // A regular schedule will always find a date; this is a safe fallback.
  return DateTime.now().setZone(zone).plus({ days: minDays }).toISODate()!;
}

function findAnyOpenDate(db: DatabaseSync, businessId: string, zone: string, minDays: number): string {
  let cursor = DateTime.now().setZone(zone).plus({ days: minDays }).startOf('day');
  for (let i = 0; i < 60; i++) {
    const date = cursor.toISODate()!;
    if (isOpenOn(db, businessId, date, zone)) return date;
    cursor = cursor.plus({ days: 1 });
  }
  return DateTime.now().setZone(zone).plus({ days: minDays }).toISODate()!;
}

function timeOnDate(date: string, hour: number, minute: number, zone: string): string {
  return DateTime.fromISO(date, { zone }).set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toISO()!;
}

function nextWeekdayTime(
  db: DatabaseSync,
  businessId: string,
  zone: string,
  weekday: number,
  hour: number,
  minute: number,
): string {
  return timeOnDate(findWeekday(db, businessId, zone, weekday), hour, minute, zone);
}

function previousWeekdayTime(
  db: DatabaseSync,
  businessId: string,
  zone: string,
  weekday: number,
  hour: number,
  minute: number,
): string {
  return timeOnDate(findWeekday(db, businessId, zone, weekday, -1), hour, minute, zone);
}

function insertRule(db: DatabaseSync, businessId: string, weekday: number, ranges: [number, number][]) {
  for (const [start, end] of ranges) {
    db.prepare(
      'INSERT INTO availability_rules (id, business_id, weekday, start_minute, end_minute, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    ).run(uid(), businessId, weekday, start, end);
  }
}

function weekly(
  db: DatabaseSync,
  businessId: string,
  days: Record<number, [number, number][]>,
) {
  for (const [weekday, ranges] of Object.entries(days)) {
    insertRule(db, businessId, Number(weekday), ranges);
  }
}

function insertService(
  db: DatabaseSync,
  businessId: string,
  name: string,
  description: string,
  duration: number,
  buffer: number,
  priceCents: number,
  sort: number,
  houseCall = false,
): string {
  const id = uid();
  db.prepare(
    `INSERT INTO services (id, business_id, name, description, duration_minutes, buffer_minutes, price_cents, is_active, house_call, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, businessId, name, description, duration, buffer, priceCents, houseCall ? 1 : 0, sort, nowIso());
  return id;
}

const FULL = (start: number, end: number): [number, number][] => [[start, end]];

export function isSeeded(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  return row.count > 0;
}

export function resetDatabase(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const table of [
    'messages',
    'conversations',
    'email_outbox',
    'notifications',
    'service_watchlist',
    'favorites',
    'bookings',
    'availability_exceptions',
    'availability_rules',
    'services',
    'sessions',
    'businesses',
    'users',
  ]) {
    db.exec(`DELETE FROM ${table};`);
  }
  db.exec('PRAGMA foreign_keys = ON;');
}

export async function seedDatabase(db: DatabaseSync): Promise<void> {
  if (isSeeded(db)) return;

  const passwordHash = hashPassword(DEMO_PASSWORD);

  const users: SeedUser[] = [
    { id: uid(), name: 'Kagiso Mothibi', email: 'kagiso@tempo.demo', role: 'owner', phone: '+267 71 234 567', address: 'Plot 123, Main Mall', city: 'Gaborone' },
    { id: uid(), name: 'Naledi Kgosi', email: 'naledi.kgosi@tempo.demo', role: 'owner', phone: '+267 72 880 145', address: 'Plot 45, Phakalane', city: 'Gaborone' },
    { id: uid(), name: 'Lesego Moyo', email: 'lesego@tempo.demo', role: 'owner', phone: '+267 76 330 902', address: 'Plot 8, Gerald Estate', city: 'Francistown' },
    { id: uid(), name: 'Thabo Molefe', email: 'thabo@tempo.demo', role: 'owner', phone: '+267 74 512 778', address: 'Plot 102, Sir Seretse Khama Road', city: 'Maun' },
    { id: uid(), name: 'Amantle Dube', email: 'amantle@tempo.demo', role: 'owner', phone: '+267 73 611 204', address: 'Plot 77, Extension 12', city: 'Gaborone' },
    { id: uid(), name: 'Warona Sebina', email: 'warona@tempo.demo', role: 'owner', phone: '+267 77 402 819', address: 'Plot 3, Tlokweng Road', city: 'Gaborone' },
    { id: uid(), name: 'Tebogo Motaung', email: 'tebogo@tempo.demo', role: 'customer', phone: '+267 74 555 018', address: 'Plot 2210, Extension 12', city: 'Gaborone' },
    { id: uid(), name: 'Lerato Molefe', email: 'lerato@tempo.demo', role: 'customer', phone: '+267 76 221 440', address: 'Plot 45, Phakalane', city: 'Gaborone' },
    { id: uid(), name: 'Kabelo Dintwa', email: 'kabelo@tempo.demo', role: 'customer', phone: '+267 72 903 114', address: 'Plot 8, Riverside', city: 'Maun' },
    { id: uid(), name: 'Naledi Phiri', email: 'naledi@tempo.demo', role: 'customer', phone: '+267 77 812 003', address: 'Plot 19, Gerald Estate', city: 'Francistown' },
    { id: uid(), name: 'Boitumelo Kgosi', email: 'boitumelo@tempo.demo', role: 'customer', phone: '+267 73 445 120', address: 'Plot 312, Tlokweng', city: 'Gaborone' },
  ];

  for (const user of users) {
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, email_notifications, in_app_notifications, phone, address, city, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
    ).run(user.id, user.name, user.email, passwordHash, user.role, user.phone, user.address, user.city, nowIso());
  }

  const byEmail = (email: string) => users.find((u) => u.email === email)!;
  const kagiso = byEmail('kagiso@tempo.demo');
  const nalediKgosi = byEmail('naledi.kgosi@tempo.demo');
  const lesego = byEmail('lesego@tempo.demo');
  const thabo = byEmail('thabo@tempo.demo');
  const amantle = byEmail('amantle@tempo.demo');
  const warona = byEmail('warona@tempo.demo');
  const tebogo = byEmail('tebogo@tempo.demo');
  const lerato = byEmail('lerato@tempo.demo');
  const kabelo = byEmail('kabelo@tempo.demo');
  const nalediPhiri = byEmail('naledi@tempo.demo');
  const boitumelo = byEmail('boitumelo@tempo.demo');


  const businesses: SeedBusiness[] = [
    {
      id: uid(),
      ownerId: kagiso.id,
      name: 'Kgotla Barber Co.',
      slug: 'kgotla-barber',
      category: 'Barbering',
      tagline: 'Considered cuts, cold drinks, good conversation.',
      description:
        'A neighbourhood barbershop in the heart of Gaborone. We take our time with every cut, keep the fridge stocked with cold drinks, and make space for the kind of conversation that turns a haircut into the best part of your day. Walk-ins are welcome when there is room, but booking keeps your chair.',
      address: 'Plot 123, Main Mall',
      city: 'Gaborone',
      timezone: 'Africa/Gaborone',
      coverImage: '/images/barber.jpg',
      accentColor: '#a96335',
      approvalRequired: true,
      rating: 4.9,
      reviewCount: 128,
      phone: '+267 71 234 567',
      email: 'hello@kgotlabarber.co.bw',
    },
    {
      id: uid(),
      ownerId: nalediKgosi.id,
      name: 'Mopane Bodywork',
      slug: 'mopane-bodywork',
      category: 'Wellness',
      tagline: 'Slow, skilled bodywork — in studio or at home.',
      description:
        'A quiet studio for therapeutic massage and restorative care in Gaborone. Every session begins with a conversation and ends with a glass of water, a warm eye pillow, and absolutely no rush. We offer studio appointments and house calls across greater Gaborone, bringing the table, oils, and calm to you.',
      address: 'Plot 45, Phakalane',
      city: 'Gaborone',
      timezone: 'Africa/Gaborone',
      coverImage: '/images/spa.jpg',
      accentColor: '#64775d',
      approvalRequired: false,
      rating: 4.8,
      reviewCount: 92,
      phone: '+267 72 880 145',
      email: 'care@mopanebodywork.co.bw',
    },
    {
      id: uid(),
      ownerId: lesego.id,
      name: 'Sethunya Nail Studio',
      slug: 'sethunya-nails',
      category: 'Nails',
      tagline: 'Quietly excellent nails, every time.',
      description:
        'A nail studio for people who like their appointments calm and their polish precise. We use gentle, breathable products, take sterilisation seriously, and never rush a set. Come alone or bring a friend — the rooibos tea is always on.',
      address: 'Plot 8, Gerald Estate',
      city: 'Francistown',
      timezone: 'Africa/Gaborone',
      coverImage: '/images/nails.jpg',
      accentColor: '#b97a63',
      approvalRequired: false,
      rating: 4.9,
      reviewCount: 76,
      phone: '+267 76 330 902',
      email: 'hello@sethunyanails.co.bw',
    },
    {
      id: uid(),
      ownerId: thabo.id,
      name: 'Molefe Strength Lab',
      slug: 'molefe-strength',
      category: 'Fitness',
      tagline: 'Strength coaching that fits real life.',
      description:
        'One-on-one strength and movement coaching for everyday athletes in Maun and around the delta. Whether you are rebuilding after an injury, training for a first race, or simply want to feel sturdier, we build the programme around your week — not the other way around. Home and outdoor sessions available.',
      address: 'Plot 102, Sir Seretse Khama Road',
      city: 'Maun',
      timezone: 'Africa/Gaborone',
      coverImage: '/images/training.jpg',
      accentColor: '#4f6a52',
      approvalRequired: false,
      rating: 4.9,
      reviewCount: 61,
      phone: '+267 74 512 778',
      email: 'coach@molefestrength.co.bw',
    },
    {
      id: uid(),
      ownerId: amantle.id,
      name: 'Nala Hair Atelier',
      slug: 'nala-hair',
      category: 'Hair',
      tagline: 'Hair with a point of view.',
      description:
        'A small atelier for cut, colour, braids, and the kind of finish that survives a Gaborone afternoon. We work with natural texture, prioritise hair health, and keep appointments long enough to do things properly.',
      address: 'Plot 77, Extension 12',
      city: 'Gaborone',
      timezone: 'Africa/Gaborone',
      coverImage: '/images/hair.jpg',
      accentColor: '#8a5f3f',
      approvalRequired: true,
      rating: 4.8,
      reviewCount: 154,
      phone: '+267 73 611 204',
      email: 'studio@nalahair.co.bw',
    },
    {
      id: uid(),
      ownerId: warona.id,
      name: 'Hearth Yoga',
      slug: 'hearth-yoga',
      category: 'Wellness',
      tagline: 'A softer place to land.',
      description:
        'Private and small-group yoga in a warm, plant-filled studio in Gaborone. Our sessions are slow by design: breath first, movement second, always at the pace your body is asking for. Beginners are genuinely welcome, and private sessions can come to your home.',
      address: 'Plot 3, Tlokweng Road',
      city: 'Gaborone',
      timezone: 'Africa/Gaborone',
      coverImage: '/images/yoga.jpg',
      accentColor: '#a9774c',
      approvalRequired: false,
      rating: 4.9,
      reviewCount: 48,
      phone: '+267 77 402 819',
      email: 'hello@hearthyoga.co.bw',
    },
  ];


  for (const b of businesses) {
    db.prepare(
      `INSERT INTO businesses
        (id, owner_id, name, slug, category, tagline, description, address, city, country, phone, email, timezone,
         cover_image, accent_color, approval_required, rating, review_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Botswana', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      b.id,
      b.ownerId,
      b.name,
      b.slug,
      b.category,
      b.tagline,
      b.description,
      b.address,
      b.city,
      b.phone,
      b.email,
      b.timezone,
      b.coverImage,
      b.accentColor,
      b.approvalRequired ? 1 : 0,
      b.rating,
      b.reviewCount,
      nowIso(),
    );
  }

  const biz = (slug: string) => businesses.find((b) => b.slug === slug)!;
  const kgotla = biz('kgotla-barber');
  const mopane = biz('mopane-bodywork');
  const sethunya = biz('sethunya-nails');
  const molefeStrength = biz('molefe-strength');
  const nalaHair = biz('nala-hair');
  const hearth = biz('hearth-yoga');

  // Availability: weekday 0 = Sunday.
  weekly(db, kgotla.id, {
    2: [
      [9 * 60, 13 * 60],
      [14 * 60, 18 * 60],
    ],
    3: [
      [9 * 60, 13 * 60],
      [14 * 60, 18 * 60],
    ],
    4: [
      [9 * 60, 13 * 60],
      [14 * 60, 18 * 60],
    ],
    5: [
      [9 * 60, 13 * 60],
      [14 * 60, 18 * 60],
    ],
    6: FULL(9 * 60, 16 * 60),
  });
  weekly(db, mopane.id, {
    1: FULL(10 * 60, 19 * 60),
    2: FULL(10 * 60, 19 * 60),
    3: FULL(10 * 60, 19 * 60),
    4: FULL(10 * 60, 19 * 60),
    5: FULL(10 * 60, 19 * 60),
    6: FULL(10 * 60, 14 * 60),
  });
  weekly(db, sethunya.id, {
    2: FULL(10 * 60, 18 * 60),
    3: FULL(10 * 60, 18 * 60),
    4: FULL(10 * 60, 18 * 60),
    5: FULL(10 * 60, 18 * 60),
    6: FULL(10 * 60, 17 * 60),
  });
  weekly(db, molefeStrength.id, {
    1: [
      [6 * 60, 11 * 60],
      [16 * 60, 20 * 60],
    ],
    2: [
      [6 * 60, 11 * 60],
      [16 * 60, 20 * 60],
    ],
    3: [
      [6 * 60, 11 * 60],
      [16 * 60, 20 * 60],
    ],
    4: [
      [6 * 60, 11 * 60],
      [16 * 60, 20 * 60],
    ],
    5: [
      [6 * 60, 11 * 60],
      [16 * 60, 20 * 60],
    ],
    6: FULL(8 * 60, 12 * 60),
  });
  weekly(db, nalaHair.id, {
    3: FULL(10 * 60, 19 * 60),
    4: FULL(10 * 60, 19 * 60),
    5: FULL(10 * 60, 19 * 60),
    6: FULL(10 * 60, 19 * 60),
    0: FULL(11 * 60, 17 * 60),
  });
  weekly(db, hearth.id, {
    1: [
      [7 * 60, 12 * 60],
      [16 * 60, 19 * 60],
    ],
    2: [
      [7 * 60, 12 * 60],
      [16 * 60, 19 * 60],
    ],
    3: [
      [7 * 60, 12 * 60],
      [16 * 60, 19 * 60],
    ],
    4: [
      [7 * 60, 12 * 60],
      [16 * 60, 19 * 60],
    ],
    6: FULL(8 * 60, 12 * 60),
  });

  // Date-specific exceptions, chosen on days that would otherwise be open.
  const closedDate = findAnyOpenDate(db, kgotla.id, kgotla.timezone, 12);
  db.prepare(
    `INSERT INTO availability_exceptions (id, business_id, date, is_closed, start_minute, end_minute, note, created_at)
     VALUES (?, ?, ?, 1, NULL, NULL, ?, ?)`,
  ).run(uid(), kgotla.id, closedDate, 'Studio closed for a team workshop', nowIso());
  const shortDate = findWeekday(db, kgotla.id, kgotla.timezone, 6, 1, 14);
  db.prepare(
    `INSERT INTO availability_exceptions (id, business_id, date, is_closed, start_minute, end_minute, note, created_at)
     VALUES (?, ?, ?, 0, 600, 840, 'Short Saturday — closing early', ?)`,
  ).run(uid(), kgotla.id, shortDate, nowIso());
  const stillClosed = findAnyOpenDate(db, mopane.id, mopane.timezone, 10);
  db.prepare(
    `INSERT INTO availability_exceptions (id, business_id, date, is_closed, start_minute, end_minute, note, created_at)
     VALUES (?, ?, ?, 1, NULL, NULL, 'Naledi is away — back next week', ?)`,
  ).run(uid(), mopane.id, stillClosed, nowIso());

  const signatureCut = insertService(
    db,
    kgotla.id,
    'Signature Cut',
    'A proper consultation, precision cut, hot towel finish, and styling. Our most popular appointment.',
    45,
    10,
    18000,
    1,
  );
  const skinFade = insertService(
    db,
    kgotla.id,
    'Skin Fade',
    'A clean, close fade with detailed line work, finished with a light styling product.',
    45,
    10,
    15000,
    2,
  );
  const beardTrim = insertService(
    db,
    kgotla.id,
    'Beard Trim & Shape',
    'Shape, tidy, and condition. A quick reset for a beard that deserves better.',
    30,
    5,
    9000,
    3,
  );
  const cutBeard = insertService(
    db,
    kgotla.id,
    'Cut & Beard',
    'The full reset: signature cut plus a detailed beard shape. Allow a little extra time.',
    60,
    15,
    25000,
    4,
  );
  insertService(
    db,
    kgotla.id,
    'Hot Towel Shave',
    'Traditional straight-razor shave with warm towels, pre-shave oil, and a calm, quiet room.',
    40,
    10,
    13000,
    5,
  );
  const homeVisit = insertService(
    db,
    kgotla.id,
    'Home Barber Visit',
    'The full barbering ritual at your home — ideal for young children, elders, or a busy week. We bring the cape, clippers, and clean-up.',
    45,
    15,
    22000,
    6,
    true,
  );

  const deepTissue = insertService(
    db,
    mopane.id,
    'Deep Tissue Massage',
    'Focused, therapeutic bodywork for stubborn tension. Pressure tailored to you.',
    60,
    15,
    55000,
    1,
    true,
  );
  insertService(
    db,
    mopane.id,
    'Restorative Facial',
    'A slow facial with lymphatic massage, botanicals, and a very good nap-like finish.',
    75,
    15,
    65000,
    2,
    true,
  );
  const headNeck = insertService(
    db,
    mopane.id,
    'Head & Neck Reset',
    'Thirty focused minutes for screen-weary necks, shoulders, and jaws.',
    30,
    10,
    28000,
    3,
    true,
  );

  const gelManicure = insertService(
    db,
    sethunya.id,
    'Gel Manicure',
    'Shape, cuticle care, and a long-wearing gel polish in the color of your choosing.',
    45,
    10,
    22000,
    1,
  );
  insertService(
    db,
    sethunya.id,
    'Structured Pedicure',
    'A thorough, gentle pedicure with structured gel for extra durability.',
    60,
    15,
    30000,
    2,
  );
  insertService(
    db,
    sethunya.id,
    'Art Add-On Set',
    'A full set with hand-painted nail art. Bring a reference or let us dream something up.',
    75,
    15,
    38000,
    3,
  );

  const strengthSession = insertService(
    db,
    molefeStrength.id,
    'Strength Session',
    'One-on-one coaching with a program built around your goals and your actual schedule.',
    60,
    10,
    35000,
    1,
    true,
  );
  insertService(
    db,
    molefeStrength.id,
    'Mobility & Recovery',
    'Guided mobility, breathwork, and soft-tissue work to keep you moving well.',
    45,
    10,
    25000,
    2,
    true,
  );
  insertService(
    db,
    molefeStrength.id,
    'Run Form Lab',
    'Video gait analysis plus a practical plan to run more efficiently and stay injury-free.',
    75,
    15,
    50000,
    3,
  );

  const precisionCut = insertService(
    db,
    nalaHair.id,
    'Precision Cut',
    'A considered cut built around your hair texture, routine, and the shape you actually want.',
    60,
    15,
    40000,
    1,
  );
  const glossBlowout = insertService(
    db,
    nalaHair.id,
    'Gloss & Blowout',
    'Shine-boosting gloss plus a smooth, long-lasting blowout.',
    75,
    15,
    55000,
    2,
  );
  insertService(
    db,
    nalaHair.id,
    'Bridal Trial',
    'A full trial run for your wedding hair, including mood-board review and photos from every angle.',
    90,
    20,
    85000,
    3,
  );

  const slowFlow = insertService(
    db,
    hearth.id,
    'Private Slow Flow',
    'A one-to-one slow yoga session shaped around your body and energy that day.',
    60,
    15,
    30000,
    1,
    true,
  );
  insertService(
    db,
    hearth.id,
    'Breathwork Session',
    'Guided breathwork for nervous-system reset and better sleep. No experience needed.',
    45,
    10,
    25000,
    2,
    true,
  );
  insertService(
    db,
    hearth.id,
    'Restorative Duo',
    'Bring a friend or partner for ninety minutes of supported, deeply restful yoga.',
    90,
    15,
    52000,
    3,
  );

  const bookingRows: {
    business: SeedBusiness;
    serviceId: string;
    serviceName: string;
    customer: SeedUser;
    start: string;
    duration: number;
    price: number;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    notes?: string;
    reason?: string;
    locationType?: 'business' | 'house_call';
    serviceAddress?: string;
    serviceCity?: string;
    contactPhone?: string;
  }[] = [
    {
      business: kgotla,
      serviceId: signatureCut,
      serviceName: 'Signature Cut',
      customer: tebogo,
      start: nextWeekdayTime(db, kgotla.id, kgotla.timezone, 4, 10, 0), // Thursday
      duration: 45,
      price: 18000,
      status: 'confirmed',
      notes: 'I like the sides short, but keep some length on top.',
    },
    {
      business: kgotla,
      serviceId: skinFade,
      serviceName: 'Skin Fade',
      customer: lerato,
      start: nextWeekdayTime(db, kgotla.id, kgotla.timezone, 4, 11, 0), // Thursday
      duration: 45,
      price: 15000,
      status: 'confirmed',
    },
    {
      business: kgotla,
      serviceId: beardTrim,
      serviceName: 'Beard Trim & Shape',
      customer: kabelo,
      start: nextWeekdayTime(db, kgotla.id, kgotla.timezone, 5, 10, 0), // Friday
      duration: 30,
      price: 9000,
      status: 'pending',
      notes: 'First time visiting — beard is getting a little wild.',
    },
    {
      business: kgotla,
      serviceId: cutBeard,
      serviceName: 'Cut & Beard',
      customer: nalediPhiri,
      start: nextWeekdayTime(db, kgotla.id, kgotla.timezone, 6, 16, 0), // Saturday
      duration: 60,
      price: 25000,
      status: 'confirmed',
    },
    {
      business: kgotla,
      serviceId: signatureCut,
      serviceName: 'Signature Cut',
      customer: boitumelo,
      start: nextWeekdayTime(db, kgotla.id, kgotla.timezone, 2, 11, 0), // next Tuesday
      duration: 45,
      price: 18000,
      status: 'pending',
    },
    {
      business: kgotla,
      serviceId: signatureCut,
      serviceName: 'Signature Cut',
      customer: lerato,
      start: previousWeekdayTime(db, kgotla.id, kgotla.timezone, 4, 14, 0),
      duration: 45,
      price: 18000,
      status: 'completed',
    },
    {
      business: kgotla,
      serviceId: beardTrim,
      serviceName: 'Beard Trim & Shape',
      customer: tebogo,
      start: previousWeekdayTime(db, kgotla.id, kgotla.timezone, 3, 11, 0),
      duration: 30,
      price: 9000,
      status: 'completed',
    },
    {
      business: kgotla,
      serviceId: skinFade,
      serviceName: 'Skin Fade',
      customer: kabelo,
      start: previousWeekdayTime(db, kgotla.id, kgotla.timezone, 5, 15, 0),
      duration: 45,
      price: 15000,
      status: 'cancelled',
      reason: 'Something came up at work.',
    },
    {
      business: mopane,
      serviceId: deepTissue,
      serviceName: 'Deep Tissue Massage',
      customer: tebogo,
      start: nextWeekdayTime(db, mopane.id, mopane.timezone, 1, 13, 0), // Monday
      duration: 60,
      price: 55000,
      status: 'confirmed',
      notes: 'Shoulders and lower back, please. Medium-firm pressure.',
      locationType: 'house_call',
      serviceAddress: tebogo.address,
      serviceCity: tebogo.city,
      contactPhone: tebogo.phone,
    },
    {
      business: mopane,
      serviceId: headNeck,
      serviceName: 'Head & Neck Reset',
      customer: nalediPhiri,
      start: nextWeekdayTime(db, mopane.id, mopane.timezone, 2, 15, 0), // Tuesday
      duration: 30,
      price: 28000,
      status: 'confirmed',
    },
    {
      business: sethunya,
      serviceId: gelManicure,
      serviceName: 'Gel Manicure',
      customer: lerato,
      start: nextWeekdayTime(db, sethunya.id, sethunya.timezone, 3, 11, 0), // Wednesday
      duration: 45,
      price: 22000,
      status: 'confirmed',
    },
    {
      business: sethunya,
      serviceId: gelManicure,
      serviceName: 'Gel Manicure',
      customer: tebogo,
      start: previousWeekdayTime(db, sethunya.id, sethunya.timezone, 4, 10, 30),
      duration: 45,
      price: 22000,
      status: 'completed',
    },
    {
      business: nalaHair,
      serviceId: precisionCut,
      serviceName: 'Precision Cut',
      customer: tebogo,
      start: nextWeekdayTime(db, nalaHair.id, nalaHair.timezone, 5, 14, 0), // Friday
      duration: 60,
      price: 40000,
      status: 'confirmed',
    },
    {
      business: nalaHair,
      serviceId: glossBlowout,
      serviceName: 'Gloss & Blowout',
      customer: boitumelo,
      start: nextWeekdayTime(db, nalaHair.id, nalaHair.timezone, 4, 11, 0), // Thursday
      duration: 75,
      price: 55000,
      status: 'confirmed',
    },
    {
      business: hearth,
      serviceId: slowFlow,
      serviceName: 'Private Slow Flow',
      customer: tebogo,
      start: nextWeekdayTime(db, hearth.id, hearth.timezone, 3, 17, 0), // Wednesday
      duration: 60,
      price: 30000,
      status: 'confirmed',
    },
    {
      business: kgotla,
      serviceId: homeVisit,
      serviceName: 'Home Barber Visit',
      customer: boitumelo,
      start: nextWeekdayTime(db, kgotla.id, kgotla.timezone, 3, 15, 0), // Wednesday
      duration: 45,
      price: 22000,
      status: 'confirmed',
      notes: 'My son is six — a home visit will make it much easier.',
      locationType: 'house_call',
      serviceAddress: boitumelo.address,
      serviceCity: boitumelo.city,
      contactPhone: boitumelo.phone,
    },
    {
      business: molefeStrength,
      serviceId: strengthSession,
      serviceName: 'Strength Session',
      customer: boitumelo,
      start: nextWeekdayTime(db, molefeStrength.id, molefeStrength.timezone, 4, 17, 0), // Thursday
      duration: 60,
      price: 35000,
      status: 'confirmed',
      notes: 'Training in my yard — I have dumbbells and a mat.',
      locationType: 'house_call',
      serviceAddress: boitumelo.address,
      serviceCity: boitumelo.city,
      contactPhone: boitumelo.phone,
    },
  ];

  for (const b of bookingRows) {
    const services = db.prepare('SELECT buffer_minutes FROM services WHERE id = ?').get(b.serviceId) as {
      buffer_minutes: number;
    };
    const endsAt = DateTime.fromISO(b.start, { zone: 'utc' })
      .plus({ minutes: b.duration })
      .toUTC()
      .toISO()!;
    db.prepare(
      `INSERT INTO bookings
        (id, business_id, service_id, customer_id, starts_at, ends_at, status, notes, price_cents,
         location_type, service_address, service_city, contact_phone,
         cancellation_reason, reminder_sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      uid(),
      b.business.id,
      b.serviceId,
      b.customer.id,
      b.start,
      endsAt,
      b.status,
      b.notes || '',
      b.price,
      b.locationType || 'business',
      b.serviceAddress || '',
      b.serviceCity || '',
      b.contactPhone || b.customer.phone,
      b.reason || '',
      nowIso(),
      nowIso(),
    );
    void services;
  }

  // Favorites and service watchlists.
  const favoritePairs: [SeedUser, SeedBusiness][] = [
    [tebogo, kgotla],
    [tebogo, mopane],
    [tebogo, nalaHair],
    [tebogo, hearth],
    [lerato, kgotla],
    [lerato, sethunya],
    [kabelo, kgotla],
    [kabelo, nalaHair],
    [nalediPhiri, mopane],
    [boitumelo, mopane],
  ];
  for (const [user, business] of favoritePairs) {
    db.prepare('INSERT INTO favorites (id, user_id, business_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid(),
      user.id,
      business.id,
      nowIso(),
    );
  }
  for (const [user, serviceId] of [
    [tebogo, beardTrim],
    [tebogo, headNeck],
    [lerato, gelManicure],
  ] as [SeedUser, string][]) {
    db.prepare('INSERT INTO service_watchlist (id, user_id, service_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid(),
      user.id,
      serviceId,
      nowIso(),
    );
  }

  // Seed a few realistic in-app + email messages.
  const tebogoNorthBooking = db
    .prepare(
      `SELECT bk.*, b.name AS business_name, b.timezone, s.name AS service_name
       FROM bookings bk JOIN businesses b ON b.id = bk.business_id JOIN services s ON s.id = bk.service_id
       WHERE bk.customer_id = ? AND bk.business_id = ? AND bk.status = 'confirmed' AND bk.starts_at > ?
       ORDER BY bk.starts_at ASC LIMIT 1`,
    )
    .get(tebogo.id, kgotla.id, nowIso()) as
    | { id: string; starts_at: string; business_name: string; timezone: string; service_name: string }
    | undefined;

  if (tebogoNorthBooking) {
    await notifyUser(db, {
      userId: tebogo.id,
      type: 'booking_confirmed',
      title: `You're booked at ${tebogoNorthBooking.business_name}`,
      body: `${tebogoNorthBooking.service_name} is confirmed for ${DateTime.fromISO(tebogoNorthBooking.starts_at, { zone: 'utc' }).setZone(tebogoNorthBooking.timezone).toFormat('cccc, LLL d · h:mm a')}.`,
      actionUrl: '/account/bookings',
      businessId: kgotla.id,
      bookingId: tebogoNorthBooking.id,
      email: {
        subject: `Confirmed: ${tebogoNorthBooking.service_name} at ${tebogoNorthBooking.business_name}`,
        kind: 'booking_confirmed',
        kicker: 'You are confirmed',
        heading: "You're on the books.",
        intro: `We're looking forward to seeing you at ${tebogoNorthBooking.business_name}. Here are the details for your calendar.`,
        details: [
          { label: 'Service', value: tebogoNorthBooking.service_name },
          {
            label: 'When',
            value: DateTime.fromISO(tebogoNorthBooking.starts_at, { zone: 'utc' })
              .setZone(tebogoNorthBooking.timezone)
              .toFormat('ccc, LLL d · h:mm a'),
          },
          { label: 'Business', value: tebogoNorthBooking.business_name },
        ],
        ctaLabel: 'View appointment',
      },
    });
  }

  await notifyUser(db, {
    userId: tebogo.id,
    type: 'slot_opened',
    title: 'A new time opened at Sethunya Nail Studio',
    body: 'A Saturday morning gel manicure just came available. Favorites get first look.',
    actionUrl: '/b/sethunya-nails',
    businessId: sethunya.id,
    email: {
      subject: 'An opening just appeared at Sethunya Nail Studio',
      kind: 'slot_opened',
      kicker: 'A favorite has availability',
      heading: 'A little room opened up.',
      intro: 'A Saturday morning cancellation at Sethunya Nail Studio means a gel manicure opening just appeared.',
      details: [
        { label: 'Business', value: 'Sethunya Nail Studio' },
        { label: 'Open times', value: 'Saturday · 10:00 AM' },
        { label: 'Service', value: 'Gel Manicure' },
      ],
      ctaLabel: 'Book this opening',
    },
  });

  const kabeloRequest = db
    .prepare(
      `SELECT bk.starts_at FROM bookings bk
       WHERE bk.customer_id = ? AND bk.business_id = ? AND bk.status = 'pending'
       ORDER BY bk.starts_at ASC LIMIT 1`,
    )
    .get(kabelo.id, kgotla.id) as { starts_at: string } | undefined;

  await notifyUser(db, {
    userId: kagiso.id,
    type: 'booking_request',
    title: 'New booking request',
    body: 'Kabelo Dintwa requested a Beard Trim & Shape. Your approval is needed.',
    actionUrl: '/owner/bookings',
    businessId: kgotla.id,
    email: {
      subject: 'New request: Kabelo Dintwa · Beard Trim & Shape',
      kind: 'owner_new_booking',
      kicker: 'Needs your approval',
      heading: 'A booking needs your nod.',
      intro: 'Kabelo Dintwa has requested a Beard Trim & Shape. Review the request when you have a moment.',
      details: [
        { label: 'Customer', value: 'Kabelo Dintwa' },
        { label: 'Service', value: 'Beard Trim & Shape' },
        {
          label: 'Requested',
          value: kabeloRequest
            ? DateTime.fromISO(kabeloRequest.starts_at, { zone: 'utc' })
                .setZone(kgotla.timezone)
                .toFormat('ccc, LLL d · h:mm a')
            : 'See dashboard',
        },
      ],
      ctaLabel: 'Review request',
    },
  });

  await notifyUser(db, {
    userId: tebogo.id,
    type: 'welcome',
    title: 'Welcome to Tempo',
    body: 'Your favorites, bookings, and little windows of me-time all live here now.',
    actionUrl: '/account',
    email: {
      subject: 'Welcome to Tempo',
      kind: 'welcome',
      kicker: 'Welcome in',
      heading: 'Good to have you here.',
      intro: 'Tempo keeps your appointments, favorite places, and open-slot alerts in one calm place.',
      ctaLabel: 'Explore Tempo',
    },
  });

  // Seed real conversations so messaging feels alive on first visit.
  type SeedMessage = { sender: SeedUser; body: string; minutesAgo: number; unread?: boolean };
  const seedConversation = (business: SeedBusiness, customer: SeedUser, messages: SeedMessage[]): string => {
    const conversationId = uid();
    const stamps = messages.map((message) => DateTime.now().minus({ minutes: message.minutesAgo }).toUTC().toISO()!);
    const first = stamps.reduce((earliest, stamp) => (stamp < earliest ? stamp : earliest));
    const last = stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest));
    db.prepare(
      'INSERT INTO conversations (id, business_id, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(conversationId, business.id, customer.id, first, last);
    messages.forEach((message, index) => {
      db.prepare(
        'INSERT INTO messages (id, conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(uid(), conversationId, message.sender.id, message.body, stamps[index], message.unread ? null : stamps[index]);
    });
    return conversationId;
  };

  seedConversation(kgotla, tebogo, [
    {
      sender: tebogo,
      body: 'Dumela Kagiso! I’m looking forward to my cut on Thursday. Is the 10:00 still good?',
      minutesAgo: 2880,
    },
    {
      sender: kagiso,
      body: 'Dumela Tebogo! Yes, 10:00 is yours. The coffee will be ready. ☕',
      minutesAgo: 2790,
    },
    {
      sender: tebogo,
      body: 'Sharp. I’m bringing a photo of the shape I’m after — see you then.',
      minutesAgo: 55,
      unread: true,
    },
  ]);

  seedConversation(kgotla, lerato, [
    {
      sender: lerato,
      body: 'Hi Kagiso, can I bring my son for a skin fade after my appointment on Saturday?',
      minutesAgo: 190,
      unread: true,
    },
  ]);

  seedConversation(mopane, tebogo, [
    {
      sender: tebogo,
      body: 'Dumela Naledi, I booked a home massage for Monday. Do you bring everything with you?',
      minutesAgo: 1560,
    },
    {
      sender: nalediKgosi,
      body: 'Dumela Tebogo! Always — table, towels, oils and a calm playlist. I’ll see you at your place at 13:00.',
      minutesAgo: 28,
      unread: true,
    },
  ]);

  // Give the demo inbox a little history instead of showing every message as "Just now".
  const stagger: { user: SeedUser; type: string; kind: string; offset: Record<string, number> }[] = [
    { user: tebogo, type: 'welcome', kind: 'welcome', offset: { days: 4 } },
    { user: tebogo, type: 'booking_confirmed', kind: 'booking_confirmed', offset: { hours: 29 } },
    { user: tebogo, type: 'slot_opened', kind: 'slot_opened', offset: { hours: 5 } },
    { user: kagiso, type: 'booking_request', kind: 'owner_new_booking', offset: { hours: 2 } },
  ];
  for (const item of stagger) {
    const stamp = DateTime.now().minus(item.offset).toUTC().toISO()!;
    db.prepare('UPDATE notifications SET created_at = ? WHERE user_id = ? AND type = ?').run(
      stamp,
      item.user.id,
      item.type,
    );
    db.prepare('UPDATE email_outbox SET created_at = ? WHERE user_id = ? AND kind = ?').run(
      stamp,
      item.user.id,
      item.kind,
    );
  }

  // Keep the service watch list and pricing data consistent with the UI.
  void deepTissue;
  void glossBlowout;
  void precisionCut;
  void skinFade;
  void slowFlow;
}
