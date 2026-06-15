import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useLocale } from '../locale'
import { createPasskeyFromOptions, supportsWebAuthn } from '../lib/webauthn'
import { clearAuthStoragePreservingTheme } from '../theme'

type PasskeyRow = {
  credentialId: string
  label: string
  discoverable: boolean
  createdAt?: string
  lastUsedAt?: string | null
  kind: string
}

type SessionRow = {
  sessionKey: string
  label: string
  ipAddress?: string | null
  issuedAt?: string
  lastSeenAt?: string
  current: boolean
  revoked: boolean
}

type ActivityRow = {
  type: string
  title: string
  detail?: string | null
  occurredAt?: string
  riskLevel?: string | null
}

type Alerts = {
  factorChangeAlertsEnabled: boolean
  suspiciousSignInAlertsEnabled: boolean
}

type SecurityOverview = {
  passkeys: PasskeyRow[]
  recoveryCodesRemaining: number
  sessions: SessionRow[]
  activity: ActivityRow[]
  alerts: Alerts
  passkeyCount: number
  activeSessionCount: number
}

type SecurityPageProps = {
  embedded?: boolean
}

type ReauthRequest = {
  title: string
  execute: (reauthToken: string) => Promise<void>
}

type SecurityTab = 'overview' | 'signIn' | 'sessions' | 'alerts'

type SecurityIconName =
  | 'alert'
  | 'android'
  | 'apple'
  | 'arrowRight'
  | 'bell'
  | 'check'
  | 'chevronDown'
  | 'clock'
  | 'copy'
  | 'desktop'
  | 'download'
  | 'fingerprint'
  | 'key'
  | 'lock'
  | 'logout'
  | 'shield'
  | 'sparkle'
  | 'windows'

const securityTabs: Array<{ id: SecurityTab; label: string; icon: SecurityIconName }> = [
  { id: 'overview', label: 'Overview', icon: 'shield' },
  { id: 'signIn', label: 'Sign-in methods', icon: 'key' },
  { id: 'sessions', label: 'Sessions', icon: 'desktop' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
]

function formatDateTime(value?: string | null, locale?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'sl' ? 'sl-SI' : undefined)
}

function formatAgo(value?: string | null, locale?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60000)
  const isSl = locale === 'sl'
  if (diffMinutes < 1) return isSl ? 'pravkar' : 'just now'
  if (diffMinutes < 60) return isSl ? `pred ${diffMinutes} min` : `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return isSl ? `pred ${diffHours} h` : `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 14) return isSl ? `pred ${diffDays} d` : `${diffDays}d ago`
  return formatDateTime(value, locale)
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}

function SecurityIcon({ name, className = '' }: { name: SecurityIconName; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'windows') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="m3 5.2 8-1.1v7.6H3V5.2Zm9.2-1.3L21 2.7v9h-8.8V3.9ZM3 12.9h8v7.1l-8-1.1v-6Zm9.2 0H21v8.4l-8.8-1.2v-7.2Z" />
      </svg>
    )
  }

  if (name === 'android') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 10.2h10v7.3c0 .8-.7 1.5-1.5 1.5h-.7v2.1c0 .5-.4.9-.9.9s-.9-.4-.9-.9V19h-2v2.1c0 .5-.4.9-.9.9s-.9-.4-.9-.9V19h-.7c-.8 0-1.5-.7-1.5-1.5v-7.3Zm-2.3 0c.5 0 .9.4.9.9v4.4c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-4.4c0-.5.4-.9.9-.9Zm14.6 0c.5 0 .9.4.9.9v4.4c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-4.4c0-.5.4-.9.9-.9ZM8.4 5.5 7.2 3.9a.5.5 0 0 1 .8-.6L9.3 5a6.4 6.4 0 0 1 5.4 0L16 3.3a.5.5 0 0 1 .8.6l-1.2 1.6c1 .8 1.7 1.9 1.9 3.2h-11c.2-1.3.9-2.4 1.9-3.2ZM9.7 7.4a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4Zm4.6 0a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4Z" />
      </svg>
    )
  }

  if (name === 'apple') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M16.5 12.7c0-2 1.6-3 1.7-3.1-1-.1-1.8-.6-2.3-1.2-1-.9-2-.8-2.5-.8-1.1.1-2.1.7-2.7.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.2 2-1.4 2.5-.4 6.1 1 8.1.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7s1.8-1 2.5-2c.8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-2.8ZM14.7 6.4c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.7-1.1 1.7-.9 2.7 1 .1 1.9-.5 2.5-1.3Z" />
      </svg>
    )
  }

  const paths: Record<Exclude<SecurityIconName, 'windows' | 'android' | 'apple'>, ReactNode> = {
    alert: (
      <>
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
        <path d="M10.3 4.7 3.3 17a2 2 0 0 0 1.8 3h13.8a2 2 0 0 0 1.8-3l-7-12.3a2 2 0 0 0-3.4 0Z" />
      </>
    ),
    arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
        <path d="M13.7 20a2 2 0 0 1-3.4 0" />
      </>
    ),
    check: <path d="m5 12.5 4.2 4L19 7" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.7v4.5l3 1.8" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      </>
    ),
    desktop: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v11" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    fingerprint: (
      <>
        <path d="M12 11c0 2.8-1.1 5.5-3 7.5" />
        <path d="M15 13.2c-.2 2.4-1.1 4.7-2.5 6.7" />
        <path d="M6.6 15.7c.9-1.2 1.4-2.9 1.4-4.7a4 4 0 0 1 8 0" />
        <path d="M18.9 14.4c.1-1 .1-2.1.1-3.4a7 7 0 0 0-14 0" />
        <path d="M4.2 15.2c.6-1 1-2.5 1-4.2" />
        <path d="M12 8a3 3 0 0 1 3 3" />
        <path d="M9.8 21c.7-.8 1.2-1.8 1.6-2.9" />
      </>
    ),
    key: (
      <>
        <circle cx="7.5" cy="14.5" r="3.5" />
        <path d="m10 12 9-9" />
        <path d="m15 7 2 2" />
        <path d="m17 5 2 2" />
      </>
    ),
    lock: (
      <>
        <rect x="4.5" y="10" width="15" height="10" rx="2" />
        <path d="M8 10V7.7a4 4 0 0 1 8 0V10" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5.8A1.8 1.8 0 0 1 4 19.2V4.8A1.8 1.8 0 0 1 5.8 3H9" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3.5 5.4 6v5.3c0 4.2 2.8 7.8 6.6 9 3.8-1.2 6.6-4.8 6.6-9V6L12 3.5Z" />
        <path d="m9.3 12 1.8 1.8 3.8-4" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" />
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
      </>
    ),
  }

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {paths[name]}
    </svg>
  )
}

