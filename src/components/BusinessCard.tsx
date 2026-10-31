import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, MapPin, Star } from 'lucide-react';
import type { BusinessSummary } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { post } from '../lib/api';
import { money } from '../lib/format';
import { CategoryIcon } from './CategoryIcon';
import { asset } from '../lib/asset';

export function BusinessCard({
  business,
  nextAvailable,
  onFavoriteChange,
}: {
  business: BusinessSummary;
  nextAvailable?: string | null;
  onFavoriteChange?: (favorited: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [favorite, setFavorite] = useState(business.isFavorite);
  const [busy, setBusy] = useState(false);

  async function toggleFavorite() {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (user.role !== 'customer') {
      toast('Favorites are for customer accounts.', 'info');
      return;
    }
    setBusy(true);
    try {
      const result = await post<{ favorited: boolean }>(`/businesses/${business.id}/favorite`);
      setFavorite(result.favorited);
      onFavoriteChange?.(result.favorited);
      toast(result.favorited ? `${business.name} is in your favorites.` : `Removed ${business.name} from favorites.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update favorites.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="business-card">
      <div className="business-card-media">
        <Link to={`/b/${business.slug}`} aria-label={`View ${business.name}`}>
          <img src={asset(business.coverImage)} alt="" loading="lazy" />
        </Link>
        <span className="business-category">
          <CategoryIcon category={business.category} size={13} />
          {business.category}
        </span>
        {user?.role !== 'owner' && (
          <button
            className={`heart-btn ${favorite ? 'active' : ''}`}
            onClick={toggleFavorite}
            disabled={busy}
            aria-label={favorite ? `Remove ${business.name} from favorites` : `Favorite ${business.name}`}
          >
            <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className="business-card-body">
        <div className="business-card-topline">
          <span className="rating">
            <Star size={13} fill="currentColor" /> {business.rating.toFixed(1)}
            <span className="rating-count">({business.reviewCount})</span>
          </span>
          <span className="business-price">from {money(business.startingPriceCents)}</span>
        </div>
        <Link to={`/b/${business.slug}`} className="business-card-title">
          <h3>{business.name}</h3>
        </Link>
        <p className="business-card-tagline">{business.tagline}</p>
        <div className="business-card-footer">
          <span className="business-location">
            <MapPin size={13} /> {business.city}
          </span>
          {nextAvailable ? (
            <span className="next-opening">
              <span className="pulse-dot" /> Next opening soon
            </span>
          ) : (
            <span className="service-count">{business.serviceCount} services</span>
          )}
        </div>
      </div>
    </article>
  );
}
