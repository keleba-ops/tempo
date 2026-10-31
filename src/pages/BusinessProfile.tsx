import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  Home,
  Info,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
} from 'lucide-react';
import type { Booking, BusinessDetail, Service, Slot, SlotDay } from '../../shared/types';
import { get, post } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DateStrip } from '../components/DateStrip';
import { SlotPicker } from '../components/SlotPicker';
import { StatusBadge } from '../components/StatusBadge';
import { CategoryIcon } from '../components/CategoryIcon';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { PageLoader } from '../components/Loading';
import { GoogleMap } from '../components/GoogleMap';
import { duration, formatDateTime, minutesToLabel, money, WEEKDAYS } from '../lib/format';
import { announceNotificationsChanged } from '../lib/events';
import { asset } from '../lib/asset';

interface SlotsResponse {
  date: string;
  timezone: string;
  slots: Slot[];
  windows: { startMinute: number; endMinute: number }[];
  exception: { isClosed: boolean; note: string } | null;
}

export function BusinessProfile() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [days, setDays] = useState<SlotDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotMeta, setSlotMeta] = useState<SlotsResponse | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Booking | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [watched, setWatched] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [locationType, setLocationType] = useState<'business' | 'house_call'>('business');
  const [serviceAddress, setServiceAddress] = useState('');
  const [serviceCity, setServiceCity] = useState('Gaborone');
  const [contactPhone, setContactPhone] = useState('');
  const [mapAddress, setMapAddress] = useState('');

  const bookingPanelRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const presetTime = useRef<string | null>(null);
  const initialDate = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<{ business: BusinessDetail }>(`/businesses/${slug}`)
      .then((data) => {
        if (cancelled) return;
        setBusiness(data.business);
        setFavorite(data.business.isFavorite);
        setWatched(data.business.favoriteServices);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'This business could not be loaded.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!business || initialized.current) return;
    initialized.current = true;
    const requestedService = searchParams.get('service');
    const requestedDate = searchParams.get('date');
    const requestedTime = searchParams.get('time');
    const service = business.services.find((item) => item.id === requestedService) || business.services[0];
    if (service) {
      setSelectedServiceId(service.id);
      if (requestedDate) {
        setSelectedDate(requestedDate);
        initialDate.current = requestedDate;
      }
      if (requestedTime) presetTime.current = requestedTime;
    }
  }, [business, searchParams]);

  const selectedService: Service | undefined = useMemo(
    () => business?.services.find((service) => service.id === selectedServiceId),
    [business, selectedServiceId],
  );

  useEffect(() => {
    if (!user || user.role !== 'customer') return;
    setServiceAddress((current) => current || user.address || '');
    setServiceCity((current) => current || user.city || 'Gaborone');
    setContactPhone((current) => current || user.phone || '');
  }, [user]);

  useEffect(() => {
    if (locationType !== 'house_call') {
      setMapAddress('');
      return;
    }
    const timer = window.setTimeout(() => {
      if (serviceAddress.trim().length > 4) {
        setMapAddress(`${serviceAddress.trim()}, ${serviceCity.trim() || 'Gaborone'}, Botswana`);
      } else {
        setMapAddress('');
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [locationType, serviceAddress, serviceCity]);

  useEffect(() => {
    if (!selectedService || !business) {
      setDays([]);
      return;
    }
    let cancelled = false;
    setDaysLoading(true);
    get<{ days: SlotDay[] }>(`/businesses/${business.slug}/slot-days?serviceId=${selectedService.id}&days=14`)
      .then((data) => {
        if (cancelled) return;
        setDays(data.days);
        setSelectedDate((current) => {
          if (current && data.days.some((day) => day.date === current && day.count > 0)) return current;
          if (current && current !== initialDate.current) return current;
          const firstOpen = data.days.find((day) => day.count > 0);
          return firstOpen?.date || '';
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setDaysLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedService, business, refreshKey]);

  useEffect(() => {
    if (!selectedService || !business || !selectedDate) {
      setSlots([]);
      setSlotMeta(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    get<SlotsResponse>(
      `/businesses/${business.slug}/slots?serviceId=${selectedService.id}&date=${selectedDate}`,
    )
      .then((data) => {
        if (cancelled) return;
        setSlots(data.slots);
        setSlotMeta(data);
        setSelectedSlot((current) => {
          if (presetTime.current && initialDate.current === selectedDate) {
            const preset = data.slots.find((slot) => slot.startsAt === presetTime.current);
            if (preset) return preset.startsAt;
          }
          return current && data.slots.some((slot) => slot.startsAt === current) ? current : null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setSlotMeta(null);
        }
      })
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedService, business, refreshKey]);

  function selectService(service: Service) {
    if (service.id === selectedServiceId) return;
    setSelectedServiceId(service.id);
    setSelectedDate('');
    setSelectedSlot(null);
    setNotes('');
    setLocationType('business');
    presetTime.current = null;
    initialDate.current = null;
    if (window.innerWidth < 960) {
      window.setTimeout(() => {
        bookingPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  function chooseDate(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    presetTime.current = null;
  }

  async function toggleFavorite() {
    if (!business) return;
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (user.role !== 'customer') {
      toast('Switch to a customer account to save favorites.', 'info');
      return;
    }
    setFavoriteBusy(true);
    try {
      const result = await post<{ favorited: boolean }>(`/businesses/${business.id}/favorite`);
      setFavorite(result.favorited);
      toast(result.favorited ? `${business.name} saved to favorites.` : `Removed from favorites.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update favorites.', 'error');
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function toggleWatch(service: Service) {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (user.role !== 'customer') {
      toast('Availability alerts are for customer accounts.', 'info');
      return;
    }
    try {
      const result = await post<{ watching: boolean }>(`/services/${service.id}/watch`);
      setWatched((current) =>
        result.watching ? [...current, service.id] : current.filter((id) => id !== service.id),
      );
      toast(
        result.watching
          ? `We'll tell you when ${service.name} has an opening.`
          : `Stopped watching ${service.name}.`,
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update alerts.', 'error');
    }
  }

  function shareBusiness() {
    if (!business) return;
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: business.name, text: `Book with ${business.name} on Tempo`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => toast('Link copied to your clipboard.')).catch(() => {});
    }
  }

  async function messageBusiness() {
    if (!business) return;
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (user.role !== 'customer') {
      toast('Messages between businesses and customers open from a customer account.', 'info');
      return;
    }
    try {
      const data = await post<{ conversation: { id: string } }>('/conversations', { businessId: business.id });
      if (data.conversation?.id) navigate(`/account/messages?c=${data.conversation.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open a conversation.', 'error');
    }
  }

  async function handleBook() {
    if (!business || !selectedService) return;
    if (!user) {
      const params = new URLSearchParams();
      params.set('service', selectedService.id);
      if (selectedDate) params.set('date', selectedDate);
      if (selectedSlot) params.set('time', selectedSlot);
      const returnTo = `/b/${business.slug}?${params.toString()}`;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (user.role !== 'customer') {
      toast('Please sign in with a customer account to book.', 'info');
      return;
    }
    if (!selectedSlot) {
      toast('Choose a time for your appointment first.', 'info');
      return;
    }
    if (selectedService.houseCall && locationType === 'house_call') {
      if (!serviceAddress.trim() || !serviceCity.trim()) {
        toast('Add the address for your house call.', 'info');
        return;
      }
      if (!contactPhone.trim()) {
        toast('Add a phone number so the business can reach you.', 'info');
        return;
      }
    }
    setSubmitting(true);
    try {
      const data = await post<{ booking: Booking }>('/bookings', {
        serviceId: selectedService.id,
        startsAt: selectedSlot,
        notes,
        locationType: selectedService.houseCall ? locationType : 'business',
        serviceAddress: selectedService.houseCall && locationType === 'house_call' ? serviceAddress.trim() : '',
        serviceCity: selectedService.houseCall && locationType === 'house_call' ? serviceCity.trim() : '',
        contactPhone: selectedService.houseCall ? contactPhone.trim() : '',
      });
      setSuccess(data.booking);
      setSelectedSlot(null);
      presetTime.current = null;
      setNotes('');
      setRefreshKey((key) => key + 1);
      announceNotificationsChanged();
      toast(
        data.booking.status === 'pending'
          ? 'Your request is with the business.'
          : 'Your appointment is confirmed.',
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That time could not be booked.', 'error');
      setSelectedSlot(null);
      setRefreshKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-loading container">
        <PageLoader label="Opening the studio" />
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="container profile-error">
        <div className="empty-state">
          <div className="empty-icon"><Sparkles size={24} /></div>
          <h3>We couldn't find that place</h3>
          <p>{error || 'This business may have moved or closed.'}</p>
          <Link to="/explore" className="btn btn-dark">Browse places</Link>
        </div>
      </div>
    );
  }

  const todayWeekday = DateTime.now().setZone(business.timezone).weekday % 7;
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];
  const upcomingExceptions = business.exceptions
    .filter((exception) => exception.date >= DateTime.now().setZone(business.timezone).toISODate()!)
    .slice(0, 3);
  const selectedDay = days.find((day) => day.date === selectedDate);

  return (
    <div className="business-profile">
      <div className="business-cover">
        <img src={asset(business.coverImage)} alt={`${business.name} interior`} />
        <div className="business-cover-shade" />
        <div className="container business-cover-controls">
          <Link to="/explore" className="cover-btn">
            <ArrowLeft size={17} /> All places
          </Link>
          <div className="cover-actions">
            {user?.role !== 'owner' && (
              <button className="cover-btn cover-message-btn" onClick={messageBusiness}>
                <MessageCircle size={16} /> <span>Message</span>
              </button>
            )}
            <button className="cover-btn" onClick={shareBusiness}>
              <Share2 size={16} /> Share
            </button>
            <button
              className={`cover-btn cover-heart ${favorite ? 'active' : ''}`}
              onClick={toggleFavorite}
              disabled={favoriteBusy}
            >
              <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
              {favorite ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <div className="cover-caption">
          <span>{business.category}</span>
          <span className="cover-caption-dot" />
          <span>{business.city}</span>
        </div>
      </div>

      <div className="container">
        <div className="business-identity">
          <div className="business-monogram" style={{ background: business.accentColor }}>
            <CategoryIcon category={business.category} size={28} />
          </div>
          <div className="business-identity-main">
            <div className="business-title-row">
              <h1>{business.name}</h1>
              {business.approvalRequired ? (
                <span className="approval-pill"><Clock3 size={12} /> Requests reviewed</span>
              ) : (
                <span className="instant-pill"><Check size={12} /> Instant booking</span>
              )}
            </div>
            <p className="business-tagline">{business.tagline}</p>
            <div className="business-meta">
              <span className="rating">
                <Star size={14} fill="currentColor" /> {business.rating.toFixed(1)}
                <span className="rating-count">{business.reviewCount} reviews</span>
              </span>
              <span><MapPin size={14} /> {business.address}, {business.city}</span>
              <span><Clock3 size={14} /> Botswana time · CAT</span>
            </div>
          </div>
          <div className="business-owner">
            <Avatar name={business.ownerName} size="md" />
            <div>
              <span>Hosted by</span>
              <strong>{business.ownerName}</strong>
            </div>
          </div>
        </div>

        <div className="profile-layout">
          <div className="profile-main">
            <section className="profile-section about-section">
              <div className="eyebrow">The place</div>
              <h2>A little about {business.name}</h2>
              <p className="about-text">{business.description}</p>
              <div className="about-facts">
                <div>
                  <span className="fact-label">Neighborhood</span>
                  <strong><MapPin size={14} /> {business.city}</strong>
                </div>
                <div>
                  <span className="fact-label">Contact</span>
                  <strong><Phone size={14} /> {business.phone || business.email}</strong>
                </div>
                <div>
                  <span className="fact-label">Calendar</span>
                  <strong><Sparkles size={14} /> {business.timezone.split('/')[1]?.replaceAll('_', ' ')}</strong>
                </div>
              </div>
            </section>

            <section className="profile-section services-section" id="services">
              <div className="services-head">
                <div>
                  <div className="eyebrow">Choose your time</div>
                  <h2>Services</h2>
                </div>
                <span className="services-count">{business.services.length} offerings · prices in BWP</span>
              </div>
              <div className="service-list">
                {business.services.map((service) => {
                  const active = service.id === selectedServiceId;
                  const isWatched = watched.includes(service.id);
                  return (
                    <div
                      key={service.id}
                      className={`service-row ${active ? 'active' : ''}`}
                      onClick={() => selectService(service)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') selectService(service);
                      }}
                    >
                      <div className="service-select-mark">
                        {active ? <Check size={14} /> : <span />}
                      </div>
                      <div className="service-info">
                        <div className="service-name-row">
                          <h3>{service.name}</h3>
                          {service.bufferMinutes > 0 && (
                            <span className="buffer-chip">{service.bufferMinutes} min reset</span>
                          )}
                          {service.houseCall && (
                            <span className="housecall-chip"><Home size={10} /> House calls</span>
                          )}
                        </div>
                        <p>{service.description}</p>
                        <div className="service-meta">
                          <span><Clock3 size={13} /> {duration(service.durationMinutes)}</span>
                          <span className="service-meta-dot" />
                          <span>{money(service.priceCents)}</span>
                        </div>
                      </div>
                      <div className="service-actions">
                        <button
                          className={`watch-btn ${isWatched ? 'active' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleWatch(service);
                          }}
                          aria-label={isWatched ? `Stop watching ${service.name}` : `Get alerts for ${service.name}`}
                          title={isWatched ? 'You are watching this service' : 'Notify me when a slot opens'}
                        >
                          {isWatched ? <BellRing size={16} /> : <Bell size={16} />}
                        </button>
                        <button
                          className={`btn btn-sm ${active ? 'btn-accent' : 'btn-outline'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectService(service);
                          }}
                        >
                          {active ? 'Selected' : 'Choose'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="profile-section hours-section">
              <div className="hours-grid-wrap">
                <div>
                  <div className="eyebrow">The rhythm</div>
                  <h2>Hours & location</h2>
                  <p className="hours-note">
                    All times are shown in Botswana time (CAT, GMT+2).
                  </p>
                  <div className="address-card">
                    <span className="address-icon"><MapPin size={19} /></span>
                    <div>
                      <strong>{business.name}</strong>
                      <span>{business.address}</span>
                      <span>{business.city}, {business.country}</span>
                    </div>
                    <a
                      className="text-arrow"
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${business.address}, ${business.city}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions <ArrowRight size={15} />
                    </a>
                  </div>
                  {(business.address.trim() || business.city.trim()) && (
                    <div className="business-map-block">
                      <GoogleMap
                        query={`${business.address}, ${business.city}, Botswana`}
                        label="Get directions"
                        height={205}
                      />
                    </div>
                  )}
                  {upcomingExceptions.length > 0 && (
                    <div className="exception-note">
                      <Info size={16} />
                      <div>
                        <strong>Upcoming schedule changes</strong>
                        {upcomingExceptions.map((exception) => (
                          <span key={exception.id}>
                            {DateTime.fromISO(exception.date).toFormat('ccc, LLL d')} —{' '}
                            {exception.isClosed
                              ? exception.note || 'Closed'
                              : `${minutesToLabel(exception.startMinute || 0)}–${minutesToLabel(exception.endMinute || 0)}${exception.note ? ` · ${exception.note}` : ''}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="hours-list">
                  {orderedDays.map((weekday) => {
                    const hours = business.weeklyHours.find((day) => day.weekday === weekday);
                    const isToday = weekday === todayWeekday;
                    return (
                      <div className={`hours-row ${isToday ? 'today' : ''}`} key={weekday}>
                        <span>{WEEKDAYS[weekday]}{isToday && <em>Today</em>}</span>
                        <strong>
                          {!hours || !hours.isOpen
                            ? 'Closed'
                            : hours.windows
                                .map((window) => `${minutesToLabel(window.startMinute)} – ${minutesToLabel(window.endMinute)}`)
                                .join(' · ')}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="profile-section good-to-know">
              <div className="eyebrow">Good to know</div>
              <h2>A few small things</h2>
              <div className="know-grid">
                <div className="know-item">
                  <span><CalendarCheck size={19} /></span>
                  <strong>Flexible changes</strong>
                  <p>Reschedule or cancel online up to 12 hours before your appointment.</p>
                </div>
                <div className="know-item">
                  <span><BellRing size={19} /></span>
                  <strong>A gentle reminder</strong>
                  <p>We'll send a reminder in-app and by email the day before.</p>
                </div>
                <div className="know-item">
                  <span><ShieldCheck size={19} /></span>
                  <strong>No double bookings</strong>
                  <p>Availability is checked again the moment you book, so your spot is really yours.</p>
                </div>
                {business.services.some((service) => service.houseCall) && (
                  <div className="know-item">
                    <span><Home size={19} /></span>
                    <strong>House calls available</strong>
                    <p>Choose “At my place” and add your address for services marked House calls.</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="profile-sidebar">
            <div className="booking-panel" ref={bookingPanelRef}>
              <div className="booking-panel-head">
                <div>
                  <div className="eyebrow">Reserve your spot</div>
                  <h2>Book an appointment</h2>
                </div>
                <span className="booking-panel-availability">
                  <span className="pulse-dot" /> Open
                </span>
              </div>
              {selectedService ? (
                <>
                  <div className="booking-service-summary">
                    <div className="booking-service-icon">
                      <CategoryIcon category={business.category} size={18} />
                    </div>
                    <div>
                      <strong>{selectedService.name}</strong>
                      <span>{duration(selectedService.durationMinutes)} · {money(selectedService.priceCents)}</span>
                    </div>
                    <button
                      className="text-link small"
                      onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    >
                      Change
                    </button>
                  </div>

                  {selectedService.houseCall && (
                    <div className="booking-block location-block">
                      <div className="booking-block-label">
                        <Home size={14} /> Where should we meet?
                      </div>
                      <div className="location-toggle">
                        <button
                          className={locationType === 'business' ? 'active' : ''}
                          onClick={() => setLocationType('business')}
                        >
                          <Store size={14} /> At the studio
                        </button>
                        <button
                          className={locationType === 'house_call' ? 'active' : ''}
                          onClick={() => setLocationType('house_call')}
                        >
                          <Home size={14} /> At my place
                        </button>
                      </div>
                      {locationType === 'house_call' && (
                        <div className="house-call-fields">
                          <label className="field">
                            <span className="field-label">Street / plot & area</span>
                            <input
                              className="input"
                              value={serviceAddress}
                              onChange={(event) => setServiceAddress(event.target.value)}
                              placeholder="e.g. Plot 2210, Extension 12"
                            />
                          </label>
                          <div className="house-call-field-row">
                            <label className="field">
                              <span className="field-label">Town / city</span>
                              <input
                                className="input"
                                value={serviceCity}
                                onChange={(event) => setServiceCity(event.target.value)}
                                placeholder="Gaborone"
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">Contact number</span>
                              <input
                                className="input"
                                value={contactPhone}
                                onChange={(event) => setContactPhone(event.target.value)}
                                placeholder="+267 …"
                              />
                            </label>
                          </div>
                          {mapAddress ? (
                            <GoogleMap query={mapAddress} height={150} compact label="Open in Maps" />
                          ) : (
                            <p className="house-call-hint">Add your address to preview the house-call location on Google Maps.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="booking-block">
                    <div className="booking-block-label">
                      <span>1</span> Pick a day
                    </div>
                    <DateStrip days={days} selected={selectedDate} onSelect={chooseDate} loading={daysLoading} />
                    {selectedDay && (
                      <div className="day-available-note">
                        <span className="live-dot" />
                        {selectedDay.count} time{selectedDay.count === 1 ? '' : 's'} available
                      </div>
                    )}
                  </div>

                  <div className="booking-block">
                    <div className="booking-block-label">
                      <span>2</span> Choose a time
                    </div>
                    <SlotPicker
                      slots={slots}
                      selected={selectedSlot}
                      onSelect={(startsAt) => {
                        presetTime.current = null;
                        setSelectedSlot(startsAt);
                      }}
                      loading={slotsLoading}
                    />
                    <div className="booking-timezone">All times in Botswana time (CAT)</div>
                    {slotMeta?.exception && !slotMeta.exception.isClosed && (
                      <div className="slot-exception">
                        <Info size={13} /> {slotMeta.exception.note}
                      </div>
                    )}
                  </div>

                  <div className="booking-block">
                    <div className="booking-block-label">
                      <span>3</span> Anything we should know?
                    </div>
                    <textarea
                      className="textarea booking-notes"
                      rows={2}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Optional notes for the business…"
                      maxLength={800}
                    />
                  </div>

                  <div className="booking-total">
                    <span>Total today · BWP</span>
                    <strong>{money(selectedService.priceCents)}</strong>
                  </div>

                  <button
                    className="btn btn-accent btn-block booking-submit"
                    onClick={handleBook}
                    disabled={submitting || !selectedSlot}
                  >
                    {submitting
                      ? 'Reserving…'
                      : !user
                        ? 'Sign in to book'
                        : business.approvalRequired
                          ? 'Request appointment'
                          : 'Confirm appointment'}
                    {!submitting && <ArrowRight size={17} />}
                  </button>

                  {business.approvalRequired ? (
                    <p className="booking-footnote">
                      <Clock3 size={13} /> {business.ownerName} reviews each request. You'll get an email as soon as
                      it's confirmed.
                    </p>
                  ) : (
                    <p className="booking-footnote">
                      <ShieldCheck size={13} /> Instant confirmation. No charge until your visit.
                    </p>
                  )}
                  <p className="booking-policy">
                    Free cancellation up to 12 hours before. By booking, you agree to the business's policy.
                  </p>
                </>
              ) : (
                <div className="booking-empty">
                  <CalendarCheck size={28} />
                  <h3>Choose a service to see times</h3>
                  <p>Pick an offering from the list and we'll show you real availability.</p>
                </div>
              )}
            </div>

            <div className="booking-aside-card">
              <div className="aside-card-head">
                <Heart size={15} fill={favorite ? 'currentColor' : 'none'} />
                <strong>Can't make these times?</strong>
              </div>
              <p>Save {business.name} and we'll let you know the moment something opens up.</p>
              <button className={`btn btn-sm btn-block ${favorite ? 'btn-outline' : 'btn-dark'}`} onClick={toggleFavorite}>
                {favorite ? 'Saved to favorites' : 'Save this place'}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {selectedService && (
        <button
          className="mobile-booking-bar"
          onClick={() => bookingPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          aria-label="Go to booking panel"
        >
          <span className="mobile-booking-bar-icon"><CalendarCheck size={17} /></span>
          <span className="mobile-booking-bar-copy">
            <em>Book {selectedService.name}</em>
            <strong>{duration(selectedService.durationMinutes)} · {money(selectedService.priceCents)}</strong>
          </span>
          <span className="mobile-booking-bar-action">Choose a time <ArrowRight size={14} /></span>
        </button>
      )}

      <section className="profile-bottom-cta">
        <div className="container profile-bottom-inner">
          <Logo />
          <p>A little time for yourself, booked beautifully.</p>
          <Link to="/explore" className="text-arrow">
            Find another place <ChevronRight size={15} />
          </Link>
        </div>
      </section>

      <Modal
        open={Boolean(success)}
        onClose={() => {
          setSuccess(null);
        }}
        hideClose
        size="sm"
      >
        {success && (
          <div className="booking-success">
            <div className="success-icon"><Check size={27} /></div>
            <div className="eyebrow">{success.status === 'pending' ? 'Request received' : 'Confirmed'}</div>
            <h2>{success.status === 'pending' ? 'Your request is in.' : "You're on the books."}</h2>
            <p>
              {success.status === 'pending'
                ? `${business.ownerName} will take a look and confirm your appointment shortly. We've sent the details to your email.`
                : `We've sent a confirmation and calendar details to your email. ${business.name} can't wait to see you.`}
            </p>
            <div className="success-details">
              <div>
                <span>Service</span>
                <strong>{success.service.name}</strong>
              </div>
              <div>
                <span>When</span>
                <strong>{formatDateTime(success.startsAt, success.business.timezone)}</strong>
              </div>
              <div>
                <span>Where</span>
                <strong>
                  {success.locationType === 'house_call'
                    ? `House call · ${success.serviceAddress}, ${success.serviceCity}`
                    : `${business.address}, ${business.city}`}
                </strong>
              </div>
              <div>
                <span>Status</span>
                <StatusBadge status={success.status} />
              </div>
            </div>
            {success.locationType === 'house_call' && (
              <div className="success-map">
                <GoogleMap
                  query={`${success.serviceAddress}, ${success.serviceCity}, Botswana`}
                  height={155}
                  compact
                  label="Open location"
                />
              </div>
            )}
            <div className="success-actions">
              <Link to="/account/bookings" className="btn btn-accent btn-block">
                View my appointments <ArrowRight size={16} />
              </Link>
              <button
                className="btn btn-ghost btn-block"
                onClick={() => {
                  setSuccess(null);
                  navigate('/explore');
                }}
              >
                Keep exploring
              </button>
            </div>
            <p className="success-note">A little reminder will find you before the appointment.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
