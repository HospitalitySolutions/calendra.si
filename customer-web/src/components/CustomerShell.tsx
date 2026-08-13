import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { useAuth } from '../auth/AuthContext'
import {
  BellIcon,
  CalendarIcon,
  LogOutIcon,
  MessageIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  WalletIcon,
} from './Icons'
import { initials } from '../utils'

const navItems = [
  { to: '/profil', label: 'Profil', icon: UserIcon },
  { to: '/termini', label: 'Termini', icon: CalendarIcon },
  { to: '/denarnica', label: 'Denarnica', icon: WalletIcon },
  { to: '/sporocila', label: 'Sporočila', icon: MessageIcon },
  { to: '/obvestila', label: 'Obvestila', icon: BellIcon },
]

const accountMenuItems = [
  { to: '/profil', label: 'Moj profil', icon: UserIcon },
  { to: '/termini', label: 'Moji termini', icon: CalendarIcon },
  { to: '/denarnica', label: 'Denarnica', icon: WalletIcon },
  { to: '/sporocila', label: 'Sporočila', icon: MessageIcon },
  { to: '/obvestila', label: 'Obvestila', icon: BellIcon },
  { to: '/profil#nastavitve', label: 'Nastavitve', icon: SettingsIcon },
]

export function CustomerShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: home } = useQuery({ queryKey: ['customer-home-shell'], queryFn: customerApi.home, staleTime: 45_000 })

  const title = location.pathname === '/' ? 'Moj račun'
    : location.pathname.startsWith('/isci') ? 'Poišči termin'
      : location.pathname.startsWith('/termini') ? 'Termini'
        : location.pathname.startsWith('/denarnica') ? 'Denarnica'
          : location.pathname.startsWith('/sporocila') ? 'Sporočila'
            : location.pathname.startsWith('/obvestila') ? 'Obvestila'
              : location.pathname.startsWith('/profil') ? 'Profil'
                : 'Moj račun'

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [menuOpen])

  function performLogout() {
    logout()
    window.location.replace('/za-stranke')
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand-button brand-button--main" href="/za-stranke" aria-label="Calendra za stranke">
        <img src="/racun/calendra-wordmark.webp" alt="Calendra"/>
      </a>
      <div className="sidebar-user"><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.email}</small></div>
      <nav className="sidebar-nav" aria-label="Moj račun">
        {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}><Icon/><span>{label}</span>{label === 'Sporočila' && Boolean(home?.unreadInboxCount) && <b className="nav-badge">{home?.unreadInboxCount}</b>}{label === 'Obvestila' && Boolean(home?.unreadNotificationCount) && <b className="nav-badge">{home?.unreadNotificationCount}</b>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <a href="/ponudniki" className="nav-link"><SearchIcon/><span>Poišči ponudnika</span></a>
      </div>
    </aside>

    <main className="app-main">
      <header className="topbar">
        <div><span className="topbar__mobile-brand">Calendra</span><h1>{title}</h1></div>
        <div className="topbar__actions">
          <a className="button button--secondary topbar-search-button" href="/ponudniki"><SearchIcon size={17}/> Poišči termin</a>
          <div className="account-menu" ref={menuRef}>
            <button className="avatar-button avatar-button--menu" onClick={() => setMenuOpen(value => !value)} aria-label="Moj račun" aria-expanded={menuOpen}>
              {initials(user?.firstName, user?.lastName)}<span className="avatar-caret">⌄</span>
            </button>
            {menuOpen && <div className="account-menu__panel" role="menu">
              <div className="account-menu__identity"><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.email}</small></div>
              <div className="account-menu__divider"/>
              {accountMenuItems.map(({ to, label, icon: Icon }) => <a key={to} href={`/racun${to}`} className="account-menu__item" role="menuitem"><Icon size={18}/><span>{label}</span></a>)}
              <div className="account-menu__divider"/>
              <button className="account-menu__item" type="button" onClick={performLogout} role="menuitem"><LogOutIcon size={18}/><span>Odjava</span></button>
              <div className="account-menu__divider"/>
              <a className="account-menu__item account-menu__item--business" href="https://app.calendra.si"><span>Za podjetje</span><span>→</span></a>
            </div>}
          </div>
        </div>
      </header>
      <div className="app-content"><Outlet/></div>
    </main>

    <nav className="mobile-nav" aria-label="Moj račun">
      {navItems.slice(0, 4).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `mobile-nav__item ${isActive ? 'mobile-nav__item--active' : ''}`}><span className="mobile-nav__icon"><Icon size={21}/>{label === 'Sporočila' && Boolean(home?.unreadInboxCount) && <i/>}</span><span>{label}</span></NavLink>)}
    </nav>
  </div>
}
