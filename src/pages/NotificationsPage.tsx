import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Inbox,
  Mail,
  MailOpen,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { EmailDelivery, Notification } from '../../shared/types';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { NotificationIcon } from '../components/NotificationIcon';
import { Modal } from '../components/Modal';
import { PageLoader } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { timeAgo } from '../lib/format';
import { announceNotificationsChanged } from '../lib/events';

type Tab = 'inbox' | 'email';
type Filter = 'all' | 'unread';

const KIND_LABELS: Record<string, string> = {
  booking_confirmed: 'Booking confirmed',
  booking_requested: 'Request received',
  booking_rescheduled: 'Rescheduled',
  booking_cancelled: 'Cancellation',
  slot_opened: 'New opening',
  reminder: 'Reminder',
  welcome: 'Welcome',
  owner_new_booking: 'Owner alert',
  owner_booking_cancelled: 'Owner alert',
  owner_booking_rescheduled: 'Owner alert',
};

export function NotificationsPage() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('inbox');
  const [filter, setFilter] = useState<Filter>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [emails, setEmails] = useState<EmailDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<EmailDelivery | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  async function loadNotifications() {
    const data = await get<{ notifications: Notification[]; unreadCount: number }>('/me/notifications');
    setNotifications(data.notifications);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([get<{ notifications: Notification[] }>('/me/notifications'), get<{ emails: EmailDelivery[] }>('/me/emails')])
      .then(([notes, mail]) => {
        if (cancelled) return;
        setNotifications(notes.notifications);
        setEmails(mail.emails);
      })
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not load notifications.', 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const unread = notifications.filter((item) => !item.isRead).length;
  const shown = useMemo(
    () => (filter === 'unread' ? notifications.filter((item) => !item.isRead) : notifications),
    [notifications, filter],
  );

  async function markRead(id: string) {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    await patch(`/me/notifications/${id}/read`).catch(() => {});
    announceNotificationsChanged();
  }

  async function openNotification(item: Notification) {
    if (!item.isRead) await markRead(item.id);
    if (item.actionUrl) navigate(item.actionUrl);
  }

  async function markAllRead() {
    try {
      await post('/me/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      announceNotificationsChanged();
      toast('Everything marked as read.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark notifications as read.', 'error');
    }
  }

  async function setPreference(key: 'emailNotifications' | 'inAppNotifications', value: boolean) {
    if (!user) return;
    setSavingPrefs(true);
    try {
      const data = await patch<{ user: typeof user }>('/me/preferences', {
        emailNotifications: key === 'emailNotifications' ? value : user.emailNotifications,
        inAppNotifications: key === 'inAppNotifications' ? value : user.inAppNotifications,
      });
      updateUser(data.user);
      announceNotificationsChanged();
      toast('Notification preferences updated.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  }

  if (loading) return <PageLoader label="Gathering notifications" />;

  return (
    <div className="notifications-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Stay in the loop</div>
          <h1>Notifications</h1>
          <p>Confirmations, gentle reminders, and the little openings worth knowing about.</p>
        </div>
        <div className="page-head-badges">
          <span className="head-badge"><Bell size={14} /> {unread} unread</span>
          <span className="head-badge head-badge-sage"><Mail size={14} /> {emails.length} emails</span>
        </div>
      </div>

      <div className="notification-toolbar">
        <div className="segmented-tabs notification-tabs">
          <button className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
            <Inbox size={15} /> In-app {unread > 0 && <span className="tab-count">{unread}</span>}
          </button>
          <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>
            <Mail size={15} /> Email deliveries <span className="tab-count">{emails.length}</span>
          </button>
        </div>
        {tab === 'inbox' && (
          <div className="notification-actions">
            <div className="chip-group">
              <button className={`chip chip-sm ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All
              </button>
              <button className={`chip chip-sm ${filter === 'unread' ? 'active' : ''}`} onClick={() => setFilter('unread')}>
                Unread
              </button>
            </div>
            {unread > 0 && (
              <button className="btn btn-sm btn-outline" onClick={markAllRead}>
                <CheckCheck size={15} /> Mark all read
              </button>
            )}
          </div>
        )}
      </div>

      {tab === 'inbox' ? (
        shown.length > 0 ? (
          <div className="notification-list">
            {shown.map((item) => (
              <div className={`notification-row ${!item.isRead ? 'unread' : ''}`} key={item.id}>
                <NotificationIcon type={item.type} />
                <button className="notification-content" onClick={() => openNotification(item)}>
                  <div className="notification-title-row">
                    <strong>{item.title}</strong>
                    {!item.isRead && <span className="unread-tag">New</span>}
                  </div>
                  <p>{item.body}</p>
                  <span className="notification-time">{timeAgo(item.createdAt)}</span>
                </button>
                <div className="notification-row-actions">
                  {!item.isRead && (
                    <button
                      className="icon-btn"
                      onClick={() => markRead(item.id)}
                      title="Mark as read"
                      aria-label="Mark as read"
                    >
                      <Check size={16} />
                    </button>
                  )}
                  {item.actionUrl && (
                    <button
                      className="icon-btn"
                      onClick={() => openNotification(item)}
                      title="Open"
                      aria-label="Open notification"
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BellRing size={25} />}
            title={filter === 'unread' ? 'All caught up' : 'No notifications yet'}
            description={
              filter === 'unread'
                ? 'You have read everything. Future confirmations and openings will land here.'
                : 'When you book, reschedule, or a favorite place opens up, you will hear about it here.'
            }
            action={filter === 'unread' ? <button className="btn btn-dark" onClick={() => setFilter('all')}>See all notifications</button> : undefined}
          />
        )
      ) : emails.length > 0 ? (
        <div className="email-list">
          <div className="email-list-note">
            <MailOpen size={16} />
            <span>
              Every email Tempo sends lands here too. In local development, messages are stored in the demo outbox
              (and <code>data/emails/</code>) instead of being delivered.
            </span>
          </div>
          {emails.map((email) => (
            <div className="email-row" key={email.id}>
              <span className="email-icon"><Mail size={17} /></span>
              <div className="email-copy">
                <div className="email-subject-row">
                  <strong>{email.subject}</strong>
                  <span className={`email-status email-status-${email.status}`}>
                    {email.status === 'sent' ? 'Sent' : email.status === 'failed' ? 'Failed' : 'Demo outbox'}
                  </span>
                </div>
                <span>
                  To {email.toEmail} · {KIND_LABELS[email.kind] || email.kind.replaceAll('_', ' ')} · {timeAgo(email.createdAt)}
                </span>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setPreview(email)}>
                Preview email
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Mail size={25} />}
          title="No emails yet"
          description="Booking confirmations, reminders, and opening alerts will appear here for reference."
        />
      )}

      <div className="notification-settings-panel">
        <div className="settings-panel-head">
          <span className="settings-panel-icon"><Settings2 size={19} /></span>
          <div>
            <h2>How would you like to hear from us?</h2>
            <p>Your preferences apply to all confirmation emails, reminders, and opening alerts.</p>
          </div>
        </div>
        <div className="preference-list">
          <div className="preference-row">
            <div>
              <strong><Bell size={16} /> In-app notifications</strong>
              <span>See updates in your notification center and the little bell up top.</span>
            </div>
            <button
              className={`toggle ${user?.inAppNotifications ? 'on' : ''}`}
              onClick={() => setPreference('inAppNotifications', !user?.inAppNotifications)}
              disabled={savingPrefs}
              role="switch"
              aria-checked={Boolean(user?.inAppNotifications)}
              aria-label="In-app notifications"
            >
              <span />
            </button>
          </div>
          <div className="preference-row">
            <div>
              <strong><Mail size={16} /> Email notifications</strong>
              <span>Confirmations, reminders, and new-opening alerts sent to {user?.email}.</span>
            </div>
            <button
              className={`toggle ${user?.emailNotifications ? 'on' : ''}`}
              onClick={() => setPreference('emailNotifications', !user?.emailNotifications)}
              disabled={savingPrefs}
              role="switch"
              aria-checked={Boolean(user?.emailNotifications)}
              aria-label="Email notifications"
            >
              <span />
            </button>
          </div>
        </div>
        <div className="settings-panel-foot">
          <Sparkles size={14} />
          <span>We only send the useful stuff. No marketing noise, ever.</span>
        </div>
      </div>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.subject || 'Email preview'}
        eyebrow="Email delivery preview"
        size="lg"
      >
        {preview && (
          <div className="email-preview">
            <div className="email-preview-meta">
              <span>To: {preview.toEmail}</span>
              <span>Status: {preview.status === 'sent' ? 'Sent via SMTP' : 'Stored in demo outbox'}</span>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="email-frame" />
          </div>
        )}
      </Modal>
    </div>
  );
}
