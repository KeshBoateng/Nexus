import { NavLink, Outlet, useLocation } from 'react-router';
import { Bell, Settings } from 'lucide-react';
import { useUnreadCount } from '../features/notifications/api';
import { DESTINATIONS } from './navigation';
import { OfflineBanner } from '../components/OfflineBanner';

/**
 * Mobile: content + fixed bottom bar with the five destinations.
 * Desktop (lg+): slim left rail with the same five, settings pinned at the bottom.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const unread = useUnreadCount();
  const badge = unread > 0 && (
    <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent tabular">
      {unread > 9 ? '9+' : unread}
    </span>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border px-4 py-6 lg:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <img src="/icon.svg" alt="" className="size-7" />
          <span className="text-[13px] font-semibold tracking-[0.2em] text-text-muted">NEXUS</span>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
          {DESTINATIONS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                  isActive ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`size-[18px] ${isActive ? 'text-accent' : ''}`} strokeWidth={1.75} aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `mb-1 flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] ${
              isActive ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
            }`
          }
        >
          <span className="relative">
            <Bell className="size-[18px]" strokeWidth={1.75} aria-hidden />
            {badge}
          </span>
          Notifications{unread > 0 && <span className="sr-only"> ({unread} unread)</span>}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] ${
              isActive ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
            }`
          }
        >
          <Settings className="size-[18px]" strokeWidth={1.75} aria-hidden />
          Settings
        </NavLink>
      </aside>

      {/* Mobile top bar: settings stays reachable without taking a primary slot */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="size-6" />
          <span className="text-[12px] font-semibold tracking-[0.2em] text-text-muted">NEXUS</span>
        </div>
        <div className="flex items-center">
        <NavLink
          to="/notifications"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative flex size-10 items-center justify-center rounded-xl text-text-muted hover:text-text"
        >
          <span className="relative">
            <Bell className="size-5" strokeWidth={1.75} aria-hidden />
            {badge}
          </span>
        </NavLink>
        <NavLink
          to="/settings"
          aria-label="Settings"
          className="flex size-10 items-center justify-center rounded-xl text-text-muted hover:text-text"
        >
          <Settings className="size-5" strokeWidth={1.75} aria-hidden />
        </NavLink>
        </div>
      </header>

      <main id="main" key={pathname} className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 animate-rise sm:px-6 lg:pb-12 lg:pt-12">
        <OfflineBanner />
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {DESTINATIONS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                isActive ? 'text-text' : 'text-text-faint'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`size-[22px] ${isActive ? 'text-accent' : ''}`} strokeWidth={1.75} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
