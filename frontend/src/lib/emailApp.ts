import { Capacitor } from '@capacitor/core'

type EmailProviderConfig = {
  webInboxUrl: string
  nativeScheme?: string
}

const EMAIL_PROVIDER_MAP: Record<string, EmailProviderConfig> = {
  'gmail.com': {
    webInboxUrl: 'https://mail.google.com/mail/u/0/#inbox',
    nativeScheme: 'googlegmail://',
  },
  'googlemail.com': {
    webInboxUrl: 'https://mail.google.com/mail/u/0/#inbox',
    nativeScheme: 'googlegmail://',
  },
  'outlook.com': {
    webInboxUrl: 'https://outlook.live.com/mail/0/inbox',
    nativeScheme: 'ms-outlook://',
  },
  'hotmail.com': {
    webInboxUrl: 'https://outlook.live.com/mail/0/inbox',
    nativeScheme: 'ms-outlook://',
  },
  'live.com': {
    webInboxUrl: 'https://outlook.live.com/mail/0/inbox',
    nativeScheme: 'ms-outlook://',
  },
  'msn.com': {
    webInboxUrl: 'https://outlook.live.com/mail/0/inbox',
    nativeScheme: 'ms-outlook://',
  },
  'icloud.com': {
    webInboxUrl: 'https://www.icloud.com/mail',
    nativeScheme: 'message://',
  },
  'me.com': {
    webInboxUrl: 'https://www.icloud.com/mail',
    nativeScheme: 'message://',
  },
  'mac.com': {
    webInboxUrl: 'https://www.icloud.com/mail',
    nativeScheme: 'message://',
  },
  'yahoo.com': {
    webInboxUrl: 'https://mail.yahoo.com/d/folders/1',
    nativeScheme: 'ymail://',
  },
  'aol.com': {
    webInboxUrl: 'https://mail.aol.com',
  },
  'proton.me': {
    webInboxUrl: 'https://mail.proton.me/u/0/inbox',
  },
  'protonmail.com': {
    webInboxUrl: 'https://mail.proton.me/u/0/inbox',
  },
  'zoho.com': {
    webInboxUrl: 'https://mail.zoho.com/zm/',
  },
}

function getEmailDomain(email: string): string {
  const normalized = email.trim().toLowerCase()
  const atIndex = normalized.lastIndexOf('@')
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : ''
}

function getProviderConfig(email: string): EmailProviderConfig | null {
  const domain = getEmailDomain(email)
  if (!domain) return null
  return EMAIL_PROVIDER_MAP[domain] ?? null
}

function openUrl(target: string): void {
  window.open(target, '_blank', 'noopener,noreferrer')
}

export function openEmailApp(email: string): void {
  const provider = getProviderConfig(email)

  if (Capacitor.isNativePlatform()) {
    if (provider?.nativeScheme) {
      window.location.href = provider.nativeScheme
      return
    }
    window.location.href = 'message://'
    return
  }

  if (provider?.webInboxUrl) {
    openUrl(provider.webInboxUrl)
    return
  }

  openUrl('mailto:')
}

export function getEmailProviderName(email: string): string | null {
  const domain = getEmailDomain(email)
  if (!domain) return null

  switch (domain) {
    case 'gmail.com':
    case 'googlemail.com':
      return 'Gmail'
    case 'outlook.com':
    case 'hotmail.com':
    case 'live.com':
    case 'msn.com':
      return 'Outlook'
    case 'icloud.com':
    case 'me.com':
    case 'mac.com':
      return 'iCloud Mail'
    case 'yahoo.com':
      return 'Yahoo Mail'
    case 'proton.me':
    case 'protonmail.com':
      return 'Proton Mail'
    case 'zoho.com':
      return 'Zoho Mail'
    case 'aol.com':
      return 'AOL Mail'
    default:
      return domain
  }
}