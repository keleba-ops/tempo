import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  Clock3,
  Heart,
  Home,
  MapPin,
  Sparkles,
  Star,
} from 'lucide-react';
import type { Booking, FavoritesResponse, Notification } from '../../../shared/types';
import { get } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime, formatTimeRange, firstName, money, relativeDay, timeAgo } from '../../lib/format';
import { PageLoader } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';
import { NotificationIcon } from '../../components/NotificationIcon';
import { EmptyState } from '../../components/EmptyState';
import { CategoryIcon } from '../../components/CategoryIcon';
import { asset } from '../../lib/asset';

function greeting(): string {
  const hour = DateTime.now().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function AccountOverview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<FavoritesResponse>({ businesses: [], services: [] });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      get<{ bookings: Booking[] }>('/me/bookings?scope=upcoming'),
      get<{ bookings: Booking[] }>('/me/bookings?scope=past'),
      get<FavoritesResponse>('/me/favorites'),
      get<{ notifications: Notification[] }>('/me/notifications'),
    ])
      .then(([up, previous, favs, notes]) => {
        if (cancelled) return;
        setUpcoming(up.bookings);
        setPast(previous.bookings);
        setFavorites(favs);
        setNotifications(notes.notifications);
      })
      .catch(() => toast('Some of your dashboard could not be loaded.', 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const next = upcoming[0];
  const totalHours = useMemo(
    () => Math.round(upcoming.reduce((total, booking) => total + booking.service.durationMinutes, 0) / 60),
    [upcoming],
  );
  const unread = notifications.filter((notification) => !notification.isRead).length;
  const today = DateTime.now().setZone(next?.business.timezone || undefined);

  async function openNotification(notification: Notification) {
    if (notification.actionUrl) navigate(notification.actionUrl);
  }

  if (loading) return <PageLoader label="Gathering your day" />;

  return (
    <div className="account-overview">
      <div className="page-head">
        <div>
          <div className="eyebrow">{today.toFormat('cccc, LLLL d')}</div>
          <h1>{greeting()}, {firstName(user?.name || 'there')}.</h1>
          <p>Here's what's on your horizon — and a little room for something new.</p>
        </div>
        <Link to="/explore" className="btn btn-dark">
          Find a new favorite <ArrowRight size={16} />
        </Link>
      </div>

      <div className="overview-hero-grid">
        {next ? (
          <div className="next-appointment-card">
            <div className="next-card-copy">
              <div className="next-card-label">
                <span className="live-dot" /> Next appointment
                <StatusBadge status={next.status} />
              </div>
              <div className="next-card-when">
                <div className="next-date-block">
                  <span>{DateTime.fromISO(next.startsAt, { zone: 'utc' }).setZone(next.business.timezone).toFormat('LLL')}</span>
                  <strong>{DateTime.fromISO(next.startsAt, { zone: 'utc' }).setZone(next.business.timezone).toFormat('d')}</strong>
                  <span>{DateTime.fromISO(next.startsAt, { zone: 'utc' }).setZone(next.business.timezone).toFormat('ccc')}</span>
                </div>
                <div>
                  <h2>{next.service.name}</h2>
                  <p className="next-business">{next.business.name}</p>
                  <div className="next-details">
                    <span><Clock3 size={14} /> {formatTime(next.startsAt, next.business.timezone)} · {next.service.durationMinutes} min</span>
                    <span>
                      {next.locationType === 'house_call' ? <Home size={14} /> : <MapPin size={14} />}
                      {next.locationType === 'house_call' ? `House call · ${next.serviceCity}` : next.business.city}
                    </span>
                  </div>
                </div>
              </div>
              <div className="next-card-foot">
                <span>{relativeDay(next.startsAt, next.business.timezone)} · {money(next.priceCents)}</span>
                <Link to="/account/bookings" className="next-card-link">
                  View details <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>
            <div className="next-card-image">
              <img src={asset(next.business.coverImage)} alt="" />
              <div className="next-image-save">
                <Heart size={14} fill="currentColor" />
                Saved
              </div>
            </div>
          </div>
        ) : (
          <div className="next-appointment-card next-empty-card">
            <div className="next-card-copy">
              <div className="next-card-label"><Sparkles size={14} /> A clear horizon</div>
              <h2>Nothing booked — yet.</h2>
              <p>Your next good hour is waiting at one of these lovely places.</p>
              <Link to="/explore" className="btn btn-light btn-sm">
                Explore places <ArrowRight size={15} />
              </Link>
            </div>
            <div className="next-card-image">
              <img src={asset('/images/spa.jpg')} alt="" />
            </div>
          </div>
        )}

        <div className="rhythm-card">
          <div className="rhythm-head">
            <div>
              <div className="eyebrow">Your rhythm</div>
              <h3>What's coming up</h3>
            </div>
            <Link to="/account/bookings" className="round-link" aria-label="All bookings">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {upcoming.length > 0 ? (
            <div className="rhythm-list">
              {upcoming.slice(0, 3).map((booking) => (
                <Link to="/account/bookings" key={booking.id} className="rhythm-item">
                  <div className="rhythm-date">
                    <span>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(booking.business.timezone).toFormat('LLL')}</span>
                    <strong>{DateTime.fromISO(booking.startsAt, { zone: 'utc' }).setZone(booking.business.timezone).toFormat('d')}</strong>
                  </div>
                  <div className="rhythm-copy">
                    <strong>{booking.service.name}</strong>
                    <span>{booking.business.name} · {formatTime(booking.startsAt, booking.business.timezone)}</span>
                  </div>
                  <StatusBadge status={booking.status} dotOnly />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rhythm-empty">
              <CalendarDays size={22} />
              <p>Your calendar has room to breathe.</p>
              <Link to="/explore">Find something good</Link>
            </div>
          )}
          <div className="rhythm-foot">
            <div className="rhythm-stat">
              <strong>{upcoming.length}</strong>
              <span>upcoming</span>
            </div>
            <div className="rhythm-stat">
              <strong>{favorites.businesses.length}</strong>
              <span>favorites</span>
            </div>
            <div className="rhythm-stat">
              <strong>{unread}</strong>
              <span>unread</span>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-icon"><CalendarDays size={18} /></span>
          <div>
            <strong>{upcoming.length}</strong>
            <span>Upcoming visits</span>
          </div>
          <span className="stat-trend">{upcoming.length > 0 ? 'On the books' : 'Wide open'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-sage"><Clock3 size={18} /></span>
          <div>
            <strong>{totalHours}h</strong>
            <span>Time set aside</span>
          </div>
          <span className="stat-trend">Just for you</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-rose"><Heart size={18} /></span>
          <div>
            <strong>{favorites.businesses.length}</strong>
            <span>Favorite places</span>
          </div>
          <span className="stat-trend">{favorites.services.length} services watched</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-gold"><Star size={18} /></span>
          <div>
            <strong>{past.length}</strong>
            <span>Past appointments</span>
          </div>
          <span className="stat-trend">History kept</span>
        </div>
      </div>

      <div className="overview-two-col">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Saved for later</div>
              <h2>Your favorites</h2>
            </div>
            <Link to="/account/favorites" className="text-arrow">View all <ArrowUpRight size={15} /></Link>
          </div>
          {favorites.businesses.length > 0 ? (
            <div className="favorite-mini-list">
              {favorites.businesses.slice(0, 3).map((business) => (
                <Link to={`/b/${business.slug}`} key={business.id} className="favorite-mini">
                  <img src={asset(business.coverImage)} alt="" />
                  <div className="favorite-mini-copy">
                    <div className="favorite-mini-category">
                      <CategoryIcon category={business.category} size={12} /> {business.category}
                    </div>
                    <strong>{business.name}</strong>
                    <span>
                      {business.nextAvailable
                        ? <>Next opening {DateTime.fromISO(business.nextAvailable).toFormat('ccc, LLL d')}</>
                        : `${business.city} · ${business.serviceCount} services`}
                    </span>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Heart size={22} />}
              title="No favorites yet"
              description="Tap the heart on any business to keep it close."
              action={<Link to="/explore" className="btn btn-sm btn-outline">Explore places</Link>}
            />
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">The latest</div>
              <h2>Notifications</h2>
            </div>
            <Link to="/account/notifications" className="text-arrow">
              <Bell size={14} /> All notifications
            </Link>
          </div>
          {notifications.length > 0 ? (
            <div className="mini-notification-list">
              {notifications.slice(0, 4).map((notification) => (
                <button
                  key={notification.id}
                  className={`mini-notification ${!notification.isRead ? 'unread' : ''}`}
                  onClick={() => openNotification(notification)}
                >
                  <NotificationIcon type={notification.type} />
                  <div>
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                    <em>{timeAgo(notification.createdAt)}</em>
                  </div>
                  {!notification.isRead && <span className="unread-dot" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="rhythm-empty">
              <Bell size={22} />
              <p>All quiet for now.</p>
            </div>
          )}
        </section>
      </div>

      <div className="account-tip">
        <span className="account-tip-icon"><Check size={17} /></span>
        <div>
          <strong>Good to know</strong>
          <span>You can reschedule or cancel any appointment online up to 12 hours before it starts.</span>
        </div>
        <Link to="/account/bookings">View appointments <ArrowRight size={15} /></Link>
      </div>
    </div>
  );
}
