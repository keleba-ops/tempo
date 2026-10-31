import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { get } from '../lib/api';
import { NOTIFICATIONS_CHANGED } from '../lib/events';

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await get<{ unreadCount: number }>('/me/notifications');
        if (!cancelled) setCount(data.unreadCount);
      } catch {
        // Silent — the bell is supplemental.
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
      window.removeEventListener('focus', load);
    };
  }, [user]);

  if (!user) return null;
  const destination = user.role === 'owner' ? '/owner/notifications' : '/account/notifications';

  return (
    <button
      className="icon-btn topbar-bell"
      onClick={() => navigate(destination)}
      aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
    >
      <Bell size={19} />
      {count > 0 && <span className="bell-dot">{count > 9 ? '9+' : count}</span>}
    </button>
  );
}
