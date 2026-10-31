import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, MapPin } from 'lucide-react';
import { Modal } from './Modal';
import { Spinner } from './Loading';
import { saveProfile, useAuth } from '../context/AuthContext';
import { BOTSWANA_CITIES } from '../lib/cities';

export function needsSetup(user: { mustChangePassword?: boolean; city: string; address: string } | null): boolean {
  return Boolean(user && (user.mustChangePassword || !user.city.trim() || !user.address.trim()));
}

/** Forced first-run steps: replace the temporary password, then give a location so nearby providers can be shown. */
export function SetupFlow() {
  const { user, temporaryPassword, changePassword, updateUser, logout } = useAuth();
  const [current, setCurrent] = useState(temporaryPassword ?? '');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [city, setCity] = useState(user?.city || 'Gaborone');
  const [address, setAddress] = useState(user?.address || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // The component mounts before sign-up finishes, so fill the field once the temporary password arrives.
  useEffect(() => {
    if (temporaryPassword) setCurrent((value) => value || temporaryPassword);
  }, [temporaryPassword]);

  if (!user || !needsSetup(user)) return null;
  const passwordStep = Boolean(user.mustChangePassword);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (next !== confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  async function submitLocation(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (address.trim().length < 3) return setError('Please enter your street address or area.');
    setBusy(true);
    try {
      const data = await saveProfile({ address: address.trim(), city });
      updateUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your location.');
    } finally {
      setBusy(false);
    }
  }

  async function copyTemp() {
    try {
      await navigator.clipboard.writeText(temporaryPassword ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <Modal open onClose={() => {}} hideClose size="sm">
      {passwordStep ? (
        <form className="gate" onSubmit={submitPassword}>
          <div className="wizard-icon"><KeyRound size={26} /></div>
          <h2 className="gate-title">Set your own password</h2>
          <p className="gate-sub">We created a temporary password for your account. Choose your own now to keep it secure.</p>
          {temporaryPassword && (
            <div className="temp-pass">
              <span>Your temporary password</span>
              <strong>{temporaryPassword}</strong>
              <button type="button" className="btn btn-ghost" onClick={copyTemp}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>
          )}
          <label className="field-label">Temporary password
            <input className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field-label">New password
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          <label className="field-label">Confirm new password
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {error && <p className="gate-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={busy}>
            {busy ? <Spinner /> : 'Save password'}
          </button>
          <button type="button" className="gate-link" onClick={() => void logout()}>Sign out</button>
        </form>
      ) : (
        <form className="gate" onSubmit={submitLocation}>
          <div className="wizard-icon"><MapPin size={26} /></div>
          <h2 className="gate-title">{user.role === 'owner' ? 'Where is your business?' : 'Where are you?'}</h2>
          <p className="gate-sub">
            {user.role === 'owner'
              ? 'Clients near you will find your business first.'
              : 'We use this to show providers near you first.'}
          </p>
          <label className="field-label">City or town
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              {BOTSWANA_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field-label">{user.role === 'owner' ? 'Business address' : 'Street address or area'}
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Plot 123, Main Mall" autoComplete="street-address" required />
          </label>
          {error && <p className="gate-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={busy}>
            {busy ? <Spinner /> : 'Save location'}
          </button>
        </form>
      )}
    </Modal>
  );
}
