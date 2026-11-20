import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { SignInPage } from '../features/auth/SignInPage';
import { NewPasswordPage } from '../features/auth/NewPasswordPage';
import { ProfileProvider } from '../features/profile/ProfileProvider';
import {
  HomePage,
  MyLifePage,
} from '../features/destinations/pages';
import { supabase } from '../lib/supabase';
import { AppShell } from './AppShell';
import { SetupRequired } from './SetupRequired';

// Section pages load on demand so the first screen stays small on phones.
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AcademicsPage = lazy(() => import('../features/academics/AcademicsPage').then((m) => ({ default: m.AcademicsPage })));
const FinancesPage = lazy(() => import('../features/finances/FinancesPage').then((m) => ({ default: m.FinancesPage })));
const GoalsPage = lazy(() => import('../features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const ProjectsListPage = lazy(() => import('../features/projects/ProjectsPages').then((m) => ({ default: m.ProjectsListPage })));
const ProjectDetailPage = lazy(() => import('../features/projects/ProjectsPages').then((m) => ({ default: m.ProjectDetailPage })));

const IntelligencePage = lazy(() => import('../features/intelligence/IntelligencePage').then((m) => ({ default: m.IntelligencePage })));

const DevelopmentPage = lazy(() => import('../features/development/DevelopmentPage').then((m) => ({ default: m.DevelopmentPage })));

const page = (el: React.ReactNode) => <Suspense fallback={<p className="text-text-muted">Loading…</p>}>{el}</Suspense>;

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
          <Route path="life/academics" element={page(<AcademicsPage />)} />
          <Route path="life/finances" element={page(<FinancesPage />)} />
          <Route path="life/goals" element={page(<GoalsPage />)} />
          <Route path="development" element={page(<DevelopmentPage />)} />
          <Route path="projects" element={page(<ProjectsListPage />)} />
          <Route path="projects/:id" element={page(<ProjectDetailPage />)} />
          <Route path="intelligence" element={page(<IntelligencePage />)} />
          <Route path="settings" element={page(<SettingsPage />)} />
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
