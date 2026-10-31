import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  Plus,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import type { Booking, OwnerOverview as OverviewData } from '../../../shared/types';
import { get, patch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime, firstName, money, relativeDay } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { PageLoader, Spinner } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';

function greeting(): string {
  const hour = DateTime.now().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function OwnerOverview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load(showLoader = false) {
    if (showLoader) setLoading(true);
    try {
      const overview = await get<OverviewData>('/owner/overview');
      setData(overview);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load your studio.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm(booking: Booking) {
    setConfirming(booking.id);
    try {
      await patch(`/owner/bookings/${booking.id}`, { action: 'confirm' });
      toast(`${booking.customer.name}'s appointment is confirmed.`);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not confirm this booking.', 'error');
    } finally {
      setConfirming(null);
    }
  }

  if (loading) return <PageLoader label="Opening your studio" />;
  if (!data) return null;

  const { business, stats } = data;
  const timezone = business.timezone;
  const today = DateTime.now().setZone(timezone);
  const maxWeekCount = Math.max(...data.weekDays.map((day) => day.count), 1);
  const profileItems = [
    { label: 'Business story', done: business.description.trim().length > 40 },
    { label: 'Contact & location', done: Boolean(business.address.trim() && (business.phone.trim() || business.email.trim())) },
    { label: 'Services & pricing', done: business.services.some((service) => service.isActive) },
    { label: 'Cover image', done: Boolean(business.coverImage) },
  ];
  const completeness = Math.round(
    (profileItems.filter((item) => item.done).length / profileItems.length) * 100,
  );
  const ringCircumference = 2 * Math.PI * 33;

  return (
    <div className="owner-overview">
      <div className="page-head">
        <div>
          <div className="eyebrow">{today.toFormat('cccc, LLLL d')} · {business.city}</div>
          <h1>{greeting()}, {firstName(user?.name || business.ownerName)}.</h1>
          <p>Here's the shape of your studio today, with {stats.pending} request{stats.pending === 1 ? '' : 's'} waiting for you.</p>
        </div>
        <div className="page-head-actions">
          <Link to={`/b/${business.slug}`} className="btn btn-outline">
            Public page <ArrowUpRight size={15} />
          </Link>
          <Link to="/owner/services" className="btn btn-dark">
            <Plus size={16} /> Add a service
          </Link>
        </div>
      </div>

      <div className="owner-stat-grid">
        <div className="owner-stat-card">
          <div className="owner-stat-top">
            <span className="owner-stat-icon"><CalendarCheck size={19} /></span>
            <span className="owner-stat-tag">Next 7 days</span>
          </div>
          <strong>{stats.upcoming}</strong>
          <span>Upcoming appointments</span>
          <div className="owner-stat-foot">
            <span className="live-dot" /> {data.today.length} today
          </div>
        </div>
        <div className="owner-stat-card owner-stat-pending">
          <div className="owner-stat-top">
            <span className="owner-stat-icon"><Clock3 size={19} /></span>
            <span className="owner-stat-tag">Needs you</span>
          </div>
          <strong>{stats.pending}</strong>
          <span>Requests to approve</span>
          <div className="owner-stat-foot">
            <Link to="/owner/bookings">Review requests <ArrowRight size={13} /></Link>
          </div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-top">
            <span className="owner-stat-icon owner-icon-sage"><Coins size={19} /></span>
            <span className="owner-stat-tag">This month</span>
          </div>
          <strong>{money(stats.revenueMonthCents)}</strong>
          <span>Booked revenue · BWP</span>
          <div className="owner-stat-foot">
            <span>{stats.completedMonth} completed visits</span>
          </div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-top">
            <span className="owner-stat-icon owner-icon-gold"><CalendarDays size={19} /></span>
            <span className="owner-stat-tag">Next 7 days</span>
          </div>
          <strong>{stats.occupancyPercent}%</strong>
          <span>Calendar occupancy</span>
          <div className="occupancy-bar">
            <span style={{ width: `${stats.occupancyPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="owner-main-grid">
        <section className="panel owner-today-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Today · {today.toFormat('LLL d')}</div>
              <h2>Your schedule</h2>
            </div>
            <Link to="/owner/calendar" className="text-arrow">Full calendar <ArrowUpRight size={15} /></Link>
          </div>
          {data.today.length > 0 ? (
            <div className="today-timeline">
              {data.today.map((booking) => {
                const start = DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(timezone);
                return (
                  <div className="today-row" key={booking.id}>
                    <div className="today-time">
                      <strong>{start.toFormat('h:mm')}</strong>
                      <span>{start.toFormat('a')}</span>
                    </div>
                    <div className="timeline-line">
                      <span className={`timeline-dot status-${booking.status}`} />
                    </div>
                    <Avatar name={booking.customer.name} size="md" />
                    <div className="today-copy">
                      <div className="today-name-row">
                        <strong>{booking.customer.name}</strong>
                        <StatusBadge status={booking.status} />
                      </div>
                      <span>{booking.service.name} · {booking.service.durationMinutes} min</span>
                    </div>
                    <div className="today-price">{money(booking.priceCents)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="owner-clear-day">
              <span className="clear-day-icon"><Sparkles size={22} /></span>
              <h3>A clear day, beautifully.</h3>
              <p>Nothing on the books today. Your public page is still taking requests.</p>
              <Link to={`/b/${business.slug}`} className="btn btn-sm btn-outline">View public page</Link>
            </div>
          )}
          <div className="today-foot">
            <span><Clock3 size={14} /> Today's hours: {business.weeklyHours.find((day) => day.weekday === (today.weekday % 7))?.windows.map((window) => `${Math.floor(window.startMinute / 60)}–${Math.floor(window.endMinute / 60)}`).join(' · ') || 'Closed'}</span>
            <Link to="/owner/availability">Edit hours</Link>
          </div>
        </section>

        <div className="owner-side-stack">
          <section className="panel owner-requests-panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Waiting on you</div>
                <h2>Requests</h2>
              </div>
              <span className="count-bubble">{data.pending.length}</span>
            </div>
            {data.pending.length > 0 ? (
              <div className="request-list">
                {data.pending.slice(0, 3).map((booking) => (
                  <div className="request-item" key={booking.id}>
                    <div className="request-top">
                      <Avatar name={booking.customer.name} size="sm" />
                      <div>
                        <strong>{booking.customer.name}</strong>
                        <span>{booking.service.name}</span>
                      </div>
                      <div className="request-when">
                        <strong>{relativeDay(booking.startsAt, timezone)}</strong>
                        <span>{formatTime(booking.startsAt, timezone)}</span>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button className="btn btn-sm btn-accent" onClick={() => confirm(booking)} disabled={confirming === booking.id}>
                        {confirming === booking.id ? <Spinner size={14} /> : <><Check size={14} /> Confirm</>}
                      </button>
                      <Link to="/owner/bookings" className="btn btn-sm btn-ghost">Details</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="requests-empty">
                <Check size={20} />
                <p>All caught up. No requests waiting.</p>
              </div>
            )}
            <Link to="/owner/bookings" className="panel-footer-link">
              See all bookings <ArrowRight size={14} />
            </Link>
          </section>

          <section className="panel week-glance-panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">The week ahead</div>
                <h2>On the horizon</h2>
              </div>
              <Link to="/owner/calendar" className="round-link" aria-label="Calendar"><ArrowUpRight size={15} /></Link>
            </div>
            <div className="week-bars">
              {data.weekDays.map((day, index) => (
                <div className={`week-bar-col ${index === 0 ? 'today' : ''}`} key={day.date}>
                  <span className="week-bar-count">{day.count || ''}</span>
                  <div className="week-bar-track">
                    <span
                      className={`week-bar-fill ${index === 0 ? 'active' : ''}`}
                      style={{ height: `${Math.max((day.count / maxWeekCount) * 100, day.count ? 18 : 4)}%` }}
                    />
                  </div>
                  <span className="week-bar-label">{day.label.slice(0, 2)}</span>
                </div>
              ))}
            </div>
            <div className="week-glance-foot">
              <Users size={14} /> {stats.newCustomersMonth} new customers this month
            </div>
          </section>
        </div>
      </div>

      <div className="owner-lower-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Coming up</div>
              <h2>Next appointments</h2>
            </div>
            <Link to="/owner/bookings" className="text-arrow">All bookings <ArrowUpRight size={15} /></Link>
          </div>
          {data.upcoming.length > 0 ? (
            <div className="upcoming-table">
              {data.upcoming.slice(0, 5).map((booking) => (
                <div className="upcoming-row" key={booking.id}>
                  <div className="upcoming-date">
                    <span>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(timezone).toFormat('LLL')}</span>
                    <strong>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(timezone).toFormat('d')}</strong>
                  </div>
                  <Avatar name={booking.customer.name} size="sm" />
                  <div className="upcoming-copy">
                    <strong>{booking.customer.name}</strong>
                    <span>{booking.service.name}</span>
                  </div>
                  <span className="upcoming-time">{formatDate(booking.startsAt, timezone)} · {formatTime(booking.startsAt, timezone)}</span>
                  <StatusBadge status={booking.status} />
                  <span className="upcoming-price">{money(booking.priceCents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="requests-empty"><CalendarCheck size={20} /><p>No upcoming appointments yet.</p></div>
          )}
        </section>

        <section className="panel owner-profile-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Your public page</div>
              <h2>Profile strength</h2>
            </div>
            <Star size={17} className="gold-star" fill="currentColor" />
          </div>
          <div className="profile-strength">
            <div className="strength-ring">
              <svg viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="33" className="ring-track" />
                <circle
                  cx="40"
                  cy="40"
                  r="33"
                  className="ring-value"
                  strokeDasharray={`${ringCircumference}`}
                  strokeDashoffset={`${ringCircumference * (1 - completeness / 100)}`}
                />
              </svg>
              <div><strong>{completeness}%</strong><span>complete</span></div>
            </div>
            <div className="strength-list">
              {profileItems.map((item) => (
                <span key={item.label} className={item.done ? 'done' : 'todo'}>
                  {item.done ? <Check size={13} /> : <Plus size={13} />} {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="profile-rating-row">
            <div>
              <Star size={14} fill="currentColor" />
              <strong>{business.rating.toFixed(1)}</strong>
              <span>{business.reviewCount} reviews</span>
            </div>
            <Link to={`/b/${business.slug}`} className="text-arrow">Preview <ArrowUpRight size={14} /></Link>
          </div>
          <Link to="/owner/settings" className="btn btn-sm btn-outline btn-block">Polish your profile</Link>
        </section>
      </div>

      <div className="owner-tip">
        <span className="owner-tip-icon"><Sparkles size={17} /></span>
        <div>
          <strong>Small thing, big difference</strong>
          <span>Buffers between appointments protect your energy and stop the day running late. You have 10–15 minute buffers set on most services.</span>
        </div>
        <Link to="/owner/services">Review services <ArrowRight size={15} /></Link>
      </div>
    </div>
  );
}
