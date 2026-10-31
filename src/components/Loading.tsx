import { Loader2 } from 'lucide-react';

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 className="spin" size={size} aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page-loader">
      <Spinner size={24} />
      <span>{label}…</span>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-image" />
      <div className="skeleton-lines">
        <div className="skeleton skeleton-line w40" />
        <div className="skeleton skeleton-line w70" />
        <div className="skeleton skeleton-line w55" />
      </div>
    </div>
  );
}
