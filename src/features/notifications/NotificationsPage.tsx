import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { Link, useNavigate } from 'react-router';
import { BellOff, Check, Clock, X } from 'lucide-react';
import { Notice, Panel } from '../../components/ui';
import { announceChange, dismiss, fetchNotifications, isVisible, markRead, snooze, type Notif } from './api';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

export function NotificationsPage() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setItems(await cached('notifications', fetchNotifications));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    cached('notifications', fetchNotifications)
      .then((n) => active && setItems(n))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Could not load notifications.'));
    return () => {
      active = false;
    };
  }, []);

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
      await load();
      announceChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const visible = items?.filter((n) => isVisible(n)) ?? [];
  const history = items?.filter((n) => !isVisible(n)) ?? [];
  const unreadIds = visible.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-[15px] text-text-muted">
            Reminders from your own records. <Link to="/settings" className="text-accent hover:underline">Settings</Link>
          </p>
        </div>
        {unreadIds.length > 0 && (
          <button className="text-sm text-text-muted hover:text-text" onClick={() => act(() => markRead(unreadIds))}>
            Mark all read
          </button>
        )}
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {items && visible.length === 0 && (
        <Panel>
          <p className="flex items-center gap-2 text-[15px] text-text-muted">
            <BellOff className="size-4" aria-hidden /> Nothing needs you right now.
          </p>
        </Panel>
      )}
      <ul className="space-y-2">
        {visible.map((n) => (
          <li key={n.id} className={`rounded-2xl border p-4 ${n.read_at ? 'border-border bg-surface' : 'border-accent/40 bg-surface'}`}>
            <div className="flex items-start gap-3">
              {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  act(async () => {
                    await markRead([n.id]);
                    if (n.link && /^\/(?!\/)/.test(n.link)) navigate(n.link);
                  })
                }
              >
                <p className={`text-[15px] ${n.priority === 'high' ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-text-muted">{n.body}</p>}
                <p className="mt-1 text-xs text-text-faint">
                  {n.category} · {ago(n.created_at)}
                </p>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {!n.read_at && (
                  <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={() => act(() => markRead([n.id]))} aria-label="Mark read">
                    <Check className="size-4" aria-hidden />
                  </button>
                )}
                <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={() => act(() => snooze(n.id, new Date(Date.now() + 3_600_000)))} aria-label="Snooze 1 hour" title="Snooze 1 hour">
                  <Clock className="size-4" aria-hidden />
                </button>
                <button className="rounded-lg p-1.5 text-text-faint hover:text-text" onClick={() => act(() => dismiss(n.id))} aria-label="Dismiss">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {history.length > 0 && (
        <div>
          <button className="text-sm text-text-muted hover:text-text" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : `History (${history.length})`}
          </button>
          {showHistory && (
            <ul className="mt-2 divide-y divide-border">
              {history.map((n) => (
                <li key={n.id} className="py-2.5">
                  <p className="text-[15px] text-text-muted">{n.title}</p>
                  <p className="text-xs text-text-faint">
                    {ago(n.created_at)} · {n.dismissed_at ? 'dismissed' : 'snoozed'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
