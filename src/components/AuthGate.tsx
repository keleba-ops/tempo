import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { Logo } from './Logo';
import { Spinner } from './Loading';
import { IntroTour } from './IntroTour';
import { useAuth } from '../context/AuthContext';
import { browserTimezone } from '../lib/format';
import type { Role } from '../../shared/types';

/** Opens as soon as a signed-out visitor loads the app: create an account or sign in. */
export function AuthGate() {
  const { user, loading, login, register } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [introSeen, setIntroSeen] = useState(() => {
    try { return Boolean(localStorage.getItem('tempo-intro-seen')); } catch { return false; }
  });
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [role, setRole] = useState<Role>('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The dedicated pages handle their own forms.
  if (loading || user || pathname === '/login' || pathname === '/register') return null;

  function finishIntro() {
    try { localStorage.setItem('tempo-intro-seen', '1'); } catch { /* ignore */ }
    setIntroSeen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (password.length < 8) throw new Error('Your password needs at least 8 characters.');
        const created = await register({
          name,
          email,
          password,
          role,
          timezone: browserTimezone(),
          ...(role === 'owner' ? { businessName } : {}),
        });
        navigate(created.role === 'owner' ? '/owner' : '/account', { replace: true });
      } else {
        const signedIn = await login({ email, password });
        navigate(signedIn.role === 'owner' ? '/owner' : '/account', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!introSeen) return <IntroTour onDone={finishIntro} />;

  return (
    <Modal open onClose={() => {}} hideClose size="sm">
      <form className="gate" onSubmit={submit}>
        <Logo />
        <h2 className="gate-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="gate-sub">
          {mode === 'register'
            ? 'Book appointments or manage your business. It takes under a minute.'
            : 'Sign in to see your bookings and messages.'}
        </p>

        <div className="gate-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
        </div>

        {mode === 'register' && (
          <>
            <div className="gate-roles">
              <button type="button" className={role === 'customer' ? 'on' : ''} onClick={() => setRole('customer')}>
                <strong>I want to book</strong><span>Find and book appointments</span>
              </button>
              <button type="button" className={role === 'owner' ? 'on' : ''} onClick={() => setRole('owner')}>
                <strong>I run a business</strong><span>Take bookings from clients</span>
              </button>
            </div>
            <label className="field-label">Full name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            {role === 'owner' && (
              <label className="field-label">Business name
                <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
              </label>
            )}
          </>
        )}

        <label className="field-label">Email
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field-label">Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
        </label>

        {error && <p className="gate-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={submitting}>
          {submitting ? <Spinner /> : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </Modal>
  );
}
