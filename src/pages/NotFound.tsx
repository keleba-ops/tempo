import { Link } from 'react-router-dom';
import { ArrowLeft, Clock3 } from 'lucide-react';
import { Logo } from '../components/Logo';

export function NotFound() {
  return (
    <div className="notfound-page">
      <div className="notfound-inner">
        <Logo />
        <div className="notfound-clock"><Clock3 size={30} /></div>
        <div className="eyebrow">404 · A little off schedule</div>
        <h1>This page isn't<br /><em>on the calendar.</em></h1>
        <p>The link may have moved, or the hour got away from us.</p>
        <div className="notfound-actions">
          <Link to="/" className="btn btn-dark"><ArrowLeft size={16} /> Back home</Link>
          <Link to="/explore" className="btn btn-outline">Explore places</Link>
        </div>
      </div>
    </div>
  );
}
