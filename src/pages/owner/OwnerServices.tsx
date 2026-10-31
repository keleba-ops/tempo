import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  Coffee,
  Coins,
  Edit3,
  Home,
  Plus,
  Scissors,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import type { Service } from '../../../shared/types';
import { del, get, patch, post } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { duration, money } from '../../lib/format';
import { PageLoader, Spinner } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';

interface FormState {
  name: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: string;
  isActive: boolean;
  houseCall: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  durationMinutes: 45,
  bufferMinutes: 10,
  price: '50',
  isActive: true,
  houseCall: false,
};

export function OwnerServices() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await get<{ services: Service[] }>('/owner/services');
      setServices(data.services);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load services.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(() => services.filter((service) => service.isActive), [services]);
  const archived = useMemo(() => services.filter((service) => !service.isActive), [services]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      price: (service.priceCents / 100).toFixed(service.priceCents % 100 === 0 ? 0 : 2),
      isActive: service.isActive,
      houseCall: service.houseCall,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const priceCents = Math.round(Number(form.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError('Enter a valid price (for example 45 or 45.00).');
      return;
    }
    if (!form.name.trim()) {
      setError('Give the service a name.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        durationMinutes: Number(form.durationMinutes),
        bufferMinutes: Number(form.bufferMinutes),
        priceCents,
        isActive: form.isActive,
        houseCall: form.houseCall,
      };
      if (editing) {
        await patch(`/owner/services/${editing.id}`, body);
        toast('Service updated.');
      } else {
        await post('/owner/services', body);
        toast('Service added. Customers can book it right away.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this service.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service: Service) {
    setBusyId(service.id);
    try {
      await patch(`/owner/services/${service.id}`, { isActive: !service.isActive });
      setServices((current) =>
        current.map((item) => (item.id === service.id ? { ...item, isActive: !item.isActive } : item)),
      );
      toast(service.isActive ? `${service.name} is now hidden from booking.` : `${service.name} is live again.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update this service.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function archive(service: Service) {
    setBusyId(service.id);
    try {
      await del(`/owner/services/${service.id}`);
      setServices((current) =>
        current.map((item) => (item.id === service.id ? { ...item, isActive: false } : item)),
      );
      toast(`${service.name} archived. Existing bookings are untouched.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not archive this service.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageLoader label="Loading your services" />;

  const totalValue = active.reduce((sum, service) => sum + service.priceCents, 0);

  return (
    <div className="owner-services-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">What you offer</div>
          <h1>Services</h1>
          <p>Your menu, your pace. All prices in BWP Pula; duration and buffer shape the openings customers see.</p>
        </div>
        <button className="btn btn-dark" onClick={openCreate}>
          <Plus size={16} /> New service
        </button>
      </div>

      <div className="service-stats-row">
        <div className="mini-stat"><Scissors size={16} /><strong>{active.length}</strong><span>active services</span></div>
        <div className="mini-stat"><Clock3 size={16} /><strong>{active.reduce((sum, service) => sum + service.durationMinutes, 0)} min</strong><span>total menu time</span></div>
        <div className="mini-stat"><Coffee size={16} /><strong>{active.reduce((sum, service) => sum + service.bufferMinutes, 0)} min</strong><span>buffer per full menu</span></div>
        <div className="mini-stat"><Coins size={16} /><strong>{money(totalValue)}</strong><span>combined value</span></div>
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={<Scissors size={25} />}
          title="Your service menu is empty"
          description="Add your first offering with a duration, price, and breathing room. Customers will be able to book it immediately."
          action={<button className="btn btn-dark" onClick={openCreate}><Plus size={15} /> Add your first service</button>}
        />
      ) : (
        <>
          <div className="service-section-head">
            <div>
              <h2>Active menu</h2>
              <span>{active.length} bookable services</span>
            </div>
            <Link to="/owner/availability" className="text-arrow">Manage availability <ArrowRight size={15} /></Link>
          </div>
          {active.length > 0 ? (
            <div className="owner-service-grid">
              {active.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  busy={busyId === service.id}
                  onEdit={() => openEdit(service)}
                  onToggle={() => toggleActive(service)}
                  onArchive={() => archive(service)}
                />
              ))}
              <button className="add-service-card" onClick={openCreate}>
                <span><Plus size={22} /></span>
                <strong>Add another service</strong>
                <p>A facial, a quick trim, a new kind of good hour.</p>
              </button>
            </div>
          ) : (
            <div className="archived-empty-note">No active services. Restore one below or create a new service.</div>
          )}

          {archived.length > 0 && (
            <>
              <div className="service-section-head archived-head">
                <div>
                  <h2>Archived</h2>
                  <span>Hidden from booking, kept for your history</span>
                </div>
              </div>
              <div className="archived-service-list">
                {archived.map((service) => (
                  <div className="archived-service-row" key={service.id}>
                    <span className="archived-service-icon"><Scissors size={16} /></span>
                    <div>
                      <strong>{service.name}</strong>
                      <span>{duration(service.durationMinutes)} · {money(service.priceCents)}</span>
                    </div>
                    <span className="archived-tag">Archived</span>
                    <button className="btn btn-sm btn-outline" onClick={() => toggleActive(service)} disabled={busyId === service.id}>
                      {busyId === service.id ? <Spinner size={13} /> : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="services-tip">
        <span className="services-tip-icon"><Timer size={17} /></span>
        <div>
          <strong>How buffers work</strong>
          <span>After each appointment, Tempo hides the buffer from new bookings. A 45-minute service with a 10-minute buffer needs 55 minutes of clear calendar.</span>
        </div>
        <Sparkles size={18} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit service' : 'Add a service'}
        eyebrow={editing ? editing.name : 'New offering'}
        size="md"
      >
        <form className="service-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label className="field">
            <span className="field-label">Service name</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Signature Cut"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="textarea"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What should customers expect?"
            />
          </label>
          <div className="field-grid field-grid-3">
            <label className="field">
              <span className="field-label">Duration (min)</span>
              <input
                className="input"
                type="number"
                min={5}
                max={480}
                step={5}
                value={form.durationMinutes}
                onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Buffer after (min)</span>
              <input
                className="input"
                type="number"
                min={0}
                max={180}
                step={5}
                value={form.bufferMinutes}
                onChange={(event) => setForm({ ...form, bufferMinutes: Number(event.target.value) })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Price (BWP / Pula)</span>
              <div className="price-input">
                <span>P</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                  required
                />
              </div>
            </label>
          </div>
          <p className="form-hint">
            Customers need {form.durationMinutes + form.bufferMinutes} minutes of clear calendar for this service.
          </p>
          <label className="switch-row">
            <div>
              <strong>Available for booking</strong>
              <span>Inactive services stay on your menu but are hidden from customers.</span>
            </div>
            <button
              type="button"
              className={`toggle ${form.isActive ? 'on' : ''}`}
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              role="switch"
              aria-checked={form.isActive}
            >
              <span />
            </button>
          </label>
          <label className="switch-row">
            <div>
              <strong>Offer house calls</strong>
              <span>Customers can share their address and choose “At my place” when booking this service.</span>
            </div>
            <button
              type="button"
              className={`toggle ${form.houseCall ? 'on' : ''}`}
              onClick={() => setForm({ ...form, houseCall: !form.houseCall })}
              role="switch"
              aria-checked={form.houseCall}
            >
              <span />
            </button>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-accent" disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save changes' : 'Add service'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ServiceCard({
  service,
  busy,
  onEdit,
  onToggle,
  onArchive,
}: {
  service: Service;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onArchive: () => void;
}) {
  return (
    <article className="owner-service-card">
      <div className="service-card-top">
        <span className="service-card-icon"><Scissors size={18} /></span>
        <button
          className={`toggle toggle-sm ${service.isActive ? 'on' : ''}`}
          onClick={onToggle}
          disabled={busy}
          role="switch"
          aria-checked={service.isActive}
          aria-label={`${service.isActive ? 'Deactivate' : 'Activate'} ${service.name}`}
        >
          <span />
        </button>
      </div>
      <div className="service-card-body">
        <h3>{service.name}</h3>
        <p>{service.description || 'No description yet.'}</p>
      </div>
      <div className="service-card-meta">
        <span><Clock3 size={13} /> {duration(service.durationMinutes)}</span>
        <span><Coffee size={13} /> {service.bufferMinutes} min buffer</span>
        {service.houseCall && <span className="service-housecall"><Home size={13} /> House calls</span>}
      </div>
      <div className="service-card-foot">
        <strong>{money(service.priceCents)}</strong>
        <div>
          <button className="icon-btn" onClick={onEdit} disabled={busy} aria-label={`Edit ${service.name}`}>
            <Edit3 size={16} />
          </button>
          <button className="icon-btn icon-btn-danger" onClick={onArchive} disabled={busy} aria-label={`Archive ${service.name}`}>
            {busy ? <Spinner size={15} /> : <Trash2 size={16} />}
          </button>
        </div>
      </div>
    </article>
  );
}
