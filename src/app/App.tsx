import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { SignInPage } from '../features/auth/SignInPage';
import { NewPasswordPage } from '../features/auth/NewPasswordPage';
import { ProfileProvider } from '../features/profile/ProfileProvider';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AcademicsPage } from '../features/academics/AcademicsPage';
import {
  DevelopmentPage,
  HomePage,
  IntelligencePage,
  MyLifePage,
  ProjectsPage,
} from '../features/destinations/pages';
import { supabase } from '../lib/supabase';
import { AppShell } from './AppShell';
import { SetupRequired } from './SetupRequired';

function Gate() {
  const { session, loading, recovering } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <img src="/icon.svg" alt="Loading NEXUS" className="size-10 animate-pulse" />
      </div>
    );
  }
  if (recovering) return <NewPasswordPage />;
  if (!session) return <SignInPage />;
  return (
    <ProfileProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="life" element={<MyLifePage />} />
          <Route path="life/academics" element={<AcademicsPage />} />
          <Route path="development" element={<DevelopmentPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="intelligence" element={<IntelligencePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProfileProvider>
  );
}

export function App() {
  if (!supabase) return <SetupRequired />;
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
