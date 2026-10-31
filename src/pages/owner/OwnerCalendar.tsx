import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Sparkles } from 'lucide-react';
import type { Booking, BusinessDetail } from '../../../shared/types';
import { get } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatTime, money } from '../../lib/format';
import { PageLoader, Spinner } from '../../components/Loading';
import { OwnerBookingModal } from '../../components/OwnerBookingModal';
import { StatusBadge } from '../../components/StatusBadge';

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 76;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

export function OwnerCalendar() {
  const { toast } = useToast();
  const [timezone, setTimezone] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    get<{ business: BusinessDetail }>('/owner/business')
      .then((data) => {
        if (cancelled) return;
        setTimezone(data.business.timezone);
        setWeekStart(
          DateTime.now().setZone(data.business.timezone).startOf('week').toISODate()!,
        );
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not open your calendar.', 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!timezone || !weekStart) return;
    let cancelled = false;
    const start = DateTime.fromISO(weekStart, { zone: timezone }).startOf('day');
    const end = start.plus({ days: 7 });
    setWeekLoading(true);
    get<{ bookings: Booking[] }>(
      `/owner/bookings?from=${encodeURIComponent(start.toUTC().toISO()!)}&to=${encodeURIComponent(end.toUTC().toISO()!)}`,
    )
      .then((data) => {
        if (!cancelled) setBookings(data.bookings.filter((booking) => booking.status !== 'cancelled'));
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not load this week.', 'error'))
      .finally(() => !cancelled && setWeekLoading(false));
    return () => {
      cancelled = true;
    };
  }, [timezone, weekStart, refresh, toast]);

  const weekDays = useMemo(() => {
    if (!weekStart || !timezone) return [];
    const start = DateTime.fromISO(weekStart, { zone: timezone });
    const today = DateTime.now().setZone(timezone);
    return Array.from({ length: 7 }, (_, index) => {
      const day = start.plus({ days: index });
      const localDate = day.toISODate();
      const dayBookings = bookings.filter(
        (booking) =>
          DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(timezone).toISODate() === localDate,
      );
      return {
        date: localDate,
        dayLabel: day.toFormat('ccc'),
        dateLabel: day.toFormat('d'),
        month: day.toFormat('LLL'),
        isToday: day.hasSame(today, 'day'),
        bookings: dayBookings,
      };
    });
  }, [weekStart, timezone, bookings]);

  const weekEnd = weekStart ? DateTime.fromISO(weekStart, { zone: timezone }).plus({ days: 6 }) : null;
  const rangeLabel = weekStart
    ? `${DateTime.fromISO(weekStart, { zone: timezone }).toFormat('LLL d')} – ${weekEnd?.toFormat(weekEnd.month === DateTime.fromISO(weekStart, { zone: timezone }).month ? 'd' : 'LLL d')}, ${weekEnd?.year}`
    : '';

  function shiftWeek(days: number) {
    if (!weekStart) return;
    setWeekStart(DateTime.fromISO(weekStart, { zone: timezone }).plus({ days }).toISODate()!);
  }

  function goToday() {
    setWeekStart(DateTime.now().setZone(timezone).startOf('week').toISODate()!);
  }

  if (loading) return <PageLoader label="Setting up your week" />;

  return (
    <div className="owner-calendar-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your week at a glance</div>
          <h1>Calendar</h1>
          <p>Every booking, buffer, and open hour in one honest view.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-outline" onClick={goToday}>
            <CalendarDays size={16} /> Today
          </button>
          <div className="week-nav">
            <button className="icon-btn" onClick={() => shiftWeek(-7)} aria-label="Previous week">
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" onClick={() => shiftWeek(7)} aria-label="Next week">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-card">
        <div className="calendar-toolbar">
          <div className="calendar-range">
            <strong>{rangeLabel}</strong>
            <span>{bookings.length} appointment{bookings.length === 1 ? '' : 's'} this week</span>
          </div>
          <div className="calendar-legend">
            <span><i className="legend-dot status-confirmed" /> Confirmed</span>
            <span><i className="legend-dot status-pending" /> Pending</span>
            <span><i className="legend-dot status-completed" /> Completed</span>
            {weekLoading && <span className="calendar-loading"><Spinner size={13} /> Updating</span>}
          </div>
        </div>

        <div className="calendar-scroll">
          <div className="week-calendar">
            <div className="cal-header-row">
              <div className="cal-gutter-head">
                <span>{timezone.split('/')[1]?.replaceAll('_', ' ')}</span>
              </div>
              {weekDays.map((day) => (
                <div className={`cal-day-head ${day.isToday ? 'today' : ''}`} key={day.date}>
                  <span>{day.dayLabel}</span>
                  <strong>{day.dateLabel}</strong>
                  <em>{day.month}</em>
                  {day.bookings.length > 0 && <span className="cal-day-count">{day.bookings.length}</span>}
                </div>
              ))}
            </div>

            <div className="cal-body-row">
              <div className="cal-time-col" style={{ height: TOTAL_HEIGHT }}>
                {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, index) => {
                  const hour = START_HOUR + index;
                  return (
                    <span
                      key={hour}
                      className="cal-hour-label"
                      style={{ top: index * HOUR_HEIGHT - 8 }}
                    >
                      {DateTime.fromObject({ hour }).toFormat('h a')}
                    </span>
                  );
                })}
              </div>
              {weekDays.map((day) => (
                <div className={`cal-day-col ${day.isToday ? 'today' : ''}`} key={day.date} style={{ height: TOTAL_HEIGHT }}>
                  {Array.from({ length: END_HOUR - START_HOUR }).map((_, index) => (
                    <span
                      className="cal-hour-line"
                      key={index}
                      style={{ top: index * HOUR_HEIGHT }}
                    />
                  ))}
                  {day.isToday && (() => {
                    const now = DateTime.now().setZone(timezone);
                    const minutes = now.hour * 60 + now.minute;
                    if (minutes < START_HOUR * 60 || minutes > END_HOUR * 60) return null;
                    return (
                      <span
                        className="cal-now-line"
                        style={{ top: ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
                      >
                        <i />
                      </span>
                    );
                  })()}
                  {day.bookings.map((booking) => {
                    const start = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(timezone);
                    const minutes = start.hour * 60 + start.minute;
                    if (minutes < START_HOUR * 60 || minutes >= END_HOUR * 60) return null;
                    const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = Math.max((booking.service.durationMinutes / 60) * HOUR_HEIGHT, 40);
                    const compact = height < 58;
                    return (
                      <button
                        key={booking.id}
                        className={`cal-booking status-${booking.status} ${compact ? 'compact' : ''}`}
                        style={{ top, height }}
                        onClick={() => setSelected(booking)}
                      >
                        <span className="cal-booking-time">{formatTime(booking.startsAt, timezone)}</span>
                        <strong>{booking.customer.name}</strong>
                        {!compact && <span className="cal-booking-service">{booking.service.name}</span>}
                        {!compact && <span className="cal-booking-price">{money(booking.priceCents)}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="calendar-foot">
          <span><Clock3 size={14} /> Times shown in Botswana time (CAT)</span>
          <span><Sparkles size={14} /> Click any appointment to confirm, move, or cancel it.</span>
        </div>
      </div>

      <div className="mobile-week-agenda">
        <div className="mobile-agenda-head">
          <div>
            <div className="eyebrow">This week, in order</div>
            <h3>Appointments</h3>
          </div>
          <span>{bookings.length} total</span>
        </div>
        {weekDays.filter((day) => day.bookings.length > 0).length > 0 ? (
          <div className="mobile-agenda-days">
            {weekDays.filter((day) => day.bookings.length > 0).map((day) => (
              <div className="mobile-agenda-day" key={day.date}>
                <div className="mobile-agenda-date">
                  <span>{day.dayLabel}</span>
                  <strong>{day.dateLabel}</strong>
                </div>
                <div className="mobile-agenda-items">
                  {day.bookings.map((booking) => (
                    <button className="mobile-agenda-item" key={booking.id} onClick={() => setSelected(booking)}>
                      <span className="mobile-agenda-time">{formatTime(booking.startsAt, timezone)}</span>
                      <div>
                        <strong>{booking.customer.name}</strong>
                        <span>{booking.service.name}</span>
                      </div>
                      <StatusBadge status={booking.status} dotOnly />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="requests-empty"><CalendarDays size={18} /><p>No appointments this week.</p></div>
        )}
      </div>

      {bookings.length === 0 && (
        <div className="calendar-empty-note">
          <CalendarDays size={20} />
          <div>
            <strong>A quiet week</strong>
            <span>No appointments in this range. Share your public page to fill the calendar.</span>
          </div>
          <Link to="/owner/services" className="btn btn-sm btn-outline">
            <Plus size={14} /> Add a service
          </Link>
        </div>
      )}

      <OwnerBookingModal
        booking={selected}
        onClose={() => setSelected(null)}
        onChanged={() => setRefresh((value) => value + 1)}
      />
    </div>
  );
}
