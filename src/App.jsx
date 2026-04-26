import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'
import LoginPage from './LoginPage.jsx'
import AdminLayout from './AdminLayout.jsx'
import { AppShell } from './components/shell/AppShell.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { StaffListPage } from './pages/StaffListPage.jsx'
import { StaffCreatePage } from './pages/StaffCreatePage.jsx'
import { StaffDetailPage } from './pages/StaffDetailPage.jsx'
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
  const { user, login, logout, loading } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    return <LoginPage onLogin={login} loading={loading} />
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/staff" element={<StaffListPage />} />
        <Route path="/staff/new" element={<StaffCreatePage />} />
        <Route path="/staff/:refCode" element={<StaffDetailPage />} />
        <Route path="/staff/:refCode/:tab" element={<StaffDetailPage />} />
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
              onLogout={logout}
              currentUser={user}
            />
          }
        />
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
