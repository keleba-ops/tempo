import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ArrowRight, Bell, BellRing, CalendarDays, Heart, MapPin, Sparkles, Star, X } from 'lucide-react';
import type { FavoritesResponse } from '../../../shared/types';
import { get, post } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { BusinessCard } from '../../components/BusinessCard';
import { EmptyState } from '../../components/EmptyState';
import { PageLoader, Spinner } from '../../components/Loading';
import { formatDate, formatTime } from '../../lib/format';

export function AccountFavorites() {
  const { toast } = useToast();
  const [favorites, setFavorites] = useState<FavoritesResponse>({ businesses: [], services: [] });
  const [loading, setLoading] = useState(true);
  const [busyService, setBusyService] = useState<string | null>(null);

  useEffect(() => {
    get<FavoritesResponse>('/me/favorites')
      .then(setFavorites)
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not load favorites.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function unwatch(serviceId: string) {
    setBusyService(serviceId);
    try {
      await post(`/services/${serviceId}/watch`);
      setFavorites((current) => ({
        ...current,
        services: current.services.filter((service) => service.serviceId !== serviceId),
      }));
      toast('Stopped watching that service.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update alerts.', 'error');
    } finally {
      setBusyService(null);
    }
  }

  if (loading) return <PageLoader label="Opening your favorites" />;

  return (
    <div className="favorites-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Keep the good ones close</div>
          <h1>Your favorites</h1>
          <p>Places you love, services you're watching, and first word when a spot opens up.</p>
        </div>
        <Link to="/explore" className="btn btn-dark">
          Find more places <ArrowRight size={16} />
        </Link>
      </div>

      <div className="favorite-summary-row">
        <div className="favorite-summary">
          <span className="summary-icon"><Heart size={18} fill="currentColor" /></span>
          <div><strong>{favorites.businesses.length}</strong><span>Favorite places</span></div>
        </div>
        <div className="favorite-summary">
          <span className="summary-icon summary-icon-sage"><BellRing size={18} /></span>
          <div><strong>{favorites.services.length}</strong><span>Services watched</span></div>
        </div>
        <div className="favorite-summary favorite-summary-note">
          <Sparkles size={18} />
          <p>When a cancellation opens a spot at a favorite, you'll get first word in-app and by email.</p>
        </div>
      </div>

      {favorites.businesses.length > 0 ? (
        <div className="favorites-grid">
          {favorites.businesses.map((business) => (
            <div className="favorite-card-wrap" key={business.id}>
              <BusinessCard
                business={business}
                nextAvailable={business.nextAvailable}
                onFavoriteChange={(favorited) => {
                  if (!favorited) {
                    setFavorites((current) => ({
                      ...current,
                      businesses: current.businesses.filter((item) => item.id !== business.id),
                    }));
                  }
                }}
              />
              {business.nextAvailable && (
                <div className="next-opening-bar">
                  <span className="live-dot" />
                  <span>
                    Next opening <strong>{formatDate(business.nextAvailable, business.timezone)}</strong> at{' '}
                    <strong>{formatTime(business.nextAvailable, business.timezone)}</strong>
                  </span>
                  <Link to={`/b/${business.slug}`}>Book it <ArrowRight size={13} /></Link>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart size={25} />}
          title="Your favorites list is wide open"
          description="Tap the heart on any place you love. We'll keep it here and let you know when a new opening appears."
          action={<Link to="/explore" className="btn btn-dark">Explore places</Link>}
        />
      )}

      <section className="watched-section panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">First in line</div>
            <h2>Services you're watching</h2>
          </div>
          <span className="watched-note"><Bell size={14} /> Alerts on new openings</span>
        </div>
        {favorites.services.length > 0 ? (
          <div className="watched-list">
            {favorites.services.map((service) => (
              <div className="watched-item" key={service.id}>
                <span className="watched-icon"><BellRing size={17} /></span>
                <div>
                  <strong>{service.serviceName}</strong>
                  <Link to={`/b/${service.businessSlug}`}>{service.businessName}</Link>
                </div>
                <span className="watched-status"><span className="pulse-dot" /> Watching</span>
                <button
                  className="icon-btn"
                  onClick={() => unwatch(service.serviceId)}
                  disabled={busyService === service.serviceId}
                  aria-label={`Stop watching ${service.serviceName}`}
                >
                  {busyService === service.serviceId ? <Spinner size={15} /> : <X size={16} />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="watched-empty">
            <CalendarDays size={22} />
            <div>
              <strong>No services watched yet</strong>
              <p>Use the bell icon on any service to get an alert when a spot opens.</p>
            </div>
            <Link to="/explore" className="btn btn-sm btn-outline">Browse services</Link>
          </div>
        )}
      </section>

      <div className="favorites-note">
        <Star size={18} />
        <p>Favorites are private. Businesses never see who saved them — they just see the open hours fill.</p>
      </div>
    </div>
  );
}
