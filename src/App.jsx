import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'
import LoginPage from './LoginPage.jsx'
import AdminLayout from './AdminLayout.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { StaffListPage } from './pages/StaffListPage.jsx'
import { StaffCreatePage } from './pages/StaffCreatePage.jsx'
import { StaffDetailPage } from './pages/StaffDetailPage.jsx'
import { NotificationsPage } from './pages/NotificationsPage.jsx'
import { ClientListPage } from './pages/ClientListPage.jsx'
import { isSuperadmin } from './lib/permissions.js'

export default function App() {
  const { user, login, logout, loading } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    return <LoginPage onLogin={login} loading={loading} />
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/staff" element={<StaffListPage />} />
      <Route path="/staff/new" element={<StaffCreatePage />} />
      <Route path="/staff/:refCode" element={<StaffDetailPage />} />
      <Route path="/staff/:refCode/:tab" element={<StaffDetailPage />} />
      <Route path="/clients" element={<ClientListPage />} />
      <Route path="/clients/:clientId" element={<ClientListPage />} />
      <Route path="/clients/:clientId/:tab" element={<ClientListPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
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
