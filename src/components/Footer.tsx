import { Link } from 'react-router-dom';
import { ArrowUpRight, AtSign, MapPin } from 'lucide-react';
import { Logo } from './Logo';
import { BuiltBy } from './BuiltBy';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand">
          <Logo />
          <p>Appointments, in rhythm. Thoughtful scheduling for Botswana's independent businesses and the people who love them.</p>
          <a className="footer-social" href="https://instagram.com" target="_blank" rel="noreferrer">
            <AtSign size={16} /> @tempo.appointments
          </a>
          <span className="footer-locale"><MapPin size={13} /> Gaborone, Botswana</span>
        </div>
        <div className="footer-col">
          <h4>Discover</h4>
          <Link to="/explore">All places</Link>
          <Link to="/get-app">Get the app</Link>
          <Link to="/explore?category=Wellness">Wellness</Link>
          <Link to="/explore?category=Barbering">Barbering</Link>
          <Link to="/explore?category=Hair">Hair</Link>
        </div>
        <div className="footer-col">
          <h4>For business</h4>
          <Link to="/register?role=owner">List your business</Link>
          <Link to="/login?role=owner">Owner sign in</Link>
          <Link to="/#how-it-works">How Tempo works</Link>
        </div>
        <div className="footer-col">
          <h4>Good to know</h4>
          <Link to="/#faq">Booking policy</Link>
          <Link to="/#faq">Notification settings</Link>
          <Link to="/#faq">Help & contact</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <div className="footer-meta">
          <span>© {new Date().getFullYear()} Tempo. Made for the good small businesses of Botswana.</span>
          <BuiltBy tone="inverse" />
        </div>
        <div>
          <a href="#top">Privacy</a>
          <a href="#top">Terms</a>
          <a href="#top">
            Back to top <ArrowUpRight size={13} />
          </a>
        </div>
      </div>
    </footer>
  );
}
