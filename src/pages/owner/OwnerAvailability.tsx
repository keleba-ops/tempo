import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowRight,
  CalendarDays,
  CalendarOff,
  Check,
  Clock3,
  Info,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { AvailabilityException, AvailabilityWindow, WeeklyHours } from '../../../shared/types';
import { del, get, post, put } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { minutesToLabel, minutesToTimeInput, timeInputToMinutes, WEEKDAYS } from '../../lib/format';
import { PageLoader, Spinner } from '../../components/Loading';
import { Modal } from '../../components/Modal';

interface AvailabilityResponse {
  timezone: string;
  weeklyHours: WeeklyHours[];
  exceptions: AvailabilityException[];
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function normalizeDays(days: WeeklyHours[]): WeeklyHours[] {
  return DAY_ORDER.map((weekday) => {
    const existing = days.find((day) => day.weekday === weekday);
    return existing
      ? { weekday, isOpen: existing.isOpen, windows: existing.windows.map((window) => ({ ...window })) }
      : { weekday, isOpen: false, windows: [] };
  });
}

function snapshot(days: WeeklyHours[]): string {
  return JSON.stringify(days.map((day) => ({ weekday: day.weekday, isOpen: day.isOpen, windows: day.windows })));
}

export function OwnerAvailability() {
  const { toast } = useToast();
  const [timezone, setTimezone] = useState('');
  const [days, setDays] = useState<WeeklyHours[]>(normalizeDays([]));
  const [saved, setSaved] = useState('');
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [busyException, setBusyException] = useState<string | null>(null);

  async function load() {
    try {
      const data = await get<AvailabilityResponse>('/owner/availability');
      const normalized = normalizeDays(data.weeklyHours);
      setTimezone(data.timezone);
      setDays(normalized);
      setSaved(snapshot(normalized));
      setExceptions(data.exceptions);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load availability.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(() => snapshot(days) !== saved, [days, saved]);
  const openDays = days.filter((day) => day.isOpen && day.windows.length > 0).length;
  const weeklyMinutes = days.reduce(
    (sum, day) => sum + (day.isOpen ? day.windows.reduce((s, w) => s + Math.max(0, w.endMinute - w.startMinute), 0) : 0),
    0,
  );

  function updateDay(weekday: number, next: WeeklyHours) {
    setDays((current) => current.map((day) => (day.weekday === weekday ? next : day)));
  }

  function toggleDay(day: WeeklyHours) {
    if (day.isOpen) updateDay(day.weekday, { ...day, isOpen: false });
    else updateDay(day.weekday, { ...day, isOpen: true, windows: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] });
  }

  function updateWindow(day: WeeklyHours, index: number, next: AvailabilityWindow) {
    const windows = day.windows.map((window, i) => (i === index ? next : window));
    updateDay(day.weekday, { ...day, windows });
  }

  function addWindow(day: WeeklyHours) {
    const last = day.windows[day.windows.length - 1];
    const startMinute = last ? Math.min(last.endMinute + 30, 22 * 60) : 9 * 60;
    const endMinute = Math.min(startMinute + 60, 23 * 60 + 59);
    updateDay(day.weekday, {
      ...day,
      windows: [...day.windows, { startMinute, endMinute }],
    });
  }

  function removeWindow(day: WeeklyHours, index: number) {
    const windows = day.windows.filter((_, i) => i !== index);
    updateDay(day.weekday, { ...day, windows, isOpen: windows.length > 0 ? day.isOpen : false });
  }

  function validate(): string | null {
    for (const day of days) {
      if (!day.isOpen) continue;
      if (day.windows.length === 0) return `${WEEKDAYS[day.weekday]} is open but has no hours. Add a window or mark it closed.`;
      const sorted = [...day.windows].sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].endMinute <= sorted[i].startMinute) {
          return `${WEEKDAYS[day.weekday]} has a window that ends before it starts.`;
        }
        if (i > 0 && sorted[i - 1].endMinute > sorted[i].startMinute) {
          return `${WEEKDAYS[day.weekday]} has overlapping windows. Leave a gap or combine them.`;
        }
      }
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      toast(problem, 'error');
      return;
    }
    setSaving(true);
    try {
      const data = await put<{ weeklyHours: WeeklyHours[] }>('/owner/availability', { weeklyHours: days });
      const normalized = normalizeDays(data.weeklyHours);
      setDays(normalized);
      setSaved(snapshot(normalized));
      toast('Weekly availability saved. New slots are live.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save availability.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteException(exception: AvailabilityException) {
    setBusyException(exception.id);
    try {
      const data = await del<{ exceptions: AvailabilityException[] }>(
        `/owner/availability/exceptions/${exception.id}`,
      );
      setExceptions(data.exceptions);
      toast('Date exception removed.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not remove exception.', 'error');
    } finally {
      setBusyException(null);
    }
  }

  if (loading) return <PageLoader label="Loading your hours" />;

  return (
    <div className="owner-availability-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your working rhythm</div>
          <h1>Availability</h1>
          <p>Set the hours you actually want to work. Tempo turns them into bookable slots.</p>
        </div>
        <div className="page-head-actions">
          {dirty && <span className="unsaved-chip">Unsaved changes</span>}
          <button className="btn btn-dark" onClick={save} disabled={saving || !dirty}>
            {saving ? <Spinner /> : <><Save size={16} /> Save changes</>}
          </button>
        </div>
      </div>

      <div className="availability-meta">
        <span><Clock3 size={14} /> All times in Botswana time (CAT)</span>
        <span><CalendarDays size={14} /> {openDays} open days per week</span>
        <span><Sparkles size={14} /> {Math.floor(weeklyMinutes / 60)}h {weeklyMinutes % 60}m of availability</span>
        <Link to="/owner/settings">Change timezone <ArrowRight size={13} /></Link>
      </div>

      <div className="availability-layout">
        <section className="panel weekly-editor-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Recurring hours</div>
              <h2>Your week</h2>
            </div>
            <span className="panel-hint">Add a second window for lunch or a school run.</span>
          </div>
          <div className="weekly-editor">
            {days.map((day) => (
              <div className={`day-editor ${day.isOpen ? 'open' : 'closed'}`} key={day.weekday}>
                <div className="day-editor-label">
                  <button
                    className={`toggle toggle-sm ${day.isOpen ? 'on' : ''}`}
                    onClick={() => toggleDay(day)}
                    role="switch"
                    aria-checked={day.isOpen}
                    aria-label={`${day.isOpen ? 'Close' : 'Open'} ${WEEKDAYS[day.weekday]}`}
                  >
                    <span />
                  </button>
                  <div>
                    <strong>{WEEKDAYS[day.weekday]}</strong>
                    <span>{day.isOpen ? `${day.windows.length} window${day.windows.length === 1 ? '' : 's'}` : 'Closed'}</span>
                  </div>
                </div>
                <div className="day-editor-windows">
                  {day.isOpen ? (
                    <>
                      {day.windows.map((window, index) => (
                        <div className="time-window" key={index}>
                          <input
                            type="time"
                            step={900}
                            value={minutesToTimeInput(window.startMinute)}
                            onChange={(event) =>
                              updateWindow(day, index, {
                                ...window,
                                startMinute: timeInputToMinutes(event.target.value),
                              })
                            }
                            aria-label={`${WEEKDAYS[day.weekday]} opening time`}
                          />
                          <span>to</span>
                          <input
                            type="time"
                            step={900}
                            value={minutesToTimeInput(window.endMinute)}
                            onChange={(event) =>
                              updateWindow(day, index, {
                                ...window,
                                endMinute: timeInputToMinutes(event.target.value),
                              })
                            }
                            aria-label={`${WEEKDAYS[day.weekday]} closing time`}
                          />
                          <button
                            className="icon-btn icon-btn-danger"
                            onClick={() => removeWindow(day, index)}
                            aria-label="Remove time window"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <button className="add-window-btn" onClick={() => addWindow(day)}>
                        <Plus size={14} /> Add window
                      </button>
                    </>
                  ) : (
                    <button className="closed-day-btn" onClick={() => toggleDay(day)}>
                      <Plus size={14} /> Open this day
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {dirty && (
            <div className="availability-savebar">
              <span>You have unsaved changes.</span>
              <div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setDays(normalizeDays(JSON.parse(saved) as WeeklyHours[]))}
                >
                  <RotateCcw size={14} /> Reset
                </button>
                <button className="btn btn-sm btn-accent" onClick={save} disabled={saving}>
                  {saving ? <Spinner size={14} /> : 'Save weekly hours'}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="availability-side">
          <div className="panel availability-summary">
            <div className="eyebrow">At a glance</div>
            <h3>Your bookable week</h3>
            <div className="availability-big-number">
              <strong>{Math.floor(weeklyMinutes / 60)}</strong>
              <span>hours open<br />each week</span>
            </div>
            <div className="availability-day-dots">
              {days.map((day) => (
                <div key={day.weekday}>
                  <span className={day.isOpen ? 'on' : ''}>{WEEKDAYS[day.weekday][0]}</span>
                  <em>{day.isOpen ? `${Math.round(day.windows.reduce((s, w) => s + w.endMinute - w.startMinute, 0) / 60)}h` : '—'}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="panel slot-explainer">
            <div className="eyebrow">How slots are built</div>
            <h3>The honest math</h3>
            <div className="explainer-step">
              <span>01</span>
              <div><strong>Recurring hours</strong><p>Your weekly windows set the outer edges of the day.</p></div>
            </div>
            <div className="explainer-step">
              <span>02</span>
              <div><strong>Date exceptions</strong><p>Days off and holiday hours replace the regular week.</p></div>
            </div>
            <div className="explainer-step">
              <span>03</span>
              <div><strong>Bookings & buffers</strong><p>Existing appointments and each service's reset time are subtracted.</p></div>
            </div>
            <div className="explainer-result">
              <Check size={14} /> Only genuinely free times appear to customers.
            </div>
          </div>

          <div className="availability-side-note">
            <Info size={15} />
            <p>Changes to recurring hours do not cancel existing bookings. Exceptions apply immediately.</p>
          </div>
        </aside>
      </div>

      <section className="panel exceptions-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">The exceptions</div>
            <h2>Days off & special hours</h2>
            <p className="panel-sub">Holidays, deep-clean days, late starts, and the occasional long weekend.</p>
          </div>
          <button className="btn btn-outline" onClick={() => setExceptionOpen(true)}>
            <Plus size={16} /> Add date exception
          </button>
        </div>
        {exceptions.length > 0 ? (
          <div className="exception-list">
            {exceptions.map((exception) => {
              const past = exception.date < DateTime.now().toISODate()!;
              return (
                <div className={`exception-row ${past ? 'past' : ''}`} key={exception.id}>
                  <div className="exception-date">
                    <strong>{DateTime.fromISO(exception.date).toFormat('d')}</strong>
                    <span>{DateTime.fromISO(exception.date).toFormat('LLL')}</span>
                  </div>
                  <div className="exception-copy">
                    <strong>
                      {DateTime.fromISO(exception.date).toFormat('cccc, LLLL d, yyyy')}
                      {past && <em>Past</em>}
                    </strong>
                    <span>
                      {exception.isClosed
                        ? 'Closed all day'
                        : `${minutesToLabel(exception.startMinute || 0)} – ${minutesToLabel(exception.endMinute || 0)}`}
                      {exception.note ? ` · ${exception.note}` : ''}
                    </span>
                  </div>
                  <span className={`exception-type ${exception.isClosed ? 'closed' : 'custom'}`}>
                    {exception.isClosed ? <CalendarOff size={13} /> : <Clock3 size={13} />}
                    {exception.isClosed ? 'Day off' : 'Custom hours'}
                  </span>
                  <button
                    className="icon-btn icon-btn-danger"
                    onClick={() => deleteException(exception)}
                    disabled={busyException === exception.id}
                    aria-label="Delete exception"
                  >
                    {busyException === exception.id ? <Spinner size={14} /> : <Trash2 size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="exceptions-empty">
            <CalendarOff size={23} />
            <div>
              <strong>No exceptions yet</strong>
              <p>Your regular weekly rhythm applies every week.</p>
            </div>
            <button className="btn btn-sm btn-outline" onClick={() => setExceptionOpen(true)}>
              Add a day off
            </button>
          </div>
        )}
      </section>

      <ExceptionModal
        open={exceptionOpen}
        onClose={() => setExceptionOpen(false)}
        onSaved={(next) => {
          setExceptions(next);
          setExceptionOpen(false);
        }}
      />
    </div>
  );
}

function ExceptionModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (exceptions: AvailabilityException[]) => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(DateTime.now().plus({ days: 1 }).toISODate()!);
  const [type, setType] = useState<'closed' | 'custom'>('closed');
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('14:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(DateTime.now().plus({ days: 1 }).toISODate()!);
    setType('closed');
    setStart('10:00');
    setEnd('14:00');
    setNote('');
    setError('');
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!date) {
      setError('Choose a date.');
      return;
    }
    const startMinute = timeInputToMinutes(start);
    const endMinute = timeInputToMinutes(end);
    if (type === 'custom' && endMinute <= startMinute) {
      setError('Closing time must be after opening time.');
      return;
    }
    setSaving(true);
    try {
      const data = await post<{ exceptions: AvailabilityException[] }>('/owner/availability/exceptions', {
        date,
        isClosed: type === 'closed',
        startMinute: type === 'closed' ? null : startMinute,
        endMinute: type === 'closed' ? null : endMinute,
        note,
      });
      toast(type === 'closed' ? 'Day off added.' : 'Special hours added.');
      onSaved(data.exceptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this exception.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a date exception" eyebrow="One-off change" size="md">
      <form className="exception-form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <label className="field">
          <span className="field-label">Date</span>
          <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <div className="exception-type-toggle">
          <button
            type="button"
            className={type === 'closed' ? 'active' : ''}
            onClick={() => setType('closed')}
          >
            <CalendarOff size={16} />
            <strong>Closed all day</strong>
            <span>A proper day off.</span>
          </button>
          <button
            type="button"
            className={type === 'custom' ? 'active' : ''}
            onClick={() => setType('custom')}
          >
            <Clock3 size={16} />
            <strong>Custom hours</strong>
            <span>Different hours just for this date.</span>
          </button>
        </div>
        {type === 'custom' && (
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Opens</span>
              <input className="input" type="time" step={900} value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Closes</span>
              <input className="input" type="time" step={900} value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
        )}
        <label className="field">
          <span className="field-label">Note (optional)</span>
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Team workshop, holiday hours…"
            maxLength={200}
          />
        </label>
        <p className="form-hint">This date overrides your recurring hours completely.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-accent" disabled={saving}>
            {saving ? <Spinner /> : 'Add exception'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
