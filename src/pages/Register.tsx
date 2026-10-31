import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Check,
  Eye,
  EyeOff,
  Heart,
  LockKeyhole,
  Mail,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';
import type { Role } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Logo } from '../components/Logo';
import { BuiltBy } from '../components/BuiltBy';
import { Spinner } from '../components/Loading';
import { browserTimezone } from '../lib/format';
import { TIMEZONES } from '../lib/timezones';
import { asset } from '../lib/asset';

export function Register() {
  const { user, loading: authLoading, register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const initialRole = searchParams.get('role') === 'owner' ? 'owner' : 'customer';
  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [timezone, setTimezone] = useState('Africa/Gaborone');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const zones = useMemo(() => {
    const current = browserTimezone();
    return TIMEZONES.includes(current) ? TIMEZONES : [current, ...TIMEZONES];
  }, []);

  const destination = returnTo && returnTo.startsWith('/') ? returnTo : null;

  useEffect(() => {
    if (authLoading || !user) return;
    navigate(user.role === 'owner' ? '/owner' : destination || '/account', { replace: true });
  }, [authLoading, user, destination, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (role === 'owner' && !businessName.trim()) {
      setError('Add your business name to create an owner account.');
      return;
    }
    setSubmitting(true);
    try {
      const signedIn = await register({
        name: name.trim(),
        email: email.trim(),
        role,
        ...(role === 'owner' ? { businessName: businessName.trim(), timezone } : {}),
      });
      toast(
        role === 'owner'
          ? 'Your studio is ready. Add your first service to start taking bookings.'
          : 'Welcome to Tempo. Your next good hour starts here.',
      );
      navigate(role === 'owner' ? '/owner' : destination || '/account', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  }

  const loginLink = `/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;

  return (
    <div className="auth-page register-page">
      <div className="auth-visual register-visual">
        <img
          src={role === 'owner' ? asset('/images/spa.jpg') : asset('/images/nails.jpg')}
          alt={role === 'owner' ? 'A welcoming independent studio' : 'A considered nail studio'}
        />
        <div className="auth-visual-shade" />
        <div className="auth-visual-top">
          <Logo light />
          <Link to="/explore" className="auth-visual-link">Explore places</Link>
        </div>
        <div className="auth-visual-copy">
          <span className="auth-kicker">
            <Sparkles size={13} /> {role === 'owner' ? 'For the ones behind the craft' : 'The good part of the week'}
          </span>
          {role === 'owner' ? (
            <>
              <h1>A calmer way<br /><em>to run the diary.</em></h1>
              <p>Set your hours once. Take the bookings that fit. Spend the rest of your time on the work you love.</p>
            </>
          ) : (
            <>
              <h1>Your next favorite<br /><em>place is close.</em></h1>
              <p>Book thoughtful local businesses, keep your favorites close, and never miss a good opening.</p>
            </>
          )}
        </div>
        <div className="register-benefits">
          {(role === 'owner'
            ? [
                { icon: CalendarCheck, text: 'Availability, buffers, and exceptions handled for you' },
                { icon: BellRing, text: 'Cancellations automatically alert your waitlist' },
                { icon: Check, text: 'Approve bookings or let them book instantly' },
              ]
            : [
                { icon: CalendarCheck, text: 'Real openings, no back-and-forth messaging' },
                { icon: Heart, text: 'Save favorites and hear about new openings' },
                { icon: BellRing, text: 'In-app and email reminders before every visit' },
              ]
          ).map(({ icon: Icon, text }) => (
            <div key={text}>
              <span><Icon size={16} /></span>
              {text}
            </div>
          ))}
        </div>
        <div className="auth-visual-bottom">
          <div className="avatar-stack">
            <span className="avatar avatar-sm" style={{ background: '#c9633f' }}>MC</span>
            <span className="avatar avatar-sm" style={{ background: '#64775d' }}>NW</span>
            <span className="avatar avatar-sm" style={{ background: '#9c6b53' }}>EP</span>
          </div>
          <span>Join the independent businesses across Botswana doing time differently.</span>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form-top">
          <Link to="/" className="text-link">Back home</Link>
          <span>Already have an account? <Link to={loginLink}>Sign in</Link></span>
        </div>
        <div className="auth-form-wrap register-form-wrap">
          <div className="eyebrow">Create your account</div>
          <h2>Let's make some room.</h2>
          <p className="auth-sub">A few details and you're in. No credit card, no fuss.</p>

          <div className="role-switch" role="tablist" aria-label="Account type">
            <button
              type="button"
              role="tab"
              aria-selected={role === 'customer'}
              className={role === 'customer' ? 'active' : ''}
              onClick={() => setRole('customer')}
            >
              <UserRound size={16} />
              I'm booking
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={role === 'owner'}
              className={role === 'owner' ? 'active' : ''}
              onClick={() => setRole('owner')}
            >
              <Store size={16} />
              I run a business
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="form-error">{error}</div>}
            <label className="field">
              <span className="field-label">Full name</span>
              <div className="input-with-icon">
                <UserRound size={17} />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                  minLength={2}
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Email address</span>
              <div className="input-with-icon">
                <Mail size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>
            {role === 'owner' && (
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">Business name</span>
                  <div className="input-with-icon">
                    <Store size={17} />
                    <input
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder="e.g. Kgotla Barber Co."
                      required
                    />
                  </div>
                </label>
                <label className="field">
                  <span className="field-label">Timezone</span>
                  <select className="select" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                    {zones.map((zone) => (
                      <option value={zone} key={zone}>{zone.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="field-hint">We'll create a temporary password for you on the next screen, then you'll choose your own.</p>
            <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={submitting}>
              {submitting ? <Spinner /> : <>Create account <ArrowRight size={17} /></>}
            </button>
            <p className="auth-terms">
              By creating an account you agree to Tempo's <a href="#top">Terms</a> and{' '}
              <a href="#top">Privacy Policy</a>.
            </p>
          </form>

          <div className="auth-bottom-links">
            <Link to={loginLink}>Returning? Sign in</Link>
            <span>·</span>
            <Link to="/explore">Browse places</Link>
          </div>
        </div>
        <BuiltBy className="auth-credit" />
      </div>
    </div>
  );
}
