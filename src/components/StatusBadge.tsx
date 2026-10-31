import { CheckCircle2, CircleDashed, Clock3, XCircle } from 'lucide-react';
import type { BookingStatus } from '../../shared/types';
import { statusLabel } from '../lib/format';

export function StatusBadge({ status, dotOnly = false }: { status: BookingStatus; dotOnly?: boolean }) {
  const Icon =
    status === 'confirmed'
      ? CheckCircle2
      : status === 'pending'
        ? Clock3
        : status === 'completed'
          ? CheckCircle2
          : status === 'cancelled'
            ? XCircle
            : CircleDashed;

  if (dotOnly) return <span className={`status-dot status-${status}`} title={statusLabel(status)} />;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={12} strokeWidth={2.5} />
      {statusLabel(status)}
    </span>
  );
}
