/// <reference lib="webworker" />
/**
 * NEXUS service worker: app-shell precache + Web Push.
 * Supabase API responses are never cached here (private data stays out of the SW cache).
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

/** Only same-origin paths may be opened from a notification. */
function safePath(url: unknown): string {
  return typeof url === 'string' && /^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/.test(url) ? url : '/';
}

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string };
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'NEXUS', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'NEXUS', {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag,
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safePath((event.notification.data as { url?: string } | undefined)?.url);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await (w as WindowClient).focus();
          await (w as WindowClient).navigate(path).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(path);
    })(),
  );
});
