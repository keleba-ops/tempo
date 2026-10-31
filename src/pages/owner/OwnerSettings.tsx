import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  Globe2,
  Image as ImageIcon,
  MapPin,
  Phone,
  Save,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import type { BusinessDetail } from '../../../shared/types';
import { get, put } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { PageLoader, Spinner } from '../../components/Loading';
import { CATEGORY_OPTIONS } from '../../lib/categories';
import { TIMEZONES } from '../../lib/timezones';
import { money } from '../../lib/format';
import { asset } from '../../lib/asset';

const COVER_OPTIONS = [
  { src: '/images/barber.jpg', label: 'Barbershop' },
  { src: '/images/studio.jpg', label: 'Studio' },
  { src: '/images/spa.jpg', label: 'Wellness' },
  { src: '/images/hair.jpg', label: 'Salon' },
  { src: '/images/nails.jpg', label: 'Nails' },
  { src: '/images/training.jpg', label: 'Fitness' },
  { src: '/images/yoga.jpg', label: 'Yoga' },
  { src: '/images/hero.jpg', label: 'Minimal' },
];

const ACCENTS = ['#b65b3d', '#6e7d67', '#c18772', '#5b6d5a', '#8d5d49', '#a9774c', '#486173', '#8b5e6d'];

interface FormState {
  name: string;
  category: string;
  tagline: string;
  description: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  coverImage: string;
  accentColor: string;
  approvalRequired: boolean;
}

