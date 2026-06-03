import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { hasBillingAccess, hasInboxAccess } from '../lib/packageAccess'
import type { User } from '../lib/types'
import {
  clearOnboardingTourPending,
  hasPendingOnboardingTour,
  isOnboardingTourCompleted,
  markOnboardingTourCompleted,
} from '../lib/onboardingTour'

type OnboardingStepId =
  | 'welcome'
  | 'calendar'
  | 'clients'
  | 'billing'
  | 'inbox'
  | 'analytics'
  | 'services'
  | 'employees'
  | 'configuration'

type OnboardingStep = {
  id: OnboardingStepId
  path: string
  title: string
  body: string
  badge?: string
  spotlight: string
}

type OnboardingTourProps = {
  user: User
  billingModuleEnabled: boolean
  inboxModuleEnabled: boolean
  servicesModuleEnabled: boolean
  employeesModuleEnabled: boolean
  configurationModuleEnabled: boolean
  ready?: boolean
}

function buildSteps({
  user,
  billingModuleEnabled,
  inboxModuleEnabled,
  servicesModuleEnabled,
  employeesModuleEnabled,
  configurationModuleEnabled,
}: OnboardingTourProps): OnboardingStep[] {
  const billingAllowed = hasBillingAccess(user.packageType) && billingModuleEnabled
  const inboxAllowed = hasInboxAccess(user.packageType) && inboxModuleEnabled

  return [
    {
      id: 'welcome',
      path: '/calendar',
      title: 'Welcome to Calendra',
      body: 'Let’s take a quick tour of your workspace. In just a few steps, we’ll show you where to manage bookings, clients, billing, messages, analytics, services, employees, and settings.',
      spotlight: 'calendar',
    },
    {
      id: 'calendar',
      path: '/calendar',
      title: 'Calendar page',
      body: 'This is your booking hub. View your schedule, switch between calendar views, create new bookings, and keep track of upcoming sessions at a glance.',
      spotlight: 'calendar',
    },
    {
      id: 'clients',
      path: '/clients',
      title: 'Clients page',
      body: 'Store all client details in one place. View contact information, notes, history, memberships, and balances so every interaction stays organized.',
      spotlight: 'clients',
    },
    ...(billingAllowed
      ? [{
          id: 'billing' as const,
          path: '/billing',
          title: 'Billing page',
          body: 'Manage invoices, open bills, payments, discounts, and document history from here. This module is available for Business package and above.',
          badge: 'Business+ only',
          spotlight: 'billing',
        }]
      : []),
    ...(inboxAllowed
      ? [{
          id: 'inbox' as const,
          path: '/inbox',
          title: 'Inbox page',
          body: 'Send and manage messages across channels. Use templates, follow conversations, and keep email, SMS, and in-app communication in one place.',
          spotlight: 'inbox',
        }]
      : []),
    {
      id: 'analytics',
      path: '/analytics',
      title: 'Analytics page',
      body: 'Track bookings, revenue, client activity, and business trends. Use analytics to understand performance and make better decisions.',
      spotlight: 'analytics',
    },
    ...(servicesModuleEnabled
      ? [{
          id: 'services' as const,
          path: '/session-types',
          title: 'Services page',
          body: 'Create and manage your services. Set names, durations, prices, availability, and online booking options for each offering.',
          spotlight: 'services',
        }]
      : []),
    ...(employeesModuleEnabled
      ? [{
          id: 'employees' as const,
          path: '/consultants',
          title: 'Employees page',
          body: 'Add your team, assign services, manage schedules, and control permissions so everyone has the right access.',
          spotlight: 'employees',
        }]
      : []),
    ...(configurationModuleEnabled
      ? [{
          id: 'configuration' as const,
          path: '/configuration',
          title: 'Configuration page',
          body: 'Configure your workspace here. Manage company information, integrations, notifications, invoice settings, and other preferences in one place.',
          spotlight: 'configuration',
        }]
      : []),
  ]
}

function getPathnameWithoutTrailingSlash(pathname: string) {
  if (pathname !== '/' && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

export function OnboardingTour(props: OnboardingTourProps) {
  const { user, billingModuleEnabled, inboxModuleEnabled, servicesModuleEnabled, employeesModuleEnabled, configurationModuleEnabled, ready = true } = props
  const navigate = useNavigate()
  const location = useLocation()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const steps = useMemo(() => buildSteps(props), [user.packageType, billingModuleEnabled, inboxModuleEnabled, servicesModuleEnabled, employeesModuleEnabled, configurationModuleEnabled])
  const step = steps[stepIndex]
  const total = steps.length
  const currentNumber = stepIndex + 1

  useEffect(() => {
    if (!ready) return
    if (!hasPendingOnboardingTour()) return
    if (isOnboardingTourCompleted(user.id, user.companyId)) {
      clearOnboardingTourPending()
      return
    }
    if (!steps.length) return
    setActive(true)
    setStepIndex(0)
    if (getPathnameWithoutTrailingSlash(location.pathname) !== steps[0].path) {
      navigate(steps[0].path, { replace: true })
    }
    // This should only decide whether to start the pending tour when the shell/user is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user.id, user.companyId, steps.length])

  useEffect(() => {
    if (!active || !step) return
    const currentPath = getPathnameWithoutTrailingSlash(location.pathname)
    if (currentPath !== step.path) {
      navigate(step.path, { replace: true })
    }
  }, [active, location.pathname, navigate, step])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishTour()
      if (event.key === 'ArrowRight') goNext()
      if (event.key === 'ArrowLeft') goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, total])

  const finishTour = () => {
    markOnboardingTourCompleted(user.id, user.companyId)
    setActive(false)
  }

  const goNext = () => {
    if (stepIndex >= total - 1) {
      finishTour()
      return
    }
    setStepIndex((current) => Math.min(current + 1, total - 1))
  }

  const goBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  if (!active || !step) return null

  return createPortal(
    <div className={`onboarding-tour onboarding-tour--${step.spotlight}`} role="dialog" aria-modal="true" aria-labelledby="onboarding-tour-title">
      <div className="onboarding-tour__veil" />
      <section className={`onboarding-tour__card onboarding-tour__card--${step.id}`}>
        <div className="onboarding-tour__progress-row" aria-label={`Step ${currentNumber} of ${total}`}>
          <span className="onboarding-tour__step-badge">{currentNumber}</span>
          <div className="onboarding-tour__progress-track" aria-hidden>
            {steps.map((tourStep, index) => (
              <span
                key={tourStep.id}
                className={index <= stepIndex ? 'onboarding-tour__progress-segment is-complete' : 'onboarding-tour__progress-segment'}
              />
            ))}
          </div>
        </div>
        <div className="onboarding-tour__headline-row">
          <h2 id="onboarding-tour-title">{step.title}</h2>
          {step.badge && <span className="onboarding-tour__badge">{step.badge}</span>}
        </div>
        <p>{step.body}</p>
        <div className="onboarding-tour__step-label">Step {currentNumber} of {total}</div>
        <div className="onboarding-tour__divider" />
        <div className="onboarding-tour__actions">
          {stepIndex > 0 && (
            <button type="button" className="onboarding-tour__button onboarding-tour__button--secondary" onClick={goBack}>
              Back
            </button>
          )}
          {stepIndex < total - 1 && (
            <button type="button" className="onboarding-tour__button onboarding-tour__button--secondary" onClick={finishTour}>
              Skip tour
            </button>
          )}
          <button type="button" className="onboarding-tour__button onboarding-tour__button--primary" onClick={goNext}>
            {stepIndex === total - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
