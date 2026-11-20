export type ThemePreference = 'dark' | 'light' | 'system';

const KEY = 'nexus.theme';

function resolve(pref: ThemePreference): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function readStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    /* storage unavailable (private mode) — fall through to default */
  }
  return 'dark';
}

/** Apply a theme now and remember it locally so the next load paints correctly. */
export function applyTheme(pref: ThemePreference): void {
  const resolved = resolve(pref);
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f6f5f1' : '#0d0e11');
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* non-fatal */
  }
}