export function OwnerSettings() {
  const { toast } = useToast();
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    get<{ business: BusinessDetail }>('/owner/business')
      .then((data) => {
        if (cancelled) return;
        const b = data.business;
        setBusiness(b);
        setForm({
          name: b.name,
          category: b.category,
          tagline: b.tagline,
          description: b.description,
          address: b.address,
          city: b.city,
          country: b.country,
          phone: b.phone,
          email: b.email,
          timezone: b.timezone,
          coverImage: b.coverImage,
          accentColor: b.accentColor,
          approvalRequired: b.approvalRequired,
        });
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load your profile.', 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const zones = useMemo(() => {
    if (!form) return TIMEZONES;
    return TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES];
  }, [form]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError('');
    if (form.name.trim().length < 2) {
      setError('Your business needs a name.');
      return;
    }
    setSaving(true);
    try {
      const data = await put<{ business: BusinessDetail }>('/owner/business', {
        ...form,
        name: form.name.trim(),
        category: form.category,
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      setBusiness(data.business);
      setForm({
        name: data.business.name,
        category: data.business.category,
        tagline: data.business.tagline,
        description: data.business.description,
        address: data.business.address,
        city: data.business.city,
        country: data.business.country,
        phone: data.business.phone,
        email: data.business.email,
        timezone: data.business.timezone,
        coverImage: data.business.coverImage,
        accentColor: data.business.accentColor,
        approvalRequired: data.business.approvalRequired,
      });
      toast('Your public profile has been updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function copyLink() {
    if (!business) return;
    const link = `${window.location.origin}/b/${business.slug}`;
    await navigator.clipboard.writeText(link);
    toast('Public booking link copied.');
  }

  if (loading || !form || !business) return <PageLoader label="Opening your profile" />;

  const previewService = business.services.find((service) => service.isActive);

  return (
    <div className="owner-settings-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">The face of your studio</div>
          <h1>Business profile</h1>
          <p>This is what customers see before they book. Make it feel like you.</p>
        </div>
        <div className="page-head-actions">
          <Link to={`/b/${business.slug}`} className="btn btn-outline">
            Preview page <ArrowUpRight size={15} />
          </Link>
          <button className="btn btn-dark" onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner /> : <><Save size={16} /> Save changes</>}
          </button>
        </div>
      </div>

      <form className="settings-layout owner-profile-form" onSubmit={handleSubmit}>
        <div className="settings-main">
          {error && <div className="form-error">{error}</div>}
          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon"><Store size={19} /></span>
              <div>
                <h2>The essentials</h2>
                <p>Your name, craft, and the first thing people read about you.</p>
              </div>
            </div>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Business name</span>
                <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} required />
              </label>
              <label className="field">
                <span className="field-label">Category</span>
                <select className="select" value={form.category} onChange={(event) => set('category', event.target.value)}>
                  {CATEGORY_OPTIONS.map((category) => (
                    <option value={category} key={category}>{category}</option>
                  ))}
                  {!CATEGORY_OPTIONS.includes(form.category) && (
                    <option value={form.category}>{form.category}</option>
                  )}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Tagline <em className="field-count">{form.tagline.length}/140</em></span>
              <input
                className="input"
                value={form.tagline}
                onChange={(event) => set('tagline', event.target.value.slice(0, 140))}
                placeholder="One line that sounds like you."
              />
            </label>
            <label className="field">
              <span className="field-label">Your story <em className="field-count">{form.description.length}/2400</em></span>
              <textarea
                className="textarea"
                rows={5}
                value={form.description}
                onChange={(event) => set('description', event.target.value.slice(0, 2400))}
                placeholder="What makes this place worth visiting? What should customers expect?"
              />
              <span className="field-hint">A few warm, specific sentences beat a paragraph of marketing speak.</span>
            </label>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon settings-icon-sage"><ImageIcon size={19} /></span>
              <div>
                <h2>The visual</h2>
                <p>Pick a cover and an accent that feel like your space.</p>
              </div>
            </div>
            <div className="cover-picker">
              {COVER_OPTIONS.map((cover) => (
                <button
                  type="button"
                  key={cover.src}
                  className={`cover-option ${form.coverImage === cover.src ? 'selected' : ''}`}
                  onClick={() => set('coverImage', cover.src)}
                  title={cover.label}
                >
                  <img src={cover.src} alt={cover.label} loading="lazy" />
                  {form.coverImage === cover.src && <span className="cover-check"><Check size={14} /></span>}
                </button>
              ))}
            </div>
            <div className="accent-picker">
              <span className="field-label">Accent color</span>
              <div className="accent-swatches">
                {ACCENTS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={form.accentColor === color ? 'selected' : ''}
                    style={{ backgroundColor: color }}
                    onClick={() => set('accentColor', color)}
                    aria-label={`Use accent ${color}`}
                  >
                    {form.accentColor === color && <Check size={14} />}
                  </button>
                ))}
                <label className="accent-custom">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(event) => set('accentColor', event.target.value)}
                    aria-label="Custom accent color"
                  />
                  Custom
                </label>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon settings-icon-gold"><MapPin size={19} /></span>
              <div>
                <h2>Location & contact</h2>
                <p>Where to find you and how to get in touch.</p>
              </div>
            </div>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Street address</span>
                <div className="input-with-icon"><MapPin size={16} /><input value={form.address} onChange={(event) => set('address', event.target.value)} /></div>
              </label>
              <label className="field">
                <span className="field-label">City</span>
                <input className="input" value={form.city} onChange={(event) => set('city', event.target.value)} />
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Country</span>
                <input className="input" value={form.country} onChange={(event) => set('country', event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Phone</span>
                <div className="input-with-icon"><Phone size={16} /><input value={form.phone} onChange={(event) => set('phone', event.target.value)} /></div>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Contact email</span>
              <input className="input" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} />
            </label>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon"><Clock3 size={19} /></span>
              <div>
                <h2>Scheduling preferences</h2>
                <p>Your timezone and how new bookings reach you.</p>
              </div>
            </div>
            <label className="field">
              <span className="field-label">Timezone</span>
              <div className="input-with-icon">
                <Globe2 size={16} />
                <select className="select select-bare" value={form.timezone} onChange={(event) => set('timezone', event.target.value)}>
                  {zones.map((zone) => <option value={zone} key={zone}>{zone.replaceAll('_', ' ')}</option>)}
                </select>
              </div>
              <span className="field-hint">Changing this shifts how all existing bookings are displayed and scheduled.</span>
            </label>
            <div className={`approval-setting ${form.approvalRequired ? 'on' : ''}`}>
              <div className="approval-setting-copy">
                <span className="approval-setting-icon"><Users size={18} /></span>
                <div>
                  <strong>Review new bookings first</strong>
                  <p>
                    {form.approvalRequired
                      ? 'New requests arrive as pending. You confirm each one before it is locked in.'
                      : 'Customers get instant confirmation. Their booking immediately holds the time.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`toggle ${form.approvalRequired ? 'on' : ''}`}
                onClick={() => set('approvalRequired', !form.approvalRequired)}
                role="switch"
                aria-checked={form.approvalRequired}
              >
                <span />
              </button>
            </div>
          </section>
        </div>

        <aside className="settings-side owner-profile-side">
          <div className="preview-panel">
            <div className="preview-panel-label"><Sparkles size={13} /> Live preview</div>
            <div className="preview-cover">
              <img src={asset(form.coverImage)} alt="" />
              <span className="preview-category" style={{ backgroundColor: form.accentColor }}>
                {form.category}
              </span>
            </div>
            <div className="preview-body">
              <h3>{form.name || 'Your business'}</h3>
              <p>{form.tagline || 'Your tagline will appear here.'}</p>
              <div className="preview-meta">
                <span>{form.city || 'Your city'}</span>
                <span>{previewService ? `from ${money(previewService.priceCents)}` : 'No services yet'}</span>
              </div>
              <div className="preview-availability">
                <span className="live-dot" />
                {form.approvalRequired ? 'Requests reviewed' : 'Instant booking'}
              </div>
            </div>
            <Link to={`/b/${business.slug}`} className="preview-link">
              Open public page <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="settings-side-card">
            <span className="side-card-icon"><Globe2 size={18} /></span>
            <h3>Your booking link</h3>
            <p className="booking-link-text">/b/{business.slug}</p>
            <button type="button" className="btn btn-sm btn-outline btn-block" onClick={copyLink}>
              <Copy size={14} /> Copy link
            </button>
          </div>

          <div className="settings-side-card settings-help">
            <ImageIcon size={18} />
            <h3>Tips for a lovely profile</h3>
            <ul className="mini-tips">
              <li>Use a real photo of your space, not a stock smile.</li>
              <li>Write like you talk. Specific is friendlier than fancy.</li>
              <li>Keep your services and buffers honest.</li>
            </ul>
          </div>

          <div className="owner-profile-side-actions">
            <Link to="/owner/services" className="btn btn-sm btn-outline btn-block">Manage services</Link>
            <Link to="/owner/availability" className="btn btn-sm btn-outline btn-block">Manage availability</Link>
          </div>
        </aside>
      </form>
    </div>
  );
}
