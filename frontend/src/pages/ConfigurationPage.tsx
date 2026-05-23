import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { PaymentMethod, PaymentType } from '../lib/types'
import { normalizePaymentMethod } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { currency, formatDate } from '../lib/format'
import { ConfigurationViberSection, ConfigurationWhatsAppSection } from './ConfigurationInboxMessagingSections'
import { ConfigurationInvoiceDeliverySection } from './ConfigurationInvoiceDeliverySection'
import { FolioLayoutEditor } from './FolioLayoutEditor'
import { SecurityPage } from './SecurityPage'
import { GoogleCalendarIntegrationSection } from './GoogleCalendarIntegrationSection'
import { GuestConfigSaveIcon as GuestSaveIcon } from '../components/GuestConfigSaveIcon'
import { ModernTimePicker } from '../components/ModernTimePicker'
import { useLocale } from '../locale'
import { getDefaultAllowedRoute } from '../lib/packageAccess'
import { helpTooltip } from '../helpContent'

type Tab = 'company' | 'booking' | 'billing' | 'guestApp' | 'notifications' | 'googleCalendar' | 'whatsapp' | 'viber' | 'modules' | 'security'
type BookingSubtab = 'general' | 'spaces'
type BillingSubtab = 'settings' | 'paymentMethods' | 'paypal' | 'fiscal' | 'invoiceDelivery' | 'folioLayout'
type PersonalTaskPreset = { id: string; name: string; color: string }

type CompanyProfileForm = {
  id: string
  name: string
  address: string
  postalCode: string
  city: string
  vatId: string
  email: string
  telephone: string
  iban: string
  bic: string
  bankQrPurposeCode: string
  bankQrPurposeText: string
  isDefault: boolean
}

const createCompanyProfileId = () => `company-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const sanitizeCompanyProfile = (profile: Partial<CompanyProfileForm>, fallbackId?: string): CompanyProfileForm => ({
  id: typeof profile.id === 'string' && profile.id ? profile.id : (fallbackId || createCompanyProfileId()),
  name: typeof profile.name === 'string' ? profile.name : '',
  address: typeof profile.address === 'string' ? profile.address : '',
  postalCode: typeof profile.postalCode === 'string' ? profile.postalCode : '',
  city: typeof profile.city === 'string' ? profile.city : '',
  vatId: typeof profile.vatId === 'string' ? profile.vatId : '',
  email: typeof profile.email === 'string' ? profile.email : '',
  telephone: typeof profile.telephone === 'string' ? profile.telephone : '',
  iban: typeof profile.iban === 'string' ? profile.iban : '',
  bic: typeof profile.bic === 'string' ? profile.bic : '',
  bankQrPurposeCode: typeof profile.bankQrPurposeCode === 'string' ? profile.bankQrPurposeCode : 'OTHR',
  bankQrPurposeText: typeof profile.bankQrPurposeText === 'string' ? profile.bankQrPurposeText : 'PLACILO FOLIA',
  isDefault: Boolean(profile.isDefault),
})

const companyProfileFromSettings = (settings: Record<string, string>): CompanyProfileForm => sanitizeCompanyProfile({
  id: 'default-company-profile',
  name: settings.COMPANY_NAME || '',
  address: settings.COMPANY_ADDRESS || '',
  postalCode: settings.COMPANY_POSTAL_CODE || '',
  city: settings.COMPANY_CITY || '',
  vatId: settings.COMPANY_VAT_ID || '',
  email: settings.COMPANY_EMAIL || '',
  telephone: settings.COMPANY_TELEPHONE || '',
  iban: settings.COMPANY_IBAN || '',
  bic: settings.COMPANY_BIC || '',
  bankQrPurposeCode: settings.BANK_QR_PURPOSE_CODE || 'OTHR',
  bankQrPurposeText: settings.BANK_QR_PURPOSE_TEXT || 'PLACILO FOLIA',
  isDefault: true,
})

const companyProfileToSettings = (settings: Record<string, string>, profile: CompanyProfileForm, profiles: CompanyProfileForm[]): Record<string, string> => ({
  ...settings,
  COMPANY_NAME: profile.name,
  COMPANY_ADDRESS: profile.address,
  COMPANY_POSTAL_CODE: profile.postalCode,
  COMPANY_CITY: profile.city,
  COMPANY_VAT_ID: profile.vatId,
  COMPANY_EMAIL: profile.email,
  COMPANY_TELEPHONE: profile.telephone,
  COMPANY_IBAN: profile.iban,
  COMPANY_BIC: profile.bic,
  BANK_QR_PURPOSE_CODE: profile.bankQrPurposeCode || 'OTHR',
  BANK_QR_PURPOSE_TEXT: profile.bankQrPurposeText || 'PLACILO FOLIA',
  COMPANY_PROFILES: JSON.stringify(profiles),
  COMPANY_SELECTED_PROFILE_ID: profile.id,
})

const loadCompanyProfilesFromSettings = (settings: Record<string, string>): CompanyProfileForm[] => {
  if (settings.COMPANY_PROFILES) {
    try {
      const parsed = JSON.parse(settings.COMPANY_PROFILES)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const profiles = parsed.map((profile, index) => sanitizeCompanyProfile(profile, index === 0 ? 'default-company-profile' : undefined))
        return profiles.some((profile) => profile.isDefault)
          ? profiles
          : profiles.map((profile, index) => ({ ...profile, isDefault: index === 0 }))
      }
    } catch {
      // Fall back to legacy single-profile settings below.
    }
  }
  return [companyProfileFromSettings(settings)]
}


type ConfigNavIcon = 'company' | 'booking' | 'billing' | 'guestApp' | 'notifications' | 'googleCalendar' | 'whatsapp' | 'viber' | 'modules' | 'security'

type ConfigNavItem = { id: Tab; icon: ConfigNavIcon }
type InboxGlobalCapabilities = { whatsappEnabled: boolean; viberEnabled: boolean }

const CONFIG_TAB_IDS: readonly Tab[] = ['company', 'booking', 'billing', 'guestApp', 'notifications', 'googleCalendar', 'whatsapp', 'viber', 'modules', 'security']

const CONFIG_TAB_LABEL_KEY: Record<Tab, string> = {
  company: 'tabCompany',
  booking: 'tabBooking',
  billing: 'tabBilling',
  guestApp: 'tabGuestApp',
  notifications: 'tabNotifications',
  googleCalendar: 'tabGoogleCalendar',
  whatsapp: 'tabWhatsapp',
  viber: 'tabViber',
  modules: 'tabModules',
  security: 'tabSecurity',
}

const isConfigTab = (value: string | null): value is Tab => Boolean(value && (CONFIG_TAB_IDS as readonly string[]).includes(value))

function ConfigSettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.5a2 2 0 0 1-1 1.72l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.5a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ConfigTabIcon({ kind }: { kind: ConfigNavIcon }) {
  if (kind === 'company') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </svg>
    )
  }
  if (kind === 'booking') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    )
  }
  if (kind === 'billing') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M7 15h2M12 15h5" />
      </svg>
    )
  }
  if (kind === 'guestApp') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
        <path d="M9 5h6" />
      </svg>
    )
  }
  if (kind === 'notifications') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    )
  }
  if (kind === 'googleCalendar') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
        <path d="M9 15l2 2 4-5" />
      </svg>
    )
  }
  if (kind === 'whatsapp') {
    /* Vector mark (Simple Icons, CC0) on white — avoids raster “transparency” checkerboard artifacts. */
    return (
      <span className="config-nav-tab-brand-wrap" aria-hidden>
        <svg width={15} height={15} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <path
            fill="#25D366"
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
          />
        </svg>
      </span>
    )
  }
  if (kind === 'viber') {
    return (
      <span className="config-nav-tab-brand-wrap" aria-hidden>
        <svg width={15} height={15} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <path
            fill="#7360F2"
            d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z"
          />
        </svg>
      </span>
    )
  }
  if (kind === 'modules') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  if (kind === 'security') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
        <path d="M9.5 12.5l1.5 1.5 3.5-4" />
      </svg>
    )
  }
  const _exhaustive: never = kind
  void _exhaustive
  return null
}

function HelpHint({ helpId, t }: { helpId: string; t: (key: string) => string }) {
  const text = helpTooltip(t, helpId)
  return (
    <span className="config-help-hint" data-tooltip={text} role="img" aria-label={text} tabIndex={0}>
      ?
    </span>
  )
}

type GuestFieldProps = { label: string; hint?: string; children: ReactNode; className?: string }

function GuestField({ label, hint, children, className }: GuestFieldProps) {
  return (
    <label className={className ? `gapp-field ${className}` : 'gapp-field'}>
      <span className="gapp-label">{label}</span>
      {children}
      {hint ? <span className="gapp-hint">{hint}</span> : null}
    </label>
  )
}

function GuestSegmentedToggle({ value, onChange, className }: { value: boolean; onChange: (value: boolean) => void; className?: string }) {
  return (
    <div className={className ? `gapp-segmented ${className}` : 'gapp-segmented'}>
      <button type="button" className={!value ? 'active' : ''} onClick={() => onChange(false)}>OFF</button>
      <button type="button" className={value ? 'active' : ''} onClick={() => onChange(true)}>ON</button>
    </div>
  )
}

function GuestSwitch({ checked, onChange, label = 'ON' }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <button type="button" className={checked ? 'gapp-switch active' : 'gapp-switch'} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className="gapp-switch-knob" />
      <span className="gapp-switch-label">{checked ? label : 'OFF'}</span>
    </button>
  )
}

type NotificationChannel = 'email' | 'sms' | 'guestApp'
type NotificationEventKind = 'newSession' | 'sessionChanged' | 'sessionCancelled' | 'beforeSession' | 'afterSession'

type NotificationEventDefinition = {
  id: NotificationEventKind
  title: string
  description: string
  icon: 'calendar' | 'edit' | 'x' | 'bell' | 'check' | 'message'
  reminder?: 'before' | 'after'
}

type ConfigurationNotificationsSectionProps = {
  settings: Record<string, string>
  setSettings: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void
  savingSettings: boolean
  onSave: () => void | Promise<void>
  t: (key: string) => string
}

const notificationEvents: NotificationEventDefinition[] = [
  {
    id: 'newSession',
    title: 'Nova seja',
    description: 'Pošlje se, ko je seja uspešno ustvarjena.',
    icon: 'calendar',
  },
  {
    id: 'sessionChanged',
    title: 'Sprememba seje',
    description: 'Pošlje se, ko so podrobnosti seje spremenjene.',
    icon: 'edit',
  },
  {
    id: 'sessionCancelled',
    title: 'Preklic seje',
    description: 'Pošlje se, ko je seja preklicana.',
    icon: 'x',
  },
  {
    id: 'beforeSession',
    title: 'Pred sejo',
    description: 'Opomnik pošlje pred začetkom seje.',
    icon: 'bell',
    reminder: 'before',
  },
  {
    id: 'afterSession',
    title: 'Po seji',
    description: 'Povzetek pošlje po koncu seje.',
    icon: 'check',
    reminder: 'after',
  },
]

const reminderBeforeOptions = ['15 min pred terminom', '30 min pred terminom', '1 ura pred terminom', '2 uri pred terminom', '24 ur pred terminom']
const reminderAfterOptions = ['Takoj po seji', '30 min po seji', '1 ura po seji', '2 uri po seji', '24 ur po seji']

function notificationEnabledKey(channel: NotificationChannel, id: NotificationEventKind) {
  return `NOTIFICATIONS_${channel.toUpperCase()}_${id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}_ENABLED`
}

function notificationReminderKey(channel: NotificationChannel, reminder: 'before' | 'after') {
  return `NOTIFICATIONS_${channel.toUpperCase()}_${reminder.toUpperCase()}_REMINDER_TIME`
}

function getNotificationEnabled(settings: Record<string, string>, channel: NotificationChannel, id: NotificationEventKind) {
  return settings[notificationEnabledKey(channel, id)] !== 'false'
}

function getReminderValue(settings: Record<string, string>, channel: NotificationChannel, reminder: 'before' | 'after') {
  const fallback = reminder === 'before' ? '24 ur pred terminom' : '2 uri po seji'
  return settings[notificationReminderKey(channel, reminder)] || fallback
}

function notificationEventSettingName(id: NotificationEventKind) {
  return id.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()
}

function notificationTemplateTitleKey(channel: NotificationChannel, id: NotificationEventKind) {
  return `NOTIFICATIONS_${channel.toUpperCase()}_${notificationEventSettingName(id)}_TEMPLATE_TITLE`
}

function notificationTemplateBodyKey(channel: NotificationChannel, id: NotificationEventKind) {
  return `NOTIFICATIONS_${channel.toUpperCase()}_${notificationEventSettingName(id)}_TEMPLATE_BODY`
}

type NotificationTemplateDefaults = Record<NotificationEventKind, { title: string; body: string }>

const emailTemplateDefaults: NotificationTemplateDefaults = {
  newSession: {
    title: 'Potrditev rezervacije',
    body: 'Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.\n\nVeselimo se srečanja z vami.\n{{ime_podjetja}}',
  },
  sessionChanged: {
    title: 'Sprememba rezervacije',
    body: 'Pozdravljeni {{ime_stranke}},\n\npodrobnosti vaše rezervacije so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.\n\n{{ime_podjetja}}',
  },
  sessionCancelled: {
    title: 'Preklic rezervacije',
    body: 'Pozdravljeni {{ime_stranke}},\n\nvaša rezervacija za {{ime_storitve}} je bila preklicana.\n\n{{ime_podjetja}}',
  },
  beforeSession: {
    title: 'Opomnik pred terminom',
    body: 'Pozdravljeni {{ime_stranke}},\n\nspomnimo vas na termin {{ime_storitve}} dne {{datum}} ob {{cas}}.\n\nSe vidimo kmalu.\n{{ime_podjetja}}',
  },
  afterSession: {
    title: 'Hvala za obisk',
    body: 'Pozdravljeni {{ime_stranke}},\n\nhvala za obisk. Veseli bomo vaših povratnih informacij.\n\n{{ime_podjetja}}',
  },
}

const smsTemplateDefaults: NotificationTemplateDefaults = {
  newSession: { title: 'Nova seja', body: 'Pozdravljeni {{ime_stranke}}, vaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.' },
  sessionChanged: { title: 'Sprememba seje', body: 'Pozdravljeni {{ime_stranke}}, vaš termin je bil spremenjen na {{datum}} ob {{cas}}.' },
  sessionCancelled: { title: 'Preklic seje', body: 'Pozdravljeni {{ime_stranke}}, vaša rezervacija za {{ime_storitve}} je bila preklicana.' },
  beforeSession: { title: 'Opomnik pred sejo', body: 'Pozdravljeni {{ime_stranke}}, opomnik na termin {{ime_storitve}} dne {{datum}} ob {{cas}}.' },
  afterSession: { title: 'Po seji', body: 'Hvala za obisk, {{ime_stranke}}. Veselimo se vaših povratnih informacij.' },
}

const guestAppTemplateDefaults: NotificationTemplateDefaults = {
  newSession: { title: 'Nova seja', body: 'Vaša rezervacija za {{ime_storitve}} dne {{datum}} ob {{cas}} je potrjena.' },
  sessionChanged: { title: 'Sprememba seje', body: 'Podrobnosti vaše seje so bile spremenjene. Nov termin je {{datum}} ob {{cas}}.' },
  sessionCancelled: { title: 'Preklic seje', body: 'Vaša rezervacija za {{ime_storitve}} je bila preklicana.' },
  beforeSession: { title: 'Opomnik pred sejo', body: 'Opomnik: vaš termin {{ime_storitve}} je dne {{datum}} ob {{cas}}.' },
  afterSession: { title: 'Po seji', body: 'Hvala za obisk. Veseli bomo vaših povratnih informacij.' },
}

const notificationTemplateDefaults: Record<NotificationChannel, NotificationTemplateDefaults> = {
  email: emailTemplateDefaults,
  sms: smsTemplateDefaults,
  guestApp: guestAppTemplateDefaults,
}

const notificationTemplateTags = [
  { label: 'Ime podjetja', token: '{{ime_podjetja}}' },
  { label: 'Ime stranke', token: '{{ime_stranke}}' },
  { label: 'Priimek stranke', token: '{{priimek_stranke}}' },
  { label: 'Ime storitve', token: '{{ime_storitve}}' },
  { label: 'Datum', token: '{{datum}}' },
  { label: 'Čas', token: '{{cas}}' },
  { label: 'Naslov lokacije', token: '{{naslov_lokacije}}' },
  { label: 'Ime lokacije', token: '{{ime_lokacije}}' },
  { label: 'Telefonska številka lokacije', token: '{{telefon_lokacije}}' },
  { label: 'Povezava za prenaročanje', token: '{{povezava_za_prenarocanje}}' },
  { label: 'Kategorija storitve', token: '{{kategorija_storitve}}' },
  { label: 'Ime izvajalca', token: '{{ime_izvajalca}}' },
  { label: 'Telefonska številka izvajalca', token: '{{telefon_izvajalca}}' },
  { label: 'Datum in čas prvotnega termina', token: '{{prvotni_termin}}' },
]

function getNotificationTemplateTitle(settings: Record<string, string>, channel: NotificationChannel, id: NotificationEventKind) {
  return settings[notificationTemplateTitleKey(channel, id)] || notificationTemplateDefaults[channel][id].title
}

function getNotificationTemplateBody(settings: Record<string, string>, channel: NotificationChannel, id: NotificationEventKind) {
  return settings[notificationTemplateBodyKey(channel, id)] || notificationTemplateDefaults[channel][id].body
}

function NotificationEventIcon({ icon }: { icon: NotificationEventDefinition['icon'] }) {
  if (icon === 'calendar') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M12 14v5M9.5 16.5h5" />
      </svg>
    )
  }
  if (icon === 'edit') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  }
  if (icon === 'x') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-6 6M9 9l6 6" />
      </svg>
    )
  }
  if (icon === 'bell') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    )
  }
  if (icon === 'message') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    )
  }
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  )
}

function NotificationChevronIcon({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={expanded ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}

function NotificationSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" className={checked ? 'notif-switch is-on' : 'notif-switch'} aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

function NotificationToolbarIcon({ kind }: { kind: 'bold' | 'italic' | 'underline' | 'link' | 'bullets' | 'numbers' | 'quote' | 'preview' }) {
  if (kind === 'bold') return <span aria-hidden>B</span>
  if (kind === 'italic') return <em aria-hidden>I</em>
  if (kind === 'underline') return <span style={{ textDecoration: 'underline' }} aria-hidden>U</span>
  if (kind === 'link') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
      </svg>
    )
  }
  if (kind === 'bullets') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    )
  }
  if (kind === 'numbers') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 6h11M10 12h11M10 18h11" />
        <path d="M4 6h1v4M4 10h2M4 14h2l-2 4h2" />
      </svg>
    )
  }
  if (kind === 'quote') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 6-4 8Z" />
        <path d="M14 21c3 0 7-1 7-8V5h-7v8h4c0 4-2 6-4 8Z" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const keepTemplateSelectionOnToolbarMouseDown = (event: React.MouseEvent<HTMLButtonElement | HTMLSelectElement>) => {
  event.preventDefault()
}

function ConfigurationNotificationsSection({ settings, setSettings, savingSettings, onSave, t }: ConfigurationNotificationsSectionProps) {
  const [channel, setChannel] = useState<NotificationChannel>('email')
  const [editingEvent, setEditingEvent] = useState<NotificationEventKind | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState(false)
  const templateBodyRef = useRef<HTMLDivElement | null>(null)

  const channelCopy: Record<NotificationChannel, { title: string; subtitle: string; editLabel: string }> = {
    email: {
      title: 'Sprožilci e-pošte',
      subtitle: 'E-poštna sporočila se pošiljajo samodejno na podlagi dogodkov.',
      editLabel: 'Uredi predlogo',
    },
    sms: {
      title: 'Sprožilci SMS',
      subtitle: 'Besedilna sporočila se samodejno pošiljajo za ključne dogodke.',
      editLabel: 'Uredi besedilo',
    },
    guestApp: {
      title: 'Sporočilni dogodki',
      subtitle: 'Izberite, kdaj naj bo obvestilo poslano v Guest aplikaciji.',
      editLabel: 'Uredi vsebino',
    },
  }

  useEffect(() => {
    setEditingEvent(null)
    setPreviewTemplate(false)
  }, [channel])

  useEffect(() => {
    setPreviewTemplate(false)
  }, [editingEvent])

  const selectedEvent = editingEvent ? notificationEvents.find((event) => event.id === editingEvent) || null : null
  const selectedTemplateBody = selectedEvent ? getNotificationTemplateBody(settings, channel, selectedEvent.id) : ''

  const setNotificationEnabled = (id: NotificationEventKind, checked: boolean) => {
    const key = notificationEnabledKey(channel, id)
    setSettings((prev) => ({ ...prev, [key]: checked ? 'true' : 'false' }))
  }

  const setReminderValue = (reminder: 'before' | 'after', value: string) => {
    const key = notificationReminderKey(channel, reminder)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const setTemplateTitle = (id: NotificationEventKind, value: string) => {
    setSettings((prev) => ({ ...prev, [notificationTemplateTitleKey(channel, id)]: value }))
  }

  const setTemplateBody = (id: NotificationEventKind, value: string) => {
    setSettings((prev) => ({ ...prev, [notificationTemplateBodyKey(channel, id)]: value }))
  }

  const templateBodyToEditorHtml = (raw: string) => {
    const value = String(raw || '')
    if (/<[a-z][\s\S]*>/i.test(value)) return value
    return escapeHtml(value).replace(/\n/g, '<br>')
  }

  const syncTemplateBodyFromEditor = (id: NotificationEventKind) => {
    const element = templateBodyRef.current
    if (!element) return
    setTemplateBody(id, element.innerHTML)
  }

  const execTemplateCommand = (id: NotificationEventKind, command: string, value?: string) => {
    const element = templateBodyRef.current
    if (!element) return
    element.focus()
    try {
      document.execCommand(command, false, value)
    } catch {
      // ignore browser execCommand failures
    }
    syncTemplateBodyFromEditor(id)
  }

  const applyTemplateBlockStyle = (id: NotificationEventKind, style: string) => {
    if (style === 'normal') execTemplateCommand(id, 'formatBlock', 'p')
    else if (style === 'heading') execTemplateCommand(id, 'formatBlock', 'h2')
    else if (style === 'subheading') execTemplateCommand(id, 'formatBlock', 'h3')
    else if (style === 'small') execTemplateCommand(id, 'formatBlock', 'small')
  }

  const insertTemplateLink = (id: NotificationEventKind) => {
    const url = window.prompt('URL', 'https://')
    if (!url) return
    execTemplateCommand(id, 'createLink', url)
  }

  const appendTemplateToken = (id: NotificationEventKind, token: string) => {
    execTemplateCommand(id, 'insertText', token)
  }

  const getTemplatePreviewText = (body: string) => {
    const replacements: Record<string, string> = {
      '{{ime_podjetja}}': '2TEN',
      '{{ime_stranke}}': 'Maja',
      '{{priimek_stranke}}': 'Novak',
      '{{ime_storitve}}': 'Individualni trening',
      '{{datum}}': '12. junij 2026',
      '{{cas}}': '09:30',
      '{{naslov_lokacije}}': 'Dunajska cesta 10',
      '{{ime_lokacije}}': 'Studio Center',
      '{{telefon_lokacije}}': '+386 40 123 456',
      '{{povezava_za_prenarocanje}}': 'https://2ten.si/book/2TEN',
      '{{kategorija_storitve}}': 'Fitnes',
      '{{ime_izvajalca}}': 'Ana',
      '{{telefon_izvajalca}}': '+386 41 555 111',
      '{{prvotni_termin}}': '10. junij 2026 ob 10:00',
    }
    const plain = body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|blockquote|li)>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
    return Object.entries(replacements).reduce((text, [token, value]) => text.split(token).join(value), plain)
  }

  useEffect(() => {
    if (!selectedEvent || previewTemplate) return
    const element = templateBodyRef.current
    if (!element) return
    if (document.activeElement === element) return
    const nextHtml = templateBodyToEditorHtml(selectedTemplateBody)
    if (element.innerHTML !== nextHtml) {
      element.innerHTML = nextHtml
    }
  }, [selectedEvent, previewTemplate, selectedTemplateBody])

  return (
    <section className="notif-page-shell">
      <style>{`
        .notif-page-shell {
          --notif-blue: #0f62fe;
          --notif-blue-dark: #0b4bd3;
          --notif-ink: #07173b;
          --notif-muted: #64708b;
          --notif-line: #dce3ef;
          --notif-soft: #f5f8ff;
          width: min(100%, 1540px);
        }
        .notif-page-title {
          margin: 0 0 22px;
          font-size: clamp(30px, 3vw, 38px);
          line-height: 1.1;
          color: var(--notif-ink);
          letter-spacing: -0.04em;
          font-weight: 800;
        }
        .notif-tabs {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 0 10px;
          border-bottom: 1px solid #edf2f7;
        }
        .notif-tab {
          position: relative;
          appearance: none;
          border: 0;
          background: transparent;
          color: #334155;
          font-weight: 700;
          font-size: 15px;
          padding: 10px 14px;
          cursor: pointer;
          border-radius: 10px;
          box-shadow: none;
          outline: none;
          transition: color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .notif-tab:hover {
          color: #0f172a;
          background: #f8fafc;
        }
        .notif-tab.is-active {
          color: var(--notif-blue);
          background: #eaf2ff;
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
        }
        .notif-card {
          position: relative;
          padding: clamp(24px, 3vw, 38px);
          border: 1px solid var(--notif-line);
          border-radius: 24px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 22px 50px rgba(13, 32, 67, 0.10);
          overflow: hidden;
        }
        .notif-card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 14% 0%, rgba(34, 112, 255, 0.06), transparent 30%),
            radial-gradient(circle at 84% 100%, rgba(34, 112, 255, 0.05), transparent 28%);
        }
        .notif-card-content {
          position: relative;
        }
        .notif-layout {
          display: grid;
          gap: 28px;
        }
        .notif-layout.has-editor {
          grid-template-columns: minmax(0, 0.96fr) minmax(390px, 0.82fr);
          align-items: start;
        }
        .notif-section-heading {
          margin-bottom: 24px;
        }
        .notif-section-heading h3 {
          margin: 0 0 8px;
          color: var(--notif-ink);
          font-size: 22px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .notif-section-heading p {
          margin: 0;
          color: var(--notif-muted);
          font-size: 15px;
        }
        .notif-event-list {
          display: grid;
          gap: 13px;
        }
        .notif-event-row {
          display: grid;
          grid-template-columns: 52px minmax(220px, 1fr) minmax(218px, 0.34fr) 52px auto 24px;
          align-items: center;
          gap: 18px;
          min-height: 88px;
          padding: 16px 22px 16px 16px;
          border: 1px solid var(--notif-line);
          border-radius: 16px;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 8px 20px rgba(8, 23, 58, 0.035);
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .notif-layout.has-editor .notif-event-row {
          grid-template-columns: 52px minmax(170px, 1fr) minmax(190px, 0.34fr) 52px auto 24px;
          gap: 14px;
        }
        .notif-event-row.is-editing {
          border-color: rgba(15, 98, 254, 0.46);
          box-shadow: 0 10px 24px rgba(15, 98, 254, 0.10);
        }
        .notif-event-icon {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          border-radius: 13px;
          color: var(--notif-blue);
          background: linear-gradient(180deg, #eef4ff 0%, #e7efff 100%);
        }
        .notif-event-copy strong {
          display: block;
          margin-bottom: 5px;
          color: var(--notif-ink);
          font-size: 16px;
          font-weight: 800;
        }
        .notif-event-copy span {
          display: block;
          color: var(--notif-muted);
          font-size: 14px;
          line-height: 1.35;
        }
        .notif-switch {
          position: relative;
          width: 52px;
          height: 30px;
          padding: 0;
          border: 1px solid #cfd8e7;
          border-radius: 999px;
          background: #e8edf6;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-switch span {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 7px rgba(3, 17, 44, 0.24);
          transition: transform 160ms ease;
        }
        .notif-switch.is-on {
          border-color: var(--notif-blue);
          background: linear-gradient(180deg, #1b73ff 0%, #0f62fe 100%);
          box-shadow: 0 6px 14px rgba(15, 98, 254, 0.18);
        }
        .notif-switch.is-on span {
          transform: translateX(22px);
        }
        .notif-row-action {
          border: 0;
          background: transparent;
          color: var(--notif-ink);
          font-size: 14px;
          font-weight: 800;
          white-space: nowrap;
          cursor: pointer;
        }
        .notif-row-action:hover,
        .notif-row-action.is-active {
          color: var(--notif-blue);
        }
        .notif-row-chevron {
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #0b1c45;
          cursor: pointer;
          padding: 4px;
        }
        .notif-row-chevron.is-active {
          color: var(--notif-blue);
        }
        .notif-reminder-select-wrap,
        .notif-reminder-placeholder {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .notif-reminder-select-wrap label {
          color: var(--notif-muted);
          font-size: 12px;
          font-weight: 800;
        }
        .notif-reminder-placeholder {
          min-height: 44px;
          visibility: hidden;
        }
        .notif-reminder-select {
          min-height: 44px;
          width: 100%;
          border: 1px solid #cfd8e7;
          border-radius: 11px;
          background: #fff;
          color: var(--notif-ink);
          padding: 0 40px 0 14px;
          font-size: 14px;
          font-weight: 700;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #0b1c45 50%), linear-gradient(135deg, #0b1c45 50%, transparent 50%);
          background-position: calc(100% - 18px) 19px, calc(100% - 12px) 19px;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }
        .notif-template-panel {
          min-height: 100%;
          padding-left: 30px;
          border-left: 1px solid var(--notif-line);
        }
        .notif-template-card {
          padding: 28px;
          border: 1px solid rgba(220, 227, 239, 0.96);
          border-radius: 20px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 18px 38px rgba(8, 23, 58, 0.06);
        }
        .notif-template-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 6px;
        }
        .notif-template-header h4 {
          margin: 0;
          color: var(--notif-ink);
          font-size: 22px;
          line-height: 1.18;
          font-weight: 850;
          letter-spacing: -0.035em;
        }
        .notif-template-subtitle {
          margin: 0 0 24px;
          color: var(--notif-muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .notif-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 14px;
          border-radius: 999px;
          background: #e8f8ef;
          color: #087443;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }
        .notif-status-pill::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 0 3px rgba(8, 116, 67, 0.10);
        }
        .notif-status-pill.is-off {
          background: #f3f4f6;
          color: #5b6475;
        }
        .notif-template-tags {
          margin: 0 0 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e6edf6;
          color: var(--notif-ink);
          font-size: 13px;
          font-weight: 850;
          line-height: 1.4;
        }
        .notif-template-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .notif-template-tag {
          border: 1px solid rgba(18, 148, 74, 0.18);
          border-radius: 999px;
          background: #eaf8f0;
          color: #098342;
          padding: 6px 11px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 12px rgba(21, 148, 71, 0.06);
          transition: transform 150ms ease, background 150ms ease, border-color 150ms ease;
        }
        .notif-template-tag:hover {
          background: #ddf3e7;
          border-color: rgba(18, 148, 74, 0.32);
          transform: translateY(-1px);
        }
        .notif-template-field {
          display: grid;
          gap: 9px;
          margin-top: 16px;
        }
        .notif-template-field label {
          color: var(--notif-ink);
          font-size: 13px;
          font-weight: 850;
        }
        .notif-template-input,
        .notif-template-textarea {
          width: 100%;
          border: 1px solid #cfd8e7;
          border-radius: 12px;
          background: #fff;
          color: var(--notif-ink);
          font-size: 14px;
          line-height: 1.5;
          padding: 12px 14px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-template-input:focus,
        .notif-template-textarea:focus,
        .notif-reminder-select:focus {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-template-editor {
          overflow: hidden;
          border: 1px solid #cfd8e7;
          border-radius: 13px;
          background: #fff;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .notif-template-editor:focus-within {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .notif-template-toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 46px;
          padding: 7px 9px;
          border-bottom: 1px solid #e6edf6;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .notif-template-format,
        .notif-template-toolbar-button,
        .notif-template-preview-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #23345d;
          font-size: 13px;
          font-weight: 800;
          height: 32px;
          padding: 0 10px;
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
        }
        .notif-template-format {
          min-width: 126px;
          justify-content: space-between;
          border: 1px solid #e1e8f3;
          background: #f4f7fb;
          color: #243655;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #475569 50%), linear-gradient(135deg, #475569 50%, transparent 50%);
          background-position: calc(100% - 16px) 14px, calc(100% - 11px) 14px;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          padding-right: 28px;
        }
        .notif-template-toolbar-button {
          min-width: 32px;
          padding: 0 8px;
        }
        .notif-template-toolbar-button:hover,
        .notif-template-toolbar-button.is-active,
        .notif-template-preview-button:hover,
        .notif-template-preview-button.is-active {
          background: #eef4ff;
          color: var(--notif-blue);
          box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.10);
        }
        .notif-template-toolbar-divider {
          width: 1px;
          align-self: stretch;
          margin: 4px 3px;
          background: #e6edf6;
        }
        .notif-template-toolbar-spacer {
          flex: 1 1 auto;
        }
        .notif-template-preview-button {
          gap: 7px;
          background: #eef4ff;
          color: var(--notif-blue);
          padding: 0 10px;
        }
        .notif-template-textarea {
          min-height: 220px;
          resize: vertical;
          border: 0;
          border-radius: 0;
          box-shadow: none !important;
        }
        .notif-template-preview-pane {
          min-height: 220px;
          padding: 16px 16px 18px;
          color: var(--notif-ink);
          font-size: 14px;
          line-height: 1.62;
          white-space: pre-wrap;
          background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
        }
        .notif-template-preview-empty {
          color: var(--notif-muted);
          font-style: italic;
        }
        .notif-savebar {
          display: flex;
          justify-content: flex-end;
          margin-top: 28px;
        }
        .notif-save-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-width: 220px;
          min-height: 48px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(180deg, #1c78ff 0%, #0f62fe 100%);
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 22px rgba(15, 98, 254, 0.25);
        }
        .notif-save-button:disabled {
          opacity: 0.72;
          cursor: progress;
        }
        @media (max-width: 1180px) {
          .notif-layout.has-editor {
            grid-template-columns: 1fr;
          }
          .notif-template-panel {
            padding-left: 0;
            padding-top: 24px;
            border-left: 0;
            border-top: 1px solid var(--notif-line);
          }
        }
        @media (max-width: 980px) {
          .notif-page-shell { width: 100%; }
          .notif-tabs { display: flex; width: 100%; overflow-x: auto; }
          .notif-tab { flex: 0 0 auto; }
          .notif-event-row,
          .notif-layout.has-editor .notif-event-row {
            grid-template-columns: 48px minmax(0, 1fr) auto;
            gap: 14px;
          }
          .notif-row-action {
            display: none;
          }
          .notif-reminder-select-wrap,
          .notif-reminder-placeholder {
            grid-column: 2 / -1;
            grid-row: auto;
          }
        }
        @media (max-width: 640px) {
          .notif-card { padding: 18px; border-radius: 18px; }
          .notif-event-row { padding: 14px; }
          .notif-savebar { justify-content: stretch; }
          .notif-save-button { width: 100%; }
        }
      `}</style>
      <div className="notif-card">
        <div className="notif-card-content">
          <div className="notif-tabs" role="tablist" aria-label="Obvestila">
            {([
              ['email', 'E-pošta'],
              ['sms', 'SMS'],
              ['guestApp', 'Aplikacija za goste'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={channel === id ? 'notif-tab is-active' : 'notif-tab'}
                onClick={() => setChannel(id)}
                role="tab"
                aria-selected={channel === id}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={selectedEvent ? 'notif-layout has-editor' : 'notif-layout'}>
            <div>
              <div className="notif-event-list">
                {notificationEvents.map((event) => {
                  const checked = getNotificationEnabled(settings, channel, event.id)
                  const reminderValue = event.reminder ? getReminderValue(settings, channel, event.reminder) : ''
                  const reminderOptions = event.reminder === 'after' ? reminderAfterOptions : reminderBeforeOptions
                  const isEditing = selectedEvent?.id === event.id
                  const openEditor = () => setEditingEvent((prev) => (prev === event.id ? null : event.id))
                  return (
                    <div className={isEditing ? 'notif-event-row is-editing' : 'notif-event-row'} key={`${channel}-${event.id}`}>
                      <span className="notif-event-icon"><NotificationEventIcon icon={event.icon} /></span>
                      <span className="notif-event-copy">
                        <strong>{event.title}</strong>
                        <span>{event.description}</span>
                      </span>
                      {event.reminder && checked ? (
                        <span className="notif-reminder-select-wrap">
                          <label>Privzeti čas opomnika</label>
                          <select className="notif-reminder-select" value={reminderValue} onChange={(e) => setReminderValue(event.reminder!, e.target.value)}>
                            {reminderOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </span>
                      ) : <span className="notif-reminder-placeholder" aria-hidden />}
                      <NotificationSwitch checked={checked} onChange={(next) => setNotificationEnabled(event.id, next)} />
                      <button type="button" className={isEditing ? 'notif-row-action is-active' : 'notif-row-action'} onClick={openEditor}>{channelCopy[channel].editLabel}</button>
                      <button type="button" className={isEditing ? 'notif-row-chevron is-active' : 'notif-row-chevron'} aria-label={`${channelCopy[channel].editLabel}: ${event.title}`} onClick={openEditor}>
                        <NotificationChevronIcon expanded={isEditing} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {selectedEvent ? (
              <aside className="notif-template-panel" aria-label={`${channelCopy[channel].editLabel}: ${selectedEvent.title}`}>
                <div className="notif-template-card">
                  <div className="notif-template-header">
                    <h4>{channelCopy[channel].editLabel}: {selectedEvent.title}</h4>
                    <span className={getNotificationEnabled(settings, channel, selectedEvent.id) ? 'notif-status-pill' : 'notif-status-pill is-off'}>
                      {getNotificationEnabled(settings, channel, selectedEvent.id) ? 'VKLOPLJENO' : 'IZKLOPLJENO'}
                    </span>
                  </div>
                  <p className="notif-template-subtitle">
                    {channel === 'email'
                      ? 'Uredite vsebino e-pošte, ki bo poslana gostu ob izbranem dogodku.'
                      : channel === 'sms'
                        ? 'Uredite kratko SMS sporočilo, ki bo poslano gostu ob izbranem dogodku.'
                        : 'Uredite obvestilo, ki se prikaže gostu v aplikaciji.'}
                  </p>
                  <div className="notif-template-field">
                    <label htmlFor={`notif-template-title-${channel}-${selectedEvent.id}`}>Naslov</label>
                    <input
                      id={`notif-template-title-${channel}-${selectedEvent.id}`}
                      className="notif-template-input"
                      value={getNotificationTemplateTitle(settings, channel, selectedEvent.id)}
                      onChange={(event) => setTemplateTitle(selectedEvent.id, event.target.value)}
                    />
                  </div>
                  <div className="notif-template-field">
                    <label htmlFor={`notif-template-body-${channel}-${selectedEvent.id}`}>Vsebina</label>
                    <div className="notif-template-editor">
                      <div className="notif-template-toolbar" aria-label="Orodna vrstica predloge">
                        <select
                          className="notif-template-format"
                          aria-label="Slog besedila"
                          value="normal"
                          onMouseDown={keepTemplateSelectionOnToolbarMouseDown}
                          onChange={(event) => applyTemplateBlockStyle(selectedEvent.id, event.target.value)}
                        >
                          <option value="normal">Normalno</option>
                          <option value="heading">Naslov</option>
                          <option value="subheading">Podnaslov</option>
                          <option value="small">Drobno</option>
                        </select>
                        <span className="notif-template-toolbar-divider" aria-hidden />
                        <button type="button" className="notif-template-toolbar-button" aria-label="Krepko" title="Krepko" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => execTemplateCommand(selectedEvent.id, 'bold')}>
                          <NotificationToolbarIcon kind="bold" />
                        </button>
                        <button type="button" className="notif-template-toolbar-button" aria-label="Ležeče" title="Ležeče" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => execTemplateCommand(selectedEvent.id, 'italic')}>
                          <NotificationToolbarIcon kind="italic" />
                        </button>
                        <button type="button" className="notif-template-toolbar-button" aria-label="Podčrtano" title="Podčrtano" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => execTemplateCommand(selectedEvent.id, 'underline')}>
                          <NotificationToolbarIcon kind="underline" />
                        </button>
                        <button type="button" className="notif-template-toolbar-button" aria-label="Vstavi povezavo" title="Vstavi povezavo" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => insertTemplateLink(selectedEvent.id)}>
                          <NotificationToolbarIcon kind="link" />
                        </button>
                        <span className="notif-template-toolbar-divider" aria-hidden />
                        <button type="button" className="notif-template-toolbar-button" aria-label="Označen seznam" title="Označen seznam" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => execTemplateCommand(selectedEvent.id, 'insertUnorderedList')}>
                          <NotificationToolbarIcon kind="bullets" />
                        </button>
                        <button type="button" className="notif-template-toolbar-button" aria-label="Oštevilčen seznam" title="Oštevilčen seznam" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => execTemplateCommand(selectedEvent.id, 'insertOrderedList')}>
                          <NotificationToolbarIcon kind="numbers" />
                        </button>
                        <button type="button" className="notif-template-toolbar-button" aria-label="Citat" title="Citat" onMouseDown={keepTemplateSelectionOnToolbarMouseDown} onClick={() => execTemplateCommand(selectedEvent.id, 'formatBlock', 'blockquote')}>
                          <NotificationToolbarIcon kind="quote" />
                        </button>
                        <span className="notif-template-toolbar-spacer" />
                        <button
                          type="button"
                          className={previewTemplate ? 'notif-template-preview-button is-active' : 'notif-template-preview-button'}
                          aria-label="Predogled"
                          aria-pressed={previewTemplate}
                          onMouseDown={keepTemplateSelectionOnToolbarMouseDown}
                          onClick={() => setPreviewTemplate((value) => !value)}
                        >
                          <NotificationToolbarIcon kind="preview" />
                          Predogled
                        </button>
                      </div>
                      {previewTemplate ? (
                        <div className={getNotificationTemplateBody(settings, channel, selectedEvent.id).trim() ? 'notif-template-preview-pane' : 'notif-template-preview-pane notif-template-preview-empty'}>
                          {getNotificationTemplateBody(settings, channel, selectedEvent.id).trim()
                            ? getTemplatePreviewText(getNotificationTemplateBody(settings, channel, selectedEvent.id))
                            : 'Predloga je prazna.'}
                        </div>
                      ) : (
                        <div
                          ref={templateBodyRef}
                          id={`notif-template-body-${channel}-${selectedEvent.id}`}
                          className="notif-template-textarea"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={() => syncTemplateBodyFromEditor(selectedEvent.id)}
                          onBlur={() => syncTemplateBodyFromEditor(selectedEvent.id)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="notif-template-tags">
                    Razpoložljive oznake
                    <div className="notif-template-tag-list">
                      {notificationTemplateTags.map((tag) => (
                        <button key={tag.token} type="button" className="notif-template-tag" onClick={() => appendTemplateToken(selectedEvent.id, tag.token)} title={tag.label}>
                          {tag.token}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
          <div className="notif-savebar">
            <button type="button" className="notif-save-button" onClick={() => void onSave()} disabled={savingSettings}>
              <GuestSaveIcon />
              {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function GuestDownloadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

function GuestCopyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function GuestLinkIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
    </svg>
  )
}

function GuestEyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function GuestInfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function GuestShieldIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function GuestPaymentMethodIcon({ kind }: { kind: GuestPaymentMethodId }) {
  if (kind === 'online_card') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
      </svg>
    )
  }
  if (kind === 'paypal') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 21l1.5-9h4a4 4 0 0 0 0-8H8L5 21" />
        <path d="M9.5 17h3.2a4 4 0 0 0 4-3.4l.1-.6a3 3 0 0 0-3-3.5H10" />
      </svg>
    )
  }
  if (kind === 'bank_transfer') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10h18" />
        <path d="M5 10V8l7-4 7 4v2" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 21h16M3 17h18" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  )
}

function BillingPlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function BillingEditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 5 4 4" />
      <path d="M3 21l3.9-.9L19 8 16 5 3.9 17.1 3 21z" />
    </svg>
  )
}

function BillingTrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function BillingPaypalIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 21l1.5-9h4a4 4 0 0 0 0-8H8L5 21" />
      <path d="M9.5 17h3.2a4 4 0 0 0 4-3.4l.1-.6a3 3 0 0 0-3-3.5H10" />
    </svg>
  )
}

function BillingUploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

function BillingCertificateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 15h8M8 18h5" />
      <path d="M9 11l2 2 4-4" />
    </svg>
  )
}

function BillingLockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function BillingSaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  )
}

function BillingInfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function BillingReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2-2-1.5V3a1 1 0 0 1 1-1Z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h3" />
    </svg>
  )
}

function BillingLinkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.08-7.08l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.08 7.08l1.71-1.71" />
    </svg>
  )
}

function BillingUserBadgeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22a8 8 0 0 1 16 0" />
    </svg>
  )
}

function BillingTagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.59 13.41 12 22l-9-9V4h9l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <path d="M7 7h.01" />
    </svg>
  )
}

function BillingPaymentTypeIcon({ type }: { type: PaymentType }) {
  if (type === 'CASH') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 9h.01M18 15h.01" />
      </svg>
    )
  }
  if (type === 'CARD') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3M14 15h3" />
      </svg>
    )
  }
  if (type === 'ADVANCE') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  }
  if (type === 'BANK_TRANSFER') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10h18" />
        <path d="M5 10V8l7-4 7 4v2" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M4 21h16M3 17h18" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

function GuestUploadGlyph({ kind }: { kind: 'image' | 'logo' | 'icon' }) {
  if (kind === 'icon') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="M4.93 19.07l2.83-2.83" />
        <path d="M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function GuestUploadDropzone({ title, subtitle, hint, accept, uploading, currentUrl, previewAlt, previewShape = 'wide', iconKind = 'image', onFile }: {
  title: string
  subtitle: string
  hint: string
  accept?: string
  uploading?: boolean
  currentUrl?: string
  previewAlt: string
  previewShape?: 'wide' | 'round' | 'square'
  iconKind?: 'image' | 'logo' | 'icon'
  onFile: (file: File | null) => void
}) {
  const [isDragActive, setIsDragActive] = useState(false)
  const acceptPattern = accept || 'image/*'
  const onDropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragActive(false)
    const selected = event.dataTransfer?.files?.[0] || null
    if (!selected) return
    onFile(selected)
  }

  return (
    <div className="gapp-upload-wrap">
      <label
        className={`gapp-upload-zone${isDragActive ? ' drag-active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!isDragActive) setIsDragActive(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          const related = event.relatedTarget as Node | null
          if (related && event.currentTarget.contains(related)) return
          setIsDragActive(false)
        }}
        onDrop={onDropFile}
      >
        <span className="gapp-upload-icon"><GuestUploadGlyph kind={iconKind} /></span>
        <span className="gapp-upload-copy">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <input
          className="gapp-file-input"
          type="file"
          accept={acceptPattern}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0] || null
            onFile(selected)
            event.currentTarget.value = ''
          }}
        />
      </label>
      <span className="gapp-hint">{uploading ? 'Uploading...' : hint}</span>
      {currentUrl ? (
        <div className="gapp-upload-preview-row">
          <img className={`gapp-upload-preview ${previewShape}`} src={currentUrl} alt={previewAlt} />
          <a href={currentUrl} target="_blank" rel="noreferrer">Open uploaded image</a>
        </div>
      ) : null}
    </div>
  )
}

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

