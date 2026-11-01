import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Loading';

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/** Not a <form>: it sits inside the owner settings form. */
export function ChangePinCard() {
  const { changePin } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (next !== confirm) return setError('The two new PINs do not match.');
    setBusy(true);
    try {
      await changePin(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      toast('Your PIN has been changed. Other devices were signed out.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your PIN.');
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <label className="field-label">{label}
      <input className="input pin-input" type="password" inputMode="numeric" maxLength={6} autoComplete={auto} value={value} onChange={(e) => set(digits(e.target.value))} />
    </label>
  );

  return (
    <div className="settings-note pin-card">
      <h3><KeyRound size={15} /> Change your PIN</h3>
      {field('Current PIN', current, setCurrent, 'current-password')}
      {field('New PIN', next, setNext, 'new-password')}
      {field('Confirm new PIN', confirm, setConfirm, 'new-password')}
      {error && <p className="gate-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-sm btn-outline btn-block" disabled={busy || current.length < 6 || next.length < 6} onClick={() => void save()}>
        {busy ? <Spinner /> : 'Change PIN'}
      </button>
    </div>
  );
}
