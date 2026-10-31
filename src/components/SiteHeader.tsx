import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronDown, Download, Heart, LayoutDashboard, LogOut, Menu, MessageCircle, Settings, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { NotificationBell } from './NotificationBell';

export function SiteHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const dashboard = user?.role === 'owner' ? '/owner' : '/account';
  const settings = user?.role === 'owner' ? '/owner/settings' : '/account/settings';
  const notifications = user?.role === 'owner' ? '/owner/notifications' : '/account/notifications';

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    setMobileOpen(false);
    navigate('/');
  }

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavLink to="/explore" className={({ isActive }) => (isActive ? 'active' : '')}>
            Explore
          </NavLink>
          <Link to="/#how-it-works">How it works</Link>
          <Link to={user?.role === 'owner' ? '/owner' : '/register?role=owner'}>
            For business
            {!user && <span className="nav-dot" />}
          </Link>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <NotificationBell />
              <div className="profile-menu-wrap" ref={menuRef}>
                <button
                  className="profile-trigger"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <Avatar name={user.name} size="sm" />
                  <span className="profile-trigger-name">{user.name.split(' ')[0]}</span>
                  <ChevronDown size={14} className={menuOpen ? 'rotate' : ''} />
                </button>
                {menuOpen && (
                  <div className="profile-menu" role="menu">
                    <div className="profile-menu-head">
                      <Avatar name={user.name} size="md" />
                      <div>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                    </div>
                    <div className="menu-separator" />
                    <Link to={dashboard} role="menuitem">
                      <LayoutDashboard size={16} /> Dashboard
                    </Link>
                    {user.role === 'customer' && (
                      <>
                        <Link to="/account/bookings" role="menuitem">
                          <CalendarDays size={16} /> My bookings
                        </Link>
                        <Link to="/account/messages" role="menuitem">
                          <MessageCircle size={16} /> Messages
                        </Link>
                        <Link to="/account/favorites" role="menuitem">
                          <Heart size={16} /> Favorites
                        </Link>
                      </>
                    )}
                    {user.role === 'owner' && (
                      <Link to="/owner/messages" role="menuitem">
                        <MessageCircle size={16} /> Messages
                      </Link>
                    )}
                    <Link to={notifications} role="menuitem">
                      <Sparkles size={16} /> Notifications
                    </Link>
                    <Link to={settings} role="menuitem">
                      <Settings size={16} /> Settings
                    </Link>
                    <div className="menu-separator" />
                    <button role="menuitem" onClick={handleLogout} className="menu-signout">
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="guest-actions">
              <Link to="/login" className="text-link">
                Sign in
              </Link>
              <Link to="/register?role=owner" className="btn btn-dark btn-sm">
                For business
              </Link>
            </div>
          )}
          <button className="mobile-menu-btn" onClick={() => setMobileOpen((open) => !open)} aria-label="Toggle menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="mobile-nav">
          <div className="container">
            <Link to="/explore">Explore places</Link>
            <Link to="/#how-it-works">How it works</Link>
            <Link to={user?.role === 'owner' ? '/owner' : '/register?role=owner'}>For business</Link>
            <Link to="/get-app" className="mobile-install-link"><Download size={15} /> Get the app</Link>
            {user ? (
              <>
                <Link to={dashboard}>Dashboard</Link>
                <button onClick={handleLogout}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link to="/register" className="btn btn-accent">
                  Create an account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
