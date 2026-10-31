import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarCheck,
  CalendarDays,
  Check,
  Heart,
  Home,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import type { BusinessSummary } from '../../shared/types';
import { get } from '../lib/api';
import { BusinessCard } from '../components/BusinessCard';
import { CategoryIcon } from '../components/CategoryIcon';
import { Avatar } from '../components/Avatar';
import { SkeletonCard } from '../components/Loading';
import { asset } from '../lib/asset';

interface Category {
  name: string;
  count: number;
}

export function Landing() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<{ businesses: BusinessSummary[]; categories: Category[] }>('/businesses')
      .then((data) => {
        setBusinesses(data.businesses);
        setCategories(data.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    navigate(`/explore${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  }

  return (
    <div className="landing" id="top">
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="eyebrow-icon">
                <Sparkles size={13} />
              </span>
              Thoughtful booking for Botswana's independent businesses
            </div>
            <h1>
              Make room for
              <br />
              <em>the good stuff.</em>
            </h1>
            <p className="hero-sub">
              Discover the neighborhood places worth your time, find an opening that fits your day, and book it in
              a few unhurried clicks.
            </p>
            <form className="hero-search" onSubmit={handleSearch}>
              <div className="hero-search-field">
                <Search size={19} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try “haircut”, “massage”, “Gaborone”…"
                  aria-label="Search businesses and services"
                />
              </div>
              <button type="submit" className="btn btn-accent hero-search-btn">
                Find a time <ArrowRight size={17} />
              </button>
            </form>
            <div className="hero-quick-links">
              <span>Popular:</span>
              {['Barbering', 'Wellness', 'Nails'].map((category) => (
                <Link key={category} to={`/explore?category=${encodeURIComponent(category)}`}>
                  {category}
                </Link>
              ))}
            </div>
            <div className="hero-proof">
              <div className="avatar-stack">
                <Avatar name="Tebogo Motaung" size="sm" />
                <Avatar name="Naledi Phiri" size="sm" />
                <Avatar name="Kabelo Dintwa" size="sm" />
                <span className="avatar-more">+2k</span>
              </div>
              <div>
                <div className="hero-stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} size={12} fill="currentColor" />
                  ))}
                  <strong>4.9</strong>
                </div>
                <span>Loved by people who care where they spend their time.</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image-wrap">
              <img src={asset('/images/barber.jpg')} alt="A warm, welcoming barbershop interior" />
              <div className="hero-image-tint" />
              <div className="hero-float-card hero-float-confirm">
                <span className="float-check">
                  <Check size={16} />
                </span>
                <div>
                  <strong>You’re booked.</strong>
                  <span>Sat, Nov 1 · 10:30 AM</span>
                </div>
              </div>
              <div className="hero-float-card hero-float-slot">
                <div className="float-slot-top">
                  <span className="live-dot" />
                  New opening
                </div>
                <strong>Kgotla Barber Co.</strong>
                <span>Signature Cut · 45 min</span>
                <div className="float-slot-row">
                  <span>Tomorrow</span>
                  <span className="mini-time">9:00 AM</span>
                </div>
              </div>
              <div className="hero-float-card hero-float-favorite">
                <Heart size={15} fill="currentColor" />
                <span>Saved to favorites</span>
              </div>
            </div>
            <div className="hero-note">
              <span className="hero-note-line" />
              <span>One quiet calendar for your favorite places.</span>
            </div>
          </div>
        </div>
        <div className="container hero-marquee">
          <div className="marquee-label">Made for</div>
          <div className="marquee-items">
            <span>Barbers</span>
            <span className="marquee-dot">✦</span>
            <span>Bodyworkers</span>
            <span className="marquee-dot">✦</span>
            <span>Nail artists</span>
            <span className="marquee-dot">✦</span>
            <span>Coaches</span>
            <span className="marquee-dot">✦</span>
            <span>Hairstylists</span>
            <span className="marquee-dot">✦</span>
            <span>Yoga teachers</span>
          </div>
        </div>
      </section>

      <section className="section featured-section">
        <div className="container">
          <div className="section-heading-row">
            <div>
              <div className="eyebrow">A few good places</div>
              <h2>Independent, excellent,<br />and taking bookings.</h2>
            </div>
            <Link to="/explore" className="text-arrow">
              Explore all places <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="business-grid">
            {loading
              ? Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)
              : businesses.slice(0, 4).map((business) => (
                  <BusinessCard key={business.id} business={business} />
                ))}
          </div>
        </div>
      </section>

      <section className="category-band">
        <div className="container">
          <div className="category-band-head">
            <div>
              <div className="eyebrow">Find your next hour</div>
              <h2>What are you in the mood for?</h2>
            </div>
            <p>From a fresh fade to a full reset — the good ones are closer than you think.</p>
          </div>
          <div className="category-grid">
            {categories.length > 0
              ? categories.map((category, index) => (
                  <Link
                    key={category.name}
                    to={`/explore?category=${encodeURIComponent(category.name)}`}
                    className={`category-tile category-tile-${index + 1}`}
                  >
                    <span className="category-icon">
                      <CategoryIcon category={category.name} size={24} />
                    </span>
                    <span className="category-name">{category.name}</span>
                    <span className="category-count">{category.count} places</span>
                    <ArrowUpRight size={17} className="category-arrow" />
                  </Link>
                ))
              : ['Barbering', 'Wellness', 'Nails', 'Fitness', 'Hair'].map((name, index) => (
                  <Link
                    key={name}
                    to={`/explore?category=${encodeURIComponent(name)}`}
                    className={`category-tile category-tile-${index + 1}`}
                  >
                    <span className="category-icon">
                      <CategoryIcon category={name} size={24} />
                    </span>
                    <span className="category-name">{name}</span>
                    <ArrowUpRight size={17} className="category-arrow" />
                  </Link>
                ))}
          </div>
        </div>
      </section>

      <section className="botswana-band">
        <div className="container botswana-band-grid">
          <div className="botswana-band-image">
            <img src={asset('/images/gaborone.jpg')} alt="Gaborone city skyline at golden hour" />
            <span className="botswana-band-stamp">Proudly<br />Botswana</span>
          </div>
          <div className="botswana-band-copy">
            <div className="eyebrow">Made locally</div>
            <h2>Good businesses,<br /><em>close to home.</em></h2>
            <p>
              From a fade in Gaborone to a house-call massage in Phakalane, a nail appointment in Francistown or a
              strength session in Maun — Tempo is built for the way business happens here.
            </p>
            <div className="botswana-cities">
              <span><span className="pulse-dot" /> Gaborone</span>
              <span>Francistown</span>
              <span>Maun</span>
              <span>And beyond</span>
            </div>
            <Link to="/explore" className="btn btn-dark">
              Find a local place <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section how-section" id="how-it-works">
        <div className="container">
          <div className="how-intro">
            <div className="eyebrow">How Tempo works</div>
            <h2>Less admin.<br /><em>More living.</em></h2>
            <p>
              The booking experience should feel like a deep breath — for the person booking and the person behind
              the chair.
            </p>
          </div>
          <div className="how-steps">
            <div className="how-step">
              <div className="step-top">
                <span className="step-number">01</span>
                <span className="step-icon"><Search size={20} /></span>
              </div>
              <h3>Find a place that feels right</h3>
              <p>Browse independent businesses by craft, neighborhood, or the kind of afternoon you want to have.</p>
            </div>
            <div className="how-step">
              <div className="step-top">
                <span className="step-number">02</span>
                <span className="step-icon"><CalendarDays size={20} /></span>
              </div>
              <h3>See only real openings</h3>
              <p>We compute availability from working hours, booked appointments, and breathing room — so every time you see is truly free.</p>
            </div>
            <div className="how-step">
              <div className="step-top">
                <span className="step-number">03</span>
                <span className="step-icon"><BellRing size={20} /></span>
              </div>
              <h3>Book it. Then let it go.</h3>
              <p>Confirmation, reminders, and little alerts when a favorite place opens up — all in one calm place.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section experience-section">
        <div className="container experience-grid">
          <div className="experience-visual">
            <img src={asset('/images/spa.jpg')} alt="A calm treatment room" />
            <div className="experience-badge">
              <span><Heart size={16} fill="currentColor" /></span>
              <div>
                <strong>Favorite places</strong>
                <p>We’ll tell you the moment a spot opens up.</p>
              </div>
            </div>
            <div className="experience-calendar-card">
              <div className="mini-cal-head">
                <span>October</span>
                <span className="mini-cal-dots">•••</span>
              </div>
              <div className="mini-cal-grid">
                {Array.from({ length: 21 }).map((_, index) => (
                  <span
                    key={index}
                    className={`mini-cal-day ${index === 11 ? 'selected' : ''} ${index === 5 || index === 13 ? 'dot' : ''}`}
                  >
                    {index + 1 <= 21 ? index + 1 : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="experience-copy">
            <div className="eyebrow">Your side of the story</div>
            <h2>A calendar that<br /><em>knows you.</em></h2>
            <p className="experience-lead">
              Keep every appointment, favorite place, and last-minute opening in one place. Tempo remembers the
              details so you don’t have to.
            </p>
            <ul className="feature-list">
              <li>
                <span className="feature-check"><Check size={14} /></span>
                <div>
                  <strong>Book without the back-and-forth</strong>
                  <span>Real availability, clear policies, no phone tag.</span>
                </div>
              </li>
              <li>
                <span className="feature-check"><Check size={14} /></span>
                <div>
                  <strong>First dibs on the good times</strong>
                  <span>Favorites and watched services get notified the moment a cancellation opens a spot.</span>
                </div>
              </li>
              <li>
                <span className="feature-check"><Check size={14} /></span>
                <div>
                  <strong>Reminders that actually help</strong>
                  <span>A gentle nudge in-app and by email before every appointment.</span>
                </div>
              </li>
              <li>
                <span className="feature-check"><Check size={14} /></span>
                <div>
                  <strong>A direct line to the business</strong>
                  <span>Message the owner about a booking, a reference, or your house-call address.</span>
                </div>
              </li>
            </ul>
            <div className="experience-actions">
              <Link to="/register" className="btn btn-dark">
                Start booking <ArrowRight size={16} />
              </Link>
              <Link to="/login?role=customer" className="text-link">
                Try the Tebogo demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section quote-section">
        <div className="container">
          <div className="quote-card">
            <div className="quote-mark">“</div>
            <blockquote>
              The booking part used to eat my Sundays. Now my clients find their own time, my calendar respects my
              buffers, and I get to just cut hair.
            </blockquote>
            <div className="quote-person">
              <Avatar name="Kagiso Mothibi" size="lg" />
              <div>
                <strong>Kagiso Mothibi</strong>
                <span>Owner, Kgotla Barber Co. · Gaborone</span>
              </div>
              <div className="quote-stars">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} size={14} fill="currentColor" />
                ))}
              </div>
            </div>
            <div className="quote-stamp">
              <span className="stamp-ring">
                <CalendarCheck size={26} />
              </span>
              <span>Booking<br />with care<br />since 2024</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section owner-cta-section">
        <div className="container">
          <div className="owner-cta">
            <div className="owner-cta-copy">
              <div className="eyebrow eyebrow-light">For independent business owners</div>
              <h2>Your craft deserves<br /><em>a better calendar.</em></h2>
              <p>
                Set your hours once. Add your services and buffers. Let Tempo handle the requests, reminders, and
                the awkward “do you have anything Saturday?” messages.
              </p>
              <div className="owner-cta-points">
                <span><ShieldCheck size={16} /> No double-bookings, ever</span>
                <span><CalendarCheck size={16} /> Approve bookings your way</span>
                <span><Home size={16} /> House calls with maps</span>
                <span><MessageCircle size={16} /> Message customers directly</span>
              </div>
              <div className="owner-cta-actions">
                <Link to="/register?role=owner" className="btn btn-light">
                  List your business <ArrowRight size={16} />
                </Link>
                <Link to="/login?role=owner" className="owner-login-link">
                  Owner sign in
                </Link>
              </div>
            </div>
            <div className="owner-cta-visual">
              <img src={asset('/images/studio.jpg')} alt="An independent salon interior" />
              <div className="owner-dash-float">
                <div className="owner-dash-head">
                  <span>This week</span>
                  <span className="owner-dash-live"><span /> Live</span>
                </div>
                <div className="owner-dash-value">18 bookings</div>
                <div className="owner-dash-bars">
                  {[32, 58, 43, 72, 86, 51, 28].map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} className={index === 4 ? 'active' : ''} />
                  ))}
                </div>
                <div className="owner-dash-days">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={index}>{day}</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container final-cta-inner">
          <div>
            <span className="eyebrow">Your time is worth protecting</span>
            <h2>Go make something<br /><em>of the afternoon.</em></h2>
          </div>
          <div className="final-cta-actions">
            <Link to="/explore" className="btn btn-accent btn-lg">
              Find a place <ArrowUpRight size={18} />
            </Link>
            <span>or <Link to="/register?role=owner">list your business</Link></span>
          </div>
        </div>
      </section>
    </div>
  );
}
