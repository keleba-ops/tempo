import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  CalendarCheck,
  CalendarClock,
  Check,
  Clock3,
  Home,
  Mail,
  MessageCircle,
  MapPin,
  Phone,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';
import type { Booking, Slot, SlotDay } from '../../shared/types';
import { get, patch, post } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatDate, formatDateTime, formatTime, money } from '../lib/format';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import { Spinner } from './Loading';
import { DateStrip } from './DateStrip';
import { SlotPicker } from './SlotPicker';
import { GoogleMap } from './GoogleMap';

type Mode = 'detail' | 'reschedule' | 'cancel';

export function OwnerBookingModal({
  booking,
  onClose,
  onChanged,
}: {
  booking: Booking | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('detail');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<SlotDay[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    setMode('detail');
    setReason('');
    setSelected(null);
    setSlots([]);
    setSelectedDate('');
  }, [booking?.id]);

  useEffect(() => {
    if (!booking || mode !== 'reschedule') return;
    let cancelled = false;
    setLoadingDays(true);
    get<{ days: SlotDay[] }>(
      `/businesses/${booking.business.slug}/slot-days?serviceId=${booking.service.id}&days=21`,
    )
      .then((data) => {
        if (cancelled) return;
        setDays(data.days);
        const first = data.days.find((day) => day.count > 0);
        setSelectedDate(first?.date || '');
      })
      .catch(() => toast('Could not load availability.', 'error'))
      .finally(() => !cancelled && setLoadingDays(false));
    return () => {
      cancelled = true;
    };
  }, [booking, mode, toast]);

  useEffect(() => {
    if (!booking || mode !== 'reschedule' || !selectedDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSelected(null);
    get<{ slots: Slot[] }>(
      `/businesses/${booking.business.slug}/slots?serviceId=${booking.service.id}&date=${selectedDate}`,
    )
      .then((data) => {
        if (!cancelled) setSlots(data.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [booking, mode, selectedDate]);

  async function messageCustomer() {
    if (!booking) return;
    try {
      const data = await post<{ conversation: { id: string } }>('/conversations', {
        customerId: booking.customer.id,
      });
      if (data.conversation?.id) {
        onClose();
        navigate(`/owner/messages?c=${data.conversation.id}`);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not open a conversation.', 'error');
    }
  }

  async function act(action: 'confirm' | 'complete' | 'cancel' | 'reschedule') {
    if (!booking) return;
    setBusy(true);
    try {
      await patch(`/owner/bookings/${booking.id}`, {
        action,
        ...(action === 'cancel' ? { reason } : {}),
        ...(action === 'reschedule' ? { startsAt: selected } : {}),
      });
      const messages = {
        confirm: 'Booking confirmed — the customer has been notified.',
        complete: 'Appointment marked as completed.',
        cancel: 'Appointment cancelled. The slot is open again and your waitlist has been alerted.',
        reschedule: 'Appointment moved. The customer has the new details.',
      };
      toast(messages[action]);
      onChanged();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That action could not be completed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!booking) return null;
  const tz = booking.business.timezone;
  const active = booking.status === 'pending' || booking.status === 'confirmed';

  return (
    <Modal
      open={Boolean(booking)}
      onClose={onClose}
      eyebrow={
        mode === 'reschedule' ? 'Move appointment' : mode === 'cancel' ? 'Cancel appointment' : 'Appointment details'
      }
      title={
        mode === 'reschedule'
          ? 'Find a new time'
          : mode === 'cancel'
            ? 'Cancel this appointment?'
            : booking.service.name
      }
      size={mode === 'reschedule' ? 'lg' : 'md'}
    >
      {mode === 'detail' && (
        <div className="owner-booking-detail">
          <div className="owner-booking-top">
            <div className="owner-booking-date">
              <span>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(tz).toFormat('LLL')}</span>
              <strong>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(tz).toFormat('d')}</strong>
              <span>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(tz).toFormat('ccc')}</span>
            </div>
            <div className="owner-booking-when">
              <div className="owner-booking-pills">
                <StatusBadge status={booking.status} />
                {booking.locationType === 'house_call' && (
                  <span className="house-call-pill"><Home size={11} /> House call</span>
                )}
              </div>
              <h3>{formatDate(booking.startsAt, tz, 'full')}</h3>
              <p><Clock3 size={14} /> {formatTime(booking.startsAt, tz)} – {formatTime(booking.endsAt, tz)} · {booking.service.durationMinutes} min</p>
            </div>
            <div className="owner-booking-amount">
              <span>Total</span>
              <strong>{money(booking.priceCents)}</strong>
            </div>
          </div>

          <div className="owner-booking-customer">
            <Avatar name={booking.customer.name} size="lg" />
            <div>
              <strong>{booking.customer.name}</strong>
              <span><Mail size={13} /> {booking.customer.email}</span>
            </div>
            <div className="owner-customer-actions">
              <button className="btn btn-sm btn-outline" onClick={messageCustomer}>
                <MessageCircle size={14} /> Message
              </button>
              <a href={`mailto:${booking.customer.email}`} className="btn btn-sm btn-outline">
                <Mail size={14} /> Email
              </a>
            </div>
          </div>

          <div className="owner-booking-facts">
            <div>
              <span><CalendarCheck size={15} /> Service</span>
              <strong>{booking.service.name} · {booking.service.bufferMinutes} min buffer</strong>
            </div>
            <div>
              <span>{booking.locationType === 'house_call' ? <Home size={15} /> : <MapPin size={15} />} Appointment</span>
              <strong>{booking.locationType === 'house_call' ? 'House call' : 'At the studio'}</strong>
            </div>
            <div className="fact-wide">
              <span><MapPin size={15} /> Location</span>
              <strong>
                {booking.locationType === 'house_call'
                  ? `${booking.serviceAddress}, ${booking.serviceCity}`
                  : `${booking.business.address}, ${booking.business.city}`}
              </strong>
            </div>
            <div>
              <span><Phone size={15} /> Customer phone</span>
              <strong>{booking.contactPhone || booking.customer.phone || booking.customer.email}</strong>
            </div>
            <div>
              <span><Clock3 size={15} /> Booked</span>
              <strong>{formatDateTime(booking.createdAt, tz)}</strong>
            </div>
          </div>

          {booking.locationType === 'house_call' && (
            <div className="owner-house-call-map">
              <div className="owner-map-label"><Home size={13} /> House-call location</div>
              <GoogleMap
                query={`${booking.serviceAddress}, ${booking.serviceCity}, Botswana`}
                height={190}
                compact
                label="Directions"
              />
            </div>
          )}

          {booking.notes && (
            <div className="owner-booking-note">
              <span><UserRound size={14} /> Customer note</span>
              <p>{booking.notes}</p>
            </div>
          )}

          {booking.cancellationReason && (
            <div className="owner-booking-note owner-booking-cancel-note">
              <span>Cancellation note</span>
              <p>{booking.cancellationReason}</p>
            </div>
          )}

          {active ? (
            <div className="owner-booking-actions">
              {booking.status === 'pending' && (
                <button className="btn btn-accent" onClick={() => act('confirm')} disabled={busy}>
                  {busy ? <Spinner /> : <><Check size={16} /> Confirm booking</>}
                </button>
              )}
              {booking.status === 'confirmed' && (
                <button className="btn btn-accent" onClick={() => act('complete')} disabled={busy}>
                  {busy ? <Spinner /> : <><Check size={16} /> Mark completed</>}
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setMode('reschedule')} disabled={busy}>
                <RotateCcw size={15} /> Reschedule
              </button>
              <button className="btn btn-ghost-danger" onClick={() => setMode('cancel')} disabled={busy}>
                <X size={15} /> Cancel
              </button>
            </div>
          ) : (
            <div className="owner-booking-closed">
              <p>This appointment is {booking.status}. No further actions are needed.</p>
              <button className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="reschedule-flow owner-reschedule">
          <div className="reschedule-current">
            <div>
              <span>Currently</span>
              <strong>{formatDate(booking.startsAt, tz, 'full')}</strong>
              <em>{formatTime(booking.startsAt, tz)} · {booking.service.name}</em>
            </div>
            <span className="reschedule-arrow">→</span>
            <div>
              <span>New time</span>
              <strong>{selected ? formatDate(selected, tz, 'full') : 'Choose below'}</strong>
              <em>{selected ? formatTime(selected, tz) : '—'}</em>
            </div>
          </div>
          <div className="modal-field">
            <span className="field-label">Pick a day</span>
            <DateStrip days={days} selected={selectedDate} onSelect={setSelectedDate} loading={loadingDays} />
          </div>
          <div className="modal-field">
            <span className="field-label">Available times</span>
            <SlotPicker slots={slots} selected={selected} onSelect={setSelected} loading={loadingSlots} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setMode('detail')}>Back</button>
            <button className="btn btn-accent" onClick={() => act('reschedule')} disabled={!selected || busy}>
              {busy ? <Spinner /> : <><CalendarClock size={16} /> Move appointment</>}
            </button>
          </div>
          <p className="modal-footnote">The customer will be emailed automatically with the new details.</p>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="cancel-flow">
          <div className="cancel-summary">
            <span className="cancel-icon"><X size={21} /></span>
            <div>
              <strong>{booking.service.name} with {booking.customer.name}</strong>
              <span>{formatDate(booking.startsAt, tz, 'full')} · {formatTime(booking.startsAt, tz)}</span>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Reason (sent to the customer)</span>
            <textarea
              className="textarea"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional — let them know why…"
              maxLength={300}
            />
          </label>
          <p className="cancel-note">
            Their time will reopen on your calendar. Anyone who favorited your business or is watching this service
            will be notified that a slot opened.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setMode('detail')}>Back</button>
            <button className="btn btn-danger" onClick={() => act('cancel')} disabled={busy}>
              {busy ? <Spinner /> : 'Cancel appointment'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
