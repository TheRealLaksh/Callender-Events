export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationState(): NotificationState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestNotifications(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows a system notification, preferring the service worker so it works on mobile and when backgrounded. */
export async function showSystemNotification(title: string, body: string, tag: string): Promise<void> {
  if (notificationState() !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* fall through to the page-level API */
  }
  try {
    new Notification(title, options);
  } catch {
    /* some mobile browsers only allow the service-worker form */
  }
}
