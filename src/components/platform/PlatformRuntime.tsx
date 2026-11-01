import { useEffect } from 'react';
import { initNotifications } from '@/platform/notify';
import { backupNow, startAutoBackup } from '@/platform/autoBackup';

/** Starts the background services once: notifications, scheduled reminders and automatic backups. */
export default function PlatformRuntime() {
  useEffect(() => {
    void initNotifications().then(() => startAutoBackup());
    const onAction = (e: Event) => {
      if ((e as CustomEvent<{ id: string }>).detail?.id === 'backup-now') void backupNow('Notification');
    };
    window.addEventListener('rj:native-action', onAction);
    return () => window.removeEventListener('rj:native-action', onAction);
  }, []);
  return null;
}
