import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Check,
  Clock3,
  Filter,
  Home,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { Booking, BookingStatus } from '../../../shared/types';
import { get, patch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime, money } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { PageLoader, Spinner } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { OwnerBookingModal } from '../../components/OwnerBookingModal';

type Scope = 'upcoming' | 'past' | 'all';
type FilterStatus = 'all' | BookingStatus;

const STATUSES: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function OwnerBookings() {
  const { toast } = useToast();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [status, setStatus] = useState<FilterStatus>('all');
  const [query, setQuery] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<{ bookings: Booking[] }>(`/owner/bookings?scope=${scope}&status=${status}`)
      .then((data) => {
        if (!cancelled) setBookings(data.bookings);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not load bookings.', 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope, status, refresh, toast]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bookings;
    return bookings.filter((booking) =>
      [booking.customer.name, booking.customer.email, booking.service.name]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [bookings, query]);

  const pendingCount = bookings.filter((booking) => booking.status === 'pending').length;

  async function confirm(booking: Booking) {
    setConfirming(booking.id);
    try {
      await patch(`/owner/bookings/${booking.id}`, { action: 'confirm' });
      toast(`${booking.customer.name}'s appointment is confirmed.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not confirm booking.', 'error');
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="owner-bookings-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Every chair, every hour</div>
          <h1>Bookings</h1>
          <p>Review requests, keep the day moving, and look back on all the good work.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/owner/calendar" className="btn btn-outline">
            <CalendarRange size={16} /> Calendar view
          </Link>
        </div>
      </div>

      {pendingCount > 0 && scope === 'upcoming' && (
        <div className="pending-banner">
          <span className="pending-banner-icon"><Clock3 size={18} /></span>
          <div>
            <strong>{pendingCount} request{pendingCount === 1 ? '' : 's'} need your attention</strong>
            <span>Confirming holds the time and emails the customer straight away.</span>
          </div>
          <button className="btn btn-sm btn-accent" onClick={() => setStatus('pending')}>
            Review requests <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="bookings-toolbar">
        <div className="segmented-tabs">
          {(['upcoming', 'past', 'all'] as Scope[]).map((item) => (
            <button key={item} className={scope === item ? 'active' : ''} onClick={() => setScope(item)}>
              {item === 'upcoming' ? 'Upcoming' : item === 'past' ? 'Past' : 'All time'}
            </button>
          ))}
        </div>
        <div className="bookings-toolbar-right">
          <div className="search-input-sm">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer or service"
              aria-label="Search bookings"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>
            )}
          </div>
          <div className="select-with-icon">
            <Filter size={14} />
            <select value={status} onChange={(event) => setStatus(event.target.value as FilterStatus)}>
              {STATUSES.map((item) => (
                <option value={item.value} key={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bookings-table-card">
        <div className="bookings-table-head">
          <span>When</span>
          <span>Customer</span>
          <span>Service</span>
          <span>Status</span>
          <span>Total</span>
          <span />
        </div>
        {loading ? (
          <PageLoader label="Loading bookings" />
        ) : filtered.length > 0 ? (
          <div className="bookings-table-body">
            {filtered.map((booking) => {
              const dt = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(booking.business.timezone);
              return (
                <div className={`bookings-table-row status-${booking.status}`} key={booking.id}>
                  <button className="booking-when-cell" onClick={() => setSelected(booking)}>
                    <span className="booking-cal-tile">
                      <em>{dt.toFormat('LLL')}</em>
                      <strong>{dt.toFormat('d')}</strong>
                    </span>
                    <span>
                      <strong>{formatDate(booking.startsAt, booking.business.timezone)}</strong>
                      <em>{formatTime(booking.startsAt, booking.business.timezone)} · {booking.service.durationMinutes} min</em>
                    </span>
                  </button>
                  <button className="booking-customer-cell" onClick={() => setSelected(booking)}>
                    <Avatar name={booking.customer.name} size="sm" />
                    <span>
                      <strong>{booking.customer.name}</strong>
                      <em>{booking.customer.email}</em>
                    </span>
                  </button>
                  <button className="booking-service-cell" onClick={() => setSelected(booking)}>
                    <strong>{booking.service.name}</strong>
                    <em>
                      {booking.locationType === 'house_call'
                        ? <><Home size={10} /> House call · {booking.serviceCity}</>
                        : booking.notes ? 'Has a note' : 'At the studio'}
                    </em>
                  </button>
                  <div><StatusBadge status={booking.status} /></div>
                  <div className="booking-total-cell">{money(booking.priceCents)}</div>
                  <div className="booking-row-actions">
                    {booking.status === 'pending' ? (
                      <button
                        className="btn btn-sm btn-accent"
                        onClick={() => confirm(booking)}
                        disabled={confirming === booking.id}
                      >
                        {confirming === booking.id ? <Spinner size={13} /> : <><Check size={13} /> Confirm</>}
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline" onClick={() => setSelected(booking)}>
                        Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarDays size={24} />}
            title="No bookings here"
            description={
              query
                ? 'No appointments match that search. Try a different name or service.'
                : scope === 'upcoming'
                  ? 'Your calendar is clear in this view. New bookings will appear the moment they come in.'
                  : 'No appointments in this range yet.'
            }
            action={query ? <button className="btn btn-sm btn-outline" onClick={() => setQuery('')}>Clear search</button> : undefined}
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="bookings-table-foot">
            <span>{filtered.length} appointment{filtered.length === 1 ? '' : 's'}</span>
            <span><MapPin size={13} /> Times in Botswana time (CAT)</span>
            <span><Sparkles size={13} /> All changes email the customer automatically</span>
          </div>
        )}
      </div>

      <OwnerBookingModal
        booking={selected}
        onClose={() => setSelected(null)}
        onChanged={() => setRefresh((value) => value + 1)}
      />
    </div>
  );
}