function getSessionIcon(label?: string): SecurityIconName {
  const normalized = (label || '').toLowerCase()
  if (normalized.includes('android')) return 'android'
  if (normalized.includes('mac') || normalized.includes('safari') || normalized.includes('iphone') || normalized.includes('ios')) return 'apple'
  if (normalized.includes('windows') || normalized.includes('edge')) return 'windows'
  return 'desktop'
}

function getActivityTone(event: ActivityRow) {
  const risk = (event.riskLevel || '').toLowerCase()
  const type = (event.type || '').toLowerCase()
  if (risk.includes('high') || risk.includes('warn') || type.includes('suspicious')) return 'warning'
  if (type.includes('sign') || type.includes('passkey') || type.includes('recovery')) return 'info'
  return 'neutral'
}

function SecurityStatCard({ icon, tone, value, label, detail }: { icon: SecurityIconName; tone: 'blue' | 'green' | 'amber' | 'violet'; value: string | number; label: string; detail: string }) {
  return (
    <div className="security-stat-card-v2">
      <div className={`security-stat-icon security-stat-icon--${tone}`}>
        <SecurityIcon name={icon} />
      </div>
      <div className="security-stat-content">
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
      <SecurityIcon name="arrowRight" className="security-stat-arrow" />
    </div>
  )
}

function SecurityEmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="security-empty-panel">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function SecuritySectionHeader({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="security-section-header-v2">
      <div>
        <h3>{title}</h3>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  )
}

function SecurityToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      className={`security-switch ${checked ? 'active' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="security-switch-knob" />
    </button>
  )
}

export function SecurityPage({ embedded = false }: SecurityPageProps) {
  const { t, locale } = useLocale()
  const sl = locale === 'sl'
  const securityCopy = {
    loadError: sl ? 'Pregleda varnosti ni bilo mogoče naložiti.' : 'Could not load your security overview.',
    updateError: sl ? 'Posodobitev varnosti ni uspela.' : 'Security update failed.',
    noReauthToken: sl ? 'Žeton za ponovno potrditev ni bil vrnjen.' : 'No re-authentication token returned.',
    reauthFailed: sl ? 'Ponovna potrditev ni uspela.' : 'Re-authentication failed.',
    checkingSecurity: sl ? 'Preverjam varnost' : 'Checking security',
    securityScore: sl ? 'Varnostna ocena' : 'Security score',
    goodSecurity: sl ? 'Dobra varnost' : 'Good security',
    needsAttention: sl ? 'Potrebuje pozornost' : 'Needs attention',
    setupRecommended: sl ? 'Priporočena nastavitev' : 'Setup recommended',
    pageSubtitle: sl ? 'Upravljajte prijavne ključe, aktivne seje, opozorila in nedavno varnostno aktivnost računa.' : 'Manage passkeys, active sessions, alerts, and recent account security activity.',
    heroEyebrow: sl ? 'Pregled varnosti' : 'Security overview',
    heroTitle: sl ? 'Varnost računa na enem mestu' : 'Your account security in one place',
    heroText: sl ? 'Preglejte načine prijave, aktivne seje, možnosti obnovitve in varnostna opozorila. Ohranite račun zaščiten in pod nadzorom.' : 'Review your sign-in methods, active sessions, recovery options and security alerts. Keep your account protected and stay in control.',
    tabs: {
      overview: sl ? 'Pregled' : 'Overview',
      signIn: sl ? 'Načini prijave' : 'Sign-in methods',
      sessions: sl ? 'Seje' : 'Sessions',
      alerts: sl ? 'Opozorila' : 'Alerts',
    } as Record<SecurityTab, string>,
    passkeys: sl ? 'Prijavni ključi' : 'Passkeys',
    strongSecure: sl ? 'Močno in varno' : 'Strong and secure',
    addRecommended: sl ? 'Priporočeno dodajanje' : 'Add recommended',
    activeSessions: sl ? 'Aktivne seje' : 'Active sessions',
    acrossDevices: sl ? 'Med napravami' : 'Across devices',
    recoveryCodes: sl ? 'Kode za obnovitev' : 'Recovery codes',
    available: sl ? 'Na voljo' : 'Available',
    generateBackup: sl ? 'Ustvarite varnostno kopijo' : 'Generate backup',
    securityAlerts: sl ? 'Varnostna opozorila' : 'Security alerts',
    emailAlertsEnabled: sl ? 'E-poštna opozorila vklopljena' : 'Email alerts enabled',
    signInTitle: sl ? 'Načini prijave' : 'Sign-in methods',
    signInText: sl ? 'Uporabite prijavne ključe in strojne varnostne ključe za zaščito računa. Občutljive spremembe zahtevajo potrditev gesla.' : 'Use passkeys and hardware keys to keep your account protected. Sensitive changes require password confirmation.',
    ready: sl ? 'Pripravljeno' : 'Ready',
    unavailable: sl ? 'Ni na voljo' : 'Unavailable',
    passkeysDevices: sl ? 'Prijavni ključi na vaših napravah' : 'Passkeys on your devices',
    passkeysDevicesText: sl ? 'Sinhronizirani prijavni ključi, ki se običajno prenašajo z vašim platformnim računom.' : 'Synced passkeys that can usually travel with your platform account.',
    passkeysUnsupported: sl ? 'Ta brskalnik ali vgrajeni spletni pogled ne podpira WebAuthn/prijavnih ključev. Tukaj uporabite kodo za obnovitev ali se prijavite iz podprtega brskalnika.' : 'This browser or embedded webview does not expose WebAuthn/passkeys. Use a recovery code here, or sign in from a supported browser.',
    noSyncedPasskeys: sl ? 'Sinhroniziranih prijavnih ključev še ni' : 'No synced passkeys yet',
    noSyncedPasskeysText: sl ? 'Dodajte prijavni ključ iz tega brskalnika ali naprave za lažjo prijavo in boljšo zaščito pred lažnim predstavljanjem.' : 'Add a passkey from this browser or device to make sign-in easier and phishing-resistant.',
    unnamedPasskey: sl ? 'Neimenovan prijavni ključ' : 'Unnamed passkey',
    hardwareKeys: sl ? 'Strojni varnostni ključi' : 'Hardware security keys',
    hardwareKeysText: sl ? 'Strojni ključi ostanejo na fizičnem avtentikatorju in delujejo kot odstranljiv varnostni dejavnik.' : 'Hardware keys stay on a physical authenticator and work as a removable security factor.',
    noHardwareKeys: sl ? 'Ni strojnih varnostnih ključev' : 'No hardware security keys',
    noHardwareKeysText: sl ? 'Dodate ga lahko iz podprtega brskalnika, kadar želite odstranljiv strojni dejavnik.' : 'You can still add one from a supported browser whenever you want a removable hardware factor.',
    unnamedSecurityKey: sl ? 'Neimenovan varnostni ključ' : 'Unnamed security key',
    newPasskeyLabel: sl ? 'Oznaka novega prijavnega ključa' : 'New passkey label',
    thisDevice: sl ? 'Ta naprava' : 'This device',
    working: sl ? 'Delam…' : 'Working…',
    addPasskey: sl ? 'Dodaj prijavni ključ' : 'Add passkey',
    activeSessionsText: sl ? 'Preglejte, kje ste prijavljeni, in prekličite seje, ki jim ne zaupate več.' : 'Review where you are signed in and revoke sessions you no longer trust.',
    signOutAllOtherSessions: sl ? 'Odjavi vse druge seje' : 'Sign out all other sessions',
    noTrackedSessions: sl ? 'Sledenih sej še ni' : 'No tracked sessions yet',
    noTrackedSessionsText: sl ? 'Seje se bodo prikazale tukaj, ko se prijavite iz naprav in brskalnikov.' : 'Sessions will appear here as you sign in from devices and browsers.',
    unknownDevice: sl ? 'Neznana naprava' : 'Unknown device',
    currentDevice: sl ? 'Ta naprava' : 'This device',
    started: sl ? 'Začetek' : 'Started',
    lastActive: sl ? 'Zadnja aktivnost' : 'Last active',
    ipUnavailable: sl ? 'IP ni na voljo' : 'IP unavailable',
    current: sl ? 'Trenutno' : 'Current',
    signOut: sl ? 'Odjava' : 'Sign out',
    showFewerSessions: sl ? 'Prikaži manj sej' : 'Show fewer sessions',
    viewAllSessions: sl ? 'Prikaži vse seje' : 'View all sessions',
    recovery: sl ? 'Obnovitev' : 'Recovery',
    recoveryText: sl ? 'Kode za obnovitev vam pomagajo pri prijavi, če izgubite dostop do običajnih načinov.' : 'Recovery codes help you sign in if you lose access to your usual methods.',
    left: sl ? 'preostalo' : 'left',
    recoveryVault: sl ? 'Shramba kod za obnovitev' : 'Recovery code vault',
    unusedRecoveryCodesPrefix: sl ? 'Imate' : 'You have',
    unusedRecoveryCodesSuffix: sl ? 'neuporabljenih kod za obnovitev.' : 'unused recovery codes.',
    generateRecoveryCodes: sl ? 'Ustvari nove kode za obnovitev' : 'Generate new recovery codes',
    saveTheseNow: sl ? 'Shranite jih zdaj' : 'Save these now',
    codesShownOnce: sl ? 'Te kode so v celoti prikazane samo enkrat.' : 'These codes are shown only once in full.',
    copy: sl ? 'Kopiraj' : 'Copy',
    download: sl ? 'Prenesi' : 'Download',
    alertsText: sl ? 'Prejemajte obvestila o pomembnih varnostnih dogodkih.' : 'Get notified about important security events.',
    factorChangeAlerts: sl ? 'Opozorila o spremembah varnostnih dejavnikov' : 'Factor change alerts',
    factorChangeAlertsText: sl ? 'Pošljite mi e-pošto, ko se spremenijo prijavni ključi ali kode za obnovitev.' : 'Email me when passkeys or recovery codes change.',
    suspiciousSignInAlerts: sl ? 'Opozorila o sumljivi prijavi' : 'Suspicious sign-in alerts',
    suspiciousSignInAlertsText: sl ? 'Pošljite mi e-pošto, ko je prijava za moj račun videti neobičajna.' : 'Email me when a sign-in looks unusual for my account.',
    saveAlertPreferences: sl ? 'Shrani nastavitve opozoril' : 'Save alert preferences',
    activity: sl ? 'Varnostna aktivnost' : 'Security activity',
    activityText: sl ? 'Nedavni varnostni dogodki v vašem računu.' : 'Recent security-related events on your account.',
    showLess: sl ? 'Prikaži manj' : 'Show less',
    viewAll: sl ? 'Prikaži vse' : 'View all',
    noSecurityActivity: sl ? 'Varnostne aktivnosti še ni' : 'No security activity yet',
    noSecurityActivityText: sl ? 'Ko se zgodijo varnostni dogodki, bodo prikazani tukaj.' : 'When security events happen, they will show up here.',
    passkeyLabel: sl ? 'Oznaka prijavnega ključa' : 'Passkey label',
    save: sl ? 'Shrani' : 'Save',
    cancel: sl ? 'Prekliči' : 'Cancel',
    added: sl ? 'Dodano' : 'Added',
    lastUsed: sl ? 'Nazadnje uporabljeno' : 'Last used',
    rename: sl ? 'Preimenuj' : 'Rename',
    remove: sl ? 'Odstrani' : 'Remove',
    confirmItsYou: sl ? 'Potrdite, da ste to vi' : 'Confirm it’s you',
    password: sl ? 'Geslo' : 'Password',
    enterPassword: sl ? 'Vnesite geslo' : 'Enter your password',
    checking: sl ? 'Preverjam…' : 'Checking…',
    continue: sl ? 'Nadaljuj' : 'Continue',
    confirmAddPasskey: sl ? 'Potrdite geslo za dodajanje novega prijavnega ključa.' : 'Confirm your password to add a new passkey.',
    passkeyAdded: sl ? 'Prijavni ključ je bil uspešno dodan.' : 'Passkey added successfully.',
    confirmRenamePasskey: sl ? 'Potrdite geslo za preimenovanje tega prijavnega ključa.' : 'Confirm your password to rename this passkey.',
    passkeyRenamed: sl ? 'Prijavni ključ je bil preimenovan.' : 'Passkey renamed.',
    removeConfirm: sl ? 'Odstraniti' : 'Remove',
    confirmRemovePasskey: sl ? 'Potrdite geslo za odstranitev tega prijavnega ključa.' : 'Confirm your password to remove this passkey.',
    passkeyRemoved: sl ? 'Prijavni ključ je bil odstranjen.' : 'Passkey removed.',
    confirmGenerateRecovery: sl ? 'Potrdite geslo za ustvarjanje novega nabora kod za obnovitev.' : 'Confirm your password to generate a new set of recovery codes.',
    recoveryRegenerated: sl ? 'Kode za obnovitev so bile ponovno ustvarjene. Novi nabor shranite zdaj; prejšnje kode ne delujejo več.' : 'Recovery codes regenerated. Save the new set now; the previous codes no longer work.',
    confirmUpdateAlerts: sl ? 'Potrdite geslo za posodobitev varnostnih opozoril.' : 'Confirm your password to update security alerts.',
    alertsUpdated: sl ? 'Nastavitve opozoril so posodobljene.' : 'Alert preferences updated.',
    signOutThisDeviceConfirm: sl ? 'Odjaviti to napravo?' : 'Sign out this device?',
    signOutSessionConfirm: sl ? 'Odjaviti sejo' : 'Sign out',
    confirmSignOutSession: sl ? 'Potrdite geslo za odjavo te seje.' : 'Confirm your password to sign out this session.',
    sessionSignedOut: sl ? 'Seja je bila odjavljena.' : 'Session signed out.',
    signOutOtherSessionsConfirm: sl ? 'Odjaviti vse druge seje?' : 'Sign out all other sessions?',
    confirmSignOutOtherSessions: sl ? 'Potrdite geslo za odjavo drugih sej.' : 'Confirm your password to sign out your other sessions.',
    otherSessionsSignedOut: sl ? 'Druge seje so bile odjavljene.' : 'Other sessions signed out.',
    recoveryCodesCopied: sl ? 'Kode za obnovitev so kopirane.' : 'Recovery codes copied.',
    recoveryCodesCopyError: sl ? 'Kod za obnovitev ni bilo mogoče kopirati.' : 'Could not copy the recovery codes.',
  }
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [newPasskeyLabel, setNewPasskeyLabel] = useState(() => securityCopy.thisDevice)
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null)
  const [editingPasskeyLabel, setEditingPasskeyLabel] = useState('')
  const [draftAlerts, setDraftAlerts] = useState<Alerts>({
    factorChangeAlertsEnabled: true,
    suspiciousSignInAlertsEnabled: true,
  })
  const [activeSecurityTab, setActiveSecurityTab] = useState<SecurityTab>('overview')
  const [showAllSessions, setShowAllSessions] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthRequest, setReauthRequest] = useState<ReauthRequest | null>(null)
  const [reauthBusy, setReauthBusy] = useState(false)
  const [reauthError, setReauthError] = useState('')
  const [reauthToken, setReauthToken] = useState(() => sessionStorage.getItem('securityReauthToken') || '')

  const loadOverview = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/security/overview')
      setOverview(data)
      setDraftAlerts(data.alerts)
    } catch {
      setError(securityCopy.loadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const syncedPasskeys = useMemo(
    () => (overview?.passkeys || []).filter((passkey) => passkey.discoverable),
    [overview?.passkeys],
  )
  const securityKeys = useMemo(
    () => (overview?.passkeys || []).filter((passkey) => !passkey.discoverable),
    [overview?.passkeys],
  )
  const activeSessions = useMemo(
    () => (overview?.sessions || []).filter((session) => !session.revoked),
    [overview?.sessions],
  )
  const visibleSessions = showAllSessions ? activeSessions : activeSessions.slice(0, 5)
  const visibleActivity = showAllActivity ? (overview?.activity || []) : (overview?.activity || []).slice(0, 4)
  const supportsPasskeys = supportsWebAuthn()

  const securityScore = useMemo(() => {
    if (!overview) return 0
    const passkeyScore = overview.passkeyCount > 0 ? 35 : 8
    const recoveryScore = overview.recoveryCodesRemaining > 0 ? 25 : 0
    const alertsScore =
      Number(Boolean(overview.alerts?.factorChangeAlertsEnabled)) * 12 +
      Number(Boolean(overview.alerts?.suspiciousSignInAlertsEnabled)) * 13
    const sessionsScore = overview.activeSessionCount > 0 ? 15 : 5
    return Math.min(100, passkeyScore + recoveryScore + alertsScore + sessionsScore)
  }, [overview])

  const securityScoreLabel = securityScore >= 80 ? securityCopy.goodSecurity : securityScore >= 55 ? securityCopy.needsAttention : securityCopy.setupRecommended
  const securityScoreTone = securityScore >= 80 ? 'good' : securityScore >= 55 ? 'medium' : 'low'

  const resetFeedback = () => {
    setError('')
    setSuccess('')
  }

  const applyError = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err) && err.response?.data?.message) setError(String(err.response.data.message))
    else if (err instanceof Error && err.message) setError(err.message)
    else setError(fallback)
  }

  const persistReauthToken = (token: string) => {
    setReauthToken(token)
    sessionStorage.setItem('securityReauthToken', token)
  }

  const clearReauthToken = () => {
    setReauthToken('')
    sessionStorage.removeItem('securityReauthToken')
  }

  const runProtected = async (title: string, action: (token: string) => Promise<void>) => {
    resetFeedback()
    if (reauthToken) {
      try {
        await action(reauthToken)
        return
      } catch (err) {
        if (axios.isAxiosError(err) && [401, 403].includes(err.response?.status || 0)) {
          clearReauthToken()
        } else {
          applyError(err, securityCopy.updateError)
          return
        }
      }
    }
    setReauthError('')
    setReauthPassword('')
    setReauthRequest({ title, execute: action })
  }

  const submitReauth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!reauthRequest) return
    setReauthBusy(true)
    setReauthError('')
    try {
      const { data } = await api.post('/security/reauth', { password: reauthPassword })
      const token = String(data?.reauthToken || '')
      if (!token) throw new Error(securityCopy.noReauthToken)
      persistReauthToken(token)
      await reauthRequest.execute(token)
      setReauthRequest(null)
      setReauthPassword('')
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) setReauthError(String(err.response.data.message))
      else if (err instanceof Error) setReauthError(err.message)
      else setReauthError(securityCopy.reauthFailed)
    } finally {
      setReauthBusy(false)
    }
  }

  const withBusy = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const registerPasskey = async () => {
    await runProtected(securityCopy.confirmAddPasskey, async (token) => {
      await withBusy(async () => {
        if (!supportsWebAuthn()) {
          setError(securityCopy.passkeysUnsupported)
          return
        }
        const start = await api.post('/security/passkeys/register/start', undefined, {
          headers: { 'X-Reauth-Token': token },
        })
        const credentialJson = await createPasskeyFromOptions(start.data.publicKey)
        const finish = await api.post('/security/passkeys/register/finish', {
          pendingToken: start.data.pendingToken,
          credentialJson,
          label: newPasskeyLabel,
        }, {
          headers: { 'X-Reauth-Token': token },
        })
        const codes = Array.isArray(finish.data?.recoveryCodes) ? finish.data.recoveryCodes : []
        setRecoveryCodes(codes)
        setSuccess(securityCopy.passkeyAdded)
        await loadOverview()
      })
    })
  }

  const savePasskeyLabel = async (credentialId: string) => {
    await runProtected(securityCopy.confirmRenamePasskey, async (token) => {
      await withBusy(async () => {
        await api.patch(`/security/passkeys/${encodeURIComponent(credentialId)}`, {
          label: editingPasskeyLabel,
        }, {
          headers: { 'X-Reauth-Token': token },
        })
        setEditingPasskeyId(null)
        setEditingPasskeyLabel('')
        setSuccess(securityCopy.passkeyRenamed)
        await loadOverview()
      })
    })
  }

  const removePasskey = async (credentialId: string, label: string) => {
    if (!window.confirm(`${securityCopy.removeConfirm} “${label}”?`)) return
    await runProtected(securityCopy.confirmRemovePasskey, async (token) => {
      await withBusy(async () => {
        await api.delete(`/security/passkeys/${encodeURIComponent(credentialId)}`, {
          headers: { 'X-Reauth-Token': token },
        })
        setSuccess(securityCopy.passkeyRemoved)
        await loadOverview()
      })
    })
  }

  const regenerateCodes = async () => {
    await runProtected(securityCopy.confirmGenerateRecovery, async (token) => {
      await withBusy(async () => {
        const { data } = await api.post('/security/recovery/regenerate', undefined, {
          headers: { 'X-Reauth-Token': token },
        })
        setRecoveryCodes(Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [])
        setSuccess(securityCopy.recoveryRegenerated)
        await loadOverview()
      })
    })
  }

  const saveAlerts = async () => {
    await runProtected(securityCopy.confirmUpdateAlerts, async (token) => {
      await withBusy(async () => {
        const { data } = await api.put('/security/alerts', draftAlerts, {
          headers: { 'X-Reauth-Token': token },
        })
        setDraftAlerts(data)
        setSuccess(securityCopy.alertsUpdated)
        await loadOverview()
      })
    })
  }

  const revokeSession = async (session: SessionRow) => {
    const copy = session.current ? securityCopy.signOutThisDeviceConfirm : `${securityCopy.signOutSessionConfirm} ${session.label}?`
    if (!window.confirm(copy)) return
    await runProtected(securityCopy.confirmSignOutSession, async (token) => {
      await withBusy(async () => {
        await api.delete(`/security/sessions/${encodeURIComponent(session.sessionKey)}`, {
          headers: { 'X-Reauth-Token': token },
        })
        if (session.current) {
          clearAuthStoragePreservingTheme()
          window.location.assign('/')
          return
        }
        setSuccess(securityCopy.sessionSignedOut)
        await loadOverview()
      })
    })
  }

  const revokeOtherSessions = async () => {
    if (!window.confirm(securityCopy.signOutOtherSessionsConfirm)) return
    await runProtected(securityCopy.confirmSignOutOtherSessions, async (token) => {
      await withBusy(async () => {
        await api.post('/security/sessions/revoke-others', undefined, {
          headers: { 'X-Reauth-Token': token },
        })
        setSuccess(securityCopy.otherSessionsSignedOut)
        await loadOverview()
      })
    })
  }

  const downloadRecoveryCodes = () => {
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'recovery-codes.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const copyRecoveryCodes = async () => {
    try {
      await copyText(recoveryCodes.join('\n'))
      setSuccess(securityCopy.recoveryCodesCopied)
    } catch {
      setError(securityCopy.recoveryCodesCopyError)
    }
  }

  const renderPasskeyCollection = (items: PasskeyRow[], emptyTitle: string, emptyText: string, defaultName: string, pillTone: 'blue' | 'slate') => {
    if (items.length === 0) return <SecurityEmptyPanel title={emptyTitle} text={emptyText} />

    return (
      <div className="security-method-stack">
        {items.map((passkey) => (
          <div key={passkey.credentialId} className="security-method-row">
            <div className={`security-method-icon ${pillTone === 'blue' ? 'security-method-icon--blue' : 'security-method-icon--slate'}`}>
              <SecurityIcon name={passkey.discoverable ? 'fingerprint' : 'key'} />
            </div>
            <div className="security-method-body">
              {editingPasskeyId === passkey.credentialId ? (
                <div className="security-inline-editor-v2">
                  <input value={editingPasskeyLabel} onChange={(e) => setEditingPasskeyLabel(e.target.value)} placeholder={securityCopy.passkeyLabel} />
                  <div className="security-row-actions">
                    <button type="button" className="security-primary-button security-button-sm" onClick={() => void savePasskeyLabel(passkey.credentialId)} disabled={busy || !editingPasskeyLabel.trim()}>
                      {securityCopy.save}
                    </button>
                    <button type="button" className="security-soft-button security-button-sm" onClick={() => setEditingPasskeyId(null)} disabled={busy}>
                      {securityCopy.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="security-method-heading">
                    <strong>{passkey.label || defaultName}</strong>
                    <span className={`security-chip security-chip--${pillTone}`}>{passkey.kind}</span>
                  </div>
                  <div className="security-method-meta">
                    <span>{securityCopy.added} {formatDateTime(passkey.createdAt, locale)}</span>
                    <span>{securityCopy.lastUsed} {formatAgo(passkey.lastUsedAt, locale)}</span>
                  </div>
                </>
              )}
            </div>
            {editingPasskeyId !== passkey.credentialId && (
              <div className="security-row-actions security-row-actions--right">
                <button
                  type="button"
                  className="security-soft-button security-button-sm"
                  disabled={busy}
                  onClick={() => {
                    setEditingPasskeyId(passkey.credentialId)
                    setEditingPasskeyLabel(passkey.label || '')
                  }}
                >
                  {securityCopy.rename}
                </button>
                <button type="button" className="security-danger-button security-button-sm" disabled={busy} onClick={() => void removePasskey(passkey.credentialId, passkey.label || defaultName)}>
                  {securityCopy.remove}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const signInMethodsCard = (
    <section className="security-card-v2 security-card-v2--large">
      <SecuritySectionHeader
        title={securityCopy.signInTitle}
        text={securityCopy.signInText}
        action={<span className={`security-chip ${supportsPasskeys ? 'security-chip--green' : 'security-chip--slate'}`}>{supportsPasskeys ? securityCopy.ready : securityCopy.unavailable}</span>}
      />

      <div className="security-method-group">
        <div className="security-method-group-head">
          <div className="security-method-icon security-method-icon--blue">
            <SecurityIcon name="fingerprint" />
          </div>
          <div>
            <strong>{securityCopy.passkeysDevices}</strong>
            <p>{securityCopy.passkeysDevicesText}</p>
          </div>
        </div>
        {renderPasskeyCollection(
          syncedPasskeys,
          securityCopy.noSyncedPasskeys,
          securityCopy.noSyncedPasskeysText,
          securityCopy.unnamedPasskey,
          'blue',
        )}
      </div>

      <div className="security-method-group">
        <div className="security-method-group-head">
          <div className="security-method-icon security-method-icon--slate">
            <SecurityIcon name="key" />
          </div>
          <div>
            <strong>{securityCopy.hardwareKeys}</strong>
            <p>{securityCopy.hardwareKeysText}</p>
          </div>
        </div>
        {renderPasskeyCollection(
          securityKeys,
          securityCopy.noHardwareKeys,
          securityCopy.noHardwareKeysText,
          securityCopy.unnamedSecurityKey,
          'slate',
        )}
      </div>

      <div className="security-add-passkey-box">
        <label className="security-field-v2">
          <span>{securityCopy.newPasskeyLabel}</span>
          <input value={newPasskeyLabel} onChange={(e) => setNewPasskeyLabel(e.target.value)} placeholder={securityCopy.thisDevice} />
        </label>
        <button type="button" className="security-primary-button" disabled={busy || loading || !supportsPasskeys} onClick={() => void registerPasskey()}>
          {busy ? securityCopy.working : securityCopy.addPasskey}
        </button>
        {!supportsPasskeys && <p className="security-inline-help">{securityCopy.passkeysUnsupported}</p>}
      </div>
    </section>
  )

  const activeSessionsCard = (
    <section className="security-card-v2 security-card-v2--large">
      <SecuritySectionHeader
        title={securityCopy.activeSessions}
        text={securityCopy.activeSessionsText}
        action={
          <button type="button" className="security-soft-button security-soft-button--blue" disabled={busy || activeSessions.length <= 1} onClick={() => void revokeOtherSessions()}>
            {securityCopy.signOutAllOtherSessions}
          </button>
        }
      />
      {activeSessions.length === 0 ? (
        <SecurityEmptyPanel title={securityCopy.noTrackedSessions} text={securityCopy.noTrackedSessionsText} />
      ) : (
        <>
          <div className="security-session-list">
            {visibleSessions.map((session) => {
              const icon = getSessionIcon(session.label)
              return (
                <div key={session.sessionKey} className="security-session-row">
                  <div className={`security-session-device security-session-device--${icon}`}>
                    <SecurityIcon name={icon} />
                  </div>
                  <div className="security-session-main">
                    <div className="security-session-title-line">
                      <strong>{session.label || securityCopy.unknownDevice}</strong>
                      {session.current && <span className="security-chip security-chip--blue">{securityCopy.currentDevice}</span>}
                    </div>
                    <div className="security-session-meta">
                      <span>{securityCopy.started} {formatDateTime(session.issuedAt, locale)}</span>
                      <span>{securityCopy.lastActive} {formatAgo(session.lastSeenAt, locale)}</span>
                      <span>{session.ipAddress || securityCopy.ipUnavailable}</span>
                    </div>
                  </div>
                  <div className="security-session-status">
                    <span>{formatAgo(session.lastSeenAt, locale)}</span>
                    {session.current ? (
                      <span className="security-chip security-chip--green">{securityCopy.current}</span>
                    ) : (
                      <button type="button" className="security-danger-button security-button-sm" disabled={busy} onClick={() => void revokeSession(session)}>
                        {securityCopy.signOut}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {activeSessions.length > 5 && (
            <button type="button" className="security-link-button security-centered-link" onClick={() => setShowAllSessions((value) => !value)}>
              {showAllSessions ? securityCopy.showFewerSessions : securityCopy.viewAllSessions} <SecurityIcon name="chevronDown" />
            </button>
          )}
        </>
      )}
    </section>
  )

  const recoveryCard = (
    <section className="security-card-v2">
      <SecuritySectionHeader
        title={securityCopy.recovery}
        text={securityCopy.recoveryText}
        action={<span className="security-chip security-chip--slate">{overview?.recoveryCodesRemaining ?? 0} {securityCopy.left}</span>}
      />
      <div className="security-recovery-hero">
        <div className="security-recovery-icon">
          <SecurityIcon name="lock" />
        </div>
        <div>
          <strong>{securityCopy.recoveryVault}</strong>
          <p>{securityCopy.unusedRecoveryCodesPrefix} {overview?.recoveryCodesRemaining ?? 0} {securityCopy.unusedRecoveryCodesSuffix}</p>
        </div>
      </div>
      <button type="button" className="security-primary-button security-button-full" onClick={() => void regenerateCodes()} disabled={busy || loading || !overview?.passkeyCount}>
        <SecurityIcon name="key" />
        {busy ? securityCopy.working : securityCopy.generateRecoveryCodes}
      </button>
      {recoveryCodes.length > 0 && (
        <div className="security-recovery-box-v2">
          <div>
            <strong>{securityCopy.saveTheseNow}</strong>
            <p>{securityCopy.codesShownOnce}</p>
          </div>
          <div className="security-recovery-grid-v2">
            {recoveryCodes.map((code) => (
              <code key={code}>{code}</code>
            ))}
          </div>
          <div className="security-row-actions">
            <button type="button" className="security-soft-button" onClick={() => void copyRecoveryCodes()}>
              <SecurityIcon name="copy" />
              {securityCopy.copy}
            </button>
            <button type="button" className="security-soft-button" onClick={downloadRecoveryCodes}>
              <SecurityIcon name="download" />
              {securityCopy.download}
            </button>
          </div>
        </div>
      )}
    </section>
  )

  const alertsCard = (
    <section className="security-card-v2">
      <SecuritySectionHeader
        title={securityCopy.securityAlerts}
        text={securityCopy.alertsText}
        action={<span className="security-chip security-chip--green">{securityCopy.tabs.alerts}</span>}
      />
      <div className="security-alert-list">
        <div className="security-alert-row">
          <div className="security-alert-icon security-alert-icon--amber">
            <SecurityIcon name="bell" />
          </div>
          <div>
            <strong>{securityCopy.factorChangeAlerts}</strong>
            <p>{securityCopy.factorChangeAlertsText}</p>
          </div>
          <SecurityToggle checked={draftAlerts.factorChangeAlertsEnabled} onChange={(checked) => setDraftAlerts((prev) => ({ ...prev, factorChangeAlertsEnabled: checked }))} />
        </div>
        <div className="security-alert-row">
          <div className="security-alert-icon security-alert-icon--green">
            <SecurityIcon name="shield" />
          </div>
          <div>
            <strong>{securityCopy.suspiciousSignInAlerts}</strong>
            <p>{securityCopy.suspiciousSignInAlertsText}</p>
          </div>
          <SecurityToggle checked={draftAlerts.suspiciousSignInAlertsEnabled} onChange={(checked) => setDraftAlerts((prev) => ({ ...prev, suspiciousSignInAlertsEnabled: checked }))} />
        </div>
      </div>
      <button type="button" className="security-link-button security-link-button--full" onClick={() => void saveAlerts()} disabled={busy || loading}>
        {securityCopy.saveAlertPreferences} <SecurityIcon name="arrowRight" />
      </button>
    </section>
  )

  const activityCard = (
    <section className="security-card-v2">
      <SecuritySectionHeader
        title={securityCopy.activity}
        text={securityCopy.activityText}
        action={overview?.activity?.length ? <button type="button" className="security-soft-button" onClick={() => setShowAllActivity((value) => !value)}>{showAllActivity ? securityCopy.showLess : securityCopy.viewAll}</button> : undefined}
      />
      {!loading && (!overview?.activity || overview.activity.length === 0) ? (
        <SecurityEmptyPanel title={securityCopy.noSecurityActivity} text={securityCopy.noSecurityActivityText} />
      ) : (
        <div className="security-activity-list">
          {visibleActivity.map((event, index) => {
            const tone = getActivityTone(event)
            return (
              <div key={`${event.type}-${event.occurredAt || index}`} className="security-activity-row">
                <div className={`security-activity-rail security-activity-rail--${tone}`}>
                  <span />
                </div>
                <div className="security-activity-icon">
                  <SecurityIcon name={tone === 'warning' ? 'alert' : event.type.toLowerCase().includes('out') ? 'logout' : 'key'} />
                </div>
                <div className="security-activity-copy">
                  <div>
                    <strong>{event.title}</strong>
                    <span>{formatAgo(event.occurredAt, locale)}</span>
                  </div>
                  {event.detail && <p>{event.detail}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  const tabContent = (() => {
    if (activeSecurityTab === 'signIn') {
      return <div className="security-main-grid security-main-grid--single">{signInMethodsCard}</div>
    }
    if (activeSecurityTab === 'sessions') {
      return (
        <div className="security-main-grid">
          <div>{activeSessionsCard}</div>
          <div>{activityCard}</div>
        </div>
      )
    }
    if (activeSecurityTab === 'alerts') {
      return (
        <div className="security-main-grid">
          <div>{alertsCard}</div>
          <div className="security-side-stack">{recoveryCard}{activityCard}</div>
        </div>
      )
    }
    return (
      <div className="security-main-grid">
        <div className="security-left-stack">
          {signInMethodsCard}
          {activeSessionsCard}
        </div>
        <div className="security-side-stack">
          {recoveryCard}
          {alertsCard}
          {activityCard}
        </div>
      </div>
    )
  })()

  return (
    <div className={embedded ? 'security-page security-page-modern security-page-embedded' : 'security-page security-page-modern content content-android-native'}>
      {!embedded && <PageHeader title={t('tabSecurity')} subtitle={securityCopy.pageSubtitle} />}
      {error && <div className="security-feedback security-feedback--error">{error}</div>}
      {success && <div className="security-feedback security-feedback--success">{success}</div>}

      <section className="security-hero-v2">
        <div className="security-hero-copy-v2">
          <span className="security-eyebrow-v2">{securityCopy.heroEyebrow}</span>
          <h2>{securityCopy.heroTitle}</h2>
          <p>{securityCopy.heroText}</p>
        </div>
        <div className={`security-score-card security-score-card--${securityScoreTone}`}>
          <div className="security-score-icon">
            <SecurityIcon name="shield" />
          </div>
          <div>
            <strong>{loading ? securityCopy.checkingSecurity : securityScoreLabel}</strong>
            <span>{securityCopy.securityScore}</span>
          </div>
          <b>{loading ? '—' : `${securityScore} / 100`}</b>
          <SecurityIcon name="arrowRight" className="security-score-arrow" />
        </div>
      </section>

      <nav className="security-tabbar" aria-label={securityCopy.securityAlerts}>
        {securityTabs.map((tab) => (
          <button key={tab.id} type="button" className={`security-tab ${activeSecurityTab === tab.id ? 'active' : ''}`} onClick={() => setActiveSecurityTab(tab.id)}>
            <SecurityIcon name={tab.icon} />
            {securityCopy.tabs[tab.id]}
          </button>
        ))}
      </nav>

      <section className="security-stat-grid-v2">
        <SecurityStatCard
          icon="fingerprint"
          tone="blue"
          value={overview?.passkeyCount ?? '—'}
          label={securityCopy.passkeys}
          detail={(overview?.passkeyCount || 0) > 0 ? securityCopy.strongSecure : securityCopy.addRecommended}
        />
        <SecurityStatCard icon="desktop" tone="violet" value={overview?.activeSessionCount ?? '—'} label={securityCopy.activeSessions} detail={securityCopy.acrossDevices} />
        <SecurityStatCard
          icon="shield"
          tone="green"
          value={overview?.recoveryCodesRemaining ?? '—'}
          label={securityCopy.recoveryCodes}
          detail={(overview?.recoveryCodesRemaining || 0) > 0 ? securityCopy.available : securityCopy.generateBackup}
        />
        <SecurityStatCard
          icon="bell"
          tone="amber"
          value={[draftAlerts.factorChangeAlertsEnabled, draftAlerts.suspiciousSignInAlertsEnabled].filter(Boolean).length}
          label={securityCopy.securityAlerts}
          detail={securityCopy.emailAlertsEnabled}
        />
      </section>

      {tabContent}

      {reauthRequest && (
        <div className="security-modal-backdrop" role="presentation">
          <div className="card security-reauth-card" role="dialog" aria-modal="true" aria-labelledby="security-reauth-title">
            <h3 id="security-reauth-title">{securityCopy.confirmItsYou}</h3>
            <p className="muted">{reauthRequest.title}</p>
            {reauthError && <div className="error">{reauthError}</div>}
            <form onSubmit={submitReauth} className="security-reauth-form">
              <label className="field">
                <span className="field-label">{securityCopy.password}</span>
                <input
                  type="password"
                  autoFocus
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder={securityCopy.enterPassword}
                />
              </label>
              <div className="security-row-actions">
                <button type="submit" className="security-primary-button" disabled={reauthBusy || !reauthPassword.trim()}>
                  {reauthBusy ? securityCopy.checking : securityCopy.continue}
                </button>
                <button
                  type="button"
                  className="security-soft-button"
                  onClick={() => {
                    setReauthRequest(null)
                    setReauthError('')
                    setReauthPassword('')
                  }}
                  disabled={reauthBusy}
                >
                  {securityCopy.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
