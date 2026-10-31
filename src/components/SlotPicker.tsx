import type { Slot } from '../../shared/types';

export function SlotPicker({
  slots,
  selected,
  onSelect,
  loading = false,
}: {
  slots: Slot[];
  selected: string | null;
  onSelect: (startsAt: string) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="slot-grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="slot-skeleton skeleton" key={index} />
        ))}
      </div>
    );
  }

  if (!slots.length) {
    return (
      <div className="slots-empty">
        <span className="slots-empty-icon">◌</span>
        <p>No open times on this day.</p>
        <span>Try another date — the calendar updates automatically.</span>
      </div>
    );
  }

  const groups: { label: string; items: Slot[] }[] = ['Morning', 'Afternoon', 'Evening'].map((label) => ({
    label,
    items: slots.filter((slot) => slot.period === label),
  }));

  return (
    <div className="slot-groups">
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <div className="slot-group" key={group.label}>
              <div className="slot-group-label">{group.label}</div>
              <div className="slot-grid">
                {group.items.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    className={`slot-btn ${selected === slot.startsAt ? 'selected' : ''}`}
                    onClick={() => onSelect(slot.startsAt)}
                    aria-pressed={selected === slot.startsAt}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
