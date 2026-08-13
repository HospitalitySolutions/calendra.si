import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CustomerShell } from './components/CustomerShell'
import { BookingDetailPage } from './pages/BookingDetailPage'
import { BookingsPage } from './pages/BookingsPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { InboxPage } from './pages/InboxPage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { WalletPage } from './pages/WalletPage'

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/register" element={<RegisterPage/>}/>
    <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route element={<CustomerShell/>}>
        <Route index element={<HomePage/>}/>
        <Route path="discover" element={<DiscoverPage/>}/>
        <Route path="bookings" element={<BookingsPage/>}/>
        <Route path="bookings/:id" element={<BookingDetailPage/>}/>
        <Route path="wallet" element={<WalletPage/>}/>
        <Route path="inbox" element={<InboxPage/>}/>
        <Route path="notifications" element={<NotificationsPage/>}/>
        <Route path="profile" element={<ProfilePage/>}/>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>
}
