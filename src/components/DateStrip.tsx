import { useEffect, useRef } from 'react';
import type { SlotDay } from '../../shared/types';

export function DateStrip({
  days,
  selected,
  onSelect,
  loading = false,
}: {
  days: SlotDay[];
  selected: string;
  onSelect: (date: string) => void;
  loading?: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected || !stripRef.current) return;
    const strip = stripRef.current;
    const chip = strip.querySelector<HTMLElement>('.date-chip.selected');
    if (!chip) return;
    const target = chip.offsetLeft - (strip.clientWidth - chip.clientWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [selected, days]);

  if (loading) {
    return (
      <div className="date-strip" ref={stripRef}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="date-chip date-chip-skeleton skeleton" key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="date-strip" ref={stripRef}>
      {days.map((day) => {
        const disabled = day.count === 0;
        return (
          <button
            key={day.date}
            type="button"
            className={`date-chip ${selected === day.date ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onSelect(day.date)}
            disabled={disabled}
            aria-pressed={selected === day.date}
          >
            <span className="date-chip-day">{day.isToday ? 'Today' : day.dayLabel}</span>
            <span className="date-chip-num">{day.dateLabel}</span>
            <span className="date-chip-month">{day.monthLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
