import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Clock3,
  Home,
  Info,
  MapPin,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { Booking, Slot, SlotDay } from '../../../shared/types';
import { get, patch, post } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  formatDate,
  formatTime,
  formatTimeRange,
  money,
  relativeDay,
} from '../../lib/format';
import { PageLoader, Spinner } from '../../components/Loading';
import { announceNotificationsChanged } from '../../lib/events';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { DateStrip } from '../../components/DateStrip';
import { SlotPicker } from '../../components/SlotPicker';
import { asset } from '../../lib/asset';

type Tab = 'upcoming' | 'past';

export function AccountBookings() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  async function load(scope: Tab = tab) {
    setLoading(true);
    try {
      const data = await get<{ bookings: Booking[] }>(`/me/bookings?scope=${scope}`);
      setBookings(data.bookings);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load your appointments.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function messageBusiness(booking: Booking) {
    try {
      const data = await post<{ conversation: { id: string } }>('/conversations', {
        businessId: booking.business.id,
      });
      if (data.conversation?.id) navigate(`/account/messages?c=${data.conversation.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not open a message thread.', 'error');
    }
  }

  return (
    <div className="account-bookings-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your calendar</div>
          <h1>Appointments</h1>
          <p>Everything you have coming up, and all the good hours behind you.</p>
        </div>
        <Link to="/explore" className="btn btn-dark">
          Book something new <ArrowRight size={16} />
        </Link>
      </div>

      <div className="segmented-tabs">
        <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>
          Upcoming
        </button>
        <button className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>
          Past & cancelled
        </button>
      </div>

      {loading ? (
        <PageLoader label="Checking your calendar" />
      ) : bookings.length > 0 ? (
        <div className="booking-list-large">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              past={tab === 'past'}
              onReschedule={() => setRescheduleTarget(booking)}
              onCancel={() => setCancelTarget(booking)}
              onMessage={() => messageBusiness(booking)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={tab === 'upcoming' ? <CalendarDays size={25} /> : <CalendarClock size={25} />}
          title={tab === 'upcoming' ? 'Your calendar has room' : 'No appointments here yet'}
          description={
            tab === 'upcoming'
              ? 'Find a place that feels right and give yourself something to look forward to.'
              : 'Once you have visited a place, your appointments will live here.'
          }
          action={<Link to="/explore" className="btn btn-dark">Explore places</Link>}
        />
      )}

      <div className="booking-policy-card">
        <span className="policy-icon"><Info size={19} /></span>
        <div>
          <strong>Plans change. That's okay.</strong>
          <p>
            You can reschedule or cancel online up to <strong>12 hours</strong> before your appointment. Inside
            that window, please contact the business directly.
          </p>
        </div>
        <Sparkles size={22} className="policy-sparkle" />
      </div>

      <RescheduleModal
        booking={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onDone={() => {
          setRescheduleTarget(null);
          void load(tab);
        }}
      />
      <CancelModal
        booking={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={() => {
          setCancelTarget(null);
          void load(tab);
        }}
      />
    </div>
  );
}

function BookingCard({
  booking,
  past,
  onReschedule,
  onCancel,
  onMessage,
}: {
  booking: Booking;
  past: boolean;
  onReschedule: () => void;
  onCancel: () => void;
  onMessage: () => void;
}) {
  const dt = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(booking.business.timezone);
  const active = booking.status === 'pending' || booking.status === 'confirmed';

  return (
    <article className={`booking-card-large ${past ? 'past' : ''} status-${booking.status}`}>
      <div className="booking-date-tile">
        <span>{dt.toFormat('LLL')}</span>
        <strong>{dt.toFormat('d')}</strong>
        <span>{dt.toFormat('ccc')}</span>
      </div>
      <div className="booking-card-main">
        <div className="booking-card-top">
          <div className="booking-card-title">
            <span className="booking-card-business">
              <img src={asset(booking.business.coverImage)} alt="" />
              {booking.business.name}
            </span>
            <h3>{booking.service.name}</h3>
          </div>
          <div className="booking-status-cluster">
            {booking.locationType === 'house_call' && (
              <span className="house-call-badge"><Home size={11} /> House call</span>
            )}
            <StatusBadge status={booking.status} />
          </div>
        </div>
        <div className="booking-card-meta">
          <span><Clock3 size={14} /> {relativeDay(booking.startsAt, booking.business.timezone)} · {formatTimeRange(booking.startsAt, booking.endsAt, booking.business.timezone)}</span>
          {booking.locationType === 'house_call' ? (
            <span><Home size={14} /> {booking.serviceAddress}, {booking.serviceCity}</span>
          ) : (
            <span><MapPin size={14} /> {booking.business.address}, {booking.business.city}</span>
          )}
          <span><CalendarDays size={14} /> {formatDate(booking.startsAt, booking.business.timezone, 'full')}</span>
        </div>
        {booking.notes && (
          <p className="booking-card-notes"><em>Your note:</em> {booking.notes}</p>
        )}
        {booking.status === 'pending' && (
          <div className="booking-pending-note">
            <Clock3 size={14} /> Waiting for {booking.business.name} to confirm. We'll email you the moment they do.
          </div>
        )}
        {booking.status === 'cancelled' && booking.cancellationReason && (
          <p className="booking-card-notes"><em>Cancellation note:</em> {booking.cancellationReason}</p>
        )}
      </div>
      <div className="booking-card-side">
        <div className="booking-card-price">
          <span>{booking.service.durationMinutes} min</span>
          <strong>{money(booking.priceCents)}</strong>
        </div>
        {active ? (
          <div className="booking-card-actions">
            <button className="btn btn-sm btn-ghost booking-message-btn" onClick={onMessage} title="Message the business">
              <MessageCircle size={14} /> Message
            </button>
            {booking.canReschedule ? (
              <button className="btn btn-sm btn-outline" onClick={onReschedule}>
                <RotateCcw size={14} /> Reschedule
              </button>
            ) : (
              <span className="policy-closed">Changes closed</span>
            )}
            {booking.canCancel && (
              <button className="btn btn-sm btn-ghost-danger" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="booking-card-actions">
            <button className="btn btn-sm btn-ghost booking-message-btn" onClick={onMessage} title="Message the business">
              <MessageCircle size={14} /> Message
            </button>
            <Link to={`/b/${booking.business.slug}`} className="btn btn-sm btn-outline">
              Book again
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function RescheduleModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [days, setDays] = useState<SlotDay[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!booking) return;
    let cancelled = false;
    setSelectedDate('');
    setSlots([]);
    setSelected(null);
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
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not load availability.', 'error'))
      .finally(() => !cancelled && setLoadingDays(false));
    return () => {
      cancelled = true;
    };
  }, [booking, toast]);

  useEffect(() => {
    if (!booking || !selectedDate) {
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
  }, [booking, selectedDate]);

  async function submit() {
    if (!booking || !selected) return;
    setSubmitting(true);
    try {
      await patch(`/bookings/${booking.id}/reschedule`, { startsAt: selected });
      announceNotificationsChanged();
      toast('Your appointment has been moved. We emailed you the new details.');
      onDone();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reschedule.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={Boolean(booking)} onClose={onClose} title="Find a new time" eyebrow="Reschedule" size="md">
      {booking && (
        <div className="reschedule-flow">
          <div className="reschedule-current">
            <div>
              <span>Currently</span>
              <strong>{formatDate(booking.startsAt, booking.business.timezone, 'full')}</strong>
              <em>{formatTime(booking.startsAt, booking.business.timezone)} · {booking.service.name}</em>
            </div>
            <span className="reschedule-arrow">→</span>
            <div>
              <span>New time</span>
              <strong>{selected ? formatDate(selected, booking.business.timezone, 'full') : 'Choose below'}</strong>
              <em>{selected ? formatTime(selected, booking.business.timezone) : '—'}</em>
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
            <button className="btn btn-ghost" onClick={onClose}>Keep current time</button>
            <button className="btn btn-accent" onClick={submit} disabled={!selected || submitting}>
              {submitting ? <Spinner /> : 'Confirm new time'}
            </button>
          </div>
          <p className="modal-footnote">Rescheduling is free up to 12 hours before your appointment.</p>
        </div>
      )}
    </Modal>
  );
}

function CancelModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (booking) setReason('');
  }, [booking]);

  async function submit() {
    if (!booking) return;
    setSubmitting(true);
    try {
      await patch(`/bookings/${booking.id}/cancel`, { reason });
      announceNotificationsChanged();
      toast('Your appointment was cancelled. The business has been notified.');
      onDone();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not cancel this appointment.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={Boolean(booking)} onClose={onClose} title="Cancel this appointment?" eyebrow="One more thing" size="sm">
      {booking && (
        <div className="cancel-flow">
          <div className="cancel-summary">
            <span className="cancel-icon"><CalendarX2 size={21} /></span>
            <div>
              <strong>{booking.service.name}</strong>
              <span>{formatDate(booking.startsAt, booking.business.timezone, 'full')} · {formatTime(booking.startsAt, booking.business.timezone)}</span>
              <em>with {booking.business.name}</em>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Reason (optional)</span>
            <textarea
              className="textarea"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Let the business know if you'd like…"
              maxLength={300}
            />
          </label>
          <p className="cancel-note">
            Your slot will reopen for other customers, and we'll notify people who favorited this business.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Keep appointment</button>
            <button className="btn btn-danger" onClick={submit} disabled={submitting}>
              {submitting ? <Spinner /> : 'Cancel appointment'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
