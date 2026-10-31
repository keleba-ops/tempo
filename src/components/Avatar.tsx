import { initials } from '../lib/format';

const COLORS = ['#c9633f', '#64775d', '#9c6b53', '#6b7b8d', '#a57a36', '#7b647d'];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const color = COLORS[(name.charCodeAt(0) + name.length) % COLORS.length];
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: color }}
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
