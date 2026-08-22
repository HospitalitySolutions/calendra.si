import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { useAuth } from '../auth/AuthContext'
import {
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  HomeIcon,
  LogOutIcon,
  MessageIcon,
  UserIcon,
  WalletIcon,
} from './Icons'
import { MarketplaceSearchBar } from './MarketplaceSearchBar'
import { initials } from '../utils'

const navItems = [
  { to: '/', label: 'Pregled', icon: HomeIcon, end: true },
  { to: '/termini', label: 'Termini', icon: CalendarIcon },
  { to: '/denarnica', label: 'Denarnica', icon: WalletIcon },
  { to: '/sporocila', label: 'Sporočila', icon: MessageIcon },
  { to: '/obvestila', label: 'Obvestila', icon: BellIcon },
  { to: '/profil', label: 'Profil', icon: UserIcon },
]

const accountMenuItems = [
  { to: '/', label: 'Pregled', icon: HomeIcon },
  { to: '/termini', label: 'Moji termini', icon: CalendarIcon },
  { to: '/denarnica', label: 'Denarnica', icon: WalletIcon },
  { to: '/sporocila', label: 'Sporočila', icon: MessageIcon },
  { to: '/obvestila', label: 'Obvestila', icon: BellIcon },
  { to: '/profil', label: 'Moj profil', icon: UserIcon },
]

export function CustomerShell() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: home } = useQuery({ queryKey: ['customer-home-shell'], queryFn: customerApi.home, staleTime: 45_000 })

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
    window.location.replace('/racun')
  }

  const profileInitials = initials(user?.firstName, user?.lastName)

  return <div className="app-shell app-shell--customer-connect">
    <aside className="sidebar sidebar--customer-connect">
      <a className="brand-button brand-button--main brand-button--connect" href="/za-stranke" aria-label="Calendra Connect">
        <img src="/racun/calendra-connect-logo.png" alt="Calendra Connect" />
      </a>

      <div className="sidebar-user sidebar-user--card" aria-label="Prijavljeni uporabnik">
        <span className="sidebar-user__avatar">{profileInitials}</span>
        <span className="sidebar-user__copy">
          <strong>{user?.firstName} {user?.lastName}</strong>
          <small>Dobrodošli nazaj!</small>
        </span>
        <span className="sidebar-user__caret" aria-hidden="true"><ChevronRightIcon size={16} /></span>
      </div>

      <nav className="sidebar-nav" aria-label="Moj račun">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-link nav-link--customer ${isActive ? 'nav-link--active' : ''}`}
          >
            <span className="nav-link__icon"><Icon size={21} /></span>
            <span>{label}</span>
            {label === 'Sporočila' && Boolean(home?.unreadInboxCount) && <b className="nav-badge">{home?.unreadInboxCount}</b>}
            {label === 'Obvestila' && Boolean(home?.unreadNotificationCount) && <b className="nav-badge">{home?.unreadNotificationCount}</b>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <a href="https://calendra.si/kontakt" className="sidebar-support sidebar-support--customer">
          <span className="sidebar-support__icon"><MessageIcon size={20} /></span>
          <span className="sidebar-support__copy">
            <strong>Pomoč in podpora</strong>
            <small>Tu smo, da vam pomagamo.</small>
          </span>
          <ChevronRightIcon size={16} />
        </a>
      </div>
    </aside>

    <main className="app-main app-main--customer-connect">
      <header className="topbar topbar--customer-connect">
        <MarketplaceSearchBar />

        <div className="topbar__actions topbar__actions--customer-connect">
          <NavLink className="icon-button topbar-notifications" to="/obvestila" aria-label="Obvestila">
            <BellIcon size={19} />
            {Boolean(home?.unreadNotificationCount) && <span className="notification-dot">{home?.unreadNotificationCount}</span>}
          </NavLink>

          <div className="account-menu account-menu--customer-connect" ref={menuRef}>
            <button
              className="avatar-button avatar-button--menu avatar-button--customer-connect"
              onClick={() => setMenuOpen(value => !value)}
              aria-label="Moj račun"
              aria-expanded={menuOpen}
            >
              <span className="avatar-button__initials">{profileInitials}</span>
              <span className="avatar-caret" aria-hidden="true">⌄</span>
            </button>

            {menuOpen && <div className="account-menu__panel" role="menu">
              <div className="account-menu__identity">
                <strong>{user?.firstName} {user?.lastName}</strong>
                <small>{user?.email}</small>
              </div>
              <div className="account-menu__divider" />
              {accountMenuItems.map(({ to, label, icon: Icon }) => (
                <a key={to} href={`/racun${to}`} className="account-menu__item" role="menuitem">
                  <Icon size={18} />
                  <span>{label}</span>
                </a>
              ))}
              <div className="account-menu__divider" />
              <button className="account-menu__item" type="button" onClick={performLogout} role="menuitem">
                <LogOutIcon size={18} />
                <span>Odjava</span>
              </button>
            </div>}
          </div>
        </div>
      </header>

      <div className="app-content app-content--customer-connect"><Outlet /></div>
    </main>

    <nav className="mobile-nav" aria-label="Moj račun">
      {navItems.slice(0, 4).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `mobile-nav__item ${isActive ? 'mobile-nav__item--active' : ''}`}
        >
          <span className="mobile-nav__icon">
            <Icon size={21} />
            {label === 'Sporočila' && Boolean(home?.unreadInboxCount) && <i />}
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  </div>
}
