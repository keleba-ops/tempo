import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Logo } from '../components/Logo';
import { BuiltBy } from '../components/BuiltBy';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Loading';
import { asset } from '../lib/asset';

const DEMOS = {
  customer: { email: 'tebogo@tempo.demo', password: 'demo1234', name: 'Tebogo Motaung' },
  owner: { email: 'kagiso@tempo.demo', password: 'demo1234', name: 'Kagiso Mothibi' },
};

export function Login() {
  const { user, loading: authLoading, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState<'customer' | 'owner' | null>(null);

  const destination = returnTo && returnTo.startsWith('/') ? returnTo : null;

  useEffect(() => {
    if (authLoading || !user) return;
    const target = destination || (user.role === 'owner' ? '/owner' : '/account');
    navigate(target, { replace: true });
  }, [authLoading, user, destination, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const signedIn = await login({ email: email.trim(), password });
      toast(`Welcome back, ${signedIn.name.split(' ')[0]}.`);
      navigate(destination || (signedIn.role === 'owner' ? '/owner' : '/account'), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function demoLogin(role: 'customer' | 'owner') {
    setError('');
    setDemoLoading(role);
    try {
      const signedIn = await login({ email: DEMOS[role].email, password: DEMOS[role].password });
      toast(
        role === 'owner' ? 'Signed in as Kagiso — welcome to your studio.' : 'Signed in as Tebogo — happy booking.',
      );
      navigate(role === 'owner' ? '/owner' : destination || '/account', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the demo.');
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <img src={asset('/images/studio.jpg')} alt="A calm, independent salon" />
        <div className="auth-visual-shade" />
        <div className="auth-visual-top">
          <Logo light />
          <Link to="/explore" className="auth-visual-link">Explore places</Link>
        </div>
        <div className="auth-visual-copy">
          <span className="auth-kicker"><Sparkles size={13} /> The good part of the week</span>
          <h1>Your time,<br /><em>well kept.</em></h1>
          <p>One place for the appointments, people, and places that make your week feel like yours — across Botswana.</p>
        </div>
        <div className="auth-visual-card">
          <div className="auth-quote-mark">“</div>
          <p>
            I used to keep everything in my head. Now my clients book, my calendar breathes, and I actually take a
            lunch.
          </p>
          <div className="auth-quote-person">
            <Avatar name="Kagiso Mothibi" size="sm" />
            <div>
              <strong>Kagiso Mothibi</strong>
              <span>Kgotla Barber Co. · Gaborone</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form-top">
          <Link to="/" className="text-link">Back home</Link>
          <span>New to Tempo? <Link to={`/register${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}>Create an account</Link></span>
        </div>
        <div className="auth-form-wrap">
          <div className="eyebrow">Welcome back</div>
          <h2>Good to see you.</h2>
          <p className="auth-sub">Sign in to pick up where you left off.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="form-error">{error}</div>}
            <label className="field">
              <span className="field-label">Email address</span>
              <div className="input-with-icon">
                <UserRound size={17} />
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
            <label className="field">
              <span className="field-label">Password</span>
              <div className="input-with-icon">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((show) => !show)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <div className="auth-session-note">
              <ShieldCheck size={13} /> A secure session, kept for up to 30 days.
            </div>
            <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={submitting}>
              {submitting ? <Spinner /> : <>Sign in <ArrowRight size={17} /></>}
            </button>
          </form>

          <div className="auth-divider"><span>or step into a demo</span></div>
          <div className="demo-accounts">
            <button className="demo-card" onClick={() => demoLogin('customer')} disabled={Boolean(demoLoading)}>
              <Avatar name={DEMOS.customer.name} size="md" />
              <div>
                <span>Customer demo</span>
                <strong>Tebogo Motaung</strong>
              </div>
              {demoLoading === 'customer' ? <Spinner size={16} /> : <ArrowRight size={16} />}
            </button>
            <button className="demo-card" onClick={() => demoLogin('owner')} disabled={Boolean(demoLoading)}>
              <Avatar name={DEMOS.owner.name} size="md" />
              <div>
                <span>Business owner demo</span>
                <strong>Kagiso Mothibi</strong>
              </div>
              {demoLoading === 'owner' ? <Spinner size={16} /> : <ArrowRight size={16} />}
            </button>
          </div>
          <p className="demo-note">
            <ShieldCheck size={13} /> Demo accounts are pre-filled with bookings, favorites, and a full calendar.
          </p>

          <div className="auth-bottom-links">
            <Link to={`/register?role=owner${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`}>
              I run a business
            </Link>
            <span>·</span>
            <Link to="/explore">Browse places</Link>
          </div>
        </div>
        <BuiltBy className="auth-credit" />
      </div>
    </div>
  );
}
