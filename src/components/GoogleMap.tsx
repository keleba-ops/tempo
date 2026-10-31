import { useState } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';

export function GoogleMap({
  query,
  label = 'Open location in Google Maps',
  height = 220,
  compact = false,
}: {
  query: string;
  label?: string;
  height?: number;
  compact?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const trimmed = query.trim();
  if (!trimmed) return null;
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(trimmed)}&z=15&hl=en&output=embed`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;

  return (
    <div className={`google-map ${compact ? 'google-map-compact' : ''}`}>
      {!loaded && (
        <div className="google-map-loading" style={{ height }}>
          <MapPin size={19} />
          <span>Opening Google Maps…</span>
          <em>{trimmed}</em>
        </div>
      )}
      <iframe
        title={`Google Map of ${trimmed}`}
        src={embedUrl}
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        className={loaded ? 'is-loaded' : ''}
        style={{ height }}
      />
      <div className="google-map-footer">
        <span><MapPin size={12} /> {trimmed}</span>
        <a href={mapsUrl} target="_blank" rel="noreferrer">
          {label} <ArrowUpRight size={12} />
        </a>
      </div>
    </div>
  );
}
