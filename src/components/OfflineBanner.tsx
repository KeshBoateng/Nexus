import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { offlineState, onOfflineChange } from '../lib/offline';

export function OfflineBanner() {
  const [since, setSince] = useState(offlineState());
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const off = onOfflineChange(() => setSince(offlineState()));
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      off();
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  if (online && since === null) return null;
  const when = since ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(since)) : null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>
        You’re offline{when ? ` — showing data saved ${when}` : ''}. Changes need a connection.
      </span>
    </div>
  );
}
