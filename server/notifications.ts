import type { DatabaseSync } from 'node:sqlite';
import { deliverEmail, type EmailContent } from './email.js';
import { nowIso, uid } from './utils.js';

export interface NotifyOptions {
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  businessId?: string | null;
  bookingId?: string | null;
  email?: {
    subject: string;
    kind: string;
    kicker?: string;
    heading?: string;
    intro?: string;
    details?: { label: string; value: string }[];
    ctaLabel?: string;
    footnote?: string;
  };
}

interface PrefRow {
  email: string;
  email_notifications: number;
  in_app_notifications: number;
}

export async function notifyUser(db: DatabaseSync, opts: NotifyOptions): Promise<string | null> {
  const user = db
    .prepare('SELECT email, email_notifications, in_app_notifications FROM users WHERE id = ?')
    .get(opts.userId) as PrefRow | undefined;
  if (!user) return null;

  let notificationId: string | null = null;
  if (user.in_app_notifications) {
    notificationId = uid();
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, action_url, business_id, booking_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      notificationId,
      opts.userId,
      opts.type,
      opts.title,
      opts.body,
      opts.actionUrl || '',
      opts.businessId || null,
      opts.bookingId || null,
      nowIso(),
    );
  }

  if (opts.email && user.email_notifications) {
    const content: EmailContent = {
      kicker: opts.email.kicker || 'Your appointment',
      heading: opts.email.heading || opts.title,
      intro: opts.email.intro || opts.body,
      details: opts.email.details,
      ctaLabel: opts.email.ctaLabel || 'View in Tempo',
      ctaUrl: opts.actionUrl,
      footnote: opts.email.footnote,
    };
    await deliverEmail(db, {
      userId: opts.userId,
      to: user.email,
      subject: opts.email.subject,
      kind: opts.email.kind,
      content,
    });
  }

  return notificationId;
}
