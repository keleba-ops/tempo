import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import type { BusinessSummary, FavoriteBusiness } from '../../shared/types.js';
import { requireCustomer } from '../auth.js';
import { getParam } from '../http.js';
import {
  buildBusinessDetail,
  getBusinessRowById,
  getBusinessRowBySlug,
  getServices,
  listBusinessRows,
  mapBusinessSummary,
} from '../serializers.js';
import { findNextAvailable, getSlotDays, getSlots } from '../slots.js';
import { ApiError, nowIso, uid } from '../utils.js';

export function publicRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get('/businesses', (req, res) => {
    const q = getParam(req.query.q as string | string[] | undefined).trim().toLowerCase();
    const category = getParam(req.query.category as string | string[] | undefined).trim().toLowerCase();

    let rows = listBusinessRows(db, req.user?.id || null);
    if (q) {
      const serviceRows = db
        .prepare('SELECT business_id, name FROM services WHERE is_active = 1')
        .all() as unknown as { business_id: string; name: string }[];
      const servicesByBusiness = new Map<string, string[]>();
      for (const service of serviceRows) {
        const list = servicesByBusiness.get(service.business_id) || [];
        list.push(service.name);
        servicesByBusiness.set(service.business_id, list);
      }
      rows = rows.filter((b) =>
        [b.name, b.category, b.city, b.tagline, b.description, ...(servicesByBusiness.get(b.id) || [])].some(
          (value) => value.toLowerCase().includes(q),
        ),
      );
    }
    if (category && category !== 'all') {
      rows = rows.filter((b) => b.category.toLowerCase() === category);
    }

    const allRows = listBusinessRows(db, req.user?.id || null);
    const counts = new Map<string, number>();
    for (const b of allRows) counts.set(b.category, (counts.get(b.category) || 0) + 1);
    const categories = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      businesses: rows.map(mapBusinessSummary),
      categories,
      total: rows.length,
    });
  });

  router.get('/businesses/:slug', (req, res) => {
    const row = getBusinessRowBySlug(db, getParam(req.params.slug), req.user?.id || null);
    if (!row) throw new ApiError(404, 'That business could not be found.');
    res.json({ business: buildBusinessDetail(db, row, req.user || null) });
  });

  router.get('/businesses/:slug/slots', (req, res) => {
    const date = getParam(req.query.date as string | string[] | undefined);
    const serviceId = getParam(req.query.serviceId as string | string[] | undefined);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid) {
      throw new ApiError(400, 'Please choose a valid date.');
    }
    if (!serviceId) throw new ApiError(400, 'Please choose a service first.');

    const businessRow = getBusinessRowBySlug(db, getParam(req.params.slug));
    if (!businessRow) throw new ApiError(404, 'That business could not be found.');
    const service = db
      .prepare('SELECT id, name, duration_minutes, buffer_minutes, price_cents, is_active FROM services WHERE id = ? AND business_id = ?')
      .get(serviceId, businessRow.id) as
      | {
          id: string;
          name: string;
          duration_minutes: number;
          buffer_minutes: number;
          price_cents: number;
          is_active: number;
        }
      | undefined;
    if (!service || !service.is_active) throw new ApiError(404, 'That service is not available.');

    const result = getSlots(db, {
      business: businessRow,
      service,
      date,
    });
    res.json({
      date,
      timezone: businessRow.timezone,
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.duration_minutes,
        bufferMinutes: service.buffer_minutes,
        priceCents: service.price_cents,
      },
      slots: result.slots,
      windows: result.windows,
      exception: result.exception,
    });
  });

  router.get('/businesses/:slug/slot-days', (req, res) => {
    const serviceId = getParam(req.query.serviceId as string | string[] | undefined);
    if (!serviceId) throw new ApiError(400, 'Please choose a service first.');
    const businessRow = getBusinessRowBySlug(db, getParam(req.params.slug));
    if (!businessRow) throw new ApiError(404, 'That business could not be found.');
    const service = db
      .prepare('SELECT id, name, duration_minutes, buffer_minutes, price_cents, is_active FROM services WHERE id = ? AND business_id = ?')
      .get(serviceId, businessRow.id) as
      | {
          id: string;
          name: string;
          duration_minutes: number;
          buffer_minutes: number;
          price_cents: number;
          is_active: number;
        }
      | undefined;
    if (!service || !service.is_active) throw new ApiError(404, 'That service is not available.');
    const from = getParam(req.query.from as string | string[] | undefined) || undefined;
    const days = Number(getParam(req.query.days as string | string[] | undefined) || 14);
    res.json({
      timezone: businessRow.timezone,
      days: getSlotDays(db, {
        business: businessRow,
        service,
        from,
        days: Number.isFinite(days) ? days : 14,
      }),
    });
  });

  router.post('/businesses/:id/favorite', requireCustomer, (req, res) => {
    const business = getBusinessRowById(db, getParam(req.params.id));
    if (!business) throw new ApiError(404, 'That business could not be found.');
    const existing = db
      .prepare('SELECT id FROM favorites WHERE user_id = ? AND business_id = ?')
      .get(req.user!.id, business.id) as { id: string } | undefined;
    if (existing) {
      db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
      return res.json({ favorited: false });
    }
    db.prepare('INSERT INTO favorites (id, user_id, business_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid(),
      req.user!.id,
      business.id,
      nowIso(),
    );
    res.json({ favorited: true });
  });

  router.post('/services/:id/watch', requireCustomer, (req, res) => {
    const service = db
      .prepare('SELECT s.id FROM services s WHERE s.id = ? AND s.is_active = 1')
      .get(getParam(req.params.id)) as { id: string } | undefined;
    if (!service) throw new ApiError(404, 'That service could not be found.');
    const existing = db
      .prepare('SELECT id FROM service_watchlist WHERE user_id = ? AND service_id = ?')
      .get(req.user!.id, service.id) as { id: string } | undefined;
    if (existing) {
      db.prepare('DELETE FROM service_watchlist WHERE id = ?').run(existing.id);
      return res.json({ watching: false });
    }
    db.prepare('INSERT INTO service_watchlist (id, user_id, service_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid(),
      req.user!.id,
      service.id,
      nowIso(),
    );
    res.json({ watching: true });
  });

  router.get('/me/favorites', requireCustomer, (req, res) => {
    const businessRows = db
      .prepare(
        `SELECT b.id FROM favorites f JOIN businesses b ON b.id = f.business_id
         WHERE f.user_id = ? ORDER BY f.created_at DESC`,
      )
      .all(req.user!.id) as unknown as { id: string }[];

    const businesses: FavoriteBusiness[] = businessRows.map(({ id }) => {
      const row = getBusinessRowById(db, id, req.user!.id)!;
      const service = getServices(db, row.id)[0];
      const next = findNextAvailable(
        db,
        { id: row.id, name: row.name, slug: row.slug, timezone: row.timezone },
        service
          ? {
              id: service.id,
              name: service.name,
              duration_minutes: service.durationMinutes,
              buffer_minutes: service.bufferMinutes,
              price_cents: service.priceCents,
              is_active: 1,
            }
          : undefined,
      );
      return { ...mapBusinessSummary(row), nextAvailable: next } as FavoriteBusiness;
    });

    const watched = db
      .prepare(
        `SELECT sw.id, sw.service_id, s.name AS service_name, b.name AS business_name, b.slug AS business_slug
         FROM service_watchlist sw
         JOIN services s ON s.id = sw.service_id
         JOIN businesses b ON b.id = s.business_id
         WHERE sw.user_id = ? ORDER BY sw.created_at DESC`,
      )
      .all(req.user!.id) as unknown as {
      id: string;
      service_id: string;
      service_name: string;
      business_name: string;
      business_slug: string;
    }[];

    res.json({
      businesses,
      services: watched.map((w) => ({
        id: w.id,
        serviceId: w.service_id,
        serviceName: w.service_name,
        businessName: w.business_name,
        businessSlug: w.business_slug,
      })),
    });
  });

  return router;
}

export function summarizeBusinessForTest(row: ReturnType<typeof getBusinessRowBySlug>): BusinessSummary | null {
  return row ? mapBusinessSummary(row) : null;
}
