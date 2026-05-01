import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'
import LoginPage from './LoginPage.jsx'
import SetPasswordPage from './SetPasswordPage.jsx'
import { AppShell } from './components/shell/AppShell.jsx'
import { AdminShell } from './components/admin-shell/index.js'
import PlatformsSection from './sections/PlatformsSection'
import {
  AgencyListPage,
  AgencyDetailRoute,
  AgencyDetailEmpty,
} from './pages/AgencyListPage.jsx'
import { AgencyBrandingTab } from './components/agencies/AgencyBrandingTab.jsx'
import { AgencyContactsTab } from './components/agencies/AgencyContactsTab.jsx'
import { AgencyAdminsTab } from './components/agencies/AgencyAdminsTab.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { StaffListPage, StaffDetailRoute, StaffDetailEmpty } from './pages/StaffListPage.jsx'
import { ProfileTab } from './components/staff/ProfileTab.jsx'
import { AttributesTab } from './components/staff/AttributesTab.jsx'
import { PermissionsTab } from './components/staff/PermissionsTab.jsx'
import { ActivityTab } from './components/staff/ActivityTab.jsx'
import { NotificationsPage } from './pages/NotificationsPage.jsx'
import {
  ClientListPage,
  ClientDetailRoute,
  ClientDetailEmpty,
} from './pages/ClientListPage.jsx'
import {
  TeamListPage,
  TeamDetailRoute,
  TeamDetailEmpty,
} from './pages/TeamListPage.jsx'
import {
  TaskListPage,
  TaskDetailRoute,
  TaskDetailEmpty,
} from './pages/TaskListPage.jsx'
import { isSuperadmin } from './lib/permissions.js'

export default function App() {
  const { user, loading } = useAuth()

  // Show loader only on the initial mount (no user yet). Subsequent profile
  // refreshes (tab focus, token rotation) keep the rendered tree mounted —
  // otherwise filters / open dialogs / scroll positions reset every time the
  // window loses focus.
  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/staff" element={<StaffListPage />}>
          <Route index element={<StaffDetailEmpty />} />
          <Route path=":refCode" element={<StaffDetailRoute />}>
            <Route index element={<ProfileTab />} />
            <Route path="attributes" element={<AttributesTab />} />
            <Route path="permissions" element={<PermissionsTab />} />
            <Route path="activity" element={<ActivityTab />} />
          </Route>
        </Route>
        <Route path="/staff/new" element={<Navigate to="/staff" replace />} />
        <Route path="/clients" element={<ClientListPage />}>
          <Route index element={<ClientDetailEmpty />} />
          <Route path=":clientId" element={<ClientDetailRoute />} />
          <Route path=":clientId/:tab" element={<ClientDetailRoute />} />
        </Route>
        <Route path="/teams" element={<TeamListPage />}>
          <Route index element={<TeamDetailEmpty />} />
          <Route path=":teamId" element={<TeamDetailRoute />} />
        </Route>
        <Route path="/tasks" element={<TaskListPage />}>
          <Route index element={<TaskDetailEmpty />} />
          <Route path=":taskId" element={<TaskDetailRoute />} />
          <Route path="outbox" element={<TaskDetailEmpty />} />
          <Route path="outbox/:taskId" element={<TaskDetailRoute />} />
          <Route path="all" element={<TaskDetailEmpty />} />
          <Route path="all/:taskId" element={<TaskDetailRoute />} />
        </Route>
        <Route path="/notifications" element={<NotificationsPage />} />
        {isSuperadmin(user) && (
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Navigate to="platforms" replace />} />
            <Route path="platforms/*" element={<PlatformsSection />} />
            <Route path="agencies" element={<AgencyListPage />}>
              <Route index element={<AgencyDetailEmpty />} />
              <Route path=":agencyId" element={<AgencyDetailRoute />}>
                <Route index element={<Navigate to="branding" replace />} />
                <Route path="branding" element={<AgencyBrandingTab />} />
                <Route path="contacts" element={<AgencyContactsTab />} />
                <Route path="admins" element={<AgencyAdminsTab />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/admin/platforms" replace />} />
          </Route>
        )}
      </Route>
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
