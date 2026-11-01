import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, Sparkles, Store, UserRound } from 'lucide-react';
import { useAuth, saveProfile } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { patch } from '../../lib/api';
import { Avatar } from '../../components/Avatar';
import { Spinner } from '../../components/Loading';
import { GoogleMap } from '../../components/GoogleMap';

import { ChangePinCard } from '../../components/ChangePinCard';
export function AccountSettings() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [city, setCity] = useState(user?.city || 'Gaborone');
  const [saving, setSaving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  if (!user) return null;

  async function handleProfile(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast('Please enter your full name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const data = await saveProfile({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
      });
      updateUser(data.user);
      toast('Your details have been updated.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save your details.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function updatePreference(key: 'emailNotifications' | 'inAppNotifications', value: boolean) {
    if (!user) return;
    const currentUser = user;
    setSavingPrefs(true);
    try {
      const data = await patch<{ user: typeof currentUser }>('/me/preferences', {
        emailNotifications: key === 'emailNotifications' ? value : currentUser.emailNotifications,
        inAppNotifications: key === 'inAppNotifications' ? value : currentUser.inAppNotifications,
      });
      updateUser(data.user);
      toast('Notification settings saved.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your corner of Tempo</div>
          <h1>Settings</h1>
          <p>Your details, your preferences, and how we get in touch.</p>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon"><UserRound size={19} /></span>
              <div>
                <h2>Account details</h2>
                <p>This is how you appear to yourself and in messages from Tempo.</p>
              </div>
            </div>
            <form onSubmit={handleProfile}>
              <div className="profile-edit-row">
                <Avatar name={name || user.name} size="xl" />
                <div>
                  <strong>{name || user.name}</strong>
                  <span className="role-tag">{user.role === 'owner' ? 'Business owner' : 'Customer'}</span>
                  <p>Your initials are used as your profile picture for now.</p>
                </div>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">Full name</span>
                  <input
                    className="input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">Email address</span>
                  <div className="readonly-field"><Mail size={15} /> {user.email}</div>
                  <span className="field-hint">Email changes are not available in the demo.</span>
                </label>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">Phone number</span>
                  <div className="input-with-icon">
                    <Phone size={15} />
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+267 74 000 000" />
                  </div>
                </label>
                <label className="field">
                  <span className="field-label">Town / city</span>
                  <div className="input-with-icon">
                    <MapPin size={15} />
                    <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Gaborone" />
                  </div>
                </label>
              </div>
              <label className="field">
                <span className="field-label">House-call address</span>
                <input
                  className="input"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Plot number, street, area"
                />
                <span className="field-hint">Used to prefill the address whenever you book a house call.</span>
              </label>
              {address.trim().length > 4 && city.trim() && (
                <div className="settings-map">
                  <GoogleMap query={`${address}, ${city}, Botswana`} height={160} compact label="Open address" />
                </div>
              )}
              <div className="settings-form-actions">
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={
                    saving ||
                    (name.trim() === user.name &&
                      phone.trim() === user.phone &&
                      address.trim() === user.address &&
                      city.trim() === user.city)
                  }
                >
                  {saving ? <Spinner /> : 'Save changes'}
                </button>
              </div>
            </form>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon settings-icon-sage"><Bell size={19} /></span>
              <div>
                <h2>Notifications</h2>
                <p>Choose how Tempo keeps you in the loop. Both channels respect these settings.</p>
              </div>
            </div>
            <div className="preference-list preference-list-wide">
              <div className="preference-row">
                <div>
                  <strong>In-app notifications</strong>
                  <span>Updates in your notification center and the bell menu.</span>
                </div>
                <button
                  className={`toggle ${user.inAppNotifications ? 'on' : ''}`}
                  onClick={() => updatePreference('inAppNotifications', !user.inAppNotifications)}
                  disabled={savingPrefs}
                  role="switch"
                  aria-checked={user.inAppNotifications}
                >
                  <span />
                </button>
              </div>
              <div className="preference-row">
                <div>
                  <strong>Email notifications</strong>
                  <span>Confirmations, reminders, and opening alerts to {user.email}.</span>
                </div>
                <button
                  className={`toggle ${user.emailNotifications ? 'on' : ''}`}
                  onClick={() => updatePreference('emailNotifications', !user.emailNotifications)}
                  disabled={savingPrefs}
                  role="switch"
                  aria-checked={user.emailNotifications}
                >
                  <span />
                </button>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon settings-icon-gold"><ShieldCheck size={19} /></span>
              <div>
                <h2>Booking policies</h2>
                <p>A quick refresher on how changes work.</p>
              </div>
            </div>
            <div className="policy-list">
              <div>
                <Check size={15} />
                <span><strong>Free changes up to 12 hours before.</strong> Reschedule or cancel online within that window. Closer to the appointment, contact the business directly.</span>
              </div>
              <div>
                <Check size={15} />
                <span><strong>Your spot is held when you book.</strong> Pending requests hold the time while the business reviews them. If they can't take it, you'll be notified.</span>
              </div>
              <div>
                <Check size={15} />
                <span><strong>Your data stays private.</strong> Businesses never see who favorited them, only when a new opening appears.</span>
              </div>
            </div>
          </section>
        </div>

        <aside className="settings-side">
          {user.role === 'owner' ? (
            <div className="settings-side-card settings-owner-card">
              <span className="side-card-icon"><Store size={19} /></span>
              <h3>Running a business?</h3>
              <p>Your public profile, services, and hours live in the studio dashboard.</p>
              <Link to="/owner/settings" className="btn btn-sm btn-outline btn-block">Open business profile</Link>
            </div>
          ) : (
            <div className="settings-side-card">
              <span className="side-card-icon"><Sparkles size={19} /></span>
              <h3>Make Tempo yours</h3>
              <p>Save your favorite places and watch services to hear about new openings first.</p>
              <Link to="/explore" className="btn btn-sm btn-outline btn-block">Find a favorite</Link>
            </div>
          )}
          <div className="settings-side-card settings-help">
            <LockKeyhole size={18} />
            <h3>Security note</h3>
            <p>Your session is protected by an HTTP-only cookie and lasts up to 30 days. Sign out on shared devices.</p>
          </div>
          <ChangePinCard />
          <div className="settings-support">
            <span>Need a hand?</span>
            <a href="mailto:hello@tempo.local">hello@tempo.local</a>
          </div>
        </aside>
      </div>
    </div>
  );
}
