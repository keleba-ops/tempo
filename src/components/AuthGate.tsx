import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Modal } from './Modal';
import { Logo } from './Logo';
import { Spinner } from './Loading';
import { IntroTour } from './IntroTour';
import { useAuth } from '../context/AuthContext';
import { browserTimezone } from '../lib/format';
import type { Role } from '../../shared/types';

type Mode = 'register' | 'login' | 'recover';

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * Opens as soon as a signed-out visitor loads the app. Same model as Motshelo: an emailed 6-digit code verifies the
 * email at sign-up and recovery; day to day you sign in with email + your own 6-digit PIN.
 */
export function AuthGate() {
  const { user, loading, login, startRegister, verifyRegister, startRecover, verifyRecover } = useAuth();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [introSeen, setIntroSeen] = useState(() => {
    try { return Boolean(localStorage.getItem('tempo-intro-seen')); } catch { return false; }
  });
  const [mode, setMode] = useState<Mode>(pathname === '/login' ? 'login' : 'register');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [role, setRole] = useState<Role>(params.get('role') === 'owner' ? 'owner' : 'customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (pathname === '/login') setMode('login');
    if (pathname === '/register') setMode('register');
  }, [pathname]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (loading || user) return null;

  function switchMode(next: Mode) {
    setMode(next);
    setStep('details');
    setError('');
    setNotice('');
    setCode('');
    setPin('');
    setPin2('');
  }

  function finishIntro() {
    try { localStorage.setItem('tempo-intro-seen', '1'); } catch { /* ignore */ }
    setIntroSeen(true);
  }

  function goHome(role: Role) {
    const returnTo = params.get('returnTo');
    navigate(returnTo && returnTo.startsWith('/') ? returnTo : role === 'owner' ? '/owner' : '/account', { replace: true });
  }

  async function sendCode() {
    if (mode === 'register') {
      await startRegister({
        name,
        email,
        role,
        timezone: browserTimezone(),
        ...(role === 'owner' ? { businessName } : {}),
      });
    } else {
      await startRecover(email);
    }
    setStep('code');
    setCooldown(60);
    setNotice(`We emailed a 6-digit code to ${email.trim()}. It expires in 10 minutes.`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const signedIn = await login({ email, pin });
        goHome(signedIn.role);
      } else if (step === 'details') {
        await sendCode();
      } else {
        if (pin !== pin2) throw new Error('The two PINs do not match.');
        const done = mode === 'register'
          ? await verifyRegister({ email, code, pin })
          : await verifyRecover({ email, code, pin });
        goHome(done.role);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setError('');
    setSubmitting(true);
    try {
      await sendCode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!introSeen && mode === 'register') return <IntroTour onDone={finishIntro} />;

  const title =
    mode === 'login' ? 'Welcome back' : mode === 'recover' ? 'Reset your PIN' : step === 'code' ? 'Check your email' : 'Create your account';
  const sub =
    mode === 'login'
      ? 'Sign in with your email and 6-digit PIN.'
      : step === 'code'
        ? notice
        : mode === 'recover'
          ? 'Enter your email and we will send you a code to choose a new PIN.'
          : 'Book appointments or manage your business. We will email you a code to verify it is you.';
  const button =
    mode === 'login' ? 'Sign in' : step === 'details' ? 'Send my code' : mode === 'register' ? 'Create account' : 'Save new PIN';

  return (
    <Modal open onClose={() => {}} hideClose size="sm">
      <form className="gate" onSubmit={submit}>
        <Logo />
        <h2 className="gate-title">{title}</h2>
        <p className="gate-sub">{sub}</p>

        {mode !== 'recover' && (
          <div className="gate-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => switchMode('register')}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>Sign in</button>
          </div>
        )}

        {mode === 'register' && step === 'details' && (
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
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" readOnly={step === 'code' && mode !== 'login'} required />
        </label>

        {mode === 'login' && (
          <label className="field-label">PIN (6 digits)
            <input className="input pin-input" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} pattern="\d{6}" value={pin} onChange={(e) => setPin(digits(e.target.value))} required />
          </label>
        )}

        {mode !== 'login' && step === 'code' && (
          <>
            <label className="field-label">Code from your email
              <input className="input pin-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(digits(e.target.value))} required />
            </label>
            <label className="field-label">Choose a 6-digit PIN
              <input className="input pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} pattern="\d{6}" value={pin} onChange={(e) => setPin(digits(e.target.value))} required />
            </label>
            <label className="field-label">Confirm PIN
              <input className="input pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} pattern="\d{6}" value={pin2} onChange={(e) => setPin2(digits(e.target.value))} required />
            </label>
          </>
        )}

        {error && <p className="gate-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={submitting}>
          {submitting ? <Spinner /> : button}
        </button>

        {mode !== 'login' && step === 'code' && (
          <button type="button" className="gate-link" disabled={cooldown > 0 || submitting} onClick={resend}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        )}
        {mode === 'login' && (
          <button type="button" className="gate-link" onClick={() => switchMode('recover')}>Forgot your PIN?</button>
        )}
        {mode === 'recover' && (
          <button type="button" className="gate-link" onClick={() => switchMode('login')}>Back to sign in</button>
        )}
      </form>
    </Modal>
  );
}
