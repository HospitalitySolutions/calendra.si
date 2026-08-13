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
import { ProviderPage } from './pages/ProviderPage'
import { PurchasePage } from './pages/PurchasePage'
import { CheckoutReturnPage } from './pages/CheckoutReturnPage'
import { RegisterPage } from './pages/RegisterPage'
import { WalletPage } from './pages/WalletPage'

export default function App() {
  return <Routes>
    <Route path="/prijava" element={<LoginPage/>}/>
    <Route path="/registracija" element={<RegisterPage/>}/>
    <Route path="/pozabljeno-geslo" element={<ForgotPasswordPage/>}/>

    {/* Backwards-compatible routes from connect.calendra.si. */}
    <Route path="/login" element={<Navigate to="/prijava" replace/>}/>
    <Route path="/register" element={<Navigate to="/registracija" replace/>}/>
    <Route path="/forgot-password" element={<Navigate to="/pozabljeno-geslo" replace/>}/>

    <Route element={<ProtectedRoute/>}>
      <Route element={<CustomerShell/>}>
        <Route index element={<HomePage/>}/>
        <Route path="isci" element={<DiscoverPage/>}/>
        <Route path="ponudniki/:slug" element={<ProviderPage/>}/>
        <Route path="ponudniki/:slug/kupi/:productId" element={<PurchasePage/>}/>
        <Route path="placilo/vrnitev" element={<CheckoutReturnPage/>}/>
        <Route path="termini" element={<BookingsPage/>}/>
        <Route path="termini/:id" element={<BookingDetailPage/>}/>
        <Route path="denarnica" element={<WalletPage/>}/>
        <Route path="sporocila" element={<InboxPage/>}/>
        <Route path="obvestila" element={<NotificationsPage/>}/>
        <Route path="profil" element={<ProfilePage/>}/>

        {/* Legacy internal paths remain valid after the same-domain migration. */}
        <Route path="discover" element={<Navigate to="/isci" replace/>}/>
        <Route path="providers/:slug" element={<ProviderPage/>}/>
        <Route path="providers/:slug/buy/:productId" element={<PurchasePage/>}/>
        <Route path="checkout/return" element={<CheckoutReturnPage/>}/>
        <Route path="bookings" element={<Navigate to="/termini" replace/>}/>
        <Route path="bookings/:id" element={<BookingDetailPage/>}/>
        <Route path="wallet" element={<Navigate to="/denarnica" replace/>}/>
        <Route path="inbox" element={<Navigate to="/sporocila" replace/>}/>
        <Route path="notifications" element={<Navigate to="/obvestila" replace/>}/>
        <Route path="profile" element={<Navigate to="/profil" replace/>}/>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>
}
