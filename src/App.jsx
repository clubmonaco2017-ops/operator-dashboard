import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'
import LoginPage from './LoginPage.jsx'
import SetPasswordPage from './SetPasswordPage.jsx'
import AdminLayout from './AdminLayout.jsx'
import { AppShell } from './components/shell/AppShell.jsx'
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
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

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
      </Route>
      {isSuperadmin(user) && (
        <Route
          path="/admin/*"
          element={
            <AdminLayout
              onClose={() => navigate('/')}
              onLogout={signOut}
              currentUser={user}
            />
          }
        />
      )}
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
