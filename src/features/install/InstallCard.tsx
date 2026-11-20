import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '../../components/ui';

/** Chrome/Edge/Android fire this event when the app can be installed with one tap. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone(): boolean {
  return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: deferred !== null,
    ios: isIos(),
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
      return outcome === 'accepted';
    },
  };
}

const DISMISS_KEY = 'nexus.install.dismissed';

/**
 * "Install NEXUS" — one tap on Android/desktop Chrome & Edge; step-by-step on iPhone;
 * hidden once installed. `variant="banner"` is dismissible (Home); "panel" always shows (Settings).
 */
export function InstallCard({ variant }: { variant: 'banner' | 'panel' }) {
  const { installed, canPrompt, ios, install } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (installed) {
    return variant === 'panel' ? (
      <div className="rounded-xl border border-border p-4">
        <p className="text-[15px] font-medium">Installed</p>
        <p className="text-sm text-text-muted">You’re using NEXUS as an app.</p>
      </div>
    ) : null;
  }
  if (variant === 'banner' && (dismissed || (!canPrompt && !ios))) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* non-fatal */
    }
  };

  return (
    <div className="relative rounded-2xl border border-accent/40 bg-surface p-4">
      {variant === 'banner' && (
        <button className="absolute right-2 top-2 rounded-lg p-1.5 text-text-faint hover:text-text" onClick={close} aria-label="Not now">
          <X className="size-4" aria-hidden />
        </button>
      )}
      <div className="flex items-start gap-3 pr-6">
        <img src="/icons/icon-192.png" alt="" className="size-10 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Install NEXUS on this phone</p>
          {canPrompt ? (
            <>
              <p className="mt-0.5 text-sm text-text-muted">Opens full-screen from your home screen and receives reminders even when closed.</p>
              <Button className="mt-3 h-9 px-3 text-sm" onClick={() => void install()}>
                <Download className="size-4" aria-hidden /> Install app
              </Button>
            </>
          ) : ios ? (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-text-muted">
              <li>
                In Safari, tap <Share className="inline size-3.5 align-[-2px]" aria-label="Share" /> Share
              </li>
              <li>Choose “Add to Home Screen”, then Add</li>
              <li>Open NEXUS from the new icon</li>
            </ol>
          ) : (
            <p className="mt-0.5 text-sm text-text-muted">
              In Chrome, open the menu (⋮) and choose “Install app” or “Add to Home screen”. If you don’t see it, NEXUS may already be installed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
