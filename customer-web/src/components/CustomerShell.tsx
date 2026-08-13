import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { useAuth } from '../auth/AuthContext'
import { BellIcon, CalendarIcon, HomeIcon, MessageIcon, SearchIcon, UserIcon, WalletIcon } from './Icons'
import { initials } from '../utils'

const navItems = [
  { to: '/', label: 'Domov', icon: HomeIcon, end: true },
  { to: '/discover', label: 'Razišči', icon: SearchIcon },
  { to: '/bookings', label: 'Termini', icon: CalendarIcon },
  { to: '/wallet', label: 'Denarnica', icon: WalletIcon },
  { to: '/inbox', label: 'Prejeto', icon: MessageIcon },
]

export function CustomerShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: home } = useQuery({ queryKey: ['customer-home-shell'], queryFn: customerApi.home, staleTime: 45_000 })
  const title = location.pathname === '/' ? 'Domov'
    : location.pathname.startsWith('/discover') ? 'Razišči'
      : location.pathname.startsWith('/bookings') ? 'Termini'
        : location.pathname.startsWith('/wallet') ? 'Denarnica'
          : location.pathname.startsWith('/inbox') ? 'Prejeto'
            : location.pathname.startsWith('/notifications') ? 'Obvestila'
              : location.pathname.startsWith('/profile') ? 'Profil'
                : 'Calendra Connect'

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand-button" onClick={() => navigate('/')} aria-label="Calendra Connect domov"><img src="/calendra-connect-logo.png" alt="Calendra Connect"/></button>
      <nav className="sidebar-nav" aria-label="Glavna navigacija">
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}><Icon/><span>{label}</span>{label === 'Prejeto' && Boolean(home?.unreadInboxCount) && <b className="nav-badge">{home?.unreadInboxCount}</b>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom"><NavLink to="/profile" className={({ isActive }) => `profile-mini ${isActive ? 'profile-mini--active' : ''}`}><span className="avatar">{initials(user?.firstName, user?.lastName)}</span><span><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.email}</small></span></NavLink></div>
    </aside>

    <main className="app-main">
      <header className="topbar">
        <div><span className="topbar__mobile-brand">Calendra Connect</span><h1>{title}</h1></div>
        <div className="topbar__actions">
          <button className="icon-button" onClick={() => navigate('/notifications')} aria-label="Obvestila"><BellIcon/>{Boolean(home?.unreadNotificationCount) && <span className="notification-dot">{home!.unreadNotificationCount > 9 ? '9+' : home!.unreadNotificationCount}</span>}</button>
          <button className="avatar-button" onClick={() => navigate('/profile')} aria-label="Profil">{initials(user?.firstName, user?.lastName)}</button>
        </div>
      </header>
      <div className="app-content"><Outlet/></div>
    </main>

    <nav className="mobile-nav" aria-label="Glavna mobilna navigacija">
      {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav__item ${isActive ? 'mobile-nav__item--active' : ''}`}><span className="mobile-nav__icon"><Icon size={21}/>{label === 'Prejeto' && Boolean(home?.unreadInboxCount) && <i/>}</span><span>{label}</span></NavLink>)}
    </nav>
  </div>
}