type Space = { id: number; name: string; description?: string; createdAt?: string }
const toTimeInputValue = (value: string | undefined, fallback: string) => {
  const v = (value || '').trim()
  if (/^\d{2}:\d{2}$/.test(v)) return v
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5)
  return fallback
}

function spaceListInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  const s = name.trim()
  if (s.length >= 2) return s.slice(0, 2).toUpperCase()
  return (s.charAt(0) || 'S').toUpperCase()
}
const WORKING_HOURS_FALLBACK_KEY = 'workingHoursFallback'
const getWorkingHoursFallback = () => {
  try {
    const raw = localStorage.getItem(WORKING_HOURS_FALLBACK_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}
const setWorkingHoursFallback = (start: string, end: string) => {
  try {
    localStorage.setItem(WORKING_HOURS_FALLBACK_KEY, JSON.stringify({
      WORKING_HOURS_START: start,
      WORKING_HOURS_END: end,
    }))
  } catch {
    // ignore storage errors
  }
}

const PERSONAL_TASK_PRESETS_KEY = 'PERSONAL_TASK_PRESETS_JSON'
const DEFAULT_PERSONAL_TASK_COLOR = '#F97316'
const GUEST_PUBLIC_NAME_MAX_LENGTH = 15
const GUEST_PUBLIC_CITY_MAX_LENGTH = 14
const GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH = 22
const normalizePublicName = (value: string | undefined) => String(value || '').slice(0, GUEST_PUBLIC_NAME_MAX_LENGTH)
const normalizePublicCity = (value: string | undefined) => String(value || '').slice(0, GUEST_PUBLIC_CITY_MAX_LENGTH)
const normalizeHexColor = (value: string | undefined) => {
  const v = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : DEFAULT_PERSONAL_TASK_COLOR
}
const normalizePublicDescription = (value: string | undefined) => String(value || '')
  .replace(/[\r\n]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH)
const normalizePublicDescriptionInput = (value: string | undefined) => String(value || '')
  .replace(/[\r\n]+/g, ' ')
  .slice(0, GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH)
const normalizeGuestQrColor = (value: string | undefined) => {
  const v = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : '#2563EB'
}
const parsePersonalTaskPresets = (raw: string | undefined): PersonalTaskPreset[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: PersonalTaskPreset[] = []
    for (const row of parsed) {
      const name = String(row?.name || '').trim()
      if (!name) continue
      out.push({
        id: String(row?.id || `${Date.now()}-${Math.random()}`),
        name,
        color: normalizeHexColor(row?.color),
      })
    }
    return out
  } catch {
    return []
  }
}
const serializePersonalTaskPresets = (presets: PersonalTaskPreset[]) => JSON.stringify(
  presets.map((p) => ({ id: p.id, name: p.name.trim(), color: normalizeHexColor(p.color) })),
)
const REGISTERED_PREMISES_KEY = 'FISCAL_REGISTERED_PREMISES_JSON'
const parseRegisteredPremises = (raw: string | undefined): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const normalize = (v: any): string => {
      if (typeof v === 'string' || typeof v === 'number') return String(v).trim()
      if (v && typeof v === 'object') {
        const candidate = v.id ?? v.premiseId ?? v.businessPremiseId ?? v.value
        if (candidate != null) return String(candidate).trim()
      }
      return ''
    }
    return parsed
      .map(normalize)
      .filter((v) => v.length > 0)
      .filter((v) => v.toLowerCase() !== '[object object]')
  } catch {
    return []
  }
}

type GuestPaymentMethodId = 'online_card' | 'bank_transfer' | 'paypal' | 'gift_card'

type GuestAppSettingsForm = {
  guestAppEnabled: boolean
  publicDiscoverable: boolean
  publicName: string
  publicDescription: string
  publicCity: string
  tenantType: 'salon' | 'gym' | 'spa' | 'therapy'
  cardImageUrl: string
  logoImageUrl: string
  iconImageUrl: string
  defaultLanguage: 'sl' | 'en'
  employeeSelectionStep: boolean
  useEmployeeContact: boolean
  acceptedPaymentMethodIds: GuestPaymentMethodId[]
  paymentDefaultMethodId: GuestPaymentMethodId
  paymentCurrency: string
  paymentTaxRate: string
  paymentOnLocation: boolean
  paymentSendInvoiceEmail: boolean
  paymentCustomerDescription: string
  paymentProvider: string
  qrGuestUrl: string
  qrSize: string
  qrColor: string
  qrIncludeLogo: boolean
  qrCaption: string
  qrExportFormat: 'png' | 'svg' | 'pdf'
}

type GuestBookingRulesForm = {
  cancelUntilHours: string
  rescheduleUntilHours: string
  lateCancelConsumesCredit: boolean
  noShowConsumesCredit: boolean
  sameDayBankTransferAllowed: boolean
  bankTransferReservesSlot: boolean
  requireOnlinePayment: boolean
  allowBankTransferFor: string[]
  allowCardFor: string[]
  minBookingNotice: string
  maxAdvanceDays: string
  cancellationEnabled: boolean
  freeCancelUntilHours: string
  autoConfirmReservation: boolean
  bufferBeforeMinutes: string
  bufferAfterMinutes: string
  paymentRequirement: 'none' | 'deposit' | 'full'
  depositPercent: string
  noShowPolicy: string
  refundPolicy: string
  policyText: string
}

type GuestAppSubtab = 'general' | 'bookingRules' | 'paymentMethods' | 'qrCode'

type GuestAppAssetField = 'cardImageUrl' | 'logoImageUrl' | 'iconImageUrl'

type StripeConnectMode = 'sandbox' | 'production'
type StripeConnectAccountStatus = {
  mode: StripeConnectMode | string
  accountId: string
  connected: boolean
  onboardingStatus: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsJson: string
}
type StripeConnectTenantStatus = {
  activeMode: StripeConnectMode | string
  country: string
  businessType: string
  sandbox: StripeConnectAccountStatus
  production: StripeConnectAccountStatus
  sandboxPlatformEnabled: boolean
  productionPlatformEnabled: boolean
}

const GUEST_APP_SETTINGS_KEY = 'GUEST_APP_SETTINGS_JSON'
const GUEST_BOOKING_RULES_KEY = 'GUEST_BOOKING_RULES_JSON'

const GUEST_PAYMENT_METHOD_OPTIONS: { id: GuestPaymentMethodId; label: string }[] = [
  { id: 'online_card', label: 'Spletno plačilo s kartico' },
  { id: 'bank_transfer', label: 'Bančno nakazilo' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'gift_card', label: 'Darilni bon' },
]

const DEFAULT_GUEST_PAYMENT_METHOD_IDS: GuestPaymentMethodId[] = ['online_card', 'bank_transfer', 'paypal', 'gift_card']
const isGuestPaymentMethodId = (value: string): value is GuestPaymentMethodId => GUEST_PAYMENT_METHOD_OPTIONS.some((option) => option.id === value)
const normalizeGuestPaymentMethods = (value: any): GuestPaymentMethodId[] => {
  if (!Array.isArray(value)) return DEFAULT_GUEST_PAYMENT_METHOD_IDS
  const normalized = value.map((row) => String(row || '')).filter(isGuestPaymentMethodId)
  return normalized.length > 0 ? normalized : DEFAULT_GUEST_PAYMENT_METHOD_IDS
}

function guestAppSubtabs(t: (key: string) => string): { id: GuestAppSubtab; label: string }[] {
  return [
    { id: 'general', label: t('configGuestSubtabGeneral') },
    { id: 'bookingRules', label: t('configGuestSubtabBookingRules') },
    { id: 'paymentMethods', label: t('configGuestSubtabPaymentMethods') },
    { id: 'qrCode', label: t('configGuestSubtabQrCode') },
  ]
}
const GUEST_PRODUCT_TYPES = ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP', 'GIFT_CARD'] as const
const ALL_GUEST_PRODUCT_TYPES: string[] = [...GUEST_PRODUCT_TYPES]

const defaultGuestAppSettings = (): GuestAppSettingsForm => ({
  guestAppEnabled: true,
  publicDiscoverable: false,
  publicName: '',
  publicDescription: '',
  publicCity: '',
  tenantType: 'salon',
  cardImageUrl: '',
  logoImageUrl: '',
  iconImageUrl: '',
  defaultLanguage: 'sl',
  employeeSelectionStep: false,
  useEmployeeContact: false,
  acceptedPaymentMethodIds: DEFAULT_GUEST_PAYMENT_METHOD_IDS,
  paymentDefaultMethodId: 'online_card',
  paymentCurrency: 'EUR',
  paymentTaxRate: '22',
  paymentOnLocation: true,
  paymentSendInvoiceEmail: true,
  paymentCustomerDescription: 'Sprejemamo gotovino, kartice in spletna plačila. Hvala, ker ste izbrali naše storitve!',
  paymentProvider: 'stripe',
  qrGuestUrl: '',
  qrSize: '1024 x 1024',
  qrColor: '#2563EB',
  qrIncludeLogo: true,
  qrCaption: 'Rezerviraj svoj termin',
  qrExportFormat: 'png',
})

const defaultGuestBookingRules = (): GuestBookingRulesForm => ({
  cancelUntilHours: '24',
  rescheduleUntilHours: '12',
  lateCancelConsumesCredit: true,
  noShowConsumesCredit: true,
  sameDayBankTransferAllowed: false,
  bankTransferReservesSlot: false,
  requireOnlinePayment: true,
  allowBankTransferFor: ['PACK', 'MEMBERSHIP', 'GIFT_CARD'],
  allowCardFor: ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP', 'GIFT_CARD'],
  minBookingNotice: '2 uri',
  maxAdvanceDays: '60',
  cancellationEnabled: true,
  freeCancelUntilHours: '24',
  autoConfirmReservation: true,
  bufferBeforeMinutes: '15',
  bufferAfterMinutes: '10',
  paymentRequirement: 'full',
  depositPercent: '20',
  noShowPolicy: 'charge_deposit',
  refundPolicy: 'auto_by_cancellation_deadline',
  policyText: 'Rezervacijo lahko brezplačno odpoveste do navedenega roka pred terminom.\n\nPri kasnejši odpovedi ali no-show se zaračuna polog.\n\nPolog ni prenosljiv in se ne vrača.',
})

