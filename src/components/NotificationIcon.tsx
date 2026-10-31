import { Bell, CalendarCheck, CalendarClock, CalendarX2, Heart, Sparkles, UserPlus } from 'lucide-react';

export function NotificationIcon({ type }: { type: string }) {
  const icon =
    type.includes('cancel') ? (
      <CalendarX2 size={17} />
    ) : type.includes('resched') ? (
      <CalendarClock size={17} />
    ) : type.includes('confirm') || type.includes('booking') ? (
      <CalendarCheck size={17} />
    ) : type === 'slot_opened' ? (
      <Heart size={17} />
    ) : type === 'welcome' ? (
      <Sparkles size={17} />
    ) : type === 'new_booking' ? (
      <UserPlus size={17} />
    ) : (
      <Bell size={17} />
    );

  const tone =
    type.includes('cancel')
      ? 'rose'
      : type.includes('confirm') || type.includes('booking')
        ? 'sage'
        : type === 'slot_opened'
          ? 'terracotta'
          : type === 'welcome'
            ? 'gold'
            : 'neutral';

  return <span className={`notification-icon tone-${tone}`}>{icon}</span>;
}
