import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CalendarRange,
  Clock3,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Scissors,
  Settings,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { BuiltBy } from './BuiltBy';
import { get } from '../lib/api';
import { MESSAGES_CHANGED } from '../lib/events';

const customerNav = [
  { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/account/bookings', label: 'My bookings', icon: CalendarDays },
  { to: '/account/messages', label: 'Messages', icon: MessageCircle },
  { to: '/account/favorites', label: 'Favorites', icon: Heart },
  { to: '/account/notifications', label: 'Notifications', icon: Bell },
  { to: '/account/settings', label: 'Settings', icon: Settings },
];

const ownerNav = [
  { to: '/owner', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/owner/calendar', label: 'Calendar', icon: CalendarRange },
  { to: '/owner/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/owner/messages', label: 'Messages', icon: MessageCircle },
  { to: '/owner/services', label: 'Services', icon: Scissors },
  { to: '/owner/availability', label: 'Availability', icon: Clock3 },
  { to: '/owner/settings', label: 'Business profile', icon: Store },
  { to: '/owner/notifications', label: 'Notifications', icon: Bell },
];

export function DashboardLayout({ variant }: { variant: 'customer' | 'owner' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [messageUnread, setMessageUnread] = useState(0);
  const nav = variant === 'owner' ? ownerNav : customerNav;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadUnread = async () => {
      try {
        const data = await get<{ unreadCount: number }>('/conversations/unread');
        if (!cancelled) setMessageUnread(data.unreadCount);
      } catch {
        // The badge is supplemental; failures should stay quiet.
      }
    };
    void loadUnread();
    const timer = window.setInterval(loadUnread, 10_000);
    window.addEventListener(MESSAGES_CHANGED, loadUnread);
    window.addEventListener('focus', loadUnread);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED, loadUnread);
      window.removeEventListener('focus', loadUnread);
    };
  }, [user]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const matchedNav = [...nav]
    .filter((item) =>
      item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
  const currentLabel = matchedNav?.label || (variant === 'owner' ? 'Studio' : 'Account');

  return (
    <div className={`dash-shell dash-${variant}`}>
      <div
        className={`dash-drawer-backdrop ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside className={`dash-sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="dash-sidebar-head">
          <Logo to={variant === 'owner' ? '/owner' : '/account'} />
          <button className="dash-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <div className="dash-section-label">{variant === 'owner' ? 'Your studio' : 'Your time'}</div>
        <nav className="dash-nav" aria-label="Dashboard navigation">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Messages' && messageUnread > 0 && (
                <span className="nav-badge">{messageUnread > 9 ? '9+' : messageUnread}</span>
              )}
              <span className="nav-active-mark" />
            </NavLink>
          ))}
        </nav>

        <div className="dash-sidebar-spacer" />

        {variant === 'owner' ? (
          <div className="dash-side-cta">
            <Sparkles size={17} />
            <strong>Looking good.</strong>
            <p>Your public page is live and taking bookings.</p>
            <Link to={user.businessSlug ? `/b/${user.businessSlug}` : '/owner/settings'}>
              View public page <ArrowUpRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="dash-side-cta">
            <Sparkles size={17} />
            <strong>A little room for you?</strong>
            <p>Find a new favorite and book something to look forward to.</p>
            <Link to="/explore">
              Explore places <ArrowUpRight size={14} />
            </Link>
          </div>
        )}

        <div className="dash-user">
          <Link to={variant === 'owner' ? '/owner/settings' : '/account/settings'} className="dash-user-main">
            <Avatar name={user.name} size="md" />
            <div>
              <strong>{user.name}</strong>
              <span>{variant === 'owner' ? 'Business owner' : 'Tempo member'}</span>
            </div>
          </Link>
          <button onClick={handleLogout} className="icon-btn" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
        <BuiltBy tone="inverse" className="dash-credit" />
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-mobile-left">
            <button className="icon-btn dash-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={21} />
            </button>
            <span className="dash-mobile-title">{currentLabel || (variant === 'owner' ? 'Studio' : 'Account')}</span>
          </div>
          <div className="dash-topbar-context">
            <span className="dash-topbar-label">{variant === 'owner' ? 'Studio dashboard' : 'My Tempo'}</span>
            <span className="dash-topbar-divider" />
            <span className="dash-topbar-section">{currentLabel || 'Overview'}</span>
          </div>
          <div className="dash-topbar-actions">
            <Link to="/explore" className="dash-site-link">
              Visit marketplace <ArrowUpRight size={14} />
            </Link>
            <NotificationBell />
            <Link
              to={variant === 'owner' ? '/owner/settings' : '/account/settings'}
              className="dash-avatar-link"
              aria-label="Account settings"
            >
              <Avatar name={user.name} size="sm" />
            </Link>
          </div>
        </header>
        <main className="dash-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