const QR_QUIET_ZONE = 4
const QR_DATA_CODEWORDS_L: Record<number, number> = { 1: 19, 2: 34, 3: 55, 4: 80 }
const QR_EC_CODEWORDS_L: Record<number, number> = { 1: 7, 2: 10, 3: 15, 4: 20 }

type QrMatrix = { size: number; modules: boolean[][] }

const buildQrGfTables = () => {
  const exp = new Array<number>(512).fill(0)
  const log = new Array<number>(256).fill(0)
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    exp[i] = x
    log[x] = i
    x <<= 1
    if ((x & 0x100) !== 0) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255]
  return { exp, log }
}

const QR_GF = buildQrGfTables()

const qrGfMultiply = (a: number, b: number) => {
  if (a === 0 || b === 0) return 0
  return QR_GF.exp[QR_GF.log[a] + QR_GF.log[b]]
}

const qrReedSolomonGenerator = (degree: number) => {
  let result = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(result.length + 1).fill(0)
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= qrGfMultiply(result[j], 1)
      next[j + 1] ^= qrGfMultiply(result[j], QR_GF.exp[i])
    }
    result = next
  }
  return result
}

const qrReedSolomonRemainder = (data: number[], degree: number) => {
  const generator = qrReedSolomonGenerator(degree)
  const result = new Array<number>(degree).fill(0)
  data.forEach((dataByte) => {
    const factor = dataByte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= qrGfMultiply(generator[i + 1], factor)
    }
  })
  return result
}

const appendQrBits = (out: number[], value: number, length: number) => {
  for (let i = length - 1; i >= 0; i -= 1) out.push((value >>> i) & 1)
}

const qrPayloadBytes = (payload: string) => Array.from(new TextEncoder().encode(payload))

const selectQrVersion = (bytesLength: number) => {
  for (let version = 1; version <= 4; version += 1) {
    const dataCodewords = QR_DATA_CODEWORDS_L[version]
    if (bytesLength <= Math.floor((dataCodewords * 8 - 12) / 8)) return version
  }
  return null
}

const makeQrDataCodewords = (payload: string, version: number) => {
  const bytes = qrPayloadBytes(payload)
  const dataCodewordCount = QR_DATA_CODEWORDS_L[version]
  const capacityBits = dataCodewordCount * 8
  const bits: number[] = []
  appendQrBits(bits, 0b0100, 4) // byte mode
  appendQrBits(bits, bytes.length, 8)
  bytes.forEach((byte) => appendQrBits(bits, byte, 8))
  if (bits.length > capacityBits) throw new Error('QR payload is too long for this QR version.')
  const terminator = Math.min(4, capacityBits - bits.length)
  appendQrBits(bits, 0, terminator)
  while (bits.length % 8 !== 0) bits.push(0)
  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j]
    codewords.push(value)
  }
  const padBytes = [0xec, 0x11]
  let padIndex = 0
  while (codewords.length < dataCodewordCount) {
    codewords.push(padBytes[padIndex % 2])
    padIndex += 1
  }
  return codewords
}

const qrAlignmentPatternCenters: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
}

const qrMaskAt = (mask: number, x: number, y: number) => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default: return false
  }
}

const qrFormatBits = (mask: number) => {
  const eclBits = 1 // Error correction L
  const data = (eclBits << 3) | mask
  let rem = data << 10
  for (let i = 14; i >= 10; i -= 1) {
    if (((rem >>> i) & 1) !== 0) rem ^= 0x537 << (i - 10)
  }
  return ((data << 10) | rem) ^ 0x5412
}

const makeQrMatrix = (payload: string): QrMatrix | null => {
  const trimmedPayload = payload.trim()
  if (!trimmedPayload) return null
  const bytes = qrPayloadBytes(trimmedPayload)
  const version = selectQrVersion(bytes.length)
  if (!version) return null
  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))

  const setModule = (x: number, y: number, dark: boolean, reserve = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    modules[y][x] = dark
    if (reserve) reserved[y][x] = true
  }

  const reserveModule = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    reserved[y][x] = true
  }

  const drawFinder = (left: number, top: number) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = left + dx
        const y = top + dy
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
        const dark = inPattern && (
          dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
        )
        setModule(x, y, dark)
      }
    }
  }

  const drawAlignment = (centerX: number, centerY: number) => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const max = Math.max(Math.abs(dx), Math.abs(dy))
        setModule(centerX + dx, centerY + dy, max === 2 || max === 0)
      }
    }
  }

  drawFinder(0, 0)
  drawFinder(size - 7, 0)
  drawFinder(0, size - 7)

  for (let i = 8; i <= size - 9; i += 1) {
    const dark = i % 2 === 0
    setModule(i, 6, dark)
    setModule(6, i, dark)
  }

  const centers = qrAlignmentPatternCenters[version]
  centers.forEach((centerY) => {
    centers.forEach((centerX) => {
      const overlapsFinder = (centerX === 6 && centerY === 6) || (centerX === 6 && centerY === size - 7) || (centerX === size - 7 && centerY === 6)
      if (!overlapsFinder) drawAlignment(centerX, centerY)
    })
  })

  for (let i = 0; i <= 8; i += 1) {
    reserveModule(8, i)
    reserveModule(i, 8)
  }
  for (let i = size - 8; i < size; i += 1) reserveModule(i, 8)
  for (let i = size - 7; i < size; i += 1) reserveModule(8, i)
  setModule(8, size - 8, true)

  const dataCodewords = makeQrDataCodewords(trimmedPayload, version)
  const ecc = qrReedSolomonRemainder(dataCodewords, QR_EC_CODEWORDS_L[version])
  const bits: number[] = []
  ;[...dataCodewords, ...ecc].forEach((codeword) => appendQrBits(bits, codeword, 8))

  let bitIndex = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical
      for (let j = 0; j < 2; j += 1) {
        const x = right - j
        if (reserved[y][x]) continue
        modules[y][x] = (bits[bitIndex] || 0) === 1
        bitIndex += 1
      }
    }
    upward = !upward
  }

  const mask = 0
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!reserved[y][x] && qrMaskAt(mask, x, y)) modules[y][x] = !modules[y][x]
    }
  }

  const format = qrFormatBits(mask)
  const formatBit = (i: number) => ((format >>> i) & 1) !== 0
  for (let i = 0; i <= 5; i += 1) setModule(8, i, formatBit(i))
  setModule(8, 7, formatBit(6))
  setModule(8, 8, formatBit(7))
  setModule(7, 8, formatBit(8))
  for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, formatBit(i))
  for (let i = 0; i < 8; i += 1) setModule(size - 1 - i, 8, formatBit(i))
  for (let i = 8; i < 15; i += 1) setModule(8, size - 15 + i, formatBit(i))
  setModule(8, size - 8, true)

  return { size, modules }
}

const qrModulesToPath = (matrix: QrMatrix, quietZone = QR_QUIET_ZONE) => matrix.modules
  .flatMap((row, y) => row.map((dark, x) => dark ? `M${x + quietZone} ${y + quietZone}h1v1h-1z` : ''))
  .filter(Boolean)
  .join('')

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const sanitizeDownloadPart = (value: string) => value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'tenant'

const buildGuestQrPayloadLink = (configuredLink: string, fallbackLink: string, tenantCode: string) => {
  const safeTenantCode = (tenantCode || '2TEN').trim() || '2TEN'
  const normalizedConfigured = (configuredLink || '').trim()
  const candidate = normalizedConfigured || fallbackLink
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://2ten.si'
  try {
    const url = new URL(candidate, baseOrigin)
    url.searchParams.set('tenantCode', safeTenantCode)
    return url.toString()
  } catch {
    return fallbackLink
  }
}

const parseGuestAppSettings = (raw: string | undefined): GuestAppSettingsForm => {
  if (!raw) return defaultGuestAppSettings()
  try {
    const parsed = JSON.parse(raw)
    return {
      guestAppEnabled: parsed?.guestAppEnabled !== false,
      publicDiscoverable: parsed?.publicDiscoverable === true,
      publicName: normalizePublicName(parsed?.publicName),
      publicDescription: String(parsed?.publicDescription || ''),
      publicCity: normalizePublicCity(parsed?.publicCity),
      tenantType: (['salon', 'gym', 'spa', 'therapy'].includes(parsed?.tenantType) ? parsed.tenantType : 'salon') as GuestAppSettingsForm['tenantType'],
      cardImageUrl: String(parsed?.cardImageUrl || ''),
      logoImageUrl: String(parsed?.logoImageUrl || ''),
      iconImageUrl: String(parsed?.iconImageUrl || ''),
      defaultLanguage: parsed?.defaultLanguage === 'en' ? 'en' : 'sl',
      employeeSelectionStep: parsed?.employeeSelectionStep === true,
      useEmployeeContact: parsed?.useEmployeeContact === true,
      acceptedPaymentMethodIds: normalizeGuestPaymentMethods(parsed?.acceptedPaymentMethodIds),
      paymentDefaultMethodId: isGuestPaymentMethodId(String(parsed?.paymentDefaultMethodId || '')) ? parsed.paymentDefaultMethodId : 'online_card',
      paymentCurrency: String(parsed?.paymentCurrency || 'EUR'),
      paymentTaxRate: String(parsed?.paymentTaxRate ?? '22'),
      paymentOnLocation: parsed?.paymentOnLocation !== false,
      paymentSendInvoiceEmail: parsed?.paymentSendInvoiceEmail !== false,
      paymentCustomerDescription: String(parsed?.paymentCustomerDescription || 'Sprejemamo gotovino, kartice in spletna plačila. Hvala, ker ste izbrali naše storitve!'),
      paymentProvider: String(parsed?.paymentProvider || 'stripe'),
      qrGuestUrl: String(parsed?.qrGuestUrl || ''),
      qrSize: String(parsed?.qrSize || '1024 x 1024'),
      qrColor: normalizeGuestQrColor(parsed?.qrColor || '#2563EB'),
      qrIncludeLogo: parsed?.qrIncludeLogo !== false,
      qrCaption: String(parsed?.qrCaption || 'Rezerviraj svoj termin'),
      qrExportFormat: parsed?.qrExportFormat === 'svg' || parsed?.qrExportFormat === 'pdf' ? parsed.qrExportFormat : 'png',
    }
  } catch {
    return defaultGuestAppSettings()
  }
}

