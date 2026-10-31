import { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface AppNotification {
  id: string;
  emoji: string;
  title: string;
  subtitle?: string;
  /** 'top' | 'bottom' — default 'top' */
  position?: 'top' | 'bottom';
  /** auto-dismiss in ms — 0 means manual only. Default 3500 */
  duration?: number;
  /** optional action button */
  action?: { label: string; onClick: () => void };
}

interface NotificationContextValue {
  notifications: AppNotification[];
  push: (n: Omit<AppNotification, 'id'>) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const Ctx = createContext<NotificationContextValue>({
  notifications: [],
  push: () => '',
  dismiss: () => {},
  dismissAll: () => {},
});

export function useNotifications() {
  return useContext(Ctx);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const shownIds = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const push = useCallback((n: Omit<AppNotification, 'id'>) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full: AppNotification = { ...n, id };
    setNotifications(prev => [...prev, full]);
    shownIds.current.add(id);
    const dur = n.duration ?? 3500;
    if (dur > 0) {
      const t = setTimeout(() => dismiss(id), dur);
      timers.current.set(id, t);
    }
    return id;
  }, [dismiss]);

  const dismissAll = useCallback(() => {
    timers.current.forEach(t => clearTimeout(t));
    timers.current.clear();
    setNotifications([]);
  }, []);

  return (
    <Ctx.Provider value={{ notifications, push, dismiss, dismissAll }}>
      {children}
    </Ctx.Provider>
  );
}
