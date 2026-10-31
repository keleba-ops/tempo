export const NOTIFICATIONS_CHANGED = 'tempo:notifications-changed';

export function announceNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export const MESSAGES_CHANGED = 'tempo:messages-changed';

export function announceMessagesChanged(): void {
  window.dispatchEvent(new Event(MESSAGES_CHANGED));
}
