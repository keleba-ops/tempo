import { Link } from 'react-router-dom';

export function Logo({ to = '/', light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className={`logo ${light ? 'logo-light' : ''}`} aria-label="Tempo home">
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10.75" stroke="currentColor" strokeWidth="1.4" opacity=".55" />
          <path d="M14 7.6V14l4.5 2.8" stroke="#d36b45" strokeWidth="2" strokeLinecap="round" />
          <circle cx="14" cy="14" r="1.6" fill="currentColor" />
        </svg>
      </span>
      <span className="logo-word">
        tempo<span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
