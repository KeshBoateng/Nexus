import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cached } from '../../lib/offline';
import { useAuth } from '../auth/AuthProvider';
import { applyTheme } from '../../lib/theme';
import { fetchPreferences, fetchProfile, type Preferences, type Profile } from './api';

interface ProfileState {
  profile: Profile | null;
  preferences: Preferences | null;
  error: string | null;
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<() => void> => {
    if (!userId) return () => {};
    try {
      const [p, prefs] = await Promise.all([cached('profile', () => fetchProfile(userId)), cached('preferences', () => fetchPreferences(userId))]);
      return () => {
        setProfile(p);
        setPreferences(prefs);
        applyTheme(prefs.theme);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load your profile.');
    }
  }, [userId]);

  const reload = useCallback(async () => (await load())(), [load]);

  useEffect(() => {
    // Initial load; state is applied in the promise callback, and dropped if the user changed meanwhile.
    let active = true;
    load().then((apply) => {
      if (active) apply();
    });
    return () => {
      active = false;
    };
  }, [load]);

  return <ProfileContext.Provider value={{ profile, preferences, error, reload }}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
