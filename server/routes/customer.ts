import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { requireCustomer } from '../auth.js';
import { cancelBooking, createBooking, rescheduleBooking } from '../booking-service.js';
import { getParam, parseBody } from '../http.js';
import { getCustomerBookings } from '../serializers.js';

const createSchema = z.object({
  serviceId: z.string().min(1, 'Please choose a service.'),
  startsAt: z.string().datetime({ offset: true, message: 'Please choose a valid time.' }),
  notes: z.string().max(800).optional(),
  locationType: z.enum(['business', 'house_call']).optional(),
  serviceAddress: z.string().max(300).optional(),
  serviceCity: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
});

const rescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true, message: 'Please choose a valid time.' }),
});

const cancelSchema = z.object({
  reason: z.string().max(300).optional(),
});

export function customerRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get('/me/bookings', requireCustomer, (req, res) => {
    const scopeParam = getParam(req.query.scope as string | string[] | undefined);
    const scope = scopeParam === 'upcoming' || scopeParam === 'past' ? scopeParam : 'all';
    res.json({ bookings: getCustomerBookings(db, req.user!.id, scope) });
  });

  router.post('/bookings', requireCustomer, async (req, res) => {
    const input = parseBody(createSchema, req.body);
    const booking = await createBooking(db, req.user!, input);
    res.status(201).json({ booking });
  });

  router.patch('/bookings/:id/reschedule', requireCustomer, async (req, res) => {
    const input = parseBody(rescheduleSchema, req.body);
    const booking = await rescheduleBooking(db, req.user!, getParam(req.params.id), input.startsAt, false);
    res.json({ booking });
  });

  router.patch('/bookings/:id/cancel', requireCustomer, async (req, res) => {
    const input = parseBody(cancelSchema, req.body || {});
    await cancelBooking(db, req.user!, getParam(req.params.id), input.reason || '', false);
    res.json({ ok: true });
  });

  return router;
}
