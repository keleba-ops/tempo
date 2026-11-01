import { useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { Modal } from './Modal';
import { Spinner } from './Loading';
import { saveProfile, useAuth } from '../context/AuthContext';
import { BOTSWANA_CITIES } from '../lib/cities';

export function needsSetup(user: { city: string; address: string } | null): boolean {
  return Boolean(user && (!user.city.trim() || !user.address.trim()));
}

/** Forced first-run step: give a location so nearby providers can be shown. */
export function SetupFlow() {
  const { user, updateUser } = useAuth();
  const [city, setCity] = useState(user?.city || 'Gaborone');
  const [address, setAddress] = useState(user?.address || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user || !needsSetup(user)) return null;
  async function submitLocation(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (address.trim().length < 3) return setError('Please enter your street address or area.');
    setBusy(true);
    try {
      const data = await saveProfile({ address: address.trim(), city, applyToBusiness: user?.role === 'owner' });
      updateUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your location.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => {}} hideClose size="sm">
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
    </Modal>
  );
}