const parseGuestBookingRules = (raw: string | undefined): GuestBookingRulesForm => {
  if (!raw) return defaultGuestBookingRules()
  try {
    const parsed = JSON.parse(raw)
    const normalizeAllowed = (value: any, fallback: string[]) => Array.isArray(value)
      ? value.map((row) => String(row || '').trim()).filter(Boolean)
      : fallback
    return {
      cancelUntilHours: String(parsed?.cancelUntilHours ?? 24),
      rescheduleUntilHours: String(parsed?.rescheduleUntilHours ?? 12),
      lateCancelConsumesCredit: parsed?.lateCancelConsumesCredit !== false,
      noShowConsumesCredit: parsed?.noShowConsumesCredit !== false,
      sameDayBankTransferAllowed: parsed?.sameDayBankTransferAllowed === true,
      bankTransferReservesSlot: parsed?.bankTransferReservesSlot === true,
      requireOnlinePayment: parsed?.requireOnlinePayment !== false,
      allowBankTransferFor: normalizeAllowed(parsed?.allowBankTransferFor, ['PACK', 'MEMBERSHIP', 'GIFT_CARD']),
      allowCardFor: normalizeAllowed(parsed?.allowCardFor, ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP', 'GIFT_CARD']),
      minBookingNotice: String(parsed?.minBookingNotice || '2 uri'),
      maxAdvanceDays: String(parsed?.maxAdvanceDays ?? '60'),
      cancellationEnabled: parsed?.cancellationEnabled !== false,
      freeCancelUntilHours: String(parsed?.freeCancelUntilHours ?? parsed?.cancelUntilHours ?? 24),
      autoConfirmReservation: parsed?.autoConfirmReservation !== false,
      bufferBeforeMinutes: String(parsed?.bufferBeforeMinutes ?? 15),
      bufferAfterMinutes: String(parsed?.bufferAfterMinutes ?? 10),
      paymentRequirement: parsed?.paymentRequirement === 'none' || parsed?.paymentRequirement === 'deposit' ? parsed.paymentRequirement : 'full',
      depositPercent: String(parsed?.depositPercent ?? 20),
      noShowPolicy: String(parsed?.noShowPolicy || 'charge_deposit'),
      refundPolicy: String(parsed?.refundPolicy || 'auto_by_cancellation_deadline'),
      policyText: String(parsed?.policyText || 'Rezervacijo lahko brezplačno odpoveste do navedenega roka pred terminom.\n\nPri kasnejši odpovedi ali no-show se zaračuna polog.\n\nPolog ni prenosljiv in se ne vrača.'),
    }
  } catch {
    return defaultGuestBookingRules()
  }
}

const normalizeBookingRulesForPaymentLocation = (rules: GuestBookingRulesForm, paymentOnLocation: boolean): GuestBookingRulesForm => {
  if (paymentOnLocation) {
    return { ...rules, paymentRequirement: 'none', requireOnlinePayment: false }
  }
  const nextRequirement = rules.paymentRequirement === 'none' ? 'full' : rules.paymentRequirement
  return { ...rules, paymentRequirement: nextRequirement, requireOnlinePayment: true }
}

const serializeGuestAppSettings = (value: GuestAppSettingsForm) => JSON.stringify({
  guestAppEnabled: value.guestAppEnabled,
  publicDiscoverable: value.publicDiscoverable,
  publicName: normalizePublicName(value.publicName).trim(),
  publicDescription: normalizePublicDescription(value.publicDescription),
  publicCity: normalizePublicCity(value.publicCity).trim(),
  tenantType: value.tenantType,
  cardImageUrl: value.cardImageUrl.trim(),
  logoImageUrl: value.logoImageUrl.trim(),
  iconImageUrl: value.iconImageUrl.trim(),
  defaultLanguage: value.defaultLanguage,
  employeeSelectionStep: value.employeeSelectionStep,
  useEmployeeContact: value.useEmployeeContact,
  acceptedPaymentMethodIds: normalizeGuestPaymentMethods(value.acceptedPaymentMethodIds),
  paymentDefaultMethodId: isGuestPaymentMethodId(String(value.paymentDefaultMethodId || '')) ? value.paymentDefaultMethodId : 'online_card',
  paymentCurrency: value.paymentCurrency.trim() || 'EUR',
  paymentTaxRate: value.paymentTaxRate.trim(),
  paymentOnLocation: value.paymentOnLocation,
  paymentSendInvoiceEmail: value.paymentSendInvoiceEmail,
  paymentCustomerDescription: value.paymentCustomerDescription.trim(),
  paymentProvider: value.paymentProvider.trim() || 'stripe',
  qrGuestUrl: value.qrGuestUrl.trim(),
  qrSize: value.qrSize.trim() || '1024 x 1024',
  qrColor: normalizeGuestQrColor(value.qrColor),
  qrIncludeLogo: value.qrIncludeLogo,
  qrCaption: value.qrCaption.trim(),
  qrExportFormat: value.qrExportFormat,
})

const serializeGuestBookingRules = (value: GuestBookingRulesForm) => JSON.stringify({
  cancelUntilHours: Math.max(0, Number(value.freeCancelUntilHours || value.cancelUntilHours || 0)),
  rescheduleUntilHours: Math.max(0, Number(value.rescheduleUntilHours || 0)),
  lateCancelConsumesCredit: value.lateCancelConsumesCredit,
  noShowConsumesCredit: value.noShowConsumesCredit,
  sameDayBankTransferAllowed: value.sameDayBankTransferAllowed,
  bankTransferReservesSlot: value.bankTransferReservesSlot,
  requireOnlinePayment: value.paymentRequirement !== 'none',
  allowBankTransferFor: value.allowBankTransferFor,
  allowCardFor: value.allowCardFor,
  minBookingNotice: value.minBookingNotice.trim(),
  maxAdvanceDays: value.maxAdvanceDays.trim(),
  cancellationEnabled: value.cancellationEnabled,
  freeCancelUntilHours: value.freeCancelUntilHours.trim(),
  autoConfirmReservation: value.autoConfirmReservation,
  bufferBeforeMinutes: value.bufferBeforeMinutes.trim(),
  bufferAfterMinutes: value.bufferAfterMinutes.trim(),
  paymentRequirement: value.paymentRequirement,
  depositPercent: value.depositPercent.trim(),
  noShowPolicy: value.noShowPolicy,
  refundPolicy: value.refundPolicy,
  policyText: value.policyText.trim(),
})

type ModulesDraft = {
  SPACES_ENABLED: string
  BOOKABLE_ENABLED: string
  AI_BOOKING_ENABLED: string
  PERSONAL_ENABLED: string
  TODOS_ENABLED: string
  MULTIPLE_SESSIONS_PER_SPACE_ENABLED: string
  MULTIPLE_CLIENTS_PER_SESSION_ENABLED: string
  GROUP_BOOKING_ENABLED: string
  guestAppEnabled: boolean
}

const buildModulesDraftFromCommitted = (s: Record<string, string>, g: GuestAppSettingsForm): ModulesDraft => ({
  SPACES_ENABLED: s.SPACES_ENABLED === 'true' ? 'true' : 'false',
  BOOKABLE_ENABLED: s.BOOKABLE_ENABLED === 'true' ? 'true' : 'false',
  AI_BOOKING_ENABLED: s.AI_BOOKING_ENABLED === 'false' ? 'false' : 'true',
  PERSONAL_ENABLED: s.PERSONAL_ENABLED === 'false' ? 'false' : 'true',
  TODOS_ENABLED: s.TODOS_ENABLED === 'false' ? 'false' : 'true',
  MULTIPLE_SESSIONS_PER_SPACE_ENABLED: s.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true' ? 'true' : 'false',
  MULTIPLE_CLIENTS_PER_SESSION_ENABLED: s.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true' ? 'true' : 'false',
  GROUP_BOOKING_ENABLED: s.GROUP_BOOKING_ENABLED === 'true' ? 'true' : 'false',
  guestAppEnabled: g.guestAppEnabled,
})

export function ConfigurationPage() {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
  const navigate = useNavigate()
  const query = useQuery()
  const { t, locale } = useLocale()
  const { showToast } = useToast()

  const [tab, setTab] = useState<Tab>('company')
  const [bookingSubtab, setBookingSubtab] = useState<BookingSubtab>('general')
  const [billingSubtab, setBillingSubtab] = useState<BillingSubtab>('paymentMethods')
  const [guestAppSubtab, setGuestAppSubtab] = useState<GuestAppSubtab>('general')
  const [startingPaypalOnboarding, setStartingPaypalOnboarding] = useState(false)
  const [startingStripeOnboarding, setStartingStripeOnboarding] = useState(false)
  const [refreshingStripeStatus, setRefreshingStripeStatus] = useState(false)
  const [stripeConnectStatus, setStripeConnectStatus] = useState<StripeConnectTenantStatus | null>(null)

  const [settings, setSettings] = useState<Record<string, string>>({})
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfileForm[]>([])
  const [selectedCompanyProfileId, setSelectedCompanyProfileId] = useState<string>('')
  const [companyProfilesInitialized, setCompanyProfilesInitialized] = useState(false)
  const [companyProfileEditMode, setCompanyProfileEditMode] = useState(false)
  const [companyProfileMenuOpenId, setCompanyProfileMenuOpenId] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [uploadingGuestAsset, setUploadingGuestAsset] = useState<GuestAppAssetField | null>(null)
  const [guestAppSettings, setGuestAppSettings] = useState<GuestAppSettingsForm>(defaultGuestAppSettings)
  const [guestBookingRules, setGuestBookingRules] = useState<GuestBookingRulesForm>(defaultGuestBookingRules)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [editingSpaceId, setEditingSpaceId] = useState<number | null>(null)
  const [spaceEditDraft, setSpaceEditDraft] = useState({ name: '', description: '' })
  const [newSpaceDrafts, setNewSpaceDrafts] = useState<Array<{ tempId: string; name: string; description: string }>>([])
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState<number | null>(null)
  const [personalTaskPresets, setPersonalTaskPresets] = useState<PersonalTaskPreset[]>([])
  const [showTaskPresetModal, setShowTaskPresetModal] = useState(false)
  const [editingTaskPresetId, setEditingTaskPresetId] = useState<string | null>(null)
  const [savingTaskPreset, setSavingTaskPreset] = useState(false)
  const [taskPresetForm, setTaskPresetForm] = useState<{ name: string; color: string }>({ name: '', color: DEFAULT_PERSONAL_TASK_COLOR })
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [inlineEditingPaymentMethodId, setInlineEditingPaymentMethodId] = useState<number | null>(null)
  const [inlinePaymentMethodForm, setInlinePaymentMethodForm] = useState<{
    name: string
    paymentType: PaymentType
    fiscalized: boolean
    stripeEnabled: boolean
    widgetEnabled: boolean
    guestDisplayOrder: number
  } | null>(null)
  const [registeringPremise, setRegisteringPremise] = useState(false)
  const [premiseRegisterResult, setPremiseRegisterResult] = useState<string>('')
  const [certificateMeta, setCertificateMeta] = useState<{ uploaded: boolean; fileName?: string; uploadedAt?: string; expiresAt?: string } | null>(null)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [uploadingCertificate, setUploadingCertificate] = useState(false)
  const [registeringPremiseId, setRegisteringPremiseId] = useState<string | null>(null)
  const [premisePickerOpen, setPremisePickerOpen] = useState(false)
  const [inboxGlobalCapabilities, setInboxGlobalCapabilities] = useState<InboxGlobalCapabilities>({
    whatsappEnabled: true,
    viberEnabled: true,
  })
  const [inboxCapabilitiesLoaded, setInboxCapabilitiesLoaded] = useState(false)
  const [modulesDraft, setModulesDraft] = useState<ModulesDraft | null>(null)
  const prevTabRef = useRef<Tab>(tab)
  const tabRef = useRef<Tab>(tab)
  tabRef.current = tab
  const [isCompactConfigViewport, setIsCompactConfigViewport] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 920px)').matches
      : false,
  )

  const selectedCompanyProfile = companyProfiles.find((profile) => profile.id === selectedCompanyProfileId) || companyProfiles[0]

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 920px)')
    const syncCompactViewport = () => setIsCompactConfigViewport(mq.matches)
    syncCompactViewport()
    mq.addEventListener('change', syncCompactViewport)
    return () => mq.removeEventListener('change', syncCompactViewport)
  }, [])

  useEffect(() => {
    if (companyProfilesInitialized || Object.keys(settings).length === 0) return
    const profiles = loadCompanyProfilesFromSettings(settings)
    const selectedId = settings.COMPANY_SELECTED_PROFILE_ID && profiles.some((profile) => profile.id === settings.COMPANY_SELECTED_PROFILE_ID)
      ? settings.COMPANY_SELECTED_PROFILE_ID
      : (profiles.find((profile) => profile.isDefault) || profiles[0]).id
    const selected = profiles.find((profile) => profile.id === selectedId) || profiles[0]
    setCompanyProfiles(profiles)
    setSelectedCompanyProfileId(selected.id)
    setSettings((prev) => companyProfileToSettings(prev, selected, profiles))
    setCompanyProfilesInitialized(true)
  }, [companyProfilesInitialized, settings])

  const updateSelectedCompanyProfile = (patch: Partial<CompanyProfileForm>) => {
    const selected = selectedCompanyProfile
    if (!selected) return
    const updatedSelected = sanitizeCompanyProfile({ ...selected, ...patch }, selected.id)
    const nextProfiles = companyProfiles.map((profile) => profile.id === selected.id ? updatedSelected : profile)
    setCompanyProfiles(nextProfiles)
    setSettings((prev) => companyProfileToSettings(prev, updatedSelected, nextProfiles))
  }

  const selectCompanyProfile = (profileId: string) => {
    const profile = companyProfiles.find((entry) => entry.id === profileId)
    if (!profile) return
    setSelectedCompanyProfileId(profile.id)
    setCompanyProfileEditMode(false)
    setCompanyProfileMenuOpenId(null)
    setSettings((prev) => companyProfileToSettings(prev, profile, companyProfiles))
  }

  const addCompanyProfile = () => {
    const nextProfile = sanitizeCompanyProfile({
      id: createCompanyProfileId(),
      name: `Profil podjetja ${companyProfiles.length + 1}`,
      bankQrPurposeCode: 'OTHR',
      bankQrPurposeText: 'PLACILO FOLIA',
      isDefault: companyProfiles.length === 0,
    })
    const nextProfiles = [...companyProfiles, nextProfile]
    setCompanyProfiles(nextProfiles)
    setSelectedCompanyProfileId(nextProfile.id)
    setCompanyProfileMenuOpenId(null)
    setSettings((prev) => companyProfileToSettings(prev, nextProfile, nextProfiles))
  }

  const setDefaultCompanyProfile = (profileId: string) => {
    const nextProfiles = companyProfiles.map((profile) => ({ ...profile, isDefault: profile.id === profileId }))
    const selected = nextProfiles.find((profile) => profile.id === profileId) || nextProfiles[0]
    if (!selected) return
    setCompanyProfiles(nextProfiles)
    setSelectedCompanyProfileId(selected.id)
    setCompanyProfileMenuOpenId(null)
    setSettings((prev) => companyProfileToSettings(prev, selected, nextProfiles))
  }

  const deleteCompanyProfile = (profileId: string) => {
    const target = companyProfiles.find((profile) => profile.id === profileId)
    if (!target) return
    if (companyProfiles.length <= 1) {
      window.alert('Zadnjega profila ni mogoče izbrisati.')
      return
    }
    if (target.isDefault) {
      window.alert('Privzetega profila ni mogoče izbrisati.')
      return
    }
    if (!window.confirm(`Izbrišem profil "${target.name || 'Profil podjetja'}"?`)) return
    const nextProfiles = companyProfiles.filter((profile) => profile.id !== profileId)
    const nextSelected = nextProfiles.find((profile) => profile.id === selectedCompanyProfileId) || nextProfiles[0]
    if (!nextSelected) return
    setCompanyProfiles(nextProfiles)
    setSelectedCompanyProfileId(nextSelected.id)
    setCompanyProfileEditMode(false)
    setCompanyProfileMenuOpenId(null)
    setSettings((prev) => companyProfileToSettings(prev, nextSelected, nextProfiles))
  }

  useEffect(() => {
    if (!companyProfileMenuOpenId) return
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      if (target.closest('.company-profile-menu')) return
      setCompanyProfileMenuOpenId(null)
    }
    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setCompanyProfileMenuOpenId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [companyProfileMenuOpenId])

  const guestAppEnabledCommitted = useMemo(
    () => parseGuestAppSettings(settings[GUEST_APP_SETTINGS_KEY]).guestAppEnabled,
    [settings[GUEST_APP_SETTINGS_KEY]],
  )

  const isMessagingTabEnabled = (tabId: Tab) => {
    if (tabId === 'whatsapp') return inboxGlobalCapabilities.whatsappEnabled
    if (tabId === 'viber') return inboxGlobalCapabilities.viberEnabled
    if (tabId === 'guestApp') return guestAppEnabledCommitted
    return true
  }

  const firstAvailableConfigTab = (): Tab => {
    if (isMessagingTabEnabled('company')) return 'company'
    return 'security'
  }

  useEffect(() => {
    if (!isAdmin) return
    const q = query.get('tab')
    if (q === 'sessionTypes') {
      navigate('/session-types', { replace: true })
      return
    }
    if (q === 'consultants') {
      navigate('/consultants', { replace: true })
      return
    }
    if (q === 'services') {
      navigate('/session-types?subtab=transaction-services', { replace: true })
      return
    }
    if (isConfigTab(q)) {
      if (isMessagingTabEnabled(q)) {
        setTab(q)
      } else {
        const fallback = firstAvailableConfigTab()
        setTab(fallback)
        navigate(`/configuration?tab=${fallback}`, { replace: true })
      }
    }
    const subtabQuery = query.get('subtab')
    if (
      subtabQuery === 'settings' ||
      subtabQuery === 'paymentMethods' ||
      subtabQuery === 'paypal' ||
      subtabQuery === 'fiscal' ||
      subtabQuery === 'invoiceDelivery' ||
      subtabQuery === 'folioLayout'
    ) {
      setBillingSubtab(subtabQuery)
    }
    if (q === 'guestApp' && (subtabQuery === 'general' || subtabQuery === 'bookingRules' || subtabQuery === 'paymentMethods' || subtabQuery === 'qrCode')) {
      setGuestAppSubtab(subtabQuery)
    }
  }, [query, navigate, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    void (async () => {
      try {
        const { data } = await api.get<InboxGlobalCapabilities>('/inbox/global-capabilities')
        if (cancelled || !data) return
        setInboxGlobalCapabilities({
          whatsappEnabled: data.whatsappEnabled !== false,
          viberEnabled: data.viberEnabled !== false,
        })
      } catch {
        if (!cancelled) {
          setInboxGlobalCapabilities({ whatsappEnabled: true, viberEnabled: true })
        }
      } finally {
        if (!cancelled) setInboxCapabilitiesLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  useEffect(() => {
    if (!inboxCapabilitiesLoaded) return
    if (!isMessagingTabEnabled(tab)) {
      const fallback = firstAvailableConfigTab()
      setTab(fallback)
      navigate(`/configuration?tab=${fallback}`, { replace: true })
    }
  }, [tab, inboxCapabilitiesLoaded, inboxGlobalCapabilities.whatsappEnabled, inboxGlobalCapabilities.viberEnabled, guestAppEnabledCommitted, navigate])

  useEffect(() => {
    const prev = prevTabRef.current
    if (tab === 'modules' && prev !== 'modules') {
      setModulesDraft(buildModulesDraftFromCommitted(settings, guestAppSettings))
    }
    if (prev === 'modules' && tab !== 'modules') {
      setModulesDraft(null)
    }
    prevTabRef.current = tab
  }, [tab, settings, guestAppSettings])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)')
    const onNarrow = () => {
      if (mq.matches) setBillingSubtab((cur) => (cur === 'folioLayout' ? 'paymentMethods' : cur))
    }
    onNarrow()
    mq.addEventListener('change', onNarrow)
    return () => mq.removeEventListener('change', onNarrow)
  }, [])

  const setTabAndUrl = (next: Tab) => {
    if (!isMessagingTabEnabled(next)) {
      const fallback = firstAvailableConfigTab()
      setTab(fallback)
      navigate(`/configuration?tab=${fallback}`)
      return
    }
    setTab(next)
    navigate(`/configuration?tab=${next}`)
  }

  const load = async () => {
    const [settingsRes, spacesRes, paymentMethodsRes, certificateMetaRes, paypalConfigRes, stripeConnectRes] = await Promise.all([
      api.get('/settings'),
      api.get('/spaces').catch(() => ({ data: [] })),
      api.get('/billing/payment-methods').catch(() => ({ data: [] })),
      api.get('/fiscal/certificate/meta').catch(() => ({ data: { uploaded: false } })),
      api.get('/paypal/onboarding/config').catch(() => ({ data: null })),
      api.get('/stripe/connect/config').catch(() => ({ data: null })),
    ])
    const paypalData = paypalConfigRes.data || {}
    const settingsData = {
      ...(settingsRes.data || {}),
      ...(paypalData.merchantId ? { PAYPAL_MERCHANT_ID: paypalData.merchantId } : {}),
      ...(paypalData.trackingId ? { PAYPAL_TRACKING_ID: paypalData.trackingId } : {}),
      ...(paypalData.status ? { PAYPAL_ONBOARDING_STATUS: paypalData.status } : {}),
      PAYPAL_CREDENTIALS_CONFIGURED: paypalData.credentialsConfigured ? 'true' : 'false',
    }
    const fallback = getWorkingHoursFallback()
    const nextSettings = { ...settingsData, ...((!settingsData.WORKING_HOURS_START && !settingsData.WORKING_HOURS_END) ? fallback : {}) }
    const parsedGuestApp = parseGuestAppSettings(settingsData[GUEST_APP_SETTINGS_KEY])
    const parsedGuestBookingRules = parseGuestBookingRules(settingsData[GUEST_BOOKING_RULES_KEY])
    const nextGuestApp = {
      ...parsedGuestApp,
      paymentOnLocation: parsedGuestBookingRules.paymentRequirement === 'none',
    }
    const nextGuestBookingRules = normalizeBookingRulesForPaymentLocation(parsedGuestBookingRules, nextGuestApp.paymentOnLocation)
    setSettings(nextSettings)
    setGuestAppSettings(nextGuestApp)
    if (tabRef.current === 'modules') {
      setModulesDraft(buildModulesDraftFromCommitted(nextSettings, nextGuestApp))
    }
    setGuestBookingRules(nextGuestBookingRules)
    setPersonalTaskPresets(parsePersonalTaskPresets(settingsData[PERSONAL_TASK_PRESETS_KEY]))
    setSpaces(spacesRes.data || [])
    setPaymentMethods((paymentMethodsRes.data || [])
      .map((p: PaymentMethod) => normalizePaymentMethod(p)!)
      .filter((method: PaymentMethod) => method.paymentType !== 'ADVANCE'))
    setCertificateMeta(certificateMetaRes.data || { uploaded: false })
    setStripeConnectStatus(stripeConnectRes.data || null)
  }

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    const merchantId = query.get('merchantIdInPayPal') || query.get('merchantId') || query.get('merchant_id')
    const trackingId = query.get('tracking_id') || query.get('trackingId')
    if (!merchantId && !trackingId) return

    let cancelled = false
    ;(async () => {
      try {
        await api.post('/paypal/onboarding/complete', { merchantId, trackingId })
        if (!cancelled) {
          await load()
          setTab('billing')
          setBillingSubtab('paypal')
          showToast('success', merchantId ? 'PayPal seller connected.' : 'PayPal onboarding returned. Please review the merchant ID below and save if needed.')
          navigate('/configuration?tab=billing&subtab=paypal', { replace: true })
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast('error', err?.response?.data?.message || 'Failed to save PayPal onboarding result.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAdmin, query, navigate, showToast])

  useEffect(() => {
    if (!isAdmin) return
    const stripeMode = query.get('stripeMode')
    if (!stripeMode) return

    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.post(`/stripe/connect/refresh?mode=${encodeURIComponent(stripeMode)}`)
        if (!cancelled) {
          setStripeConnectStatus(data || null)
          setTab('guestApp')
          setGuestAppSubtab('paymentMethods')
          showToast('success', 'Stripe onboarding returned. Status refreshed.')
          navigate('/configuration?tab=guestApp&subtab=paymentMethods', { replace: true })
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast('error', err?.response?.data?.message || 'Failed to refresh Stripe onboarding status.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAdmin, query, navigate, showToast])

  useEffect(() => {
    const connected = query.get('google_calendar_connected')
    const error = query.get('google_calendar_error')
    if (!connected && !error) return
    setTab('googleCalendar')
    if (connected) showToast('success', 'Google Calendar connected. Full sync was queued.')
    if (error) showToast('error', error)
    navigate('/configuration?tab=googleCalendar', { replace: true })
  }, [query, navigate, showToast])

  const spacesModuleEnabled = settings.SPACES_ENABLED === 'true'

  const modulesDraftDisplay = useMemo(() => {
    if (tab !== 'modules') return null
    return modulesDraft ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
  }, [tab, modulesDraft, settings, guestAppSettings])

  const configNavItems = useMemo((): ConfigNavItem[] => {
    const items: ConfigNavItem[] = [
      { id: 'company', icon: 'company' },
      { id: 'booking', icon: 'booking' },
      { id: 'billing', icon: 'billing' },
      { id: 'guestApp', icon: 'guestApp' },
      { id: 'notifications', icon: 'notifications' },
      { id: 'googleCalendar', icon: 'googleCalendar' },
      { id: 'whatsapp', icon: 'whatsapp' },
      { id: 'viber', icon: 'viber' },
      { id: 'modules', icon: 'modules' },
      { id: 'security', icon: 'security' },
    ]
    return items.filter((entry) => isMessagingTabEnabled(entry.id))
  }, [inboxGlobalCapabilities.whatsappEnabled, inboxGlobalCapabilities.viberEnabled, guestAppEnabledCommitted])

  useEffect(() => {
    const order: BookingSubtab[] = ['general']
    if (spacesModuleEnabled) order.push('spaces')
    if (!order.includes(bookingSubtab)) {
      setBookingSubtab(order[0]!)
    }
  }, [spacesModuleEnabled, bookingSubtab])

  useEffect(() => {
    setOpenSpaceMenuId(null)
  }, [bookingSubtab])

  useEffect(() => {
    if (openSpaceMenuId == null) return
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.config-entity-menu-wrap')) return
      setOpenSpaceMenuId(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [openSpaceMenuId])

  const saveSettings = async (opts?: { applyModulesDraft?: boolean }) => {
    if (!isAdmin) return
    setSavingSettings(true)
    try {
      const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
      const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
      let effectiveSettings = settings
      let effectiveGuestApp = guestAppSettings
      if (opts?.applyModulesDraft && modulesDraft) {
        effectiveSettings = {
          ...settings,
          SPACES_ENABLED: modulesDraft.SPACES_ENABLED,
          BOOKABLE_ENABLED: modulesDraft.BOOKABLE_ENABLED,
          AI_BOOKING_ENABLED: modulesDraft.AI_BOOKING_ENABLED,
          PERSONAL_ENABLED: modulesDraft.PERSONAL_ENABLED,
          TODOS_ENABLED: modulesDraft.TODOS_ENABLED,
          MULTIPLE_SESSIONS_PER_SPACE_ENABLED: modulesDraft.MULTIPLE_SESSIONS_PER_SPACE_ENABLED,
          MULTIPLE_CLIENTS_PER_SESSION_ENABLED: modulesDraft.MULTIPLE_CLIENTS_PER_SESSION_ENABLED,
          GROUP_BOOKING_ENABLED: modulesDraft.GROUP_BOOKING_ENABLED,
        }
        effectiveGuestApp = { ...guestAppSettings, guestAppEnabled: modulesDraft.guestAppEnabled }
      }
      const payload = {
        ...effectiveSettings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(personalTaskPresets),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(effectiveGuestApp),
        [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(guestBookingRules),
      }
      const { data } = await api.put('/settings', payload)
      setWorkingHoursFallback(normalizedStart, normalizedEnd)
      const responseHasPresets = Object.prototype.hasOwnProperty.call(data || {}, PERSONAL_TASK_PRESETS_KEY)
      const persistedPresetsRaw = responseHasPresets ? data?.[PERSONAL_TASK_PRESETS_KEY] : payload[PERSONAL_TASK_PRESETS_KEY]
      const merged = {
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: String(persistedPresetsRaw || ''),
      }
      setSettings(merged)
      setGuestAppSettings(parseGuestAppSettings(merged[GUEST_APP_SETTINGS_KEY]))
      setPersonalTaskPresets(parsePersonalTaskPresets(String(persistedPresetsRaw || '')))
      if (opts?.applyModulesDraft && modulesDraft && tab === 'modules') {
        setModulesDraft(buildModulesDraftFromCommitted(merged, parseGuestAppSettings(merged[GUEST_APP_SETTINGS_KEY])))
      }
      window.dispatchEvent(new Event('settings-updated'))
      showToast('success', t('configConfigurationSaved'))
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save configuration.')
    } finally {
      setSavingSettings(false)
    }
  }

  const paypalStatusLabel = useMemo(() => {
    const status = (settings.PAYPAL_ONBOARDING_STATUS || '').trim()
    if (!status || status === 'NOT_CONNECTED') return 'Not connected'
    if (status === 'ONBOARDING_LINK_CREATED') return 'Onboarding link created'
    if (status === 'ONBOARDING_RETURNED') return 'Connected'
    return status.replace(/_/g, ' ')
  }, [settings.PAYPAL_ONBOARDING_STATUS])

  const startPaypalOnboarding = async () => {
    setStartingPaypalOnboarding(true)
    try {
      const returnUrl = `${window.location.origin}/configuration?tab=billing&subtab=paypal`
      const { data } = await api.post('/paypal/onboarding/start', { returnUrl })
      if (!data?.actionUrl) throw new Error('PayPal did not return an onboarding URL.')
      setSettings((prev) => ({
        ...prev,
        PAYPAL_TRACKING_ID: data.trackingId || prev.PAYPAL_TRACKING_ID || '',
        PAYPAL_ONBOARDING_STATUS: 'ONBOARDING_LINK_CREATED',
      }))
      window.open(data.actionUrl, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err?.message || 'Failed to start PayPal onboarding.')
    } finally {
      setStartingPaypalOnboarding(false)
    }
  }

  const savePaypalConfiguration = async () => {
    setSavingSettings(true)
    try {
      const { data } = await api.put('/paypal/onboarding/config', {
        merchantId: settings.PAYPAL_MERCHANT_ID || '',
        trackingId: settings.PAYPAL_TRACKING_ID || '',
      })
      setSettings((prev) => ({
        ...prev,
        PAYPAL_MERCHANT_ID: data?.merchantId || '',
        PAYPAL_TRACKING_ID: data?.trackingId || '',
        PAYPAL_ONBOARDING_STATUS: data?.status || prev.PAYPAL_ONBOARDING_STATUS || 'NOT_CONNECTED',
      }))
      showToast('success', 'PayPal configuration saved.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to save PayPal configuration.')
    } finally {
      setSavingSettings(false)
    }
  }

  const activeStripeAccount = useMemo(() => {
    if (!stripeConnectStatus) return null
    return stripeConnectStatus.activeMode === 'production' ? stripeConnectStatus.production : stripeConnectStatus.sandbox
  }, [stripeConnectStatus])

  const stripeStatusLabel = useMemo(() => {
    if (!stripeConnectStatus || !activeStripeAccount) return 'Not connected'
    if (!activeStripeAccount.connected) return 'Not connected'
    if (activeStripeAccount.chargesEnabled && activeStripeAccount.payoutsEnabled) return 'Payments and payouts enabled'
    if (activeStripeAccount.chargesEnabled) return 'Payments enabled · payouts pending'
    if (activeStripeAccount.detailsSubmitted) return 'Verification pending'
    if (activeStripeAccount.onboardingStatus === 'ONBOARDING_LINK_CREATED') return 'Onboarding started'
    return activeStripeAccount.onboardingStatus?.replace(/_/g, ' ') || 'Action required'
  }, [stripeConnectStatus, activeStripeAccount])

  const saveStripePreference = async (patch: Partial<{ mode: string; country: string; businessType: string }>) => {
    const nextMode = patch.mode ?? stripeConnectStatus?.activeMode ?? 'sandbox'
    const nextCountry = patch.country ?? stripeConnectStatus?.country ?? 'SI'
    const nextBusinessType = patch.businessType ?? stripeConnectStatus?.businessType ?? 'company'
    try {
      const { data } = await api.put('/stripe/connect/config', { mode: nextMode, country: nextCountry, businessType: nextBusinessType })
      setStripeConnectStatus(data || null)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to save Stripe Connect settings.')
    }
  }

  const startStripeOnboarding = async () => {
    const mode = stripeConnectStatus?.activeMode || 'sandbox'
    setStartingStripeOnboarding(true)
    try {
      const returnUrl = `${window.location.origin}/configuration?tab=guestApp&subtab=paymentMethods&stripeMode=${mode}`
      const { data } = await api.post('/stripe/connect/onboarding-link', {
        mode,
        country: stripeConnectStatus?.country || 'SI',
        businessType: stripeConnectStatus?.businessType || 'company',
        returnUrl,
        refreshUrl: returnUrl,
      })
      if (!data?.url) throw new Error('Stripe did not return an onboarding URL.')
      await load()
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err?.message || 'Failed to start Stripe onboarding.')
    } finally {
      setStartingStripeOnboarding(false)
    }
  }

  const refreshStripeConnectStatus = async () => {
    const mode = stripeConnectStatus?.activeMode || 'sandbox'
    setRefreshingStripeStatus(true)
    try {
      const { data } = await api.post(`/stripe/connect/refresh?mode=${encodeURIComponent(mode)}`)
      setStripeConnectStatus(data || null)
      showToast('success', 'Stripe status refreshed.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to refresh Stripe status.')
    } finally {
      setRefreshingStripeStatus(false)
    }
  }

  const saveGuestAppConfiguration = async () => {
    if (!isAdmin) return
    setSavingSettings(true)
    try {
      const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
      const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
      const effectiveGuestBookingRules = normalizeBookingRulesForPaymentLocation(guestBookingRules, guestAppSettings.paymentOnLocation)
      const payload = {
        ...settings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(personalTaskPresets),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(guestAppSettings),
        [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(effectiveGuestBookingRules),
      }
      const { data } = await api.put('/settings', payload)
      const persistedRules = parseGuestBookingRules(data?.[GUEST_BOOKING_RULES_KEY] ?? payload[GUEST_BOOKING_RULES_KEY])
      setGuestBookingRules(
        normalizeBookingRulesForPaymentLocation(persistedRules, guestAppSettings.paymentOnLocation),
      )
      setSettings({
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      })
      window.dispatchEvent(new Event('settings-updated'))
      await load()
      showToast('success', t('configConfigurationSaved'))
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save guest app configuration.')
    } finally {
      setSavingSettings(false)
    }
  }

  const uploadGuestAppAsset = async (field: GuestAppAssetField, file: File | null) => {
    if (!isAdmin || !file) return
    const assetTypeByField: Record<GuestAppAssetField, 'card' | 'logo' | 'icon'> = {
      cardImageUrl: 'card',
      logoImageUrl: 'logo',
      iconImageUrl: 'icon',
    }
    setUploadingGuestAsset(field)
    try {
      const body = new FormData()
      body.append('file', file)
      const { data } = await api.post(`/settings/guest-app/assets/${assetTypeByField[field]}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const settingField = String(data?.settingField || field) as GuestAppAssetField
      const publicUrl = String(data?.publicUrl || '')
      if (!publicUrl) {
        throw new Error('Upload did not return a public URL.')
      }
      setGuestAppSettings((prev) => ({ ...prev, [settingField]: publicUrl }))
      showToast('success', 'Guest app asset uploaded.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to upload guest app asset.')
    } finally {
      setUploadingGuestAsset(null)
    }
  }

  const saveTaskPresets = async (nextPresets: PersonalTaskPreset[]) => {
    const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
    const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
    const payload = {
      ...settings,
      WORKING_HOURS_START: normalizedStart,
      WORKING_HOURS_END: normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(nextPresets),
      [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(guestAppSettings),
      [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(guestBookingRules),
    }
    const { data } = await api.put('/settings', payload)
    const responseHasPresets = Object.prototype.hasOwnProperty.call(data || {}, PERSONAL_TASK_PRESETS_KEY)
    const persistedPresetsRaw = responseHasPresets ? data?.[PERSONAL_TASK_PRESETS_KEY] : payload[PERSONAL_TASK_PRESETS_KEY]
    setSettings({
      ...payload,
      ...data,
      WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
      WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: String(persistedPresetsRaw || ''),
    })
    const parsed = parsePersonalTaskPresets(String(persistedPresetsRaw || ''))
    setPersonalTaskPresets(parsed.length > 0 || nextPresets.length === 0 ? parsed : nextPresets)
    window.dispatchEvent(new Event('settings-updated'))
    showToast('success', t('configConfigurationSaved'))
  }

  const openNewTaskPresetModal = () => {
    setEditingTaskPresetId(null)
    setTaskPresetForm({ name: '', color: DEFAULT_PERSONAL_TASK_COLOR })
    setShowTaskPresetModal(true)
  }

  const openEditTaskPresetModal = (preset: PersonalTaskPreset) => {
    setEditingTaskPresetId(preset.id)
    setTaskPresetForm({ name: preset.name, color: normalizeHexColor(preset.color) })
    setShowTaskPresetModal(true)
  }

  const submitTaskPreset = async (e: FormEvent) => {
    e.preventDefault()
    const name = taskPresetForm.name.trim()
    if (!name) return
    const color = normalizeHexColor(taskPresetForm.color)
    const duplicate = personalTaskPresets.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingTaskPresetId)
    if (duplicate) {
      window.alert('A task preset with this name already exists.')
      return
    }
    const next = editingTaskPresetId
      ? personalTaskPresets.map((p) => p.id === editingTaskPresetId ? { ...p, name, color } : p)
      : [...personalTaskPresets, { id: `${Date.now()}-${Math.random()}`, name, color }]
    setSavingTaskPreset(true)
    try {
      await saveTaskPresets(next)
      setShowTaskPresetModal(false)
      setEditingTaskPresetId(null)
      setTaskPresetForm({ name: '', color: DEFAULT_PERSONAL_TASK_COLOR })
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save predefined personal task.')
    } finally {
      setSavingTaskPreset(false)
    }
  }

  const deleteTaskPreset = async (id: string) => {
    if (!window.confirm('Delete this predefined personal task?')) return
    const next = personalTaskPresets.filter((p) => p.id !== id)
    setSavingTaskPreset(true)
    try {
      await saveTaskPresets(next)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to delete predefined personal task.')
    } finally {
      setSavingTaskPreset(false)
    }
  }

  const saveEditedSpace = async (spaceId: number) => {
    if (!isAdmin) return
    const name = spaceEditDraft.name.trim()
    if (!name) return
    await api.put(`/spaces/${spaceId}`, { name, description: spaceEditDraft.description.trim() })
    setEditingSpaceId(null)
    setSpaceEditDraft({ name: '', description: '' })
    load()
  }

  const createSpaceFromDraft = async (tempId: string) => {
    if (!isAdmin) return
    const draft = newSpaceDrafts.find((item) => item.tempId === tempId)
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return
    await api.post('/spaces', { name, description: draft.description.trim() })
    setNewSpaceDrafts((prev) => prev.filter((item) => item.tempId !== tempId))
    load()
  }

  const removeSpace = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this space?')) return
    await api.delete(`/spaces/${id}`)
    load()
  }

  const startInlinePaymentMethodEdit = (method: PaymentMethod) => {
    setInlineEditingPaymentMethodId(method.id)
    setInlinePaymentMethodForm({
      name: method.name,
      paymentType: method.paymentType,
      fiscalized: method.fiscalized,
      stripeEnabled: method.stripeEnabled,
      widgetEnabled: method.widgetEnabled,
      guestDisplayOrder: method.guestDisplayOrder,
    })
  }

  const cancelInlinePaymentMethodEdit = () => {
    setInlineEditingPaymentMethodId(null)
    setInlinePaymentMethodForm(null)
  }

  const saveInlinePaymentMethodEdit = async (id: number) => {
    if (!isAdmin || !inlinePaymentMethodForm) return
    const payload = {
      name: inlinePaymentMethodForm.name.trim(),
      paymentType: inlinePaymentMethodForm.paymentType,
      fiscalized: inlinePaymentMethodForm.fiscalized,
      stripeEnabled: inlinePaymentMethodForm.stripeEnabled,
      widgetEnabled: inlinePaymentMethodForm.widgetEnabled,
      guestDisplayOrder: inlinePaymentMethodForm.guestDisplayOrder,
      allowedGuestProductTypes: [...ALL_GUEST_PRODUCT_TYPES],
    }
    if (!payload.name) return
    if (id === -1) {
      await api.post('/billing/payment-methods', payload)
    } else {
      await api.put(`/billing/payment-methods/${id}`, payload)
    }
    cancelInlinePaymentMethodEdit()
    load()
  }

  const registerBusinessPremise = async () => {
    if (!isAdmin || registeringPremise) return
    const premiseId = (settings.FISCAL_BUSINESS_PREMISE_ID || '').trim()
    if (!premiseId) {
      setPremiseRegisterResult(t('configFiscalPremiseRequired'))
      return
    }
    setRegisteringPremise(true)
    setRegisteringPremiseId(premiseId)
    setPremiseRegisterResult('')
    try {
      const { data } = await api.post('/fiscal/premises/register')
      if (data?.success) {
        const existing = parseRegisteredPremises(settings[REGISTERED_PREMISES_KEY])
        const next = existing.includes(premiseId) ? existing : [...existing, premiseId]
        const premisesJson = JSON.stringify(next)
        await api.put('/settings', { [REGISTERED_PREMISES_KEY]: premisesJson })
        setSettings((prev) => ({ ...prev, [REGISTERED_PREMISES_KEY]: premisesJson }))
        setPremiseRegisterResult(`${t('configFiscalRegisteredSuccess')} ${data.messageId || 'n/a'}`)
      } else {
        setPremiseRegisterResult(`${t('configFiscalRegistrationFailed')} ${data?.error || t('configFiscalUnknownError')}`)
      }
    } catch (e: any) {
      setPremiseRegisterResult(`${t('configFiscalRegistrationFailed')} ${e?.response?.data?.message || e?.message || t('configFiscalUnknownError')}`)
    } finally {
      setRegisteringPremise(false)
      setRegisteringPremiseId(null)
    }
  }

  const uploadCertificate = async () => {
    if (uploadingCertificate) return
    if (!certificateFile) {
      window.alert('Please choose a certificate file first (.p12 or .pfx).')
      return
    }
    setUploadingCertificate(true)
    try {
      const formData = new FormData()
      formData.append('file', certificateFile)
      const { data } = await api.post('/fiscal/certificate', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setCertificateMeta(data)
      setCertificateFile(null)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to upload certificate.')
    } finally {
      setUploadingCertificate(false)
    }
  }

  const removeCertificate = async () => {
    if (!window.confirm('Remove uploaded fiscal certificate?')) return
    await api.delete('/fiscal/certificate')
    setCertificateMeta({ uploaded: false })
  }

  const registeredPremises = parseRegisteredPremises(settings[REGISTERED_PREMISES_KEY])
  const selectedPremiseId = (settings.FISCAL_BUSINESS_PREMISE_ID || '').trim()
  const selectedPremiseConfirmed = selectedPremiseId.length > 0 && registeredPremises.includes(selectedPremiseId)
  const tenantQrPayload = String(me.tenantCode || '').trim()
  const guestQrDefaultLink = useMemo(() => {
    const tenant = tenantQrPayload || '2TEN'
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://2ten.si'
    return `${origin}/book/${tenant}`
  }, [tenantQrPayload])
  const guestQrInputLink = (guestAppSettings.qrGuestUrl || guestQrDefaultLink).trim()
  const guestQrLink = useMemo(
    () => buildGuestQrPayloadLink(guestQrInputLink, guestQrDefaultLink, tenantQrPayload),
    [guestQrDefaultLink, guestQrInputLink, tenantQrPayload],
  )
  const guestQrColor = normalizeGuestQrColor(guestAppSettings.qrColor)
  const guestQrMatrix = useMemo(() => makeQrMatrix(guestQrLink), [guestQrLink])
  const guestQrPath = useMemo(() => guestQrMatrix ? qrModulesToPath(guestQrMatrix) : '', [guestQrMatrix])
  const guestQrViewBoxSize = guestQrMatrix ? guestQrMatrix.size + QR_QUIET_ZONE * 2 : 0
  const guestQrTitle = locale === 'sl' ? 'QR koda za rezervacijo gosta' : 'Guest booking QR code'
  const guestQrSvgMarkup = useMemo(() => {
    if (!guestQrMatrix) return ''
    const viewBoxSize = guestQrMatrix.size + QR_QUIET_ZONE * 2
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" role="img" aria-label="${escapeHtml(guestQrTitle)}"><title>${escapeHtml(guestQrTitle)}</title><rect width="100%" height="100%" fill="#ffffff"/><path d="${guestQrPath}" fill="${guestQrColor}"/></svg>`
  }, [guestQrColor, guestQrMatrix, guestQrPath, guestQrTitle])

  const saveGuestQrSvg = () => {
    if (!guestQrSvgMarkup) return
    const link = document.createElement('a')
    link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guestQrSvgMarkup)}`
    link.download = `guest-app-${sanitizeDownloadPart(tenantQrPayload || 'tenant')}-qr.svg`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const saveGuestQrPng = () => {
    if (!guestQrSvgMarkup) return
    const desiredSize = Math.max(256, Number.parseInt(guestAppSettings.qrSize, 10) || 1024)
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guestQrSvgMarkup)}`
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = desiredSize
      canvas.height = desiredSize
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, desiredSize, desiredSize)
      ctx.drawImage(img, 0, 0, desiredSize, desiredSize)
      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = pngUrl
        link.download = `guest-app-${sanitizeDownloadPart(tenantQrPayload || 'tenant')}-qr.png`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0)
      }, 'image/png')
    }
    img.src = svgDataUrl
  }

  const saveGuestQrPdf = () => {
    if (!guestQrSvgMarkup) return
    const desiredSize = Math.max(256, Number.parseInt(guestAppSettings.qrSize, 10) || 1024)
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(guestQrSvgMarkup)}`
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = desiredSize
      canvas.height = desiredSize
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, desiredSize, desiredSize)
      ctx.drawImage(img, 0, 0, desiredSize, desiredSize)

      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92)
      const base64 = jpegDataUrl.split(',')[1] || ''
      const binary = atob(base64)
      const jpegBytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) jpegBytes[i] = binary.charCodeAt(i)

      const pageW = 595.28
      const pageH = 841.89
      const maxW = pageW - 80
      const maxH = pageH - 80
      const scale = Math.min(maxW / desiredSize, maxH / desiredSize)
      const drawW = desiredSize * scale
      const drawH = desiredSize * scale
      const offsetX = (pageW - drawW) / 2
      const offsetY = (pageH - drawH) / 2

      const enc = new TextEncoder()
      const objects: BlobPart[] = []
      const objectOffsets: number[] = []
      let cursor = 0
      const pushText = (text: string) => {
        const bytes = enc.encode(text)
        objects.push(bytes)
        cursor += bytes.length
      }
      const pushBytes = (bytes: Uint8Array) => {
        const chunk = new Uint8Array(bytes.byteLength)
        chunk.set(bytes)
        objects.push(chunk)
        cursor += bytes.length
      }

      const header = enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
      pushBytes(header)
      const markObj = () => objectOffsets.push(cursor)

      markObj()
      pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
      markObj()
      pushText('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n')
      markObj()
      pushText(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`)
      markObj()
      pushText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${desiredSize} /Height ${desiredSize} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
      pushBytes(jpegBytes)
      pushText('\nendstream\nendobj\n')
      const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ\n`
      const contentBytes = enc.encode(content)
      markObj()
      pushText(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
      pushBytes(contentBytes)
      pushText('endstream\nendobj\n')

      const xrefStart = cursor
      pushText(`xref\n0 ${objectOffsets.length + 1}\n0000000000 65535 f \n`)
      for (const off of objectOffsets) pushText(`${String(off).padStart(10, '0')} 00000 n \n`)
      pushText(`trailer\n<< /Size ${objectOffsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)

      const pdfBlob = new Blob(objects, { type: 'application/pdf' })
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `guest-app-${sanitizeDownloadPart(tenantQrPayload || 'tenant')}-qr.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 0)
    }
    img.src = svgDataUrl
  }

  const copyGuestQrLink = async () => {
    try {
      await navigator.clipboard.writeText(guestQrLink)
      showToast('success', locale === 'sl' ? 'Povezava je kopirana.' : 'Link copied.')
    } catch {
      window.prompt(locale === 'sl' ? 'Kopirajte povezavo:' : 'Copy this link:', guestQrLink)
    }
  }

  const toggleGuestPaymentMethod = (id: GuestPaymentMethodId) => {
    setGuestAppSettings((prev) => {
      const has = prev.acceptedPaymentMethodIds.includes(id)
      const acceptedPaymentMethodIds = has
        ? prev.acceptedPaymentMethodIds.filter((row) => row !== id)
        : [...prev.acceptedPaymentMethodIds, id]
      return { ...prev, acceptedPaymentMethodIds: acceptedPaymentMethodIds.length > 0 ? acceptedPaymentMethodIds : prev.acceptedPaymentMethodIds }
    })
  }

  const billingSubtabs: Array<{ id: BillingSubtab; label: string }> = [
    { id: 'settings', label: t('configBillingSettingsTab') },
    { id: 'paymentMethods', label: t('configBillingPaymentMethodsTab') },
    { id: 'paypal', label: 'PayPal' },
    { id: 'fiscal', label: t('configBillingFiscalTab') },
    { id: 'invoiceDelivery', label: t('configBillingInvoiceDeliveryTab') },
    { id: 'folioLayout', label: 'Folio layout' },
  ]

  const resetAndOpenPaymentMethodModal = () => {
    setInlineEditingPaymentMethodId(-1)
    setInlinePaymentMethodForm({
      name: '',
      paymentType: 'CASH',
      fiscalized: true,
      stripeEnabled: false,
      widgetEnabled: true,
      guestDisplayOrder: 0,
    })
  }

  const togglePaymentMethodFiscalized = async (method: PaymentMethod) => {
    if (!isAdmin) return
    const nextFiscalized = !method.fiscalized
    await api.put(`/billing/payment-methods/${method.id}`, {
      name: method.name,
      paymentType: method.paymentType,
      fiscalized: nextFiscalized,
      stripeEnabled: method.stripeEnabled,
      widgetEnabled: method.widgetEnabled,
      guestDisplayOrder: method.guestDisplayOrder ?? 0,
      allowedGuestProductTypes: [...ALL_GUEST_PRODUCT_TYPES],
    })
    load()
  }

  if (!isAdmin) {
    return <Navigate to={getDefaultAllowedRoute(me.packageType)} replace />
  }

  const tabQuery = query.get('tab')
  const showCompactConfigOverview = isCompactConfigViewport && !isConfigTab(tabQuery)
  const configDetailTitle = t(CONFIG_TAB_LABEL_KEY[tab])
  const configShellClassName = showCompactConfigOverview
    ? 'config-shell config-shell--overview'
    : isCompactConfigViewport
      ? 'config-shell config-shell--detail'
      : 'config-shell'

  return (
    <div className="stack gap-lg">
      <div className={configShellClassName}>
        {showCompactConfigOverview ? (
          <section className="config-overview-panel" aria-label={t('settingsGroup')}>
            <div className="config-overview-heading">
              <span className="config-overview-heading-icon">
                <ConfigSettingsIcon />
              </span>
              <span>{t('settingsGroup')}</span>
            </div>
            <div className="config-overview-grid">
              {configNavItems.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === 'company' ? 'config-overview-tile is-featured' : 'config-overview-tile'}
                  onClick={() => setTabAndUrl(entry.id)}
                >
                  <span className="config-overview-tile-icon">
                    <ConfigTabIcon kind={entry.icon} />
                  </span>
                  <span className="config-overview-tile-label">{t(CONFIG_TAB_LABEL_KEY[entry.id])}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            {isCompactConfigViewport ? (
              <div className="config-detail-bar">
                <button type="button" className="config-detail-back" onClick={() => navigate('/configuration')} aria-label={t('settingsGroup')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <span>{configDetailTitle}</span>
              </div>
            ) : (
              <aside className="config-nav">
                <div className="config-nav-title">{t('settingsGroup')}</div>
                {configNavItems.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={tab === entry.id ? 'config-nav-item active' : 'config-nav-item'}
                    onClick={() => setTabAndUrl(entry.id)}
                  >
                    <ConfigTabIcon kind={entry.icon} />
                    <span>{t(CONFIG_TAB_LABEL_KEY[entry.id])}</span>
                  </button>
                ))}
              </aside>
            )}
            <div className="config-content">
      {tab === 'company' ? (
        <div className="company-page-shell">
          <style>{`
            .company-page-shell {
              --company-blue: #0f62fe;
              --company-ink: #07173b;
              --company-muted: #64708b;
              --company-line: #dce3ef;
              --company-soft: #f8fbff;
              width: min(100%, 1540px);
              color: var(--company-ink);
            }
            .company-page-title {
              margin: 0 0 8px;
              font-size: clamp(30px, 3vw, 38px);
              line-height: 1.1;
              letter-spacing: -0.04em;
              font-weight: 800;
            }
            .company-page-subtitle {
              margin: 0 0 28px;
              color: var(--company-muted);
              font-size: 15px;
              line-height: 1.5;
            }
            .company-card {
              border: 1px solid rgba(203, 213, 225, 0.86);
              border-radius: 24px;
              background: rgba(255,255,255,0.96);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              padding: 28px 34px 32px;
              overflow: hidden;
            }
            .company-card-content {
              display: grid;
              grid-template-columns: 390px minmax(0, 1fr);
              gap: 28px;
              align-items: start;
            }
            .company-profiles-panel {
              padding-right: 20px;
              border-right: 1px solid #e5ebf4;
            }
            .company-panel-title-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              margin-bottom: 22px;
            }
            .company-panel-title-row h3,
            .company-form-section h3 {
              margin: 0;
              font-size: 20px;
              font-weight: 800;
              color: var(--company-ink);
              letter-spacing: -0.02em;
            }
            .company-profile-list {
              display: grid;
              gap: 14px;
            }
            .company-profile-card {
              appearance: none;
              border: 1px solid var(--company-line);
              background: #fff;
              border-radius: 16px;
              padding: 16px;
              display: grid;
              grid-template-columns: 46px minmax(0, 1fr) auto auto;
              align-items: center;
              gap: 14px;
              cursor: pointer;
              color: var(--company-ink);
              text-align: left;
              box-shadow: 0 8px 18px rgba(8, 23, 58, 0.035);
              transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
            }
            .company-profile-card:hover,
            .company-profile-card.active {
              border-color: rgba(15, 98, 254, 0.52);
              background: #f8fbff;
              box-shadow: 0 10px 24px rgba(15, 98, 254, 0.09);
            }
            .company-profile-icon {
              display: grid;
              place-items: center;
              width: 46px;
              height: 46px;
              border-radius: 12px;
              color: var(--company-blue);
              background: linear-gradient(180deg, #eef4ff 0%, #e7efff 100%);
            }
            .company-profile-name {
              display: block;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              font-size: 15px;
              font-weight: 800;
            }
            .company-default-pill {
              display: inline-flex;
              align-items: center;
              height: 26px;
              padding: 0 10px;
              border-radius: 999px;
              color: #0a8f49;
              background: #dcfce7;
              font-size: 12px;
              font-weight: 800;
            }
            .company-menu-dot {
              color: var(--company-blue);
              font-size: 22px;
              line-height: 1;
              font-weight: 800;
            }
            .company-profile-menu {
              position: relative;
            }
            .company-profile-menu-trigger {
              appearance: none;
              border: 0;
              background: transparent;
              color: var(--company-blue);
              font-size: 22px;
              line-height: 1;
              font-weight: 800;
              cursor: pointer;
              padding: 2px 4px;
              border-radius: 8px;
            }
            .company-profile-menu-trigger:hover {
              background: #eef4ff;
            }
            .company-profile-menu-popover {
              position: absolute;
              right: 0;
              top: calc(100% + 8px);
              min-width: 154px;
              padding: 6px;
              border: 1px solid #dbe4f0;
              border-radius: 10px;
              background: #fff;
              box-shadow: 0 12px 28px rgba(8, 23, 58, 0.12);
              z-index: 15;
            }
            .company-profile-menu-item {
              width: 100%;
              min-height: 34px;
              border: 0;
              border-radius: 8px;
              padding: 0 10px;
              text-align: left;
              background: transparent;
              color: #b42318;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
            }
            .company-profile-menu-item:hover {
              background: #fef3f2;
            }
            .company-primary-button,
            .company-secondary-button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              min-height: 40px;
              padding: 0 16px;
              border-radius: 10px;
              border: 1px solid transparent;
              font-weight: 800;
              cursor: pointer;
              transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
            }
            .company-add-profile-button {
              font-weight: 500;
            }
            .company-primary-button {
              color: #fff;
              background: linear-gradient(180deg, #1664ff 0%, #0f62fe 100%);
              box-shadow: 0 10px 22px rgba(15, 98, 254, 0.22);
            }
            .company-primary-button:hover,
            .company-secondary-button:hover { transform: translateY(-1px); }
            .company-secondary-button {
              color: var(--company-blue);
              background: #f8fbff;
              border-color: #d8e5fb;
            }
            .company-details-panel {
              min-width: 0;
              padding: 0 0 0 4px;
            }
            .company-details-toolbar {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 18px;
            }
            .company-form-sections {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, .92fr);
              gap: 30px;
            }
            .company-form-section {
              min-width: 0;
            }
            .company-form-section + .company-form-section {
              border-left: 1px solid #e5ebf4;
              padding-left: 30px;
            }
            .company-form-section h3 {
              margin-bottom: 18px;
            }
            .company-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 18px 22px;
            }
            .company-field {
              display: grid;
              gap: 8px;
              min-width: 0;
            }
            .company-field.span-2 {
              grid-column: 1 / -1;
            }
            .company-label {
              color: var(--company-ink);
              font-size: 13px;
              font-weight: 800;
            }
            .company-input {
              width: 100%;
              min-height: 44px;
              border: 1px solid var(--company-line);
              border-radius: 10px;
              padding: 0 14px;
              color: var(--company-ink);
              background: #fff;
              font: inherit;
              outline: none;
              box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.02);
              transition: border-color 160ms ease, box-shadow 160ms ease;
            }
            .company-input:focus {
              border-color: rgba(15, 98, 254, 0.62);
              box-shadow: 0 0 0 3px rgba(15, 98, 254, 0.12);
            }
            .company-save-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 18px;
              margin-top: 26px;
            }
            .company-default-control {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              color: var(--company-ink);
              font-weight: 400;
              cursor: pointer;
              user-select: none;
            }
            .company-static-value {
              min-height: 44px;
              display: flex;
              align-items: center;
              border: 1px solid transparent;
              border-radius: 10px;
              padding: 0 2px;
              color: var(--company-ink);
              font-size: 14px;
              line-height: 1.45;
              white-space: pre-wrap;
              word-break: break-word;
            }
            .company-default-control input {
              width: 18px;
              height: 18px;
              accent-color: var(--company-blue);
            }
            @media (max-width: 1100px) {
              .company-card-content,
              .company-form-sections { grid-template-columns: 1fr; }
              .company-profiles-panel { border-right: 0; padding-right: 0; border-bottom: 1px solid #e5ebf4; padding-bottom: 24px; }
              .company-form-section + .company-form-section { border-left: 0; padding-left: 0; border-top: 1px solid #e5ebf4; padding-top: 24px; }
            }
            @media (max-width: 720px) {
              .company-card { padding: 22px; }
              .company-form-grid { grid-template-columns: 1fr; }
              .company-save-row { align-items: stretch; flex-direction: column; }
              .company-primary-button { width: 100%; }
            }
          `}</style>
          <Card className="company-card">
            <div className="company-card-content">
              <aside className="company-profiles-panel">
                <div className="company-panel-title-row">
                  <h3>Profili podjetja</h3>
                  <button type="button" className="company-primary-button company-add-profile-button" onClick={addCompanyProfile}>
                    <span aria-hidden>＋</span>
                    Nov profil
                  </button>
                </div>
                <div className="company-profile-list">
                  {(companyProfiles.length > 0 ? companyProfiles : [companyProfileFromSettings(settings)]).map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={profile.id === selectedCompanyProfile?.id ? 'company-profile-card active' : 'company-profile-card'}
                      onClick={() => selectCompanyProfile(profile.id)}
                    >
                      <span className="company-profile-icon" aria-hidden>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 21h18" />
                          <path d="M5 21V7l7-4 7 4v14" />
                          <path d="M9 21v-6h6v6" />
                        </svg>
                      </span>
                      <span className="company-profile-name">{profile.name || 'Nov profil podjetja'}</span>
                      {profile.isDefault ? <span className="company-default-pill">Privzeto</span> : <span />}
                      <span className="company-profile-menu">
                        <button
                          type="button"
                          className="company-profile-menu-trigger"
                          aria-label={`Dejanja za profil ${profile.name || 'Profil podjetja'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setCompanyProfileMenuOpenId((prev) => (prev === profile.id ? null : profile.id))
                          }}
                        >
                          <span className="company-menu-dot" aria-hidden>⋮</span>
                        </button>
                        {companyProfileMenuOpenId === profile.id ? (
                          <div className="company-profile-menu-popover" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="company-profile-menu-item"
                              onClick={() => deleteCompanyProfile(profile.id)}
                            >
                              Izbriši profil
                            </button>
                          </div>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="company-details-panel">
                <div className="company-details-toolbar">
                  <button type="button" className="company-secondary-button" onClick={() => setCompanyProfileEditMode((prev) => !prev)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    {companyProfileEditMode ? 'Zapri urejanje' : 'Uredi profil'}
                  </button>
                </div>
                <div className="company-form-sections">
                  <section className="company-form-section">
                    <h3>Osnovni podatki</h3>
                    <div className="company-form-grid">
                      <label className="company-field">
                        <span className="company-label">Naziv podjetja</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.name || ''} onChange={(e) => updateSelectedCompanyProfile({ name: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.name || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">Naslov</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.address || ''} onChange={(e) => updateSelectedCompanyProfile({ address: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.address || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">Poštna številka</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.postalCode || ''} onChange={(e) => updateSelectedCompanyProfile({ postalCode: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.postalCode || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">Mesto</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.city || ''} onChange={(e) => updateSelectedCompanyProfile({ city: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.city || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">Davčna številka</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.vatId || ''} onChange={(e) => updateSelectedCompanyProfile({ vatId: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.vatId || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">Email</span>
                        {companyProfileEditMode
                          ? <input className="company-input" type="email" value={selectedCompanyProfile?.email || ''} onChange={(e) => updateSelectedCompanyProfile({ email: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.email || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">Telefon</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.telephone || ''} onChange={(e) => updateSelectedCompanyProfile({ telephone: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.telephone || ''}</div>}
                      </label>
                    </div>
                  </section>

                  <section className="company-form-section">
                    <h3>Podatki za plačila</h3>
                    <div className="company-form-grid">
                      <label className="company-field">
                        <span className="company-label">IBAN</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.iban || ''} onChange={(e) => updateSelectedCompanyProfile({ iban: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.iban || ''}</div>}
                      </label>
                      <label className="company-field">
                        <span className="company-label">BIC / SWIFT (neobvezno)</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.bic || ''} onChange={(e) => updateSelectedCompanyProfile({ bic: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.bic || ''}</div>}
                      </label>
                      <label className="company-field span-2">
                        <span className="company-label">Bank QR purpose code (neobvezno)</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.bankQrPurposeCode || 'OTHR'} onChange={(e) => updateSelectedCompanyProfile({ bankQrPurposeCode: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.bankQrPurposeCode || 'OTHR'}</div>}
                      </label>
                      <label className="company-field span-2">
                        <span className="company-label">Bank QR purpose text (neobvezno)</span>
                        {companyProfileEditMode
                          ? <input className="company-input" value={selectedCompanyProfile?.bankQrPurposeText || 'PLACILO FOLIA'} onChange={(e) => updateSelectedCompanyProfile({ bankQrPurposeText: e.target.value })} />
                          : <div className="company-static-value">{selectedCompanyProfile?.bankQrPurposeText || 'PLACILO FOLIA'}</div>}
                      </label>
                    </div>
                  </section>
                </div>
                <div className="company-save-row">
                  <label className="company-default-control">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedCompanyProfile?.isDefault)}
                      onChange={() => selectedCompanyProfile && setDefaultCompanyProfile(selectedCompanyProfile.id)}
                    />
                    <span>Privzeti profil</span>
                  </label>
                  <button type="button" className="company-primary-button" onClick={() => void saveSettings()} disabled={savingSettings}>
                    <GuestSaveIcon />
                    {savingSettings ? 'Shranjevanje…' : 'Shrani spremembe'}
                  </button>
                </div>
              </section>
            </div>
          </Card>
        </div>
      ) : tab === 'booking' ? (
        <div className="booking-modern-shell">
          <style>{`
            .booking-modern-shell {
              --booking-blue: #0f62fe;
              --booking-ink: #07173b;
              --booking-muted: #64708b;
              --booking-line: #dce3ef;
              --booking-soft: #f8fbff;
              width: min(100%, 1540px);
              color: var(--booking-ink);
            }
            .booking-modern-title {
              margin: 0 0 8px;
              font-size: clamp(30px, 3vw, 38px);
              line-height: 1.1;
              letter-spacing: -0.04em;
              font-weight: 850;
              color: var(--booking-ink);
            }
            .booking-modern-subtitle {
              margin: 0 0 26px;
              color: var(--booking-muted);
              font-size: 15px;
              line-height: 1.5;
            }
            .booking-tabs-card {
              margin: 0 0 18px;
            }
            .booking-tabs {
              display: flex;
              align-items: center;
              gap: 10px;
              margin: 0 0 10px;
              border-bottom: 1px solid #edf2f7;
            }
            .booking-tab {
              position: relative;
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              cursor: pointer;
              border-radius: 10px;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .booking-tab:hover {
              color: #0f172a;
              background: #f8fafc;
            }
            .booking-tab.is-active {
              color: var(--booking-blue);
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .booking-panel-card {
              max-width: 1320px;
              border: 1px solid rgba(203, 213, 225, 0.88);
              border-radius: 24px;
              background: rgba(255,255,255,0.96);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              padding: clamp(26px, 3vw, 38px);
              overflow: hidden;
            }
            .booking-panel-heading {
              margin-bottom: 28px;
            }
            .booking-panel-heading h3 {
              margin: 0 0 8px;
              color: var(--booking-ink);
              font-size: 24px;
              line-height: 1.2;
              letter-spacing: -0.03em;
              font-weight: 850;
            }
            .booking-panel-heading p {
              margin: 0;
              color: var(--booking-muted);
              font-size: 15px;
              line-height: 1.5;
            }
            .booking-general-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 28px 44px;
            }
            .booking-modern-field {
              display: grid;
              gap: 10px;
              min-width: 0;
            }
            .booking-modern-label-row {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              color: var(--booking-ink);
              font-size: 14px;
              font-weight: 850;
            }
            .booking-input-wrap {
              position: relative;
              display: flex;
              align-items: center;
            }
            .booking-modern-input,
            .booking-modern-select {
              width: 100%;
              min-height: 50px;
              border: 1px solid var(--booking-line);
              border-radius: 12px;
              background: #fff;
              color: var(--booking-ink);
              padding: 0 44px 0 16px;
              font: inherit;
              font-size: 15px;
              font-weight: 650;
              outline: none;
              box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.02);
              transition: border-color 160ms ease, box-shadow 160ms ease;
            }
            .booking-modern-input:focus,
            .booking-modern-select:focus {
              border-color: rgba(15, 98, 254, 0.62);
              box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
            }
            .booking-modern-input[type='time'] {
              position: relative;
            }
            .booking-modern-input[type='time']::-webkit-calendar-picker-indicator {
              position: absolute;
              right: 14px;
              margin: 0;
            }
            .booking-modern-select {
              appearance: none;
              background-image: linear-gradient(45deg, transparent 50%, #0b1c45 50%), linear-gradient(135deg, #0b1c45 50%, transparent 50%);
              background-position: calc(100% - 20px) 22px, calc(100% - 14px) 22px;
              background-size: 6px 6px, 6px 6px;
              background-repeat: no-repeat;
            }
            .booking-input-suffix,
            .booking-input-icon {
              position: absolute;
              right: 14px;
              color: #64748b;
              font-weight: 750;
              pointer-events: none;
            }
            .booking-field-hint {
              margin: -2px 0 0;
              color: var(--booking-muted);
              font-size: 13px;
              line-height: 1.45;
            }
            .booking-save-row {
              display: flex;
              justify-content: flex-end;
              margin-top: 34px;
            }
            .booking-primary-button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              min-height: 48px;
              min-width: 220px;
              border: 0;
              border-radius: 12px;
              color: #fff;
              background: linear-gradient(180deg, #1c78ff 0%, #0f62fe 100%);
              box-shadow: 0 12px 24px rgba(15, 98, 254, 0.25);
              font-size: 15px;
              font-weight: 850;
              cursor: pointer;
            }
            .booking-primary-button--compact {
              min-height: 34px;
              min-width: 0;
              padding: 0 12px;
              border-radius: 9px;
              font-size: 13px;
              font-weight: 500;
              gap: 6px;
            }
            .booking-primary-button:disabled { opacity: .72; cursor: progress; }
            .booking-content-panel {
              margin-top: 6px;
              border: 1px solid rgba(203, 213, 225, 0.86);
              border-radius: 22px;
              background: #fff;
              padding: 34px;
              box-shadow: 0 18px 50px rgba(15, 23, 42, 0.07);
            }
            .booking-spaces-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 18px;
              margin-bottom: 28px;
            }
            .booking-spaces-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(240px, 1fr));
              gap: 24px;
            }
            .booking-space-card {
              position: relative;
              min-height: 172px;
              border: 1px solid var(--booking-line);
              border-radius: 18px;
              background: #fff;
              padding: 28px 28px 24px;
              box-shadow: 0 12px 28px rgba(8, 23, 58, 0.055);
              overflow: visible;
              transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
            }
            .booking-space-card:hover {
              transform: translateY(-2px);
              border-color: rgba(15, 98, 254, 0.32);
              box-shadow: 0 18px 36px rgba(8, 23, 58, 0.09);
            }
            .booking-space-icon {
              display: grid;
              place-items: center;
              width: 58px;
              height: 58px;
              border-radius: 999px;
              color: var(--booking-blue);
              background: linear-gradient(180deg, #eef4ff 0%, #e7efff 100%);
              margin-bottom: 24px;
            }
            .booking-space-card h4 {
              margin: 0 0 7px;
              color: var(--booking-ink);
              font-size: 22px;
              line-height: 1.1;
              font-weight: 850;
              letter-spacing: -0.03em;
            }
            .booking-space-card p {
              margin: 0 0 16px;
              color: var(--booking-muted);
              font-size: 15px;
            }
            .booking-space-input,
            .booking-space-textarea {
              width: 100%;
              border: 1px solid #d5deee;
              border-radius: 10px;
              padding: 10px 12px;
              font: inherit;
              color: var(--booking-ink);
              background: #fff;
            }
            .booking-space-input {
              margin: 0 0 10px;
              font-size: 18px;
              font-weight: 750;
            }
            .booking-space-textarea {
              min-height: 64px;
              margin: 0 0 14px;
              resize: vertical;
              font-size: 14px;
            }
            .booking-space-inline-actions {
              display: flex;
              gap: 8px;
              margin-bottom: 12px;
            }
            .booking-space-inline-btn {
              min-height: 32px;
              border-radius: 8px;
              border: 1px solid #c8d6f3;
              background: #f8fbff;
              color: var(--booking-ink);
              padding: 0 10px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
            }
            .booking-space-inline-btn.primary {
              border-color: #0f62fe;
              background: #0f62fe;
              color: #fff;
            }
            .booking-status-pill {
              display: inline-flex;
              align-items: center;
              min-height: 28px;
              padding: 0 12px;
              border-radius: 999px;
              background: #dcfce7;
              color: #087443;
              font-size: 13px;
              font-weight: 850;
            }
            .booking-space-menu-wrap {
              position: absolute;
              top: 24px;
              right: 24px;
            }
            .booking-space-menu-trigger {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 32px;
              height: 32px;
              padding: 0;
              margin: 0;
              border: 0;
              border-radius: 9px;
              background: transparent;
              color: #0b1c45;
              cursor: pointer;
            }
            .booking-space-menu-trigger svg {
              display: block;
              flex-shrink: 0;
            }
            .booking-space-menu-trigger:hover { background: #eef4ff; color: var(--booking-blue); }
            .booking-space-menu-popover {
              position: absolute;
              right: 0;
              top: calc(100% + 8px);
              min-width: 132px;
              padding: 6px;
              border: 1px solid #dbe4f0;
              border-radius: 10px;
              background: #fff;
              box-shadow: 0 12px 28px rgba(8, 23, 58, 0.12);
              z-index: 20;
            }
            .booking-space-menu-popover button {
              width: 100%;
              min-height: 34px;
              border: 0;
              border-radius: 8px;
              padding: 0 10px;
              text-align: left;
              background: transparent;
              color: var(--booking-ink);
              font-size: 13px;
              font-weight: 750;
              cursor: pointer;
            }
            .booking-space-menu-popover button:hover { background: #f1f5ff; }
            .booking-space-menu-popover button.danger { color: #b42318; }
            .booking-space-menu-popover button.danger:hover { background: #fef3f2; }
            .booking-empty-spaces {
              padding: 52px 20px;
              border: 1px dashed #cbd5e1;
              border-radius: 18px;
              background: #f8fbff;
              text-align: center;
              color: var(--booking-muted);
              font-weight: 700;
            }
            @media (max-width: 1180px) {
              .booking-spaces-grid { grid-template-columns: repeat(2, minmax(220px, 1fr)); }
            }
            @media (max-width: 920px) {
              .booking-modern-shell {
                width: 100%;
              }
              .booking-panel-card {
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                padding: 0 clamp(18px, 4.8vw, 30px) 38px;
                overflow: visible;
              }
              .booking-tabs-card {
                width: 100%;
                min-width: 0;
                margin: 0 0 clamp(42px, 9vw, 58px);
                padding: 10px;
                border: 1px solid rgba(203, 213, 225, 0.92);
                border-radius: 24px;
                background: rgba(255, 255, 255, 0.98);
                box-shadow: 0 12px 28px rgba(15, 23, 42, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.95);
              }
              .booking-tabs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin: 0;
                overflow: visible;
                border-bottom: 0;
              }
              .booking-tab {
                min-height: 74px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 10px 12px;
                border-radius: 19px;
                color: #17223a;
                font-size: clamp(18px, 4.4vw, 23px);
                line-height: 1.12;
                font-weight: 850;
                text-align: center;
                white-space: normal;
              }
              .booking-tab:hover {
                background: #f7faff;
              }
              .booking-tab.is-active {
                color: var(--booking-blue);
                background: linear-gradient(180deg, #f0f6ff 0%, #e9f2ff 100%);
                box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12), 0 10px 24px rgba(37, 99, 235, 0.12);
              }
              .booking-tabs .booking-tab:only-child {
                grid-column: 1 / -1;
              }
              .booking-content-panel {
                margin-top: 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                padding: 0;
              }
              .booking-panel-heading {
                margin-bottom: clamp(30px, 6.8vw, 42px);
              }
              .booking-panel-heading h3 {
                margin: 0 0 20px;
                font-size: clamp(44px, 11.5vw, 64px);
                line-height: .98;
                letter-spacing: -0.06em;
              }
              .booking-panel-heading p {
                max-width: 100%;
                font-size: clamp(21px, 5.2vw, 31px);
                line-height: 1.45;
              }
              .booking-general-grid,
              .booking-spaces-grid {
                grid-template-columns: 1fr;
              }
              .booking-general-grid {
                gap: 22px;
              }
              .booking-modern-field {
                width: 100%;
              }
              .booking-modern-input,
              .booking-modern-select {
                min-height: 58px;
                border-radius: 14px;
                font-size: 17px;
              }
              .booking-save-row {
                margin-top: 30px;
              }
              .booking-spaces-header {
                flex-direction: column;
                align-items: stretch;
                gap: 30px;
                margin-bottom: 38px;
              }
              .booking-primary-button {
                width: 100%;
                min-height: 64px;
                border-radius: 12px;
                font-size: clamp(18px, 4.6vw, 24px);
                box-shadow: 0 16px 30px rgba(15, 98, 254, 0.26);
              }
              .booking-primary-button--compact {
                width: 100%;
                min-height: 64px;
                padding: 0 18px;
                font-size: clamp(18px, 4.5vw, 24px);
              }
              .booking-spaces-grid {
                gap: 28px;
              }
              .booking-space-card {
                width: 100%;
                min-height: 154px;
                display: grid;
                grid-template-columns: auto minmax(0, 1fr);
                grid-template-rows: auto auto;
                align-items: center;
                column-gap: 26px;
                row-gap: 8px;
                padding: 24px 66px 24px 24px;
                border-radius: 18px;
                box-shadow: 0 12px 28px rgba(8, 23, 58, 0.045);
              }
              .booking-space-icon {
                grid-column: 1;
                grid-row: 1 / 3;
                width: 82px;
                height: 82px;
                margin: 0;
              }
              .booking-space-card h4 {
                grid-column: 2;
                grid-row: 1;
                margin: 0 0 -2px;
                min-width: 0;
                font-size: clamp(30px, 7.2vw, 44px);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .booking-space-card p {
                grid-column: 2;
                grid-row: 2;
                margin: 0;
                min-width: 0;
                font-size: clamp(20px, 4.8vw, 29px);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .booking-status-pill {
                display: none;
              }
              .booking-space-menu-wrap {
                top: 22px;
                right: 18px;
              }
              .booking-space-menu-trigger {
                width: 40px;
                height: 40px;
                border-radius: 12px;
              }
              .booking-space-card .booking-space-input,
              .booking-space-card .booking-space-textarea,
              .booking-space-card .booking-space-inline-actions {
                grid-column: 2 / -1;
              }
            }
            @media (max-width: 460px) {
              .booking-panel-card {
                padding: 0 14px 34px;
              }
              .booking-tabs-card {
                margin-bottom: 38px;
                padding: 8px;
                border-radius: 22px;
              }
              .booking-tab {
                min-height: 62px;
                border-radius: 16px;
                font-size: 18px;
              }
              .booking-panel-heading {
                margin-bottom: 28px;
              }
              .booking-panel-heading h3 {
                margin-bottom: 18px;
                font-size: 42px;
              }
              .booking-panel-heading p {
                font-size: 23px;
              }
              .booking-spaces-header {
                gap: 28px;
                margin-bottom: 34px;
              }
              .booking-primary-button,
              .booking-primary-button--compact {
                min-height: 58px;
                font-size: 18px;
              }
              .booking-space-card {
                min-height: 132px;
                column-gap: 18px;
                padding: 20px 52px 20px 18px;
              }
              .booking-space-icon {
                width: 72px;
                height: 72px;
              }
              .booking-space-card h4 {
                font-size: 28px;
              }
              .booking-space-card p {
                font-size: 21px;
              }
              .booking-space-menu-wrap {
                top: 16px;
                right: 12px;
              }
            }
          `}</style>
          <section className="booking-panel-card">
            <div className="booking-tabs-card">
              <div className="booking-tabs" role="tablist" aria-label="Rezervacije">
                <button
                  type="button"
                  className={bookingSubtab === 'general' ? 'booking-tab is-active' : 'booking-tab'}
                  onClick={() => setBookingSubtab('general')}
                  role="tab"
                  aria-selected={bookingSubtab === 'general'}
                >
                  Osnovne nastavitve
                </button>
                {spacesModuleEnabled ? (
                  <button
                    type="button"
                    className={bookingSubtab === 'spaces' ? 'booking-tab is-active' : 'booking-tab'}
                    onClick={() => setBookingSubtab('spaces')}
                    role="tab"
                    aria-selected={bookingSubtab === 'spaces'}
                  >
                    Prostori
                  </button>
                ) : null}
              </div>
            </div>
          <div className="booking-content-panel">

          {bookingSubtab === 'general' ? (
            <div>
              <div className="booking-panel-heading">
                <p>Nastavite splošna pravila rezervacij, trajanje terminov in delovni čas.</p>
              </div>
              <div className="booking-general-grid">
                <label className="booking-modern-field">
                  <span className="booking-modern-label-row">Dolžina termina (minute)</span>
                  <span className="booking-input-wrap">
                    <input className="booking-modern-input" type="number" min="15" step="15" value={settings.SESSION_LENGTH_MINUTES || '60'} onChange={(e) => setSettings({ ...settings, SESSION_LENGTH_MINUTES: e.target.value })} />
                    <span className="booking-input-suffix">min</span>
                  </span>
                  <span className="booking-field-hint">Privzeto trajanje enega termina za rezervacijo.</span>
                </label>
                <label className="booking-modern-field">
                  <span className="booking-modern-label-row">Koledar od</span>
                  <span className="booking-input-wrap">
                    <ModernTimePicker
                      className="booking-modern-input"
                      value={toTimeInputValue(settings.WORKING_HOURS_START, '05:00')}
                      onChange={(nextValue) => setSettings({ ...settings, WORKING_HOURS_START: nextValue })}
                      ariaLabel="Koledar od"
                    />
                  </span>
                  <span className="booking-field-hint">Začetek delovnega časa, ko so možne rezervacije.</span>
                </label>
                <label className="booking-modern-field">
                  <span className="booking-modern-label-row">Koledar do</span>
                  <span className="booking-input-wrap">
                    <ModernTimePicker
                      className="booking-modern-input"
                      value={toTimeInputValue(settings.WORKING_HOURS_END, '23:00')}
                      onChange={(nextValue) => setSettings({ ...settings, WORKING_HOURS_END: nextValue })}
                      ariaLabel="Koledar do"
                    />
                  </span>
                  <span className="booking-field-hint">Konec delovnega časa, ko so možne rezervacije.</span>
                </label>
              </div>
              <div className="booking-save-row">
                <button type="button" className="booking-primary-button" onClick={() => void saveSettings()} disabled={savingSettings}>
                  <GuestSaveIcon />
                  {savingSettings ? 'Shranjevanje…' : 'Shrani konfiguracijo'}
                </button>
              </div>
            </div>
          ) : null}

          {bookingSubtab === 'spaces' && spacesModuleEnabled ? (
            <div>
              <div className="booking-spaces-header">
                <div className="booking-panel-heading" style={{ marginBottom: 0 }}>
                  <p>Upravljajte prostore, v katerih se izvajajo storitve ali aktivnosti.</p>
                </div>
                <button
                  type="button"
                  className="booking-primary-button booking-primary-button--compact"
                  onClick={() => {
                    const tempId = `new-space-${Date.now()}`
                    setNewSpaceDrafts((prev) => [{ tempId, name: '', description: '' }, ...prev])
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  Novi prostor
                </button>
              </div>
              {spaces.length === 0 && newSpaceDrafts.length === 0 ? (
                <div className="booking-empty-spaces">Ni prostorov. Kliknite »Novi prostor«, da ustvarite prvi prostor.</div>
              ) : (
                <div className="booking-spaces-grid">
                  {newSpaceDrafts.map((draft, index) => (
                    <article key={draft.tempId} className="booking-space-card">
                      <span className="booking-space-icon" aria-hidden>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M10 12h.01"/></svg>
                      </span>
                      <input
                        className="booking-space-input"
                        value={draft.name}
                        placeholder="Ime prostora"
                        onChange={(e) => setNewSpaceDrafts((prev) => prev.map((item) => item.tempId === draft.tempId ? { ...item, name: e.target.value } : item))}
                      />
                      <textarea
                        className="booking-space-textarea"
                        value={draft.description}
                        placeholder="Opis (neobvezno)"
                        onChange={(e) => setNewSpaceDrafts((prev) => prev.map((item) => item.tempId === draft.tempId ? { ...item, description: e.target.value } : item))}
                      />
                      <div className="booking-space-inline-actions">
                        <button type="button" className="booking-space-inline-btn primary" onClick={() => void createSpaceFromDraft(draft.tempId)}>
                          Shrani
                        </button>
                        <button type="button" className="booking-space-inline-btn" onClick={() => setNewSpaceDrafts((prev) => prev.filter((item) => item.tempId !== draft.tempId))}>
                          Prekliči
                        </button>
                      </div>
                      <span className="booking-status-pill">Novo</span>
                    </article>
                  ))}
                  {spaces.map((space) => (
                    <article key={space.id} className="booking-space-card">
                      <span className="booking-space-icon" aria-hidden>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M10 12h.01"/></svg>
                      </span>
                      {editingSpaceId === space.id ? (
                        <>
                          <input
                            className="booking-space-input"
                            value={spaceEditDraft.name}
                            placeholder="Ime prostora"
                            onChange={(e) => setSpaceEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                          />
                          <textarea
                            className="booking-space-textarea"
                            value={spaceEditDraft.description}
                            placeholder="Opis (neobvezno)"
                            onChange={(e) => setSpaceEditDraft((prev) => ({ ...prev, description: e.target.value }))}
                          />
                          <div className="booking-space-inline-actions">
                            <button type="button" className="booking-space-inline-btn primary" onClick={() => void saveEditedSpace(space.id)}>
                              Shrani
                            </button>
                            <button type="button" className="booking-space-inline-btn" onClick={() => { setEditingSpaceId(null); setSpaceEditDraft({ name: '', description: '' }) }}>
                              Prekliči
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h4>{space.name}</h4>
                          <p>{space.description || 'Prostor'}</p>
                        </>
                      )}
                      <span className="booking-status-pill">Aktivno</span>
                      <div className="booking-space-menu-wrap">
                        <button
                          type="button"
                          className="booking-space-menu-trigger"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenSpaceMenuId((prev) => (prev === space.id ? null : space.id))
                          }}
                          aria-label="Dejanja prostora"
                          aria-expanded={openSpaceMenuId === space.id}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                            <circle cx="8" cy="3.5" r="1.35" />
                            <circle cx="8" cy="8" r="1.35" />
                            <circle cx="8" cy="12.5" r="1.35" />
                          </svg>
                        </button>
                        {openSpaceMenuId === space.id ? (
                          <div className="booking-space-menu-popover" role="dialog" aria-label="Dejanja prostora">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenSpaceMenuId(null)
                                setEditingSpaceId(space.id)
                                setSpaceEditDraft({ name: space.name, description: space.description || '' })
                              }}
                            >
                              Uredi
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenSpaceMenuId(null)
                                void removeSpace(space.id)
                              }}
                            >
                              Izbriši
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          </div>
          </section>
        </div>
      ) : tab === 'billing' ? (
        <div className="billing-modern-shell">
          <style>{`
            .billing-modern-shell {
              --billing-blue: #2563eb;
              --billing-blue-dark: #1d4ed8;
              --billing-ink: #0f1b3d;
              --billing-muted: #64748b;
              --billing-line: #dbe4f0;
              --billing-soft: #f8fafc;
              --billing-soft-blue: #eff6ff;
              --billing-green: #16a34a;
              --billing-red: #ef4444;
              width: min(100%, 1600px);
              color: var(--billing-ink);
            }
            .billing-modern-shell button { font-family: inherit; }
            .billing-tabs-card {
              border-bottom: 1px solid rgba(226, 232, 240, 0.95);
              padding-bottom: 10px;
              margin-bottom: 14px;
            }
            .billing-subtabs {
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
            }
            .billing-subtab {
              appearance: none;
              border: 1px solid transparent;
              background: transparent;
              color: #475569;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              border-radius: 10px;
              cursor: pointer;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease, border-color .18s ease;
            }
            .billing-subtab:hover {
              color: #0f172a;
              background: #f8fafc;
            }
            .billing-subtab.active {
              color: #2563eb;
              background: #eaf2ff;
              border-color: rgba(37, 99, 235, 0.16);
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .billing-main-panel { padding: 22px; }
            .billing-page-head {
              margin: 0 0 22px;
            }
            .billing-page-head h2 {
              margin: 0 0 8px;
              font-size: clamp(28px, 2.75vw, 38px);
              line-height: 1.05;
              letter-spacing: -0.045em;
              font-weight: 900;
              color: var(--billing-ink);
            }
            .billing-page-head p {
              margin: 0;
              color: var(--billing-muted);
              font-size: 16px;
              line-height: 1.5;
              max-width: 820px;
            }
            .billing-card {
              border: 1px solid rgba(203, 213, 225, 0.82);
              border-radius: 24px;
              background: rgba(255,255,255,0.98);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              overflow: hidden;
            }
            .billing-card-pad { padding: 28px 34px 30px; }
            .billing-section-title {
              margin: 0;
              font-size: 18px;
              font-weight: 900;
              letter-spacing: -0.025em;
              color: var(--billing-ink);
            }
            .billing-section-kicker {
              display: block;
              color: var(--billing-muted);
              font-size: 13px;
              line-height: 1.4;
              margin-top: 4px;
            }
            .billing-section-heading-row {
              display: flex;
              align-items: center;
              gap: 16px;
              margin-bottom: 34px;
            }
            .billing-section-icon {
              width: 54px;
              height: 54px;
              border-radius: 18px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: var(--billing-blue);
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1);
              flex: 0 0 auto;
            }
            .billing-settings-card {
              padding: 30px 32px;
            }
            .billing-settings-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 0;
              align-items: start;
            }
            .billing-settings-field {
              display: grid;
              gap: 10px;
              padding-right: 34px;
            }
            .billing-settings-field + .billing-settings-field {
              padding-right: 0;
              padding-left: 34px;
              border-left: 1px solid #e5edf7;
            }
            .billing-label {
              display: block;
              color: var(--billing-ink);
              font-size: 14px;
              font-weight: 850;
              line-height: 1.2;
            }
            .billing-hint {
              color: var(--billing-muted);
              font-size: 13px;
              line-height: 1.45;
            }
            .billing-input,
            .billing-select,
            .billing-textarea {
              width: 100%;
              min-height: 48px;
              border: 1px solid var(--billing-line);
              border-radius: 12px;
              background: #fff;
              color: #172554;
              font-size: 14px;
              line-height: 1.35;
              padding: 12px 14px;
              outline: none;
              box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
              transition: border-color .18s ease, box-shadow .18s ease;
            }
            .billing-textarea { min-height: 88px; resize: vertical; }
            .billing-input:focus,
            .billing-select:focus,
            .billing-textarea:focus {
              border-color: rgba(37, 99, 235, 0.68);
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.10);
            }
            .billing-input[readonly],
            .billing-input:disabled {
              background: #f8fafc;
              color: #64748b;
            }
            .billing-actions-row {
              display: flex;
              align-items: center;
              justify-content: flex-end;
              gap: 12px;
              margin-top: 28px;
            }
            .billing-bottom-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 18px;
              margin-top: 38px;
              padding: 14px 14px 14px 18px;
              border: 1px solid rgba(37, 99, 235, 0.18);
              border-radius: 14px;
              background: linear-gradient(180deg, #f8fbff 0%, #f3f8ff 100%);
            }
            .billing-bottom-left {
              display: flex;
              align-items: center;
              gap: 12px;
              color: #4b5875;
              font-size: 14px;
              line-height: 1.45;
            }
            .billing-bottom-status {
              margin-left: auto;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              color: #4b5875;
              font-size: 14px;
              font-weight: 750;
              white-space: nowrap;
            }
            .billing-info-dot {
              width: 25px;
              height: 25px;
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              flex: 0 0 auto;
              background: #eaf2ff;
              color: var(--billing-blue);
              font-weight: 900;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
            }
            .billing-primary-button,
            .billing-secondary-button,
            .billing-danger-button {
              appearance: none;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              min-height: 44px;
              border-radius: 12px;
              padding: 10px 20px;
              font-size: 14px;
              font-weight: 850;
              cursor: pointer;
              transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
            }
            .billing-primary-button {
              border: 1px solid transparent;
              color: #fff;
              background: linear-gradient(180deg, #2674ff 0%, var(--billing-blue) 100%);
              box-shadow: 0 12px 22px rgba(37, 99, 235, 0.28), inset 0 1px 0 rgba(255,255,255,0.2);
            }
            .billing-primary-button:hover { transform: translateY(-1px); box-shadow: 0 16px 28px rgba(37, 99, 235, 0.32); }
            .billing-secondary-button {
              border: 1px solid rgba(203, 213, 225, 0.92);
              color: #172554;
              background: #fff;
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
            }
            .billing-secondary-button:hover { border-color: rgba(37, 99, 235, 0.42); color: var(--billing-blue); }
            .billing-danger-button {
              border: 1px solid rgba(239, 68, 68, 0.46);
              color: var(--billing-red);
              background: #fff;
            }
            .billing-danger-button:hover { background: #fff7f7; }
            .billing-primary-button:disabled,
            .billing-secondary-button:disabled,
            .billing-danger-button:disabled { opacity: .62; cursor: not-allowed; transform: none; }
            .billing-table-card { width: 100%; }
            .billing-card-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 26px 30px 22px;
            }
            .billing-card-header-main {
              display: flex;
              align-items: center;
              gap: 16px;
              min-width: 0;
            }
            .billing-method-table {
              padding: 0 24px 24px;
            }
            .billing-method-head,
            .billing-method-row {
              display: grid;
              grid-template-columns: minmax(240px, 1.2fr) minmax(150px, .7fr) minmax(180px, .8fr) 180px;
              gap: 20px;
              align-items: center;
            }
            .billing-method-head {
              padding: 18px 18px 12px;
              color: #475569;
              font-size: 13px;
              font-weight: 850;
            }
            .billing-head-with-info {
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .billing-method-row {
              border-top: 1px solid #e8eef6;
              min-height: 72px;
              padding: 12px 18px;
              transition: background .18s ease;
            }
            .billing-method-row:first-of-type { border-top: 0; }
            .billing-method-row:hover { background: #f8fbff; }
            .billing-method-table-body {
              border: 1px solid #e2e8f0;
              border-radius: 15px;
              overflow: hidden;
              background: #fff;
            }
            .billing-method-name {
              display: flex;
              align-items: center;
              gap: 14px;
              min-width: 0;
              font-weight: 800;
              color: #16213e;
            }
            .billing-method-icon {
              width: 44px;
              height: 44px;
              border-radius: 999px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              flex: 0 0 auto;
              background: #f1f5f9;
              color: #334155;
            }
            .billing-method-icon--cash { color: #16a34a; background: #dcfce7; }
            .billing-method-icon--card { color: #2563eb; background: #dbeafe; }
            .billing-method-icon--bank-transfer { color: #d97706; background: #fef3c7; }
            .billing-method-icon--other { color: #7c3aed; background: #f3e8ff; }
            .billing-pill {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              width: fit-content;
              min-height: 28px;
              border-radius: 999px;
              padding: 6px 11px;
              font-size: 12.5px;
              font-weight: 850;
              line-height: 1;
              white-space: nowrap;
            }
            .billing-pill--neutral { background: #f1f5f9; color: #475569; }
            .billing-pill--success { background: #dcfce7; color: #16a34a; }
            .billing-pill--danger { background: #fee2e2; color: #ef4444; }
            .billing-status-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: currentColor;
            }
            .billing-row-switch-button {
              appearance: none;
              border: 0;
              background: transparent;
              padding: 0;
              width: fit-content;
              cursor: pointer;
            }
            .billing-row-switch {
              position: relative;
              display: inline-flex;
              width: 46px;
              height: 26px;
              border-radius: 999px;
              background: #cbd5e1;
              box-shadow: inset 0 1px 3px rgba(15, 23, 42, .16);
              transition: background .18s ease;
            }
            .billing-row-switch::after {
              content: '';
              position: absolute;
              width: 20px;
              height: 20px;
              top: 3px;
              left: 3px;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 3px 8px rgba(15, 23, 42, .22);
              transition: transform .18s ease;
            }
            .billing-row-switch.is-on { background: var(--billing-blue); }
            .billing-row-switch.is-on::after { transform: translateX(20px); }
            .billing-row-actions {
              display: flex;
              align-items: center;
              gap: 10px;
              justify-content: flex-end;
            }
            .billing-action-btn {
              appearance: none;
              width: 48px;
              height: 48px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border-radius: 11px;
              border: 1px solid #dde6f2;
              background: #fff;
              box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
              color: #172554;
              cursor: pointer;
              transition: color .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .billing-action-btn--edit:hover {
              border-color: rgba(37, 99, 235, 0.34);
              color: #1d4ed8;
              background: #f8fbff;
              box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
            }
            .billing-action-btn--delete {
              color: #ef4444;
              border-color: rgba(239, 68, 68, 0.24);
            }
            .billing-action-btn--delete:hover {
              background: #fff7f7;
              border-color: rgba(239, 68, 68, 0.46);
              box-shadow: 0 4px 12px rgba(239, 68, 68, 0.16);
            }
            .billing-fiscal-toggle-button {
              appearance: none;
              border: 0;
              background: transparent;
              padding: 0;
              width: fit-content;
              cursor: pointer;
            }
            .billing-empty-wrap { padding: 30px; }
            .billing-overview-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 22px;
              margin-bottom: 22px;
            }
            .billing-overview-card {
              display: flex;
              align-items: center;
              gap: 18px;
              min-height: 94px;
              padding: 20px 24px;
            }
            .billing-overview-icon {
              width: 50px;
              height: 50px;
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              background: #eaf2ff;
              color: var(--billing-blue);
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.13);
              flex: 0 0 auto;
            }
            .billing-overview-label {
              display: block;
              color: var(--billing-muted);
              font-size: 13px;
              font-weight: 850;
              margin-bottom: 8px;
            }
            .billing-overview-value { color: #172554; font-weight: 850; }
            .billing-form-card { padding: 28px 30px; }
            .billing-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 24px 34px;
            }
            .billing-field { display: grid; gap: 9px; }
            .billing-input-with-icon { position: relative; display: block; }
            .billing-input-with-icon .billing-input { padding-right: 42px; }
            .billing-input-icon {
              position: absolute;
              right: 13px;
              top: 50%;
              transform: translateY(-50%);
              color: #94a3b8;
              pointer-events: none;
            }
            .billing-info-note {
              margin-top: 20px;
              display: flex;
              align-items: flex-start;
              gap: 12px;
              border: 1px solid rgba(37, 99, 235, 0.22);
              border-radius: 14px;
              background: #f8fbff;
              color: #385077;
              padding: 15px 18px;
              font-size: 14px;
              line-height: 1.5;
            }
            .billing-fiscal-grid {
              display: grid;
              grid-template-columns: minmax(520px, 1fr) minmax(460px, 1.05fr);
              gap: 22px;
              align-items: start;
            }
            .billing-fiscal-card { padding: 24px; }
            .billing-fiscal-fields {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 20px 24px;
            }
            .billing-fiscal-fields .full-span { grid-column: 1 / -1; }
            .billing-fiscal-fields .span-2 { grid-column: span 2; }
            .billing-env-toggle {
              display: grid;
              grid-template-columns: 1fr 1fr;
              border: 1px solid var(--billing-line);
              border-radius: 12px;
              overflow: hidden;
              background: #f8fafc;
              min-height: 48px;
            }
            .billing-env-option {
              appearance: none;
              border: 0;
              background: transparent;
              color: #475569;
              font-size: 14px;
              font-weight: 850;
              cursor: pointer;
            }
            .billing-env-option.active {
              color: #fff;
              background: linear-gradient(180deg, #2674ff 0%, var(--billing-blue) 100%);
              box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24);
            }
            .billing-input-row {
              display: flex;
              align-items: stretch;
              gap: 10px;
            }
            .billing-input-row .billing-input { min-width: 0; }
            .billing-upload-zone {
              position: relative;
              border: 1.5px dashed rgba(37, 99, 235, 0.58);
              border-radius: 14px;
              background: #f8fbff;
              min-height: 92px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 12px;
              color: #172554;
              font-weight: 800;
              text-align: center;
              cursor: pointer;
              padding: 18px;
            }
            .billing-upload-zone input {
              position: absolute;
              inset: 0;
              opacity: 0;
              cursor: pointer;
            }
            .billing-upload-zone small {
              display: block;
              margin-top: 4px;
              color: var(--billing-muted);
              font-weight: 650;
            }
            .billing-certificate-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              padding: 14px 16px;
              background: #fff;
            }
            .billing-certificate-main {
              display: flex;
              align-items: center;
              gap: 12px;
              min-width: 0;
            }
            .billing-certificate-icon {
              width: 44px;
              height: 44px;
              border-radius: 12px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: var(--billing-blue);
              background: #eaf2ff;
              flex: 0 0 auto;
            }
            .billing-certificate-name { display: block; font-weight: 850; color: var(--billing-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .billing-certificate-meta { display: block; color: var(--billing-muted); font-size: 12.5px; margin-top: 2px; }
            .billing-fiscal-actions {
              margin-top: 24px;
              padding-top: 22px;
              border-top: 1px solid #e8eef6;
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 14px;
            }
            .billing-fiscal-note {
              margin: 0;
              color: var(--billing-muted);
              font-size: 13px;
              line-height: 1.45;
            }
            .billing-folio-panel { width: 100%; }
            .billing-folio-card {
              border-radius: 24px;
              border: 1px solid rgba(203, 213, 225, 0.82);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              overflow: hidden;
              background: #fff;
            }
            .billing-folio-card :is(input, select, textarea) {
              border-radius: 10px;
              border-color: var(--billing-line);
            }
            .billing-folio-card :is(button:not(.clients-session-tab)) {
              border-radius: 12px;
              font-weight: 800;
            }
            @media (max-width: 1180px) {
              .billing-fiscal-grid,
              .billing-overview-grid { grid-template-columns: 1fr; }
              .billing-method-head { display: none; }
              .billing-method-row { grid-template-columns: 1fr; gap: 12px; align-items: start; }
              .billing-row-actions { justify-content: flex-start; }
            }
            @media (max-width: 780px) {
              .billing-main-panel { padding: 14px; }
              .billing-subtabs { gap: 8px; }
              .billing-subtab { flex: 1 1 150px; min-width: 0; }
              .billing-settings-grid,
              .billing-form-grid,
              .billing-fiscal-fields { grid-template-columns: 1fr; }
              .billing-settings-field,
              .billing-settings-field + .billing-settings-field { padding: 0; border-left: 0; }
              .billing-settings-field + .billing-settings-field { padding-top: 22px; margin-top: 22px; border-top: 1px solid #e6edf6; }
              .billing-card-pad,
              .billing-settings-card,
              .billing-form-card,
              .billing-fiscal-card { padding: 22px; }
              .billing-fiscal-fields .span-2 { grid-column: auto; }
              .billing-fiscal-actions { grid-template-columns: 1fr; }
              .billing-bottom-bar { flex-direction: column; align-items: stretch; }
              .billing-bottom-status { margin-left: 0; }
            }
          `}</style>

          <div className="billing-card billing-main-panel">
            <div className="billing-tabs-card">
              <div className="billing-subtabs" role="tablist" aria-label="Billing settings">
                {billingSubtabs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={billingSubtab === entry.id}
                    className={billingSubtab === entry.id ? 'billing-subtab active' : 'billing-subtab'}
                    onClick={() => setBillingSubtab(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            {billingSubtab === 'settings' ? (
            <div className="billing-card billing-settings-card">
              <div className="billing-section-heading-row">
                <span className="billing-section-icon"><BillingReceiptIcon /></span>
                <span>
                  <h3 className="billing-section-title">{locale === 'sl' ? 'Osnovne nastavitve računov' : 'Basic invoice settings'}</h3>
                  <span className="billing-section-kicker">{locale === 'sl' ? 'Določite številčenje računov in plačilne roke.' : 'Set invoice numbering and payment deadlines.'}</span>
                </span>
              </div>
              <div className="billing-settings-grid">
                <label className="billing-settings-field">
                  <span className="billing-label">{locale === 'sl' ? 'Števec računov' : 'Invoice counter'}</span>
                  <input className="billing-input" value={settings.INVOICE_COUNTER ?? ''} onChange={(e) => setSettings({ ...settings, INVOICE_COUNTER: e.target.value })} />
                  <span className="billing-hint">
                    {locale === 'sl'
                      ? 'Naslednja številka računa. Predpona računa je lahko npr. I, II ali NV-0001.'
                      : 'The next invoice number to use. Supports alphanumeric prefixes such as I, II or INV-0001.'}
                  </span>
                </label>
                <label className="billing-settings-field">
                  <span className="billing-label">{locale === 'sl' ? 'Rok plačila (dni)' : 'Payment deadline (days)'}</span>
                  <input className="billing-input" type="number" min="0" step="1" value={settings.PAYMENT_DEADLINE_DAYS ?? ''} onChange={(e) => setSettings({ ...settings, PAYMENT_DEADLINE_DAYS: e.target.value })} />
                  <span className="billing-hint">
                    {locale === 'sl' ? 'Rok zapadlosti je datum računa + to število dni.' : 'Due date is invoice date + this number of days.'}
                  </span>
                </label>
              </div>
              <div className="billing-bottom-bar">
                <span className="billing-bottom-left">
                  <span className="billing-info-dot"><BillingInfoIcon /></span>
                  <span>{locale === 'sl' ? 'Spremembe se uporabijo za nove račune in ne vplivajo na že izdane račune.' : 'Changes apply to new invoices and do not affect already issued invoices.'}</span>
                </span>
                <button type="button" className="billing-primary-button" onClick={() => void saveSettings()} disabled={savingSettings}>
                  <BillingSaveIcon />
                  {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
                </button>
              </div>
            </div>
          ) : billingSubtab === 'paymentMethods' ? (
            <>
              <div className="billing-card billing-table-card">
                <div className="billing-card-header">
                  <div className="billing-card-header-main">
                    <span className="billing-section-icon"><BillingPaymentTypeIcon type="CARD" /></span>
                    <span>
                      <h3 className="billing-section-title">{locale === 'sl' ? 'Seznam načinov plačila' : 'Payment method list'}</h3>
                      <span className="billing-section-kicker">{locale === 'sl' ? 'Ustvarite, uredite in upravljajte načine plačila, ki so na voljo v sistemu.' : 'Create, edit and manage available payment methods.'}</span>
                    </span>
                  </div>
                  <button type="button" className="billing-primary-button" onClick={resetAndOpenPaymentMethodModal} disabled>
                  <BillingPlusIcon />
                  {locale === 'sl' ? 'Nov način plačila' : 'New payment method'}
                </button>
              </div>
              {paymentMethods.length === 0 && inlineEditingPaymentMethodId !== -1 ? (
                <div className="billing-empty-wrap">
                  <EmptyState title="No payment methods" text="Click New to create your first payment method." />
                </div>
              ) : (
                <div className="billing-method-table">
                  <div className="billing-method-head" aria-hidden>
                    <span>{locale === 'sl' ? 'Naziv' : 'Name'}</span>
                    <span>{locale === 'sl' ? 'Tip' : 'Type'}</span>
                    <span className="billing-head-with-info">{locale === 'sl' ? 'Fiskalizacija' : 'Fiscalization'} <BillingInfoIcon /></span>
                    <span>{locale === 'sl' ? 'Dejanja' : 'Actions'}</span>
                  </div>
                  <div className="billing-method-table-body">
                  {inlineEditingPaymentMethodId === -1 && inlinePaymentMethodForm ? (
                    <div className="billing-method-row">
                      <div className="billing-method-name">
                        <span className={`billing-method-icon billing-method-icon--${inlinePaymentMethodForm.paymentType.toLowerCase().replace('_', '-')}`}>
                          <BillingPaymentTypeIcon type={inlinePaymentMethodForm.paymentType} />
                        </span>
                        <input
                          className="billing-input"
                          placeholder={locale === 'sl' ? 'Naziv' : 'Name'}
                          value={inlinePaymentMethodForm.name}
                          onChange={(e) => setInlinePaymentMethodForm({ ...inlinePaymentMethodForm, name: e.target.value })}
                        />
                      </div>
                      <select
                        className="billing-select"
                        value={inlinePaymentMethodForm.paymentType}
                        onChange={(e) => {
                          const paymentType = e.target.value as PaymentType
                          setInlinePaymentMethodForm({
                            ...inlinePaymentMethodForm,
                            paymentType,
                            fiscalized: paymentType !== 'CARD',
                            stripeEnabled: paymentType === 'CARD',
                          })
                        }}
                      >
                        <option value="CASH">CASH</option>
                        <option value="CARD">CARD</option>
                        <option value="BANK_TRANSFER">BANK TRANSFER</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                      <button
                        type="button"
                        className="billing-fiscal-toggle-button"
                        onClick={() => setInlinePaymentMethodForm({ ...inlinePaymentMethodForm, fiscalized: !inlinePaymentMethodForm.fiscalized })}
                      >
                        <span className={inlinePaymentMethodForm.fiscalized ? 'billing-pill billing-pill--success' : 'billing-pill billing-pill--danger'}>
                          <span className="billing-status-dot" />
                          {inlinePaymentMethodForm.fiscalized ? (locale === 'sl' ? 'Vklopljeno' : 'On') : (locale === 'sl' ? 'Izklopljeno' : 'Off')}
                        </span>
                      </button>
                      <div className="billing-row-actions">
                        <button type="button" className="billing-secondary-button" onClick={cancelInlinePaymentMethodEdit}>
                          {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                        </button>
                        <button type="button" className="billing-primary-button" onClick={() => void saveInlinePaymentMethodEdit(-1)}>
                          {locale === 'sl' ? 'Shrani' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {paymentMethods.map((method) => {
                    const methodTypeLabel = method.paymentType === 'BANK_TRANSFER' ? 'BANK TRANSFER' : method.paymentType === 'OTHER' ? 'OTHER' : method.paymentType
                    const methodTypeClass = method.paymentType.toLowerCase().replace('_', '-')
                    const isInlineEditing = inlineEditingPaymentMethodId === method.id && inlinePaymentMethodForm
                    return (
                      <div
                        key={method.id}
                        className="billing-method-row"
                      >
                        <div className="billing-method-name">
                          <span className={`billing-method-icon billing-method-icon--${methodTypeClass}`}>
                            <BillingPaymentTypeIcon type={method.paymentType} />
                          </span>
                          {isInlineEditing ? (
                            <input
                              className="billing-input"
                              value={inlinePaymentMethodForm.name}
                              onChange={(e) => setInlinePaymentMethodForm({ ...inlinePaymentMethodForm, name: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span>{method.name}</span>
                          )}
                        </div>
                        <span className="billing-pill billing-pill--neutral">{methodTypeLabel}</span>
                        <button
                          type="button"
                          className="billing-fiscal-toggle-button"
                          onClick={() => {
                            if (!isInlineEditing) {
                              void togglePaymentMethodFiscalized(method)
                            } else {
                              setInlinePaymentMethodForm({ ...inlinePaymentMethodForm, fiscalized: !inlinePaymentMethodForm.fiscalized })
                            }
                          }}
                        >
                          <span className={(isInlineEditing ? inlinePaymentMethodForm.fiscalized : method.fiscalized) ? 'billing-pill billing-pill--success' : 'billing-pill billing-pill--danger'}>
                            <span className="billing-status-dot" />
                            {(isInlineEditing ? inlinePaymentMethodForm.fiscalized : method.fiscalized) ? (locale === 'sl' ? 'Vklopljeno' : 'On') : (locale === 'sl' ? 'Izklopljeno' : 'Off')}
                          </span>
                        </button>
                        <div className="billing-row-actions">
                          {isInlineEditing ? (
                            <>
                              <button
                                type="button"
                                className="billing-secondary-button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  cancelInlinePaymentMethodEdit()
                                }}
                              >
                                {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                              </button>
                              <button
                                type="button"
                                className="billing-primary-button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void saveInlinePaymentMethodEdit(method.id)
                                }}
                              >
                                {locale === 'sl' ? 'Shrani' : 'Save'}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="billing-action-btn billing-action-btn--edit"
                              aria-label="Edit payment method"
                              onClick={(e) => {
                                e.stopPropagation()
                                startInlinePaymentMethodEdit(method)
                              }}
                            >
                              <BillingEditIcon />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </div>
              )}
              </div>
            </>
          ) : billingSubtab === 'paypal' ? (
            <>
              <div className="billing-overview-grid">
                <div className="billing-card billing-overview-card">
                  <span className="billing-overview-icon"><BillingLinkIcon /></span>
                  <span>
                    <span className="billing-overview-label">{locale === 'sl' ? 'Stanje povezave' : 'Connection status'}</span>
                    <span className={paypalStatusLabel.toLowerCase().includes('connected') || paypalStatusLabel.toLowerCase().includes('povezan') ? 'billing-pill billing-pill--success' : 'billing-pill billing-pill--neutral'}>
                      <span className="billing-status-dot" /> {paypalStatusLabel}
                    </span>
                  </span>
                </div>
                <div className="billing-card billing-overview-card">
                  <span className="billing-overview-icon"><BillingUserBadgeIcon /></span>
                  <span>
                    <span className="billing-overview-label">Merchant ID</span>
                    <span className="billing-overview-value">{settings.PAYPAL_MERCHANT_ID || '—'}</span>
                  </span>
                </div>
                <div className="billing-card billing-overview-card">
                  <span className="billing-overview-icon"><BillingTagIcon /></span>
                  <span>
                    <span className="billing-overview-label">Tracking ID</span>
                    <span className="billing-overview-value">{settings.PAYPAL_TRACKING_ID || '—'}</span>
                  </span>
                </div>
              </div>

              <div className="billing-card billing-form-card">
                <div className="billing-form-grid">
                  <label className="billing-field">
                    <span className="billing-label">{locale === 'sl' ? 'Status povezave' : 'Connection status'}</span>
                    <input className="billing-input" value={paypalStatusLabel} readOnly />
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">{locale === 'sl' ? 'Poverilnice (sandbox / live)' : 'Sandbox / live credentials'}</span>
                    <span className="billing-input-with-icon">
                      <input className="billing-input" value={settings.PAYPAL_CREDENTIALS_CONFIGURED === 'true' ? (locale === 'sl' ? 'Konfigurirano v zaledju' : 'Configured on backend') : (locale === 'sl' ? 'Potrebne poverilnice v zaledju' : 'Backend credentials required')} readOnly />
                      <span className="billing-input-icon"><BillingLockIcon /></span>
                    </span>
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">PayPal merchant ID</span>
                    <input className="billing-input" value={settings.PAYPAL_MERCHANT_ID || ''} onChange={(e) => setSettings({ ...settings, PAYPAL_MERCHANT_ID: e.target.value })} placeholder="Example: 9ABCD12345EFG" />
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">Tracking ID</span>
                    <input className="billing-input" value={settings.PAYPAL_TRACKING_ID || ''} onChange={(e) => setSettings({ ...settings, PAYPAL_TRACKING_ID: e.target.value })} placeholder="Auto-generated by PayPal onboarding" />
                  </label>
                </div>
                <div className="billing-actions-row">
                  <button type="button" className="billing-primary-button" onClick={startPaypalOnboarding} disabled={startingPaypalOnboarding}>
                    <BillingPaypalIcon />
                    {startingPaypalOnboarding ? (locale === 'sl' ? 'Odpiranje PayPal…' : 'Opening PayPal…') : (locale === 'sl' ? 'Poveži PayPal' : 'Connect PayPal')}
                  </button>
                  <button type="button" className="billing-secondary-button" onClick={savePaypalConfiguration} disabled={savingSettings}>
                    <BillingSaveIcon />
                    {savingSettings ? t('formSaving') : (locale === 'sl' ? 'Shrani konfiguracijo' : 'Save configuration')}
                  </button>
                </div>
              </div>
              <div className="billing-info-note">
                <span className="billing-info-dot"><BillingInfoIcon /></span>
                <span>{locale === 'sl' ? 'Onboarding PayPal računa se odpre v novem oknu. Po zaključku boste samodejno preusmerjeni nazaj na to stran.' : 'PayPal onboarding opens in a new window. After completion you will be returned to this page automatically.'}</span>
              </div>
            </>
          ) : billingSubtab === 'fiscal' ? (
            <div className="billing-fiscal-grid">
              <div className="billing-card billing-fiscal-card">
                <div className="billing-fiscal-fields">
                  <div className="billing-field">
                    <span className="billing-label">{t('configFiscalEnvironment')}</span>
                    <div className="billing-env-toggle" role="group" aria-label={t('configFiscalEnvironment')}>
                      {(['TEST', 'PROD'] as const).map((env) => (
                        <button
                          key={env}
                          type="button"
                          className={(settings.FISCAL_ENVIRONMENT || 'TEST') === env ? 'billing-env-option active' : 'billing-env-option'}
                          onClick={() => setSettings({ ...settings, FISCAL_ENVIRONMENT: env })}
                        >
                          {env}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="billing-field">
                    <span className="billing-label">{t('configFiscalTaxNumberFromVat')}</span>
                    <input className="billing-input" value={(settings.COMPANY_VAT_ID || '').replace(/^SI/i, '')} readOnly />
                  </label>
                  <div className="billing-field full-span">
                    <span className="billing-label">{t('configFiscalBusinessPremiseId')}</span>
                    <div className="billing-input-row">
                      <input
                        className="billing-input"
                        placeholder={t('configFiscalBusinessPremiseId')}
                        value={settings.FISCAL_BUSINESS_PREMISE_ID || ''}
                        onChange={(e) => setSettings({ ...settings, FISCAL_BUSINESS_PREMISE_ID: e.target.value })}
                      />
                      <button type="button" className="billing-secondary-button" onClick={registerBusinessPremise} disabled={registeringPremise}>
                        {registeringPremise && registeringPremiseId === selectedPremiseId ? t('configFiscalRegistering') : t('configFiscalRegister')}
                      </button>
                    </div>
                    {selectedPremiseConfirmed ? <span className="billing-hint">✓ {t('configFiscalConfirmedPremise')}</span> : null}
                  </div>
                  <label className="billing-field full-span">
                    <span className="billing-label">{t('configFiscalElectronicDeviceId')}</span>
                    <input className="billing-input" value={settings.FISCAL_DEVICE_ID || ''} onChange={(e) => setSettings({ ...settings, FISCAL_DEVICE_ID: e.target.value })} />
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">{t('configFiscalCadastralNumber')}</span>
                    <input className="billing-input" value={settings.FISCAL_CADASTRAL_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_CADASTRAL_NUMBER: e.target.value })} />
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">{t('configFiscalBuildingNumber')}</span>
                    <input className="billing-input" value={settings.FISCAL_BUILDING_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_BUILDING_NUMBER: e.target.value })} />
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">{t('configFiscalBuildingSectionNumber')}</span>
                    <input className="billing-input" value={settings.FISCAL_BUILDING_SECTION_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_BUILDING_SECTION_NUMBER: e.target.value })} />
                  </label>
                  <label className="billing-field">
                    <span className="billing-label">{t('configFiscalHouseNumber')}</span>
                    <input className="billing-input" value={settings.FISCAL_HOUSE_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_HOUSE_NUMBER: e.target.value })} />
                  </label>
                  <label className="billing-field span-2">
                    <span className="billing-label">{t('configFiscalHouseNumberAdditional')}</span>
                    <input className="billing-input" value={settings.FISCAL_HOUSE_NUMBER_ADDITIONAL || ''} onChange={(e) => setSettings({ ...settings, FISCAL_HOUSE_NUMBER_ADDITIONAL: e.target.value })} />
                  </label>
                  <p className="billing-fiscal-note full-span">Fiscal URLs are managed globally in the Platform Admin Console.</p>
                  {premiseRegisterResult ? <p className="billing-fiscal-note full-span">{premiseRegisterResult}</p> : null}
                </div>
              </div>

              <div className="billing-card billing-fiscal-card">
                <div className="billing-fiscal-fields">
                  <label className="billing-field full-span">
                    <span className="billing-label">{t('configFiscalSoftwareSupplierTaxOptional')}</span>
                    <input className="billing-input" value={settings.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER: e.target.value })} />
                  </label>
                  <label className="billing-field full-span">
                    <span className="billing-label">{t('configFiscalCertificatePassword')}</span>
                    <span className="billing-input-with-icon">
                      <input className="billing-input" type="password" value={settings.FISCAL_CERTIFICATE_PASSWORD || ''} onChange={(e) => setSettings({ ...settings, FISCAL_CERTIFICATE_PASSWORD: e.target.value })} />
                      <span className="billing-input-icon"><GuestEyeIcon /></span>
                    </span>
                  </label>
                  <div className="billing-field full-span">
                    <span className="billing-label">{t('configFiscalCertificateFile')}</span>
                    <label className="billing-upload-zone">
                      <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setCertificateFile(e.target.files?.[0] || null)} />
                      <BillingUploadIcon />
                      <span>
                        {certificateFile ? certificateFile.name : (locale === 'sl' ? 'Povlecite datoteko sem ali kliknite za izbiro' : 'Drop a file here or click to choose')}
                        <small>{locale === 'sl' ? 'Dovoljene vrste: .p12, .pfx' : 'Allowed types: .p12, .pfx'}</small>
                      </span>
                    </label>
                  </div>
                  <div className="full-span">
                    <div className="billing-certificate-row">
                      <div className="billing-certificate-main">
                        <span className="billing-certificate-icon"><BillingCertificateIcon /></span>
                        <span>
                          <span className="billing-certificate-name">{certificateMeta?.uploaded ? (certificateMeta.fileName || 'certificate') : (locale === 'sl' ? 'Digitalno potrdilo ni naloženo' : 'No digital certificate uploaded')}</span>
                          <span className="billing-certificate-meta">
                            {certificateMeta?.uploaded
                              ? `${certificateMeta.expiresAt ? `${t('configFiscalExpiresAt')}: ${certificateMeta.expiresAt}` : (locale === 'sl' ? 'Potrdilo je naloženo.' : 'Certificate uploaded.')}`
                              : (locale === 'sl' ? 'Naložite .p12 ali .pfx potrdilo za fiskalizacijo.' : 'Upload a .p12 or .pfx certificate for fiscalization.')}
                          </span>
                        </span>
                      </div>
                      {certificateMeta?.uploaded ? <span className="billing-pill billing-pill--success"><span className="billing-status-dot" /> {locale === 'sl' ? 'Naloženo' : 'Uploaded'}</span> : <span className="billing-pill billing-pill--neutral">{locale === 'sl' ? 'Ni naloženo' : 'Not uploaded'}</span>}
                    </div>
                  </div>
                </div>
                <div className="billing-fiscal-actions">
                  <button type="button" className="billing-primary-button" onClick={() => void saveSettings()} disabled={savingSettings}>
                    <BillingSaveIcon />
                    {savingSettings ? t('formSaving') : t('configFiscalSaveSettings')}
                  </button>
                  <button type="button" className="billing-secondary-button" onClick={uploadCertificate} disabled={uploadingCertificate}>
                    <BillingUploadIcon />
                    {uploadingCertificate ? t('configFiscalUploadingCertificate') : t('configFiscalUploadCertificate')}
                  </button>
                  {certificateMeta?.uploaded ? (
                    <button type="button" className="billing-danger-button" onClick={removeCertificate}>
                      <BillingTrashIcon />
                      {t('configFiscalRemoveCertificate')}
                    </button>
                  ) : (
                    <button type="button" className="billing-danger-button" disabled>
                      <BillingTrashIcon />
                      {t('configFiscalRemoveCertificate')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : billingSubtab === 'invoiceDelivery' ? (
            <ConfigurationInvoiceDeliverySection
              settings={settings}
              setSettings={setSettings}
              savingSettings={savingSettings}
              onSave={() => saveSettings()}
              t={t}
              locale={locale}
            />
          ) : (
            <div className="billing-folio-panel">
              <Card className="billing-folio-card">
                <FolioLayoutEditor />
              </Card>
            </div>
            )}
          </div>
        </div>
      
      ) : tab === 'guestApp' ? (
        <Card className="settings-card guest-app-settings-card gapp-modern-card">
          <style>{`
            .gapp-modern-card {
              --gapp-blue: #2563eb;
              --gapp-blue-dark: #1d4ed8;
              --gapp-text: #0f1b3d;
              --gapp-muted: #64748b;
              --gapp-line: #dbe4f0;
              --gapp-soft: #f8fafc;
              --gapp-soft-blue: #eff6ff;
              border-radius: 24px;
              border: 1px solid rgba(203, 213, 225, 0.78);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
              background: #fff;
              padding: 28px 34px 32px;
              color: var(--gapp-text);
            }
            .gapp-modern-card button { font-family: inherit; }
            .gapp-subtabs {
              display: flex;
              align-items: center;
              gap: 10px;
              margin: 20px 0 10px;
              border-bottom: 1px solid #edf2f7;
            }
            .gapp-subtab {
              position: relative;
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-weight: 700;
              font-size: 15px;
              padding: 10px 14px;
              cursor: pointer;
              border-radius: 10px;
              box-shadow: none;
              outline: none;
              transition: color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .gapp-subtab:hover { color: #0f172a; background: #f8fafc; }
            .gapp-subtab.active {
              color: #2563eb;
              background: #eaf2ff;
              box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16), 0 3px 10px rgba(37, 99, 235, 0.18);
            }
            .gapp-panel {
              margin-top: 12px;
              border: 1px solid rgba(203, 213, 225, 0.86);
              border-radius: 22px;
              background: #fff;
              padding: 34px;
              box-shadow: 0 18px 50px rgba(15, 23, 42, 0.07);
            }
            .gapp-grid,
            .gapp-form-grid {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 38px 70px;
            }
            .gapp-column { display: grid; gap: 22px; align-content: start; }
            .gapp-field { display: grid; gap: 8px; }
            .gapp-label {
              font-size: 14px;
              font-weight: 800;
              color: var(--gapp-text);
              line-height: 1.2;
            }
            .gapp-hint {
              display: block;
              color: var(--gapp-muted);
              font-size: 12.5px;
              line-height: 1.45;
            }
            .gapp-input,
            .gapp-select,
            .gapp-textarea {
              width: 100%;
              min-height: 42px;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              background: #fff;
              color: #172554;
              font-size: 14px;
              line-height: 1.3;
              padding: 10px 14px;
              outline: none;
              box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
              transition: border-color .18s ease, box-shadow .18s ease;
            }
            .gapp-textarea { min-height: 92px; resize: vertical; }
            .gapp-input:focus,
            .gapp-select:focus,
            .gapp-textarea:focus {
              border-color: rgba(37, 99, 235, 0.65);
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.11);
            }
            .gapp-segmented {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              overflow: hidden;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              background: #f8fafc;
              min-height: 42px;
            }
            .gapp-segmented button {
              appearance: none;
              border: 0;
              background: transparent;
              color: #334155;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              transition: background .18s ease, color .18s ease, box-shadow .18s ease;
            }
            .gapp-segmented button.active {
              background: var(--gapp-blue);
              color: #fff;
              box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
            }
            .gapp-segmented-choice { grid-template-columns: repeat(var(--segments, 3), 1fr); }
            .gapp-segmented-icon { display: inline-flex; margin-right: 8px; vertical-align: -3px; }
            .gapp-section-heading { margin-bottom: 20px; }
            .gapp-section-heading h3 { margin: 0 0 6px; font-size: 19px; color: var(--gapp-text); }
            .gapp-section-heading p { margin: 0; color: var(--gapp-muted); font-size: 13px; }
            .gapp-upload-wrap { display: grid; gap: 8px; }
            .gapp-upload-zone {
              display: grid;
              grid-template-columns: 50px minmax(0, 1fr);
              align-items: center;
              gap: 14px;
              min-height: 74px;
              border: 1.5px dashed #9fb0c5;
              border-radius: 13px;
              background: linear-gradient(180deg, #fff, #fbfdff);
              padding: 12px 14px;
              cursor: pointer;
              transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
            }
            .gapp-upload-zone.drag-active {
              border-color: var(--gapp-blue);
              background: #eff6ff;
              box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
            }
            .gapp-upload-icon {
              display: grid;
              place-items: center;
              width: 46px;
              height: 46px;
              border-radius: 11px;
              color: #1e3a8a;
              background: #f1f5f9;
              border: 1px solid #dbe4f0;
            }
            .gapp-upload-copy { display: grid; gap: 3px; color: #334155; }
            .gapp-upload-copy strong { font-size: 14px; }
            .gapp-upload-copy small { color: var(--gapp-muted); font-size: 12.5px; }
            .gapp-file-input { display: none; }
            .gapp-upload-preview-row {
              display: flex;
              gap: 12px;
              align-items: center;
              min-width: 0;
              color: var(--gapp-blue);
              font-size: 12.5px;
            }
            .gapp-upload-preview { object-fit: cover; border: 1px solid #dbe4f0; background: #fff; }
            .gapp-upload-preview.wide { width: 132px; height: 76px; border-radius: 12px; }
            .gapp-upload-preview.round { width: 58px; height: 58px; border-radius: 999px; }
            .gapp-upload-preview.square { width: 58px; height: 58px; border-radius: 14px; }
            .gapp-inline-switch-row {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 14px;
              align-items: center;
            }
            .gapp-switch {
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: flex-end;
              width: 68px;
              height: 34px;
              border: 1px solid #cbd5e1;
              border-radius: 999px;
              background: #e2e8f0;
              color: #64748b;
              padding: 0 9px 0 34px;
              font-size: 10px;
              font-weight: 900;
              cursor: pointer;
              transition: background .18s ease, border-color .18s ease;
            }
            .gapp-switch.active {
              justify-content: flex-start;
              padding: 0 34px 0 9px;
              background: var(--gapp-blue);
              border-color: var(--gapp-blue);
              color: #fff;
            }
            .gapp-switch-knob {
              position: absolute;
              left: 4px;
              width: 26px;
              height: 26px;
              border-radius: 999px;
              background: #fff;
              box-shadow: 0 4px 10px rgba(15, 23, 42, .18);
              transition: transform .18s ease;
            }
            .gapp-switch.active .gapp-switch-knob { transform: translateX(34px); }
            .gapp-payment-layout { grid-template-columns: 1.15fr .85fr; gap: 34px; }
            .gapp-pane { min-width: 0; }
            .gapp-divider-pane { border-left: 1px solid #edf2f7; padding-left: 34px; }
            .gapp-payment-list { display: grid; gap: 10px; margin-bottom: 20px; }
            .gapp-payment-row {
              display: grid;
              grid-template-columns: 46px minmax(0, 1fr) auto;
              align-items: center;
              gap: 14px;
              min-height: 58px;
              border: 1px solid var(--gapp-line);
              border-radius: 13px;
              padding: 8px 12px;
              background: #fff;
            }
            .gapp-payment-icon {
              display: grid;
              place-items: center;
              width: 42px;
              height: 42px;
              border-radius: 11px;
              background: #f8fafc;
              color: #1e3a8a;
              border: 1px solid #e2e8f0;
            }
            .gapp-payment-row strong { color: #172554; font-size: 14px; }
            .gapp-payment-toggle-row {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px;
              margin-top: 4px;
            }
            .gapp-payment-toggle-card {
              border: 1px solid #dbe7fb;
              border-radius: 14px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              box-shadow: 0 6px 16px rgba(30, 64, 175, 0.06);
              padding: 12px 14px;
              align-content: start;
            }
            .gapp-toggle-head {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 12px;
            }
            .gapp-toggle-head .gapp-label { margin-top: 2px; }
            .gapp-field.gapp-deposit-field { margin-top: 12px; }
            .gapp-deposit-input-wrap {
              position: relative;
              display: flex;
              align-items: center;
            }
            .gapp-deposit-input {
              width: 100%;
              min-height: 44px;
              border: 1px solid #cddcf5;
              border-radius: 12px;
              background: #f8fbff;
              color: #1e3a8a;
              font-size: 16px;
              font-weight: 800;
              letter-spacing: .02em;
              line-height: 1.2;
              padding: 10px 40px 10px 14px;
              outline: none;
              box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
              transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
            }
            .gapp-deposit-input:focus {
              border-color: rgba(37, 99, 235, 0.65);
              background: #fff;
              box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
            }
            .gapp-deposit-input-suffix {
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              min-width: 24px;
              height: 24px;
              border-radius: 999px;
              display: grid;
              place-items: center;
              padding: 0 7px;
              background: #e7efff;
              color: #1d4ed8;
              font-size: 12px;
              font-weight: 900;
              pointer-events: none;
            }
            .gapp-mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; }
            .gapp-provider-card { display: grid; gap: 20px; }
            .gapp-password-wrap,
            .gapp-link-input-wrap { position: relative; }
            .gapp-input-icon-button {
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              display: grid;
              place-items: center;
              width: 30px;
              height: 30px;
              border: 0;
              border-radius: 9px;
              color: #1d4ed8;
              background: #eff6ff;
              cursor: pointer;
            }
            .gapp-link-copy-button {
              color: #111111;
              background: transparent;
              border-radius: 0;
              top: 38%;
            }
            .gapp-link-copy-button:hover,
            .gapp-link-copy-button:focus,
            .gapp-link-copy-button:focus-visible,
            .gapp-link-copy-button:active {
              background: transparent;
              box-shadow: none;
              outline: none;
            }
            .gapp-link-copy-button svg {
              display: block;
            }
            .gapp-status-pill {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              width: fit-content;
              border-radius: 999px;
              padding: 10px 16px;
              background: #dcfce7;
              color: #047857;
              font-weight: 800;
              font-size: 14px;
            }
            .gapp-security-note,
            .gapp-help-panel {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 14px;
              align-items: start;
              border: 1px solid #bfdbfe;
              border-radius: 15px;
              background: linear-gradient(180deg, #eff6ff, #f8fbff);
              color: #1e3a8a;
              padding: 18px;
            }
            .gapp-security-note strong,
            .gapp-help-panel strong { display: block; margin-bottom: 5px; color: #1e3a8a; }
            .gapp-security-note p,
            .gapp-help-panel p { margin: 0; color: #334155; font-size: 13px; line-height: 1.5; }
            .gapp-help-panel ul { margin: 4px 0 0 18px; padding: 0; color: #334155; font-size: 13px; line-height: 1.55; }
            .gapp-qr-layout { grid-template-columns: .96fr 1fr; gap: 38px; }
            .gapp-color-input { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 10px; }
            .gapp-color-input input[type='color'] {
              width: 48px;
              height: 42px;
              border: 1px solid var(--gapp-line);
              border-radius: 11px;
              padding: 4px;
              background: #fff;
            }
            .gapp-export-tabs { --segments: 3; }
            .gapp-qr-preview-panel { display: grid; gap: 18px; }
            .gapp-qr-card {
              border: 1px solid var(--gapp-line);
              border-radius: 18px;
              background: #fff;
              text-align: center;
              padding: 26px 24px 18px;
            }
            .gapp-qr-card h3 { margin: 0 0 6px; font-size: 22px; color: var(--gapp-text); }
            .gapp-qr-card p { margin: 0; color: var(--gapp-muted); font-size: 13px; }
            .gapp-qr-frame {
              display: inline-grid;
              place-items: center;
              margin: 16px auto 8px;
              width: 244px;
              height: 244px;
              border: 1px solid #dbeafe;
              border-radius: 14px;
              background: #fff;
            }
            .gapp-qr-svg { width: 214px; height: 214px; image-rendering: pixelated; }
            .gapp-qr-caption { margin-top: 4px; font-weight: 800; color: #1e3a8a; }
            .gapp-qr-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
            .gapp-qr-actions .gapp-outline-button { min-height: 42px; padding: 0 14px; }
            @media (max-width: 980px) {
              .gapp-grid,
              .gapp-form-grid,
              .gapp-payment-layout,
              .gapp-qr-layout,
              .gapp-mini-grid { grid-template-columns: 1fr; }
              .gapp-payment-toggle-row { grid-template-columns: 1fr; }
              .gapp-divider-pane { border-left: 0; padding-left: 0; border-top: 1px solid #edf2f7; padding-top: 24px; }
              .gapp-subtabs { gap: 18px; overflow-x: auto; }
              .gapp-panel { padding: 22px; }
              .gapp-qr-actions { grid-template-columns: 1fr; }
            }
          `}</style>
          <div className="gapp-subtabs" role="tablist" aria-label="Guest app settings">
            {guestAppSubtabs(t).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={guestAppSubtab === entry.id}
                className={guestAppSubtab === entry.id ? 'gapp-subtab active' : 'gapp-subtab'}
                onClick={() => setGuestAppSubtab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="gapp-panel">
            {guestAppSubtab === 'general' ? (
              <>
                <div className="gapp-form-grid">
                  <div className="gapp-column">
                    <GuestField
                      label={locale === 'sl' ? 'Koda podjetja' : 'Tenant code'}
                      hint={locale === 'sl' ? 'Gostje uporabijo to kodo za pridružitev vašemu podjetju v mobilni aplikaciji.' : 'Guests use this code to join your tenant from the mobile app.'}
                    >
                      <input className="gapp-input" value={me.tenantCode || ''} readOnly />
                    </GuestField>
                    <GuestField
                      label={locale === 'sl' ? 'Vrsta podjetja' : 'Tenant type'}
                      hint={locale === 'sl' ? 'Določa, v katerem karuselu brskanja v mobilni aplikaciji za goste se to podjetje prikaže.' : 'Controls which guest-mobile browse carousel this tenant appears in.'}
                    >
                      <select className="gapp-select" value={guestAppSettings.tenantType} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, tenantType: e.target.value as GuestAppSettingsForm['tenantType'] })}>
                        <option value="salon">{locale === 'sl' ? 'Salon' : 'Salon'}</option>
                        <option value="gym">{locale === 'sl' ? 'Fitnes' : 'Gym'}</option>
                        <option value="spa">{locale === 'sl' ? 'Spa' : 'Spa'}</option>
                        <option value="therapy">{locale === 'sl' ? 'Terapija' : 'Therapy'}</option>
                      </select>
                    </GuestField>
                    <GuestField
                      label={locale === 'sl' ? 'Javno najdljivo' : 'Public discoverable'}
                      hint={locale === 'sl' ? 'Ko je VKLOPLJENO, se to podjetje lahko prikaže v javnih rezultatih iskanja aplikacije za goste.' : 'When ON, this tenant can appear in guest-app public search results.'}
                    >
                      <GuestSegmentedToggle value={guestAppSettings.publicDiscoverable} onChange={(value) => setGuestAppSettings({ ...guestAppSettings, publicDiscoverable: value })} />
                    </GuestField>
                    <GuestField label={locale === 'sl' ? 'Javno ime' : 'Public name'}>
                      <input
                        className="gapp-input"
                        maxLength={GUEST_PUBLIC_NAME_MAX_LENGTH}
                        value={guestAppSettings.publicName}
                        onChange={(e) => setGuestAppSettings({ ...guestAppSettings, publicName: normalizePublicName(e.target.value) })}
                      />
                    </GuestField>
                    <GuestField label={locale === 'sl' ? 'Javno mesto' : 'Public city'}>
                      <input
                        className="gapp-input"
                        maxLength={GUEST_PUBLIC_CITY_MAX_LENGTH}
                        value={guestAppSettings.publicCity}
                        onChange={(e) => setGuestAppSettings({ ...guestAppSettings, publicCity: normalizePublicCity(e.target.value) })}
                      />
                    </GuestField>
                    <GuestField
                      label={locale === 'sl' ? 'Javni opis' : 'Public description'}
                      hint={locale === 'sl' ? 'Prikazano v iskanju gostov (1 vrstica, omejena dolžina).' : 'Shown in guest browse results (single line, limited length).'}
                    >
                      <input
                        className="gapp-input"
                        maxLength={GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH}
                        value={guestAppSettings.publicDescription}
                        onChange={(e) => setGuestAppSettings({ ...guestAppSettings, publicDescription: normalizePublicDescriptionInput(e.target.value) })}
                      />
                    </GuestField>
                  </div>
                  <div className="gapp-column">
                    <GuestField
                      label={locale === 'sl' ? 'Korak izbire zaposlenega' : 'Employee selection step'}
                      hint={locale === 'sl' ? 'Ko je VKLOPLJENO, gost po izbiri storitve v mobilni aplikaciji in spletnem gradniku izbere zaposlenega.' : 'When ON, guest clients pick an employee after choosing the service in the mobile app and website booking widget.'}
                    >
                      <GuestSegmentedToggle value={guestAppSettings.employeeSelectionStep} onChange={(value) => setGuestAppSettings({ ...guestAppSettings, employeeSelectionStep: value })} />
                    </GuestField>
                    <GuestField
                      label={locale === 'sl' ? 'Uporabi kontakt zaposlenega' : 'Use employee contact'}
                      hint={locale === 'sl' ? 'Ko je VKLOPLJENO, prihajajoče rezervacije na začetnem zaslonu gostov uporabijo telefon dodeljenega zaposlenega za Klic/Sporočilo, kjer je na voljo.' : 'When ON, upcoming bookings on guest Home use assigned employee phone for Call/Message when available.'}
                    >
                      <GuestSegmentedToggle value={guestAppSettings.useEmployeeContact} onChange={(value) => setGuestAppSettings({ ...guestAppSettings, useEmployeeContact: value })} />
                    </GuestField>
                    <GuestField label={locale === 'sl' ? 'Slika kartice v karuselu' : 'Carousel card image'}>
                      <GuestUploadDropzone
                        title={locale === 'sl' ? 'Povlecite sliko sem ali kliknite za izbiro' : 'Drag image here or click to choose'}
                        subtitle={locale === 'sl' ? 'PNG, JPG ali WebP · Priporočeno 16:9' : 'PNG, JPG or WebP · Recommended 16:9'}
                        hint={locale === 'sl' ? 'Naložite sliko, uporabljeno kot večji vizual kartice v karuselu podjetij v mobilni aplikaciji za goste.' : 'Upload image used as the large card visual on guest-mobile tenancy carousel.'}
                        currentUrl={guestAppSettings.cardImageUrl}
                        previewAlt="Current carousel card image"
                        previewShape="wide"
                        iconKind="image"
                        onFile={(selected) => void uploadGuestAppAsset('cardImageUrl', selected)}
                        uploading={uploadingGuestAsset === 'cardImageUrl'}
                      />
                    </GuestField>
                    <GuestField label={locale === 'sl' ? 'Logotip v karuselu' : 'Carousel logo'}>
                      <GuestUploadDropzone
                        title={locale === 'sl' ? 'Povlecite logotip sem ali kliknite za izbiro' : 'Drag logo here or click to choose'}
                        subtitle={locale === 'sl' ? 'PNG ali WebP · Priporočeno 512×512' : 'PNG or WebP · Recommended 512×512'}
                        hint={locale === 'sl' ? 'Naložite krožni logotip, prikazan čez kartico karusela v mobilni aplikaciji za goste.' : 'Upload circular logo shown over the guest-mobile carousel card.'}
                        currentUrl={guestAppSettings.logoImageUrl}
                        previewAlt="Current carousel logo image"
                        previewShape="round"
                        iconKind="logo"
                        onFile={(selected) => void uploadGuestAppAsset('logoImageUrl', selected)}
                        uploading={uploadingGuestAsset === 'logoImageUrl'}
                      />
                    </GuestField>
                  </div>
                </div>
                <div className="gapp-savebar">
                  <button type="button" className="gapp-primary-button" onClick={saveGuestAppConfiguration} disabled={savingSettings}>
                    <GuestSaveIcon />
                    {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
                  </button>
                </div>
              </>
            ) : guestAppSubtab === 'bookingRules' ? (
              <>
                <div className="gapp-form-grid">
                  <div className="gapp-column">
                    <GuestField label="Minimalni čas pred rezervacijo" hint="Najkasnejši čas pred začetkom termina, ko lahko gost opravi rezervacijo.">
                      <input className="gapp-input" value={guestBookingRules.minBookingNotice} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, minBookingNotice: e.target.value })} />
                    </GuestField>
                    <GuestField label="Maksimalni čas vnaprej" hint="Največje časovno obdobje vnaprej, za katero je mogoče ustvariti rezervacijo.">
                      <select className="gapp-select" value={guestBookingRules.maxAdvanceDays} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, maxAdvanceDays: e.target.value })}>
                        <option value="30">30 dni</option>
                        <option value="60">60 dni</option>
                        <option value="90">90 dni</option>
                        <option value="180">180 dni</option>
                      </select>
                    </GuestField>
                    <GuestField label="Odpoved rezervacije" hint="Ko je vklopljeno, lahko gostje odpovejo rezervacijo po pravilih odpovedi.">
                      <GuestSegmentedToggle value={guestBookingRules.cancellationEnabled} onChange={(value) => setGuestBookingRules({ ...guestBookingRules, cancellationEnabled: value })} />
                    </GuestField>
                    <GuestField label="Brezplačna odpoved do" hint="Gost lahko odpove brez stroškov do izteka nastavljenega časa pred terminom.">
                      <input className="gapp-input" value={`${guestBookingRules.freeCancelUntilHours} ur`} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, freeCancelUntilHours: e.target.value.replace(/[^0-9]/g, '') })} />
                    </GuestField>
                    <div className="gapp-inline-switch-row">
                      <GuestSwitch checked={guestBookingRules.autoConfirmReservation} onChange={(checked) => setGuestBookingRules({ ...guestBookingRules, autoConfirmReservation: checked })} />
                      <div>
                        <span className="gapp-label">Samodejna potrditev rezervacije</span>
                        <span className="gapp-hint">Ko je vklopljeno, se rezervacije samodejno potrdijo, če ni potrebna ročna odobritev.</span>
                      </div>
                    </div>
                    <GuestField label="Varnostni čas pred terminom" hint="Dodatni čas pred začetkom termina za pripravo storitve.">
                      <input className="gapp-input" value={`${guestBookingRules.bufferBeforeMinutes} min`} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, bufferBeforeMinutes: e.target.value.replace(/[^0-9]/g, '') })} />
                    </GuestField>
                    <GuestField label="Varnostni čas po terminu" hint="Dodatni čas po koncu termina za zaključek in čiščenje.">
                      <input className="gapp-input" value={`${guestBookingRules.bufferAfterMinutes} min`} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, bufferAfterMinutes: e.target.value.replace(/[^0-9]/g, '') })} />
                    </GuestField>
                  </div>
                  <div className="gapp-column">
                    <GuestField label="Politika za no-show" hint="Izberite, kako ravnati v primeru, da se gost ne pojavi.">
                      <select className="gapp-select" value={guestBookingRules.noShowPolicy} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, noShowPolicy: e.target.value })}>
                        <option value="charge_deposit">Zaračunaj polog</option>
                        <option value="consume_credit">Porabi dobroimetje</option>
                        <option value="mark_only">Samo označi no-show</option>
                      </select>
                    </GuestField>
                    <GuestField label="Pravila vračila" hint="Vračila se obdelajo samodejno na podlagi pravil odpovedi.">
                      <select className="gapp-select" value={guestBookingRules.refundPolicy} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, refundPolicy: e.target.value })}>
                        <option value="auto_by_cancellation_deadline">Samodejno glede na rok odpovedi</option>
                        <option value="manual_review">Ročni pregled</option>
                        <option value="no_refund_after_payment">Brez vračila po plačilu</option>
                      </select>
                    </GuestField>
                    <GuestField label="Besedilo pravil" hint="To besedilo se prikaže gostu v aplikaciji pri postopku rezervacije.">
                      <textarea className="gapp-textarea" rows={5} value={guestBookingRules.policyText} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, policyText: e.target.value })} />
                    </GuestField>
                  </div>
                </div>
                <div className="gapp-savebar">
                  <button type="button" className="gapp-primary-button" onClick={saveGuestAppConfiguration} disabled={savingSettings}>
                    <GuestSaveIcon />
                    {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
                  </button>
                </div>
              </>
            ) : guestAppSubtab === 'paymentMethods' ? (
              <>
                <div className="gapp-grid gapp-payment-layout">
                  <div className="gapp-pane">
                    <div className="gapp-section-heading">
                      <h3>Sprejeti načini plačila</h3>
                      <p>Izberite, katere načine plačila želite omogočiti gostom.</p>
                    </div>
                    <div className="gapp-payment-list">
                      {GUEST_PAYMENT_METHOD_OPTIONS.map((method) => (
                        <div className="gapp-payment-row" key={method.id}>
                          <span className="gapp-payment-icon"><GuestPaymentMethodIcon kind={method.id} /></span>
                          <strong>{method.label}</strong>
                          <GuestSwitch checked={guestAppSettings.acceptedPaymentMethodIds.includes(method.id)} onChange={() => toggleGuestPaymentMethod(method.id)} />
                        </div>
                      ))}
                    </div>
                    <div className="gapp-payment-toggle-row">
                      <div className="gapp-payment-toggle-card">
                        <div className="gapp-toggle-head">
                          <span className="gapp-label">Delno plačilo</span>
                          <GuestSwitch
                            checked={guestBookingRules.paymentRequirement === 'deposit'}
                            onChange={(checked) => {
                              setGuestBookingRules({ ...guestBookingRules, paymentRequirement: checked ? 'deposit' : 'full' })
                            }}
                          />
                        </div>
                        <span className="gapp-hint">Ko je izklopljeno, se samodejno zaračuna polni znesek.</span>
                        {guestBookingRules.paymentRequirement === 'deposit' ? (
                          <GuestField
                            className="gapp-deposit-field"
                            label="Znesek pologa"
                            hint="Odstotek od skupnega zneska, ki ga gost plača ob rezervaciji."
                          >
                            <div className="gapp-deposit-input-wrap">
                              <input
                                className="gapp-deposit-input"
                                value={guestBookingRules.depositPercent}
                                onChange={(e) => setGuestBookingRules({ ...guestBookingRules, depositPercent: e.target.value.replace(/[^0-9]/g, '') })}
                              />
                              <span className="gapp-deposit-input-suffix">%</span>
                            </div>
                          </GuestField>
                        ) : null}
                      </div>
                      <div className="gapp-payment-toggle-card">
                        <div className="gapp-toggle-head">
                          <span className="gapp-label">Plačilo na lokaciji</span>
                          <GuestSwitch
                            checked={guestAppSettings.paymentOnLocation}
                            onChange={(checked) => {
                              setGuestAppSettings({ ...guestAppSettings, paymentOnLocation: checked })
                              setGuestBookingRules((prev) => normalizeBookingRulesForPaymentLocation(prev, checked))
                            }}
                          />
                        </div>
                        <span className="gapp-hint">Ko je vklopljeno, gost rezervira brez spletnega plačila in poravna na lokaciji.</span>
                      </div>
                    </div>
                  </div>
                  <div className="gapp-pane gapp-divider-pane gapp-provider-card">
                    <div className="gapp-section-heading">
                      <h3>Ponudnik spletnega plačila</h3>
                      <p>Tenant poveže svoj Stripe račun. Platformni ključi so v Platform Admin → Payment providers → Stripe.</p>
                    </div>
                    <GuestField label="Ponudnik">
                      <select className="gapp-select" value={guestAppSettings.paymentProvider} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, paymentProvider: e.target.value })}>
                        <option value="stripe">Stripe Connect</option>
                        <option value="paypal">PayPal</option>
                        <option value="bankart">Bankart</option>
                      </select>
                    </GuestField>
                    {guestAppSettings.paymentProvider === 'stripe' ? (
                      <>
                        <div className="gapp-payment-toggle-row">
                          <GuestField label="Okolje" hint="Sandbox je za testiranje. Production uporabite šele po vnosu live ključev v Platform Admin.">
                            <select
                              className="gapp-select"
                              value={stripeConnectStatus?.activeMode || 'sandbox'}
                              onChange={(e) => void saveStripePreference({ mode: e.target.value })}
                            >
                              <option value="sandbox">Sandbox</option>
                              <option value="production">Production</option>
                            </select>
                          </GuestField>
                          <GuestField label="Država računa" hint="Stripe to uporabi pri ustvarjanju povezanega računa.">
                            <input
                              className="gapp-input"
                              maxLength={2}
                              value={stripeConnectStatus?.country || 'SI'}
                              onChange={(e) => void saveStripePreference({ country: e.target.value.toUpperCase() })}
                            />
                          </GuestField>
                        </div>
                        <GuestField label="Tip poslovanja">
                          <select
                            className="gapp-select"
                            value={stripeConnectStatus?.businessType || 'company'}
                            onChange={(e) => void saveStripePreference({ businessType: e.target.value })}
                          >
                            <option value="company">Podjetje</option>
                            <option value="individual">Fizična oseba / samozaposlen</option>
                            <option value="non_profit">Neprofitna organizacija</option>
                          </select>
                        </GuestField>
                        <div>
                          <span className="gapp-label">Stripe Connect status</span>
                          <div style={{ marginTop: 10 }}>
                            <span className={activeStripeAccount?.chargesEnabled ? 'gapp-status-pill' : 'billing-pill billing-pill--neutral'}>
                              {activeStripeAccount?.chargesEnabled ? '✓ ' : ''}{stripeStatusLabel}
                            </span>
                          </div>
                          <span className="gapp-hint" style={{ marginTop: 10 }}>
                            Account ID: {activeStripeAccount?.accountId || '—'} · Charges: {activeStripeAccount?.chargesEnabled ? 'ON' : 'OFF'} · Payouts: {activeStripeAccount?.payoutsEnabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <div className="gapp-qr-actions" style={{ justifyContent: 'flex-start' }}>
                          <button type="button" className="gapp-primary-button" onClick={() => void startStripeOnboarding()} disabled={startingStripeOnboarding}>
                            {startingStripeOnboarding ? 'Odpiram Stripe…' : activeStripeAccount?.connected ? 'Nadaljuj Stripe onboarding' : 'Poveži Stripe'}
                          </button>
                          <button type="button" className="gapp-outline-button" onClick={() => void refreshStripeConnectStatus()} disabled={refreshingStripeStatus || !activeStripeAccount?.connected}>
                            {refreshingStripeStatus ? 'Osvežujem…' : 'Osveži status'}
                          </button>
                        </div>
                        <div className="gapp-security-note">
                          <GuestShieldIcon />
                          <div>
                            <strong>Stripe zbira občutljive podatke</strong>
                            <p>Tenant se onboarda na Stripe hosted strani. Calendra shrani samo connected account ID in status; IBAN, KYC in dokumenti ostanejo pri Stripe.</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="gapp-security-note">
                        <GuestShieldIcon />
                        <div>
                          <strong>Varnost na prvem mestu</strong>
                          <p>Vsa kartična plačila potekajo varno preko izbranega ponudnika. Podatki o karticah nikoli niso shranjeni v našem sistemu.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="gapp-savebar">
                  <button type="button" className="gapp-primary-button" onClick={saveGuestAppConfiguration} disabled={savingSettings}>
                    <GuestSaveIcon />
                    {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="gapp-grid gapp-qr-layout">
                  <div className="gapp-column">
                    <GuestField label="Povezava za goste" hint="To je povezava, na katero bo uporabnik preusmerjen po skeniranju QR kode.">
                      <div className="gapp-link-input-wrap">
                        <input className="gapp-input" value={guestQrInputLink} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, qrGuestUrl: e.target.value })} />
                        <button type="button" className="gapp-input-icon-button gapp-link-copy-button" onClick={() => void copyGuestQrLink()} aria-label="Kopiraj povezavo"><GuestCopyIcon /></button>
                      </div>
                    </GuestField>
                    <GuestField label="Velikost QR kode" hint="Izberite velikost QR kode za najboljšo kakovost.">
                      <select className="gapp-select" value={guestAppSettings.qrSize} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, qrSize: e.target.value })}>
                        <option value="512 x 512">512 x 512</option>
                        <option value="1024 x 1024">1024 x 1024</option>
                        <option value="2048 x 2048">2048 x 2048</option>
                      </select>
                    </GuestField>
                    <GuestField label="Barva QR kode" hint="Izberite barvo modulov QR kode.">
                      <div className="gapp-color-input">
                        <input type="color" value={guestQrColor} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, qrColor: e.target.value })} />
                        <input className="gapp-input" value={guestQrColor} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, qrColor: e.target.value })} />
                      </div>
                    </GuestField>
                  </div>
                  <div className="gapp-qr-preview-panel">
                    <div>
                      <span className="gapp-label">Predogled QR kode</span>
                      <div className="gapp-qr-card">
                        {guestQrMatrix ? (
                          <div className="gapp-qr-frame" aria-label={guestQrTitle}>
                            <svg className="gapp-qr-svg" viewBox={`0 0 ${guestQrViewBoxSize} ${guestQrViewBoxSize}`} role="img" aria-label={guestQrTitle}>
                              <title>{guestQrTitle}</title>
                              <rect width="100%" height="100%" fill="#fff" />
                              <path d={guestQrPath} fill={guestQrColor} />
                            </svg>
                          </div>
                        ) : (
                          <EmptyState title="QR koda ni na voljo" text="Povezava je predolga ali ni veljavna za prikaz QR kode." />
                        )}
                        <div className="gapp-qr-actions">
                          <button type="button" className="gapp-outline-button" onClick={saveGuestQrPng} disabled={!guestQrMatrix}><GuestDownloadIcon /> Prenesi PNG</button>
                          <button type="button" className="gapp-outline-button" onClick={saveGuestQrSvg} disabled={!guestQrMatrix}><GuestDownloadIcon /> Prenesi SVG</button>
                          <button type="button" className="gapp-outline-button" onClick={saveGuestQrPdf} disabled={!guestQrMatrix}><GuestDownloadIcon /> Prenesi PDF</button>
                        </div>
                      </div>
                    </div>
                    <div className="gapp-help-panel">
                      <GuestInfoIcon />
                      <div>
                        <strong>Kje lahko uporabite QR kodo?</strong>
                        <ul>
                          <li>Na spletni strani in v e-poštnih podpisih</li>
                          <li>Na vizitkah, letakih in promocijskih gradivih</li>
                          <li>V salonu, na recepciji ali na informacijskih tablah</li>
                          <li>V družbenih omrežjih in oglasih</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="gapp-savebar">
                  <button type="button" className="gapp-primary-button" onClick={saveGuestAppConfiguration} disabled={savingSettings}>
                    <GuestSaveIcon />
                    {savingSettings ? t('formSaving') : t('configSaveConfiguration')}
                  </button>
                </div>
              </>
            )}
          </div>
        </Card>
      ) : tab === 'notifications' ? (
        <ConfigurationNotificationsSection
          settings={settings}
          setSettings={setSettings}
          savingSettings={savingSettings}
          onSave={saveSettings}
          t={t}
        />
      ) : tab === 'googleCalendar' ? (
        <GoogleCalendarIntegrationSection me={me} />
      ) : tab === 'whatsapp' ? (
        <ConfigurationWhatsAppSection
          settings={settings}
          setSettings={setSettings}
          savingSettings={savingSettings}
          onSave={saveSettings}
          t={t}
          globallyEnabled={inboxGlobalCapabilities.whatsappEnabled}
        />
      ) : tab === 'viber' ? (
        <ConfigurationViberSection
          settings={settings}
          setSettings={setSettings}
          savingSettings={savingSettings}
          onSave={saveSettings}
          t={t}
          globallyEnabled={inboxGlobalCapabilities.viberEnabled}
        />
      ) : tab === 'modules' && modulesDraftDisplay ? (
        <Card className="settings-card">
          <SectionTitle>{t('tabModules')}</SectionTitle>
          <p className="muted">{t('configModulesSectionIntro')}</p>
          <div className="config-booking-modules" style={{ marginTop: 4 }}>
            <div className="stack gap-sm">
              <div className="config-module-row">
                <div className="config-module-name">
                  <strong>Guest App</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.guestAppEnabled ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, guestAppEnabled: !d.guestAppEnabled }
                    })
                  }
                >
                  {modulesDraftDisplay.guestAppEnabled ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-spaces" t={t} />
                  <strong>{t('configModulesSpacesLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.SPACES_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, SPACES_ENABLED: d.SPACES_ENABLED === 'true' ? 'false' : 'true' }
                    })
                  }
                >
                  {modulesDraftDisplay.SPACES_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-availability" t={t} />
                  <strong>{t('configModulesAvailabilityLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.BOOKABLE_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, BOOKABLE_ENABLED: d.BOOKABLE_ENABLED === 'true' ? 'false' : 'true' }
                    })
                  }
                >
                  {modulesDraftDisplay.BOOKABLE_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-ai" t={t} />
                  <strong>{t('configModulesAiLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.AI_BOOKING_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, AI_BOOKING_ENABLED: d.AI_BOOKING_ENABLED === 'false' ? 'true' : 'false' }
                    })
                  }
                >
                  {modulesDraftDisplay.AI_BOOKING_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-personal" t={t} />
                  <strong>{t('configModulesPersonalLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.PERSONAL_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, PERSONAL_ENABLED: d.PERSONAL_ENABLED === 'false' ? 'true' : 'false' }
                    })
                  }
                >
                  {modulesDraftDisplay.PERSONAL_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-todos" t={t} />
                  <strong>{t('configModulesTodosLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.TODOS_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, TODOS_ENABLED: d.TODOS_ENABLED === 'false' ? 'true' : 'false' }
                    })
                  }
                >
                  {modulesDraftDisplay.TODOS_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-multi-space" t={t} />
                  <strong>{t('configModulesMultipleSessionsPerSpaceLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return {
                        ...d,
                        MULTIPLE_SESSIONS_PER_SPACE_ENABLED: d.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true' ? 'false' : 'true',
                      }
                    })
                  }
                >
                  {modulesDraftDisplay.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-multi-client" t={t} />
                  <strong>{t('configModulesMultipleClientsPerSessionLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return {
                        ...d,
                        MULTIPLE_CLIENTS_PER_SESSION_ENABLED: d.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true' ? 'false' : 'true',
                      }
                    })
                  }
                >
                  {modulesDraftDisplay.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-groups" t={t} />
                  <strong>{t('configModulesGroupBookingLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={modulesDraftDisplay.GROUP_BOOKING_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setModulesDraft((prev) => {
                      const d = prev ?? buildModulesDraftFromCommitted(settings, guestAppSettings)
                      return { ...d, GROUP_BOOKING_ENABLED: d.GROUP_BOOKING_ENABLED === 'true' ? 'false' : 'true' }
                    })
                  }
                >
                  {modulesDraftDisplay.GROUP_BOOKING_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
            </div>
            <div className="form-actions config-modules-save">
              <button type="button" onClick={() => void saveSettings({ applyModulesDraft: true })} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configSaveConfiguration')}</button>
            </div>
          </div>
        </Card>
      ) : tab === 'security' ? (
        <SecurityPage embedded />
      ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

