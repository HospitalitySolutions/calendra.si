import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import resourcePlugin from '@fullcalendar/resource'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import resourceDayGridPlugin from '@fullcalendar/resource-daygrid'
import { SpeechRecognition as NativeSpeechRecognition } from '@capacitor-community/speech-recognition'
import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useId,
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useCalendarShellHeader } from '../../calendarHeaderContext'
import {
  CalendarHeaderDateNav,
  CalendarHeaderDateNavArrows,
  CalendarHeaderFilters,
  CalendarHeaderModeGroup,
  CalendarHeaderViewDropdown,
  CalendarRailIconFilters,
  goToThreeDayViewWithTodayCentered,
} from '../../components/CalendarWebShellHeader'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  buildNewSlotSearchParams,
  isCalendarFormPath,
  isLegacyNewSlotPath,
  matchCalendarFormRoute,
  mergeNewBookingAndAvailabilitySearch,
  parseAvailabilityQuery,
  parseNewSlotQuery,
  pathForNewForm,
  ROUTE_NEW_BOOKING,
  type AvailabilityFormQuery,
  type NewSlotQuery,
} from '../calendarFormRoutes'
import { api } from '../../api'
import { setPostZoomReturnPath } from '../../lib/session'
import { getStoredUser } from '../../auth'
import { Card, Field, PageHeader } from '../../components/ui'
import { currency, formatDateTime, fullName, parseClientNameInput, personInitials } from '../../lib/format'
import { applyTheme, clearAuthStoragePreservingTheme, getStoredTheme, type ThemeMode } from '../../theme'
import { useLocale } from '../../locale'
import { calendarBookingPanelHelpId, helpAria, helpTitle, helpTooltip } from '../../helpContent'
import { LanguageModal } from '../../components/LanguageModal'
import { GuestConfigSaveIcon } from '../../components/GuestConfigSaveIcon'
import { type BookingPayeeDraft } from '../../components/BookingPayeePanel'
import { canIssueAdvanceInvoices, canIssueOpenInvoices } from '../../lib/employeePermissions'
import { useToast } from '../../components/Toast'
import { subscribeBookingUpdates } from '../../lib/bookingRealtime'
import { consultantDayWindow, parseHmToMinutes as whWindowParseHm, windowToDayMs } from '../../lib/consultantWorkingHours'
import { dayOptions, type BookingPaymentAllocation, type BookingPaymentStatus, type BookingPaymentStatusValue } from '../../lib/types'

import {
  ANDROID_PINCH_ZOOM_MAX,
  ANDROID_PINCH_ZOOM_MIN,
  AVAILABILITY_BLOCK_TASK,
  AVAILABILITY_BLOCK_METADATA_PREFIX,
  CALENDAR_META_POLL_MS,
  CALENDAR_POLL_MS,
  CONSULTANT_RESOURCE_UNASSIGNED_ID,
  DATE_SET_CALENDAR_DEBOUNCE_MS,
  FULLCALENDAR_LOCALES,
  PERSONAL_TASK_PRESETS_KEY,
  SPACE_RESOURCE_UNASSIGNED_ID,
  WORKING_HOURS_FALLBACK_KEY,
  isNativeAndroid,
} from './calendarConstants'
import {
  formatRepeatWeekdayLabel,
  isLocalBookingAllDay,
  isLocalTodoAllDayStart,
  localTodayYmd,
  splitLocalDateTimeParts,
  REPEAT_WEEKDAY_EN,
} from './calendarDateTime'
import {
  allowedStoredTargetsForDerivedStatus,
  validateStoredBookingStatusUpdate,
  bookingStatusDisplayLabel,
  bookingStatusTagColors,
  deriveBookingStatus,
  filterHiddenStatusesFromCalendarPayload,
  normalizeStoredBookingStatus,
  type BookingStatusUpdateValidationReason,
  type DerivedBookingStatus,
  type StoredBookingStatus,
} from './calendarStatus'
import type { ConfirmNonBookableEditPayload, ConfirmNonBookableState } from './calendarTypes'
import {
  isWebTimeGridLikeView,
  newClientInitials,
  slovenianTerminCountForm,
  toIsoDateKey,
  truncateCalendarHolidayPillText,
} from './calendarUtils'
import { CalendarFormFooterDeleteIcon, CalendarFormFooterSaveIcon, BookingTypeTabIcon, CalendarScannerIcon } from './components/CalendarIcons'
import { CalendarLocalTimeDateRow, CalendarLocalTimespanRow } from './components/CalendarLocalDateTimeRows'
import { PersonalTaskCombo } from './components/PersonalTaskCombo'
import { SessionNotesTextarea } from './components/SessionNotesTextarea'
import { CalendarSessionModals } from './components/CalendarSessionModals'
import {
  CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX,
  useCalendarCompactHeader,
  useCalendarConsultantResourceInitialsLayout,
  useCalendarDateNavArrowsInRail,
  useCalendarFiltersBottomBar,
  useCalendarMobileHeaderNav,
} from './hooks/useCalendarHeaderBreakpoints'

const EmbeddedBillingPage = lazy(() =>
  import('../BillingPage').then((module) => ({ default: module.BillingPage })),
)
const EmbeddedClientsPage = lazy(() =>
  import('../ClientsPage').then((module) => ({ default: module.ClientsPage })),
)

function CalendarPaymentPersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.8 20a6.2 6.2 0 0 1 12.4 0" />
    </svg>
  )
}

function CalendarPaymentCompanyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 20V6.8A1.8 1.8 0 0 1 8.3 5h7.4a1.8 1.8 0 0 1 1.8 1.8V20" />
      <path d="M4.5 20h15" />
      <path d="M9.5 9h1M13.5 9h1M9.5 12.5h1M13.5 12.5h1M10 20v-3.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20" />
    </svg>
  )
}

export default function CalendarPage() {

  const navigate = useNavigate()
  const location = useLocation()
  const { locale, t } = useLocale()
  const { showToast } = useToast()
  const isAndroidWeb = !isNativeAndroid && /Android/i.test(window.navigator.userAgent || '')
  const calendarLocaleTag = locale === 'sl' ? 'sl-SI' : 'en-GB'
  const voiceRecognitionLang = locale === 'sl' ? 'sl-SI' : 'en-US'
  const { setSlots: setShellCalendarSlots } = useCalendarShellHeader()
  const user = getStoredUser()!
  const isTenantAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  const canIssueOpenInvoice = canIssueOpenInvoices(user)
  const canIssueAdvanceInvoice = canIssueAdvanceInvoices(user)
  const [calendarData, setCalendarData] = useState<any>({ booked: [], bookable: [] })
  const [settings, setSettings] = useState<Record<string, string>>({})
  const personalModuleEnabled = settings.PERSONAL_ENABLED !== 'false'
  const todosModuleEnabled = settings.TODOS_ENABLED !== 'false'
  const noShowModuleEnabled = settings.NO_SHOW_ENABLED !== 'false'
  const [meta, setMeta] = useState({ clients: [], users: [], spaces: [], types: [] } as any)
  const EMPTY_ARR: any[] = useMemo(() => [], [])
  const metaUsers: any[] = Array.isArray(meta.users) ? meta.users : EMPTY_ARR
  const metaSpaces: any[] = Array.isArray(meta.spaces) ? meta.spaces : EMPTY_ARR
  const metaClients: any[] = Array.isArray(meta.clients) ? meta.clients : EMPTY_ARR
  const metaTypes: any[] = Array.isArray(meta.types) ? meta.types : EMPTY_ARR
  const multipleClientsPerSessionEnabled = settings.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true'
  /** Settings map values are usually strings; tolerate booleans / casing so group mode does not silently break. */
  const groupBookingEnabled = (() => {
    const v = settings.GROUP_BOOKING_ENABLED as unknown
    if (v === true) return true
    if (typeof v === 'string') return v.trim().toLowerCase() === 'true'
    return false
  })()
  const [bookingGroupMode, setBookingGroupMode] = useState(false)
  const selectableMetaTypes: any[] = useMemo(
    () => metaTypes.filter((type: any) => type?.active !== false && (!bookingGroupMode || type?.groupBookingEnabled === true)),
    [metaTypes, bookingGroupMode],
  )
  const metaConsultants = useMemo(() => metaUsers.filter((u: any) => u.consultant), [metaUsers])
  /** Hide Zaposleni when admin has no real choice (0–1 consultants). */
  const showBookingConsultantRow = isTenantAdmin && metaConsultants.length > 1
  /** Hide Prostor when there is no real choice (0–1 spaces). */
  const showBookingSpaceRow = settings.SPACES_ENABLED !== 'false' && metaSpaces.length > 1
  /** Hide Storitev (+ bundled Online on web) when no session types exist. */
  const showBookingTypeRow = settings.TYPES_ENABLED !== 'false' && selectableMetaTypes.length > 0
  const metaGroups: any[] = Array.isArray(meta.groups) ? meta.groups : EMPTY_ARR
  const [groupSearch, setGroupSearch] = useState('')
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false)
  const [editingGroupSearch, setEditingGroupSearch] = useState(false)
  const groupSearchInputRef = useRef<HTMLInputElement>(null)
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [newGroupForm, setNewGroupForm] = useState({ name: '', email: '' })
  const [newGroupMemberSearch, setNewGroupMemberSearch] = useState('')
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<number[]>([])
  const [savingNewGroupModal, setSavingNewGroupModal] = useState(false)
  const [groupModalError, setGroupModalError] = useState('')
  const [selection, setSelection] = useState<any>(null)
  const [dragSelection, setDragSelection] = useState<{
    start: string
    end: string
    resourceId?: string | null
  } | null>(null)
  const [form, setForm] = useState<any>({})
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [personalTaskPresetDropdownOpen, setPersonalTaskPresetDropdownOpen] = useState(false)
  /** When false and a client is chosen, show their name in the search slot; click opens search again. */
  const [editingClientSearch, setEditingClientSearch] = useState(false)
  const clientSearchInputRef = useRef<HTMLInputElement>(null)
  const bookedClientSearchInputRef = useRef<HTMLInputElement>(null)
  const [bookedClientSearch, setBookedClientSearch] = useState('')
  const [bookedClientDropdownOpen, setBookedClientDropdownOpen] = useState(false)
  const [editingBookedClientSearch, setEditingBookedClientSearch] = useState(false)
  const [bookSessionClientsExpanded, setBookSessionClientsExpanded] = useState(false)
  const [bookedSessionClientsExpanded, setBookedSessionClientsExpanded] = useState(false)
  const [showAddClientModal, setShowAddClientModal] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [savingClient, setSavingClient] = useState(false)
  const [clientError, setClientError] = useState('')
  /** Admin only: null = ALL consultants (resource columns); CONSULTANT_FILTER_ALL_SESSION = all in single column; otherwise filter to specific consultant. */
  const CONSULTANT_FILTER_ALL_SESSION = -1
  const [consultantFilterId, setConsultantFilterId] = useState<number | null>(user.id ?? null)
  const [spaceFilterId, setSpaceFilterId] = useState<number | null>(null) // null = ALL
  const [androidMonthFirstDay, setAndroidMonthFirstDay] = useState(1)
  const [androidFilterPicker, setAndroidFilterPicker] = useState<null | 'consultant' | 'space'>(null)
  const [view, setView] = useState('timeGridWeek')
  const [calendarMode, setCalendarMode] = useState<'bookings' | 'availability' | 'spaces'>('bookings')
  const [confirmNonBookable, setConfirmNonBookable] = useState<ConfirmNonBookableState | null>(null)
  const [confirmOverlap, setConfirmOverlap] = useState<{ overlapping: any[]; start: string; end: string } | null>(null)
  const [confirmBookedPersonalOverlap, setConfirmBookedPersonalOverlap] = useState<
    | { type: 'create' }
    | { type: 'move'; booking: any; newStartStr: string; newEndStr: string; spaceIdOverride?: number | null; consultantIdOverride?: number | null }
    | { type: 'edit' }
    | null
  >(null)
  const [confirmNonBookableMove, setConfirmNonBookableMove] = useState<{
    booking: any
    newStartStr: string
    newEndStr: string
    allowPersonalBlockOverlap?: boolean
    spaceIdOverride?: number | null
    consultantIdOverride?: number | null
  } | null>(null)
  const [selectedBookedSession, setSelectedBookedSession] = useState<any>(null)
  const [selectedPersonalBlock, setSelectedPersonalBlock] = useState<any>(null)
  const [selectedTodo, setSelectedTodo] = useState<any>(null)
  const [pendingExternalTodo, setPendingExternalTodo] = useState<
    | {
        todoId: number
        anchorRect?: { left: number; right: number; top: number; bottom: number } | null
      }
    | null
  >(null)
  const [availabilitySelection, setAvailabilitySelection] = useState<any>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  /** Razpoložljivost: header check runs add (bookable slot) vs block (personal AVAILABILITY_BLOCK_TASK) per toggle. */
  const [availabilityIntent, setAvailabilityIntent] = useState<'add' | 'block'>('add')
  const [visibleRange, setVisibleRange] = useState<{ start: string; end: string } | null>(null)
  const [holidaysByDate, setHolidaysByDate] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bookedStatusMenuOpen, setBookedStatusMenuOpen] = useState(false)
  const [bookedPaymentMenuOpen, setBookedPaymentMenuOpen] = useState(false)
  const [bookedPaymentManagerTab, setBookedPaymentManagerTab] = useState<'details' | 'invoice'>('invoice')
  const [bookedPaymentGroupNameDraft, setBookedPaymentGroupNameDraft] = useState('')
  const PAYMENT_MANAGER_ADD_CLIENT_ID = -1
  const [selectedBookedPaymentClientId, setSelectedBookedPaymentClientId] = useState<number | null>(null)
  const [bookedPaymentAddMode, setBookedPaymentAddMode] = useState<'group-member' | 'session-only'>('group-member')
  const [bookedPaymentAddSearch, setBookedPaymentAddSearch] = useState('')
  const [selectedBookedPaymentClientDraft, setSelectedBookedPaymentClientDraft] = useState<{
    clientId: number | null
    firstName: string
    lastName: string
    email: string
    phone: string
    address: string
    postalCode: string
    city: string
    country: string
  } | null>(null)
  const [bookingPayeeCompanies, setBookingPayeeCompanies] = useState<any[]>([])
  const [confirmSwap, setConfirmSwap] = useState<{ dragged: any; target: any; revert: () => void } | null>(null)
  const [overlapDrawerGroupId, setOverlapDrawerGroupId] = useState<string | null>(null)
  const [sessionQuickActions, setSessionQuickActions] = useState<null | {
    eventKey: string
    kind: 'booked' | 'personal' | 'todo'
    props: any
    start: string
    end: string
    resourceId?: string | null
    overlapGroupId?: string | null
    overlapCount: number
    anchorRect: { left: number; right: number; top: number; bottom: number }
    menuLeft: number
    menuTop: number
  }>(null)
  /** Closing the overlap drawer updates React state before FullCalendar may still run dateClick in a render where overlap state is already null — suppress that one follow-up open/select. */
  const overlapDrawerDismissConsumePointerRef = useRef(false)
  const armOverlapDrawerDismissPointerCleanup = () => {
    if (typeof window === 'undefined') return
    window.addEventListener(
      'pointerup',
      () => {
        overlapDrawerDismissConsumePointerRef.current = false
      },
      { capture: true, once: true },
    )
  }
  const [overlapMainOverride, setOverlapMainOverride] = useState<Record<string, string>>({})
  const overlapSidebarDragRef = useRef<any>(null)
  const [overlapSidebarDraggingId, setOverlapSidebarDraggingId] = useState<string | null>(null)
  const [overlapInlineTimeEdit, setOverlapInlineTimeEdit] = useState<{
    eventId: string
    start: string
    end: string
    saving?: boolean
    error?: string | null
  } | null>(null)
  const [zoomConnected, setZoomConnected] = useState<boolean | null>(null)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [saveBookingError, setSaveBookingError] = useState<string | null>(null)
  const [saveBookingLoading, setSaveBookingLoading] = useState(false)
  const addBookingOnlineCaptionId = useId()
  const addBookingGroupCaptionId = useId()
  const bookedSessionOnlineCaptionId = useId()
  const newBookingAllDayCaptionId = useId()
  const editBookedAllDayCaptionId = useId()
  const personalFormAllDayCaptionId = useId()
  const personalEditAllDayCaptionId = useId()
  const todoFormAllDayCaptionId = useId()
  const todoEditAllDayCaptionId = useId()
  const availabilityAllDayCaptionId = useId()
  const [voiceBookingConfigured, setVoiceBookingConfigured] = useState<boolean | null>(null)
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceBookingLoading, setVoiceBookingLoading] = useState(false)
  const [voiceBookingError, setVoiceBookingError] = useState<string | null>(null)
  const [voiceReviewOpen, setVoiceReviewOpen] = useState(false)
  const [voiceReviewText, setVoiceReviewText] = useState('')
  const [voiceReviewClientId, setVoiceReviewClientId] = useState<number | null>(null)
  const [voiceReviewClientQuery, setVoiceReviewClientQuery] = useState('')
  const [voiceReviewClientDropdownOpen, setVoiceReviewClientDropdownOpen] = useState(false)
  const voiceReviewClientInputRef = useRef<HTMLInputElement>(null)
  const [voicePendingCancellation, setVoicePendingCancellation] = useState<null | {
    action?: string
    targetType?: string | null
    targetId?: number | null
    message?: string
    bookingId?: number
    clientId?: number | null
    clientName?: string | null
    title?: string | null
    startTime?: string | null
    endTime?: string | null
    confirmationRequired?: boolean
  }>(null)
  const [modeSwitching, setModeSwitching] = useState(false)
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const realtimeCalendarReloadTimerRef = useRef<number | null>(null)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  const speechRecognitionRef = useRef<{ stop: () => void; abort?: () => void } | null>(null)
  const voiceStopRequestedRef = useRef(false)
  const webSpeechBestTranscriptRef = useRef('')
  const webSpeechSubmittedRef = useRef(false)
  const webSpeechHadTranscriptRef = useRef(false)
  const voiceFallbackErrorShownRef = useRef(false)
  const androidMicHoldActiveRef = useRef(false)
  const androidMicShouldListenRef = useRef(false)
  const nativeSpeechHandleRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const nativeListeningHandleRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const nativeTranscriptRef = useRef('')
  const nativeTranscriptBestRef = useRef('')
  const nativeSessionFinalizedRef = useRef(false)
  const nativeFinalizeTimerRef = useRef<number | null>(null)
  const nativeRestartTimerRef = useRef<number | null>(null)
  const nativeReleaseStopTimerRef = useRef<number | null>(null)
  const modeSwitchingTimerRef = useRef<number | null>(null)
  const nativeStartingRef = useRef(false)
  const calendarAndroidWeekRef = useRef<HTMLDivElement>(null)
  const calendarPinchLayerRef = useRef<HTMLDivElement>(null)
  const calendarSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const calendarSwipeAxisDecidedRef = useRef(false)
  const calendarSwipeIsHorizontalRef = useRef(false)
  const calendarSnapshotRef = useRef<HTMLElement | null>(null)
  const calendarSlideDirRef = useRef<-1 | 1 | 0>(0)
  /** Avoid double-opening modal when tap fires both dateClick and select on Android. */
  const androidSelectionAtRef = useRef(0)
  const [calendarPinchZoom, setCalendarPinchZoom] = useState(1)
  const [pinchOriginPct, setPinchOriginPct] = useState({ x: 50, y: 50 })
  const pinchZoomRef = useRef(1)
  const pinchGestureRef = useRef<{ dist0: number; scale0: number } | null>(null)
  const pinchAnchorRef = useRef<{ x: number; y: number; contentX: number; contentY: number } | null>(null)
  const isDraggingEventRef = useRef(false)
  const calendarDragTimePillRef = useRef<HTMLDivElement | null>(null)
  const calendarDragPointerCleanupRef = useRef<null | (() => void)>(null)
  const calendarSmallDragHintViewportRef = useRef(false)
  const dragEdgeNavAtRef = useRef(0)
  const dragEdgeSideRef = useRef<-1 | 0 | 1>(0)
  /** Throttle drag-selection state + DOM work in selectAllow (resource ALL views have many events; updates were ~60/s). */
  const dragSelectThrottleAtRef = useRef(0)
  const ignoreNextSelectionRef = useRef(false)
  /** Dismiss popup on calendar mousedown without opening a new selection from the same gesture. */
  const suppressNextCalendarSelectionRef = useRef(false)
  const bookingEndEditedManuallyRef = useRef(false)
  const hideCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCardRef = useRef<HTMLDivElement>(null)
  const hoveredTimegridRowRef = useRef<HTMLTableRowElement | null>(null)
  const [calendarSlideX, setCalendarSlideX] = useState(0)
  const [calendarIsSwiping, setCalendarIsSwiping] = useState(false)
  const [swipeTransitionActive, setSwipeTransitionActive] = useState(false)
  const [calendarToolbarTitle, setCalendarToolbarTitle] = useState('')
  const calendarToolbarTitleRef = useRef('')
  const swipeHandlersRef = useRef<{ move: Function | null; end: Function | null }>({ move: null, end: null })
  const swipeWrapRef = useRef<HTMLDivElement>(null)
  const swipeVelocityRef = useRef({ lastX: 0, lastT: 0, vx: 0 })
  const calendarHeaderCompact = useCalendarCompactHeader()
  const calendarFiltersBottomBar = useCalendarFiltersBottomBar()
  const calendarDateNavArrowsInRail = useCalendarDateNavArrowsInRail()
  const calendarMobileHeaderNav = useCalendarMobileHeaderNav()
  const calendarToolbarMonthLabel = useMemo(() => {
    const api = calendarRef.current?.getApi()
    const d = api?.getDate()
    if (!d) return ''
    return d.toLocaleDateString(calendarLocaleTag, { month: 'long' })
  }, [visibleRange, view, calendarLocaleTag])
  const useBookingSidePanel = isNativeAndroid || calendarFiltersBottomBar
  /** Same breakpoint as bottom filters (~939px): × + check header, no title/help; wide = PageHeader + footer CTAs. */
  const compactSelectionHeader = calendarFiltersBottomBar
  /** Booked / personal / todo editors: × left, delete + save icons right, no title; footer CTAs hidden unless delete confirm. */
  const compactSessionEditHeader = calendarFiltersBottomBar
  const compactSelectionCheckAria =
    availabilitySelection != null
      ? availabilityIntent === 'block'
        ? t('formBlockAvailability')
        : availabilitySelection.slotId
          ? t('formSaveChanges')
          : t('formCreateAvailability')
      : form.todo
        ? t('formAddTodo')
        : form.personal
          ? t('formAddBlock')
          : t('formBookSession')
  const showSelectionFormFooter = !calendarFiltersBottomBar && availabilitySelection == null
  const consultantResourceLabelsCompact = useCalendarConsultantResourceInitialsLayout()
  const compactFormHydrateSkipKeyRef = useRef<string | null>(null)
  const compactFormPrevPathRef = useRef(location.pathname)
  const lastHydratedFormRouteKeyRef = useRef('')

  const pushCompactFormRoute = useCallback(
    (toPath: string) => {
      compactFormHydrateSkipKeyRef.current = toPath
      navigate(toPath)
    },
    [navigate],
  )

  const leaveCompactFormRouteIfNeeded = useCallback(() => {
    if (!useBookingSidePanel) return
    if (!isCalendarFormPath(location.pathname)) return
    navigate('/calendar', { replace: true })
  }, [useBookingSidePanel, location.pathname, navigate])

  useEffect(() => {
    const prev = compactFormPrevPathRef.current
    compactFormPrevPathRef.current = location.pathname
    if (!useBookingSidePanel) return
    const wasForm = isCalendarFormPath(prev)
    const isForm = isCalendarFormPath(location.pathname)
    if (!wasForm || isForm) return
    lastHydratedFormRouteKeyRef.current = ''
    setSelection(null)
    setSelectedBookedSession(null)
    setSelectedPersonalBlock(null)
    setSelectedTodo(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setConfirmDelete(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    calendarRef.current?.getApi()?.unselect()
  }, [location.pathname, useBookingSidePanel])

  useEffect(() => {
    if (useBookingSidePanel) return
    if (!isCalendarFormPath(location.pathname)) return
    lastHydratedFormRouteKeyRef.current = ''
    setSelection(null)
    setSelectedBookedSession(null)
    setSelectedPersonalBlock(null)
    setSelectedTodo(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setConfirmDelete(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    calendarRef.current?.getApi()?.unselect()
    navigate('/calendar', { replace: true })
  }, [useBookingSidePanel, location.pathname, navigate])

  useEffect(() => {
    if (!useBookingSidePanel) return
    if (!isLegacyNewSlotPath(location.pathname)) return
    const sp = new URLSearchParams(location.search)
    if (location.pathname.endsWith('/personal')) sp.set('panel', 'personal')
    else if (location.pathname.endsWith('/todo')) sp.set('panel', 'todo')
    navigate(`${ROUTE_NEW_BOOKING}?${sp.toString()}`, { replace: true })
  }, [useBookingSidePanel, location.pathname, location.search, navigate])

  const [androidScheduleOpen, setAndroidScheduleOpen] = useState(false)
  const [androidConfigOpen, setAndroidConfigOpen] = useState(false)
  const [androidLanguageModal, setAndroidLanguageModal] = useState(false)
  const [androidTodoOpen, setAndroidTodoOpen] = useState(false)
  const androidScheduleRef = useRef<HTMLDivElement>(null)
  const androidConfigRef = useRef<HTMLDivElement>(null)
  const availabilityRangeStartInputRef = useRef<HTMLInputElement>(null)
  const availabilityRangeEndInputRef = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const [meetingProviderPickerOpen, setMeetingProviderPickerOpen] = useState(false)
  const [meetingProviderPickerTarget, setMeetingProviderPickerTarget] = useState<'create' | 'edit' | null>(null)
  /** If true, closing the picker without choosing (Cancel/backdrop) turns Online off — set when opening from the Online checkbox. */
  const [meetingPickerCancelUnchecksOnline, setMeetingPickerCancelUnchecksOnline] = useState(false)
  /** Android Book session: Notes textarea shown only after tapping + */
  const [bookSessionNotesExpanded, setBookSessionNotesExpanded] = useState(false)
  const [monthHoverCard, setMonthHoverCard] = useState<null | {
    x: number
    y: number
    transform: string
    timeRange: string
    typeLabel: string
    clientLabel: string | null
    /** When true, hover row uses group label (Skupina) instead of client (Stranka). */
    bookingIsGroup: boolean
    consultantLabel: string
    meetingLink: string | null
    meetingProvider: string | null
  }>(null)
  const [sessionPopupPosition, setSessionPopupPosition] = useState<{ left: number; top: number; key?: string } | null>(null)
  const sessionPopupRef = useRef<HTMLDivElement | null>(null)
  const sessionPopupAnchorRectRef = useRef<{ left: number; right: number; top: number; bottom: number } | null>(null)
  const bookedSessionBeforeClientDetailRef = useRef<any>(null)
  const bookedSessionBeforeAdvanceEditorRef = useRef<any>(null)
  const sessionPopupDragRef = useRef<{ pointerId: number; startX: number; startY: number; originLeft: number; originTop: number } | null>(null)
  const [sessionsSheetState, setSessionsSheetState] = useState<'closed' | 'collapsed' | 'expanded'>('closed')
  const [sessionsSheetDragOffset, setSessionsSheetDragOffset] = useState(0)
  const sessionsSheetStartYRef = useRef<number | null>(null)
  const sessionsSheetStartStateRef = useRef<'collapsed' | 'expanded'>('collapsed')
  const datesSetCalendarLoadTimerRef = useRef<number | null>(null)
  const lastHolidayRangeKeyRef = useRef<string | null>(null)
  /** Avoids a second /bookings/calendar fetch when datesSet fires with the same range right after load(). */
  const lastSuccessfulCalendarRangeKeyRef = useRef<string | null>(null)

  const computeCalendarFetchRange = () => {
    const apiCal = calendarRef.current?.getApi()
    let from = apiCal?.view?.activeStart ? new Date(apiCal.view.activeStart) : new Date()
    let to = apiCal?.view?.activeEnd ? new Date(apiCal.view.activeEnd) : new Date()
    if (!apiCal?.view?.activeEnd) to.setDate(to.getDate() + 30)
    from.setDate(from.getDate() - 7)
    to.setDate(to.getDate() + 7)
    const today = new Date()
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (todayDay < fromDay) from = todayDay
    if (todayDay > toDay) to = todayDay
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)
    return { fromStr, toStr, key: `${fromStr}|${toStr}` }
  }

  useEffect(() => {
    pinchZoomRef.current = calendarPinchZoom
  }, [calendarPinchZoom])

  useEffect(() => {
    if (!isNativeAndroid) return
    if (view !== 'dayGridMonth') return
    if (calendarPinchZoom !== 1) setCalendarPinchZoom(1)
  }, [view, calendarPinchZoom])

  useEffect(() => {
    if (!androidScheduleOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (androidScheduleRef.current && !androidScheduleRef.current.contains(e.target as Node)) {
        setAndroidScheduleOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [androidScheduleOpen])

  useEffect(() => {
    if (!androidConfigOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (androidConfigRef.current && !androidConfigRef.current.contains(e.target as Node)) {
        setAndroidConfigOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [androidConfigOpen])

  const toggleTheme = () => {
    if (theme === 'light') {
      applyTheme('dark')
      setTheme('dark')
      return
    }
    applyTheme('light')
    setTheme('light')
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore logout transport errors and still clear local state
    }
    clearAuthStoragePreservingTheme()
    window.location.replace('/login')
  }

  /** Two-finger pinch: scale the grid only; focal point = midpoint of fingers on first frame. */
  useEffect(() => {
    if (!isNativeAndroid) return
    const el = calendarAndroidWeekRef.current
    if (!el) return
    const distanceBetweenTouches = (tl: globalThis.TouchList) => {
      if (tl.length < 2) return 0
      return Math.hypot(tl[0].clientX - tl[1].clientX, tl[0].clientY - tl[1].clientY)
    }
    const setOriginFromTouches = (tl: globalThis.TouchList) => {
      const layer = calendarPinchLayerRef.current
      if (!layer || tl.length < 2) return
      const rect = layer.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const mx = (tl[0].clientX + tl[1].clientX) / 2
      const my = (tl[0].clientY + tl[1].clientY) / 2
      const x = mx - rect.left
      const y = my - rect.top
      setPinchOriginPct({
        x: Math.min(100, Math.max(0, (x / rect.width) * 100)),
        y: Math.min(100, Math.max(0, (y / rect.height) * 100)),
      })
      pinchAnchorRef.current = {
        x,
        y,
        contentX: (layer.scrollLeft + x) / Math.max(1, pinchZoomRef.current),
        contentY: (layer.scrollTop + y) / Math.max(1, pinchZoomRef.current),
      }
    }
    const onStart = (e: Event) => {
      const te = e as TouchEvent
      if (te.touches.length === 2) {
        const d = distanceBetweenTouches(te.touches)
        if (d > 0) {
          pinchGestureRef.current = { dist0: d, scale0: pinchZoomRef.current }
          setOriginFromTouches(te.touches)
        }
      }
    }
    const onMove = (e: Event) => {
      const te = e as TouchEvent
      if (te.touches.length === 2 && pinchGestureRef.current) {
        te.preventDefault()
        setOriginFromTouches(te.touches)
        const d = distanceBetweenTouches(te.touches)
        const g = pinchGestureRef.current
        if (g.dist0 < 4 || d < 1) return
        const next = Math.min(ANDROID_PINCH_ZOOM_MAX, Math.max(ANDROID_PINCH_ZOOM_MIN, g.scale0 * (d / g.dist0)))
        setCalendarPinchZoom(next)
        const layer = calendarPinchLayerRef.current
        const anchor = pinchAnchorRef.current
        if (layer && anchor) {
          requestAnimationFrame(() => {
            layer.scrollLeft = Math.max(0, anchor.contentX * next - anchor.x)
            layer.scrollTop = Math.max(0, anchor.contentY * next - anchor.y)
          })
        }
      }
    }
    const onEnd = () => {
      pinchGestureRef.current = null
      pinchAnchorRef.current = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [isNativeAndroid])

  useLayoutEffect(() => {
    if (!isNativeAndroid) return
    const id = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize())
    return () => cancelAnimationFrame(id)
  }, [calendarPinchZoom, isNativeAndroid])

  useEffect(() => {
    if (isNativeAndroid) return
    const compactDayViews =
      view === 'timeGridDay' ||
      view === 'timeGridThreeDay' ||
      view === 'resourceTimeGridDay' ||
      view === 'resourceTimeGridThreeDay'
    if (!compactDayViews) return
    const bump = () => {
      requestAnimationFrame(() => calendarRef.current?.getApi().updateSize())
    }
    window.addEventListener('resize', bump)
    window.visualViewport?.addEventListener('resize', bump)
    bump()
    return () => {
      window.removeEventListener('resize', bump)
      window.visualViewport?.removeEventListener('resize', bump)
    }
  }, [view, isNativeAndroid])

  useEffect(() => {
    if (!isNativeAndroid) return
    const styleId = 'calendar-android-drag-ghost-fix'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
.layout-android .fc .fc-event.fc-event-dragging:not(.fc-event-mirror) {
  opacity: 0 !important;
}
.layout-android .fc .fc-event.fc-event-dragging:not(.fc-event-mirror) * {
  opacity: 0 !important;
}
.layout-android .fc .fc-event-mirror {
  opacity: 1 !important;
  visibility: visible !important;
}
`
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  const isWeekOrMonthView =
    view === 'timeGridWeek' ||
    view === 'resourceTimeGridWeek' ||
    view === 'dayGridMonth' ||
    view === 'resourceDayGridMonth'

  /** View-only: ALL consultant in bookings mode, or ALL space in spaces mode, on week/month views. */
  const isViewOnly =
    isWeekOrMonthView &&
    ((calendarMode === 'bookings' && (consultantFilterId == null || consultantFilterId === CONSULTANT_FILTER_ALL_SESSION)) ||
      (calendarMode === 'spaces' && spaceFilterId == null))

  const cleanupDragArtifacts = useCallback(() => {
    const api = calendarRef.current?.getApi()
    api?.unselect()
    setDragSelection(null)
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
    document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
    document.querySelectorAll('.fc-highlight').forEach((n) => n.remove())
    document.querySelectorAll('.fc-event-dragging, .fc-event-selected').forEach((n) => n.classList.remove('fc-event-dragging', 'fc-event-selected'))
    window.setTimeout(() => {
      document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
      document.querySelectorAll('.fc-highlight').forEach((n) => n.remove())
      document.querySelectorAll('.fc-event-dragging, .fc-event-selected').forEach((n) => n.classList.remove('fc-event-dragging', 'fc-event-selected'))
    }, 0)
    window.setTimeout(() => {
      document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
      document.querySelectorAll('.fc-highlight').forEach((n) => n.remove())
      document.querySelectorAll('.fc-event-dragging, .fc-event-selected').forEach((n) => n.classList.remove('fc-event-dragging', 'fc-event-selected'))
    }, 120)
  }, [])

  /** Drop FC’s focus/selected chrome on session tiles after opening edit UI (keeps grid clean). */
  const clearSessionEventClickChrome = useCallback((el: HTMLElement) => {
    queueMicrotask(() => {
      el.classList.remove('fc-event-selected')
      el.blur()
    })
  }, [])

  const createCalendarSnapshot = useCallback(() => {
    const shell = document.querySelector('.calendar-fc-shell') as HTMLElement
    if (!shell) return

    if (calendarSnapshotRef.current) {
      calendarSnapshotRef.current.remove()
    }

    const clone = shell.cloneNode(true) as HTMLElement
    clone.classList.add('calendar-snapshot-layer')
    
    clone.style.position = 'absolute'
    clone.style.top = '0'
    clone.style.left = '0'
    clone.style.width = '100%'
    clone.style.height = '100%'
    clone.style.pointerEvents = 'none'
    clone.style.zIndex = '5'
    clone.style.transform = 'none'
    clone.style.transition = 'none' // Wipe any snapshot legacy transition

    if (shell.parentElement) {
      shell.parentElement.style.position = 'relative'
      shell.parentElement.appendChild(clone)
    }
    calendarSnapshotRef.current = clone
  }, [])

  const navigateCalendar = useCallback((dir: -1 | 1) => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (isDraggingEventRef.current) {
      document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
    }
    
    // Disable snapshot animations on large resolutions (laptops & monitors)
    if (window.innerWidth >= 1024) {
      if (dir < 0) api.prev()
      else api.next()
      return
    }
    
    createCalendarSnapshot()
    
    const screenW = window.innerWidth
    setCalendarIsSwiping(true)
    setSwipeTransitionActive(true)
    setCalendarSlideX(dir < 0 ? -screenW : screenW)

    if (dir < 0) api.prev()
    else api.next()

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCalendarIsSwiping(false)
        setCalendarSlideX(0)
        
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.style.setProperty('--calendar-slide-clone', `${dir < 0 ? screenW : -screenW}px`)
        }
        
        window.setTimeout(() => {
          if (calendarSnapshotRef.current) {
            calendarSnapshotRef.current.remove()
            calendarSnapshotRef.current = null
          }
          setSwipeTransitionActive(false)
        }, 320)
      })
    })
  }, [createCalendarSnapshot])

  const handleCalendarSwipeTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    // Disable click-and-drag swipe on large resolutions. Leaves standard drag/drop functional.
    if (window.innerWidth >= 1024) return
    
    const target = e.target as HTMLElement | null
    if (target?.closest('select')) return
    // Event drag sets isDraggingEventRef only in eventDragStart, after movement; without this, the first
    // few pixels of a horizontal drag on a session tile are classified as week swipe (api.prev/next).
    // Only skip for booked/personal/todo tiles — bookable/availability blocks are still .fc-event but use
    // selection, not event drag; blocking all .fc-event broke swipe from most of the grid.
    if (!isNativeAndroid && !isViewOnly) {
      const eventEl = target?.closest('.fc-event') as HTMLElement | null
      const touchOnDraggableSessionTile =
        eventEl != null &&
        (eventEl.classList.contains('calendar-event-booked-visual') ||
          eventEl.classList.contains('calendar-event-personal-visual') ||
          eventEl.classList.contains('calendar-event-todo-visual'))
      if (touchOnDraggableSessionTile) return
    }
    if (pinchZoomRef.current > 1.001) return
    if ('touches' in e && e.touches.length >= 2) return
    const t = 'touches' in e ? e.touches[0] : e
    calendarSwipeStartRef.current = { x: t.clientX, y: t.clientY }
    calendarSwipeAxisDecidedRef.current = false
    calendarSwipeIsHorizontalRef.current = false

    // To prevent swipes freezing if FullCalendar detaches the target element mid-swipe (e.g. crossing weeks over an event block),
    // we attach an immutable fallback native event listener specifically to this target node ensuring smooth continuation!
    if (target) {
      const onNativeMove = (ev: Event) => swipeHandlersRef.current.move?.(ev)
      const onNativeEnd = (ev: Event) => {
        swipeHandlersRef.current.end?.(ev)
        target.removeEventListener('touchmove', onNativeMove)
        target.removeEventListener('mousemove', onNativeMove)
        target.removeEventListener('touchend', onNativeEnd)
        target.removeEventListener('touchcancel', onNativeEnd)
        target.removeEventListener('mouseup', onNativeEnd)
      }
      target.addEventListener('touchmove', onNativeMove, { passive: true })
      target.addEventListener('mousemove', onNativeMove, { passive: true })
      target.addEventListener('touchend', onNativeEnd, { passive: true })
      target.addEventListener('touchcancel', onNativeEnd, { passive: true })
      target.addEventListener('mouseup', onNativeEnd, { passive: true })
    }
  }, [isNativeAndroid, isViewOnly])

  const handleCalendarSwipeTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('select')) return
    if (isDraggingEventRef.current) {
      isDraggingEventRef.current = false
      dragEdgeSideRef.current = 0
      cleanupDragArtifacts()
      if (calendarSwipeIsHorizontalRef.current) {
        const wrap = swipeWrapRef.current
        if (wrap) {
          wrap.style.setProperty('--calendar-slide-x', '0px')
          wrap.classList.remove('calendar-sliding-enabled', 'calendar-is-swiping', 'calendar-not-swiping')
        }
        setCalendarIsSwiping(false)
        setCalendarSlideX(0)
        setSwipeTransitionActive(false)
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.remove()
          calendarSnapshotRef.current = null
        }
      }
      calendarSwipeAxisDecidedRef.current = false
      calendarSwipeIsHorizontalRef.current = false
      return
    }
    if (pinchZoomRef.current > 1.001) {
      calendarSwipeStartRef.current = null
      if (calendarSwipeIsHorizontalRef.current) {
        const wrap = swipeWrapRef.current
        if (wrap) {
          wrap.style.setProperty('--calendar-slide-x', '0px')
          wrap.classList.remove('calendar-sliding-enabled', 'calendar-is-swiping', 'calendar-not-swiping')
        }
        setCalendarIsSwiping(false)
        setCalendarSlideX(0)
        setSwipeTransitionActive(false)
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.remove()
          calendarSnapshotRef.current = null
        }
      }
      calendarSwipeAxisDecidedRef.current = false
      calendarSwipeIsHorizontalRef.current = false
      return
    }
    const start = calendarSwipeStartRef.current
    calendarSwipeStartRef.current = null
    const wasHorizontal = calendarSwipeIsHorizontalRef.current
    calendarSwipeAxisDecidedRef.current = false
    calendarSwipeIsHorizontalRef.current = false

    if (!start) return
    const t = 'changedTouches' in e ? e.changedTouches[0] : e
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y

    if (wasHorizontal) {
      const dir = calendarSlideDirRef.current
      const screenW = window.innerWidth
      const wrap = swipeWrapRef.current

      const velocity = swipeVelocityRef.current.vx
      const VELOCITY_THRESHOLD = 0.3
      const DISTANCE_THRESHOLD = 56
      const fastFlick = Math.abs(velocity) > VELOCITY_THRESHOLD
      const flickAgainstDir = (dir < 0 && velocity > 0) || (dir > 0 && velocity < 0)
      const shouldSnapBack = dir === 0 || (Math.abs(dx) < DISTANCE_THRESHOLD && !(fastFlick && !flickAgainstDir))

      if (wrap) {
        wrap.classList.remove('calendar-is-swiping')
        wrap.classList.add('calendar-not-swiping')
      }
      setCalendarIsSwiping(false)

      if (shouldSnapBack) {
        if (wrap) wrap.style.setProperty('--calendar-slide-x', `${dir < 0 ? -screenW : screenW}px`)
        calendarSnapshotRef.current?.style.setProperty('--calendar-slide-clone', `0px`)

        window.setTimeout(() => {
          const api = calendarRef.current?.getApi()
          if (api) {
            if (dir < 0) api.next()
            else api.prev()
          }
          if (wrap) {
            wrap.style.setProperty('--calendar-slide-x', '0px')
            wrap.classList.remove('calendar-sliding-enabled', 'calendar-not-swiping')
          }
          if (calendarSnapshotRef.current) {
            calendarSnapshotRef.current.remove()
            calendarSnapshotRef.current = null
          }
          setCalendarSlideX(0)
          setSwipeTransitionActive(false)
        }, 320)
        return
      }

      if (wrap) wrap.style.setProperty('--calendar-slide-x', '0px')
      calendarSnapshotRef.current?.style.setProperty('--calendar-slide-clone', `${dir < 0 ? screenW : -screenW}px`)

      window.setTimeout(() => {
        if (wrap) wrap.classList.remove('calendar-sliding-enabled', 'calendar-not-swiping')
        if (calendarSnapshotRef.current) {
          calendarSnapshotRef.current.remove()
          calendarSnapshotRef.current = null
        }
        setCalendarSlideX(0)
        setSwipeTransitionActive(false)
      }, 320)
      return
    }

    const minDx = 56
    if (Math.abs(dx) < minDx || Math.abs(dx) < Math.abs(dy) * 1.15) return
    navigateCalendar(dx > 0 ? -1 : 1)
  }, [cleanupDragArtifacts, navigateCalendar])

  const handleDragEdgeAutoNavigate = useCallback((clientX: number) => {
    if (!isNativeAndroid || !isDraggingEventRef.current) return
    const host = calendarAndroidWeekRef.current
    const api = calendarRef.current?.getApi()
    if (!host || !api) return
    const rect = host.getBoundingClientRect()
    const edgePx = 28
    const side: -1 | 0 | 1 =
      clientX <= rect.left + edgePx
        ? -1
        : clientX >= rect.right - edgePx
          ? 1
          : 0
    if (side === 0) {
      dragEdgeSideRef.current = 0
      return
    }
    if (dragEdgeSideRef.current === side) return
    dragEdgeSideRef.current = side
    const now = Date.now()
    if (now - dragEdgeNavAtRef.current < 220) return
    dragEdgeNavAtRef.current = now
    navigateCalendar(side)
    calendarSwipeStartRef.current = null
  }, [navigateCalendar])

  const handleCalendarTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingEventRef.current) {
      const t = 'touches' in e ? e.touches[0] : e
      if (!t) return
      handleDragEdgeAutoNavigate(t.clientX)
      return
    }
    const start = calendarSwipeStartRef.current
    if (!start) return
    const t = 'touches' in e ? e.touches[0] : e
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y

    if (!calendarSwipeAxisDecidedRef.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        calendarSwipeAxisDecidedRef.current = true
        calendarSwipeIsHorizontalRef.current = Math.abs(dx) > Math.abs(dy) * 1.15
        if (calendarSwipeIsHorizontalRef.current) {
          const dir = dx > 0 ? -1 : 1
          calendarSlideDirRef.current = dir
          const screenW = window.innerWidth
          const initialOffset = dir < 0 ? -screenW + dx : screenW + dx

          const wrap = swipeWrapRef.current
          if (wrap) {
            wrap.style.setProperty('--calendar-slide-x', `${initialOffset}px`)
            wrap.classList.add('calendar-sliding-enabled', 'calendar-is-swiping')
            wrap.classList.remove('calendar-not-swiping')
          }

          createCalendarSnapshot()

          const api = calendarRef.current?.getApi()
          if (api) {
            if (dir < 0) api.prev()
            else api.next()
          }

          setCalendarIsSwiping(true)
          setSwipeTransitionActive(true)

          swipeVelocityRef.current = { lastX: t.clientX, lastT: performance.now(), vx: 0 }
        }
      }
    }
    if (calendarSwipeIsHorizontalRef.current) {
      const dir = calendarSlideDirRef.current
      const screenW = window.innerWidth
      const liveOffset = dir < 0 ? -screenW + dx : screenW + dx

      swipeWrapRef.current?.style.setProperty('--calendar-slide-x', `${liveOffset}px`)
      calendarSnapshotRef.current?.style.setProperty('--calendar-slide-clone', `${dx}px`)

      const now = performance.now()
      const dt = now - swipeVelocityRef.current.lastT
      if (dt > 0) {
        const instantVx = (t.clientX - swipeVelocityRef.current.lastX) / dt
        swipeVelocityRef.current.vx = 0.7 * instantVx + 0.3 * swipeVelocityRef.current.vx
      }
      swipeVelocityRef.current.lastX = t.clientX
      swipeVelocityRef.current.lastT = now
    }
  }, [createCalendarSnapshot, handleDragEdgeAutoNavigate])

  useEffect(() => {
    swipeHandlersRef.current.move = handleCalendarTouchMove
    swipeHandlersRef.current.end = handleCalendarSwipeTouchEnd
  }, [handleCalendarTouchMove, handleCalendarSwipeTouchEnd])

  const clearForcedHoverRow = useCallback(() => {
    if (hoveredTimegridRowRef.current) {
      hoveredTimegridRowRef.current.classList.remove('calendar-hover-row-forced')
      hoveredTimegridRowRef.current = null
    }
  }, [])

  const updateCalendarHoverRow = useCallback((clientY: number) => {
    if (
      isNativeAndroid ||
      (view !== 'timeGridWeek' && view !== 'timeGridDay' && view !== 'timeGridThreeDay') ||
      calendarMode !== 'bookings'
    ) {
      clearForcedHoverRow()
      return
    }
    const host = calendarAndroidWeekRef.current
    if (!host) return
    const timeGridBody = host.querySelector('.fc-timegrid-body') as HTMLElement | null
    if (!timeGridBody) {
      clearForcedHoverRow()
      return
    }
    const bodyRect = timeGridBody.getBoundingClientRect()
    if (clientY < bodyRect.top || clientY > bodyRect.bottom) {
      clearForcedHoverRow()
      return
    }
    const rows = Array.from(host.querySelectorAll('.fc-timegrid-slots tbody tr')) as HTMLTableRowElement[]
    if (!rows.length) {
      clearForcedHoverRow()
      return
    }
    const nextRow = rows.find((row) => {
      const r = row.getBoundingClientRect()
      return clientY >= r.top && clientY < r.bottom
    }) ?? null
    if (hoveredTimegridRowRef.current === nextRow) return
    clearForcedHoverRow()
    if (nextRow) {
      nextRow.classList.add('calendar-hover-row-forced')
      hoveredTimegridRowRef.current = nextRow
    }
  }, [isNativeAndroid, view, calendarMode, clearForcedHoverRow])

  const handleCalendarMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    updateCalendarHoverRow(e.clientY)
    if (!isDraggingEventRef.current) return
    handleDragEdgeAutoNavigate(e.clientX)
  }, [updateCalendarHoverRow, handleDragEdgeAutoNavigate])

  const handleCalendarMouseLeave = useCallback(() => {
    clearForcedHoverRow()
  }, [clearForcedHoverRow])

  useEffect(() => {
    clearForcedHoverRow()
  }, [calendarMode, view, clearForcedHoverRow])

  /** Match web `todayDay`: go to today in day view so the button reliably navigates on Android WebView. */
  const goToTodayAndroid = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.changeView('timeGridDay')
    window.setTimeout(() => {
      const a = calendarRef.current?.getApi()
      if (!a) return
      a.today()
      requestAnimationFrame(() => a.updateSize())
    }, 0)
  }, [])

  const openCalendarDayView = useCallback(
    (date: Date) => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      api.gotoDate(date)
      const spacesOn = settings.SPACES_ENABLED === 'true'
      const wantResource =
        (calendarMode === 'spaces' && spaceFilterId == null && !isNativeAndroid && spacesOn) ||
        (calendarMode === 'bookings' && isTenantAdmin && consultantFilterId == null && !isNativeAndroid)
      api.changeView(wantResource ? 'resourceTimeGridDay' : 'timeGridDay')
      setAndroidScheduleOpen(false)
    },
    [calendarMode, spaceFilterId, consultantFilterId, settings.SPACES_ENABLED, user.role],
  )

  const renderAndroidCornerViewToggle = useCallback(
    (viewType?: string) => {
      if (!isNativeAndroid) return
      const root = calendarAndroidWeekRef.current
      const api = calendarRef.current?.getApi()
      if (!root || !api) return
      root.querySelectorAll('.calendar-android-corner-nav').forEach((n) => n.remove())
      if (viewType !== 'timeGridDay' && viewType !== 'timeGridWeek' && viewType !== 'timeGridThreeDay') return
      const axisHeader = root.querySelector('.fc .fc-timegrid .fc-col-header tr th.fc-timegrid-axis')
      if (!axisHeader) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'calendar-android-corner-nav'
      btn.dataset.view = viewType === 'timeGridDay' ? 'week' : 'month'
      btn.title = viewType === 'timeGridDay' ? 'Week view' : 'Month view'
      btn.setAttribute('aria-label', btn.title)
      const svgNs = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNs, 'svg')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '2')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.setAttribute('aria-hidden', 'true')
      const rect = document.createElementNS(svgNs, 'rect')
      rect.setAttribute('x', '3')
      rect.setAttribute('y', '4')
      rect.setAttribute('width', '18')
      rect.setAttribute('height', '18')
      rect.setAttribute('rx', '2')
      svg.appendChild(rect)
      const topLine = document.createElementNS(svgNs, 'path')
      topLine.setAttribute('d', 'M3 10h18')
      svg.appendChild(topLine)
      const detail = document.createElementNS(svgNs, 'path')
      detail.setAttribute(
        'd',
        viewType === 'timeGridDay'
          ? 'M8 2v4M16 2v4M7.5 15.5l2-3.5 2 3.5 2-3.5 2 3.5'
          : 'M8 14h3M13 14h3M8 18h3M13 18h3M8 2v4M16 2v4',
      )
      svg.appendChild(detail)
      btn.appendChild(svg)
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        api.changeView(viewType === 'timeGridDay' ? 'timeGridWeek' : 'dayGridMonth')
      })
      axisHeader.appendChild(btn)
    },
    [isNativeAndroid],
  )

  const applySettingsAndMeta = (
    s: { data?: Record<string, string> },
    clients: { data: any },
    users: { data: any },
    spaces: { data: any },
    types: { data: any },
    groups?: { data: any },
  ) => {
    let settingsData = s.data || {}
    if (!settingsData.WORKING_HOURS_START && !settingsData.WORKING_HOURS_END) {
      try {
        const raw = localStorage.getItem(WORKING_HOURS_FALLBACK_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') settingsData = { ...settingsData, ...parsed }
        }
      } catch {
        // ignore storage errors
      }
    }
    setSettings(settingsData)
    setMeta({ clients: clients.data, users: users.data, spaces: spaces.data, types: types.data, groups: groups?.data ?? [] })
  }

  const loadMetaOnly = async () => {
    const [s, clients, users, spaces, types, groups] = await Promise.all([
      api.get('/settings'),
      api.get('/clients'),
      isTenantAdmin
        ? api.get('/users').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [user] }),
      api.get('/spaces'),
      api.get('/types'),
      api.get('/groups').catch(() => ({ data: [] })),
    ])
    applySettingsAndMeta(s, clients, users, spaces, types, groups)
  }

  const load = async () => {
    const { fromStr, toStr, key } = computeCalendarFetchRange()
    const [c, s, clients, users, spaces, types, groups] = await Promise.all([
      api.get('/bookings/calendar', { params: { from: fromStr, to: toStr } }),
      api.get('/settings'),
      api.get('/clients'),
      isTenantAdmin
        ? api.get('/users').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [user] }),
      api.get('/spaces'),
      api.get('/types'),
      api.get('/groups').catch(() => ({ data: [] })),
    ])
    setCalendarData(filterHiddenStatusesFromCalendarPayload(c.data))
    applySettingsAndMeta(s, clients, users, spaces, types, groups)
    lastSuccessfulCalendarRangeKeyRef.current = key
  }

  loadRef.current = load

  const loadCalendarRangeOnly = async (force = false) => {
    const { fromStr, toStr, key } = computeCalendarFetchRange()
    if (!force && key === lastSuccessfulCalendarRangeKeyRef.current) return calendarData
    const c = await api.get('/bookings/calendar', { params: { from: fromStr, to: toStr } })
    const nextCalendarData = filterHiddenStatusesFromCalendarPayload(c.data)
    setCalendarData(nextCalendarData)
    lastSuccessfulCalendarRangeKeyRef.current = key
    return nextCalendarData
  }

  const calendarOpenBillSearchParams = new URLSearchParams(location.search)
  const calendarEditOpenBillIdRaw = Number(calendarOpenBillSearchParams.get('editOpenBillId') ?? 0)
  const calendarEditOpenBillId = Number.isInteger(calendarEditOpenBillIdRaw) && calendarEditOpenBillIdRaw > 0 ? calendarEditOpenBillIdRaw : null
  const calendarClientDetailIdRaw = Number(calendarOpenBillSearchParams.get('clientId') ?? 0)
  const calendarClientDetailId = Number.isInteger(calendarClientDetailIdRaw) && calendarClientDetailIdRaw > 0 ? calendarClientDetailIdRaw : null
  const calendarGroupDetailIdRaw = Number(calendarOpenBillSearchParams.get('groupId') ?? 0)
  const calendarGroupDetailId = Number.isInteger(calendarGroupDetailIdRaw) && calendarGroupDetailIdRaw > 0 ? calendarGroupDetailIdRaw : null
  const calendarCreateAdvanceRequested = calendarOpenBillSearchParams.get('createAdvance') === '1'
  const calendarCreateAdvanceSessionIdRaw = Number(calendarOpenBillSearchParams.get('advanceSessionId') ?? calendarOpenBillSearchParams.get('sessionId') ?? 0)
  const calendarCreateAdvanceClientIdRaw = Number(calendarOpenBillSearchParams.get('advanceClientId') ?? 0)
  const calendarCreateAdvanceClientIds = Array.from(new Set(
    String(calendarOpenBillSearchParams.get('advanceClientIds') ?? '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0),
  ))
  const calendarCreateAdvanceConsultantIdRaw = Number(calendarOpenBillSearchParams.get('advanceConsultantId') ?? 0)
  const calendarCreateAdvanceCompanyIdRaw = Number(calendarOpenBillSearchParams.get('advanceCompanyId') ?? 0)
  const calendarCreateAdvanceBillingTarget: 'COMPANY' | 'PERSON' = calendarOpenBillSearchParams.get('advanceBillingTarget') === 'COMPANY' ? 'COMPANY' : 'PERSON'
  const calendarCreateAdvanceRequest = calendarCreateAdvanceRequested ? {
    billType: 'ADVANCE' as const,
    sessionId: Number.isInteger(calendarCreateAdvanceSessionIdRaw) && calendarCreateAdvanceSessionIdRaw > 0 ? calendarCreateAdvanceSessionIdRaw : null,
    clientId: Number.isInteger(calendarCreateAdvanceClientIdRaw) && calendarCreateAdvanceClientIdRaw > 0 ? calendarCreateAdvanceClientIdRaw : null,
    clientIds: calendarCreateAdvanceClientIds,
    consultantId: Number.isInteger(calendarCreateAdvanceConsultantIdRaw) && calendarCreateAdvanceConsultantIdRaw > 0 ? calendarCreateAdvanceConsultantIdRaw : null,
    billingTarget: calendarCreateAdvanceBillingTarget,
    recipientCompanyId: calendarCreateAdvanceBillingTarget === 'COMPANY' && Number.isInteger(calendarCreateAdvanceCompanyIdRaw) && calendarCreateAdvanceCompanyIdRaw > 0 ? calendarCreateAdvanceCompanyIdRaw : null,
  } : null

  const closeCalendarOpenBillEditor = useCallback(() => {
    const params = new URLSearchParams(location.search)
    params.delete('editOpenBillId')
    params.delete('editBill')
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
  }, [location.pathname, location.search, navigate])

  const closeCalendarAdvanceEditor = useCallback(() => {
    const params = new URLSearchParams(location.search)
    params.delete('createAdvance')
    params.delete('advanceSessionId')
    params.delete('advanceClientId')
    params.delete('advanceClientIds')
    params.delete('advanceConsultantId')
    params.delete('advanceBillingTarget')
    params.delete('advanceCompanyId')
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    const savedSession = bookedSessionBeforeAdvanceEditorRef.current
    bookedSessionBeforeAdvanceEditorRef.current = null
    if (savedSession) {
      setSelectedBookedSession((current: any) => current ?? savedSession)
    }
  }, [location.pathname, location.search, navigate])

  const openCalendarClientDetail = useCallback((clientId: number) => {
    if (!Number.isInteger(clientId) || clientId <= 0) return
    bookedSessionBeforeClientDetailRef.current = selectedBookedSession
    const params = new URLSearchParams(location.search)
    params.set('clientId', String(clientId))
    params.delete('groupId')
    params.delete('tab')
    params.delete('entitlementId')
    const sessionId = Number(selectedBookedSession?.id ?? 0)
    if (Number.isInteger(sessionId) && sessionId > 0) {
      params.set('sessionId', String(sessionId))
    } else {
      params.delete('sessionId')
    }
    const pathname = useBookingSidePanel && Number.isInteger(sessionId) && sessionId > 0
      ? `/calendar/booking/${sessionId}`
      : location.pathname
    const nextSearch = params.toString()
    navigate({ pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: false })
  }, [location.pathname, location.search, navigate, selectedBookedSession, useBookingSidePanel])

  const openCalendarGroupDetail = useCallback((groupId: number) => {
    if (!Number.isInteger(groupId) || groupId <= 0) return
    bookedSessionBeforeClientDetailRef.current = selectedBookedSession
    const params = new URLSearchParams(location.search)
    params.set('groupId', String(groupId))
    params.delete('clientId')
    params.delete('tab')
    params.delete('entitlementId')
    const sessionId = Number(selectedBookedSession?.id ?? 0)
    if (Number.isInteger(sessionId) && sessionId > 0) {
      params.set('sessionId', String(sessionId))
    } else {
      params.delete('sessionId')
    }
    const pathname = useBookingSidePanel && Number.isInteger(sessionId) && sessionId > 0
      ? `/calendar/booking/${sessionId}`
      : location.pathname
    const nextSearch = params.toString()
    navigate({ pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: false })
  }, [location.pathname, location.search, navigate, selectedBookedSession, useBookingSidePanel])

  const closeCalendarClientDetail = useCallback(() => {
    const params = new URLSearchParams(location.search)
    params.delete('clientId')
    params.delete('groupId')
    params.delete('tab')
    params.delete('entitlementId')
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    const savedSession = bookedSessionBeforeClientDetailRef.current
    bookedSessionBeforeClientDetailRef.current = null
    if (savedSession) {
      setSelectedBookedSession((current: any) => current ?? savedSession)
    }
  }, [location.pathname, location.search, navigate])

  const refreshCalendarAfterClientEdit = useCallback(async () => {
    await loadMetaOnly()
    await loadCalendarRangeOnly(true)
  }, [loadCalendarRangeOnly])

  const refreshCalendarAfterOpenBillEdit = useCallback(async () => {
    const refreshed = await loadCalendarRangeOnly(true)
    if (!refreshed?.booked) return
    const fallbackBookedSessionIdRaw = Number(bookedSessionBeforeAdvanceEditorRef.current?.id ?? 0)
    const activeBookedSessionIdRaw = Number(selectedBookedSession?.id ?? 0)
    const bookingId = Number.isInteger(activeBookedSessionIdRaw) && activeBookedSessionIdRaw > 0
      ? activeBookedSessionIdRaw
      : (Number.isInteger(fallbackBookedSessionIdRaw) && fallbackBookedSessionIdRaw > 0 ? fallbackBookedSessionIdRaw : null)
    if (!bookingId) return
    const updated = refreshed.booked.find((booking: any) => Number(booking?.id) === bookingId)
    if (!updated) return
    bookedSessionBeforeAdvanceEditorRef.current = updated
    setSelectedBookedSession((current: any) => {
      if (current && Number(current?.id) !== bookingId) return current
      return updated
    })
  }, [loadCalendarRangeOnly, selectedBookedSession?.id])

  const openBookedPaymentOpenBillEditor = useCallback((status: BookingPaymentStatus | null | undefined, explicitOpenBillId?: number | null) => {
    const openBillIdRaw = Number(explicitOpenBillId ?? status?.openBillId ?? 0)
    if (!Number.isInteger(openBillIdRaw) || openBillIdRaw <= 0) return false
    const params = new URLSearchParams(location.search)
    params.delete('createAdvance')
    params.delete('advanceSessionId')
    params.delete('advanceClientId')
    params.delete('advanceClientIds')
    params.delete('advanceConsultantId')
    params.delete('advanceBillingTarget')
    params.delete('advanceCompanyId')
    params.set('editOpenBillId', String(openBillIdRaw))
    const sessionId = Number(selectedBookedSession?.id ?? status?.bookingId ?? 0)
    if (Number.isInteger(sessionId) && sessionId > 0) params.set('sessionId', String(sessionId))
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: false })
    return true
  }, [location.pathname, location.search, navigate, selectedBookedSession?.id])

  const applyHolidayLabelsToMountedMonthCells = useCallback(() => {
    const calendarRoot = ((calendarRef.current as any)?.elRef?.current ?? null) as HTMLElement | null
    if (!calendarRoot) return
    const dayCells = Array.from(calendarRoot.querySelectorAll('.fc-daygrid-day[data-date]')) as HTMLElement[]
    dayCells.forEach((cell) => {
      const dateKey = cell.getAttribute('data-date') || ''
      const dayTop = cell.querySelector('.fc-daygrid-day-top') as HTMLElement | null
      if (!dayTop) return
      const old = dayTop.querySelector('.calendar-holiday-label')
      if (old) old.remove()
      const holidayName = holidaysByDate[dateKey]
      if (!holidayName) return
      const label = document.createElement('div')
      label.className = 'calendar-holiday-label'
      label.title = holidayName
      label.textContent = holidayName
      dayTop.appendChild(label)
    })
  }, [holidaysByDate])

  useEffect(() => {
    applyHolidayLabelsToMountedMonthCells()
  }, [holidaysByDate, view, applyHolidayLabelsToMountedMonthCells])

  useEffect(() => {
    if (!visibleRange?.start || !visibleRange?.end) return
    const startDate = new Date(visibleRange.start)
    const endExclusive = new Date(visibleRange.end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endExclusive.getTime())) return
    const endDate = new Date(endExclusive)
    endDate.setDate(endDate.getDate() - 1)
    const from = toIsoDateKey(startDate)
    const to = toIsoDateKey(endDate)
    const key = `${from}:${to}`
    if (key === lastHolidayRangeKeyRef.current) return
    lastHolidayRangeKeyRef.current = key
    let cancelled = false
    api
      .get('/holidays', { params: { from, to } })
      .then((res) => {
        if (cancelled) return
        const rows: Array<{ date?: string; localName?: string; name?: string }> = Array.isArray(res.data) ? res.data : []
        const next: Record<string, string> = {}
        rows.forEach((row) => {
          if (!row?.date) return
          next[row.date] = (row.localName || row.name || '').trim()
        })
        setHolidaysByDate(next)
      })
      .catch(() => {
        if (cancelled) return
        setHolidaysByDate({})
      })
    return () => {
      cancelled = true
    }
  }, [visibleRange])

  useEffect(() => {
    void Promise.all([
      load(),
      api.get('/zoom/status').then((r) => setZoomConnected(r.data.connected)).catch(() => setZoomConnected(false)),
      api.get('/google/status').then((r) => setGoogleConnected(r.data.connected)).catch(() => setGoogleConnected(false)),
      api.get('/ai/voice-booking/status').then((r) => setVoiceBookingConfigured(!!r.data?.configured)).catch(() => setVoiceBookingConfigured(false)),
    ])
    const calendarInterval = window.setInterval(() => void loadCalendarRangeOnly(true), CALENDAR_POLL_MS)
    const metaInterval = window.setInterval(() => void loadMetaOnly(), CALENDAR_META_POLL_MS)
    const refreshClients = () => api.get('/clients').then((r) => {
      const updated: any[] = r.data ?? []
      setMeta((prev: any) => ({ ...prev, clients: updated }))
      setForm((f: any) => {
        if (!f.clientId) return f
        const still = updated.find((c: any) => c.id === f.clientId)
        if (still && still.active !== false) return f
        return { ...f, clientId: undefined }
      })
    }).catch(() => {})
    const onTodosUpdated = () => void loadCalendarRangeOnly(true)
    const onSettingsUpdated = () => void loadMetaOnly()
    const onBookingUpdated = () => {
      if (realtimeCalendarReloadTimerRef.current != null) {
        window.clearTimeout(realtimeCalendarReloadTimerRef.current)
      }
      realtimeCalendarReloadTimerRef.current = window.setTimeout(() => {
        realtimeCalendarReloadTimerRef.current = null
        void loadCalendarRangeOnly(true)
      }, 250)
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void loadMetaOnly()
      void loadCalendarRangeOnly(true)
    }
    window.addEventListener('todos-updated', onTodosUpdated)
    window.addEventListener('clients-updated', refreshClients)
    window.addEventListener('settings-updated', onSettingsUpdated)
    window.addEventListener('users-updated', onSettingsUpdated)
    const unsubscribeBookingRealtime = subscribeBookingUpdates(onBookingUpdated)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(calendarInterval)
      window.clearInterval(metaInterval)
      window.removeEventListener('todos-updated', onTodosUpdated)
      window.removeEventListener('clients-updated', refreshClients)
      window.removeEventListener('settings-updated', onSettingsUpdated)
      window.removeEventListener('users-updated', onSettingsUpdated)
      unsubscribeBookingRealtime()
      if (realtimeCalendarReloadTimerRef.current != null) {
        window.clearTimeout(realtimeCalendarReloadTimerRef.current)
        realtimeCalendarReloadTimerRef.current = null
      }
      document.removeEventListener('visibilitychange', onVisibility)
      if (datesSetCalendarLoadTimerRef.current != null) {
        window.clearTimeout(datesSetCalendarLoadTimerRef.current)
        datesSetCalendarLoadTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const PENDING_EXTERNAL_TODO_KEY = 'openCalendarTodo'
    const applyPayload = (raw: unknown) => {
      const data = raw as {
        todoId?: unknown
        anchorRect?: { left?: unknown; right?: unknown; top?: unknown; bottom?: unknown } | null
      }
      const todoId = Number(data?.todoId)
      if (!Number.isFinite(todoId)) return
      const r = data?.anchorRect
      const hasRect =
        !!r &&
        Number.isFinite(Number(r.left)) &&
        Number.isFinite(Number(r.right)) &&
        Number.isFinite(Number(r.top)) &&
        Number.isFinite(Number(r.bottom))
      setPendingExternalTodo({
        todoId,
        anchorRect: hasRect
          ? {
              left: Number(r!.left),
              right: Number(r!.right),
              top: Number(r!.top),
              bottom: Number(r!.bottom),
            }
          : null,
      })
    }

    try {
      const raw = sessionStorage.getItem(PENDING_EXTERNAL_TODO_KEY)
      if (raw) {
        applyPayload(JSON.parse(raw))
        sessionStorage.removeItem(PENDING_EXTERNAL_TODO_KEY)
      }
    } catch {
      // ignore malformed payloads
    }

    const onOpenTodoFromShell = (ev: Event) => {
      const ce = ev as CustomEvent
      applyPayload(ce.detail)
    }

    window.addEventListener('open-calendar-todo', onOpenTodoFromShell)
    return () => {
      window.removeEventListener('open-calendar-todo', onOpenTodoFromShell)
    }
  }, [])

  useEffect(() => {
    if (!pendingExternalTodo || !todosModuleEnabled) return
    const todo = (calendarData.todos || []).find((t: any) => t.id === pendingExternalTodo.todoId)
    if (!todo) return
    sessionPopupAnchorRectRef.current = pendingExternalTodo.anchorRect ?? null
    setSelectedTodo(todo)
    setPendingExternalTodo(null)
  }, [pendingExternalTodo, calendarData.todos, todosModuleEnabled])

  useEffect(() => {
    if (!todosModuleEnabled) return
    const todoIdRaw = new URLSearchParams(location.search).get('todoId')
    if (!todoIdRaw) return
    const todoId = Number(todoIdRaw)
    if (!Number.isFinite(todoId)) return
    navigate(`/calendar/todo/${todoId}`, { replace: true })
  }, [todosModuleEnabled, location.search, navigate])

  const PENDING_BOOKING_KEY = 'pendingOnlineBooking'
  const PENDING_BOOKING_EDIT_KEY = 'pendingOnlineBookingEdit'

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_BOOKING_KEY)
    try {
      const pending = JSON.parse(raw)
      const pendingGroupIdRaw = pending.groupId != null ? Number(pending.groupId) : NaN
      const pendingGroupId = Number.isFinite(pendingGroupIdRaw) && pendingGroupIdRaw > 0 ? pendingGroupIdRaw : null
      const pendingClientIds = Array.isArray(pending.clientIds)
        ? pending.clientIds
            .map((v: any) => Number(v))
            .filter((v: number) => Number.isInteger(v) && v > 0)
        : (() => {
            const n = Number(pending.clientId)
            return Number.isInteger(n) && n > 0 ? [n] : []
          })()
      const hasClients = pendingClientIds.length > 0
      if ((!hasClients && !pendingGroupId) || !pending.consultantId || !pending.startTime || !pending.endTime) return
      Promise.all([
        api.get('/zoom/status').then((r) => r.data.connected).catch(() => false),
        api.get('/google/status').then((r) => r.data.connected).catch(() => false),
      ]).then(([zoom, google]) => {
        setZoomConnected(zoom)
        setGoogleConnected(google)
        const provider = pending.meetingProvider || 'zoom'
        const connected = provider === 'google' ? google : zoom
        if (!connected) {
          setSaveBookingError(`Still not connected to ${provider === 'google' ? 'Google Meet' : 'Zoom'}. Please try again.`)
          return
        }
        const payload = pendingGroupId
          ? {
              groupId: pendingGroupId,
              ...(pendingClientIds.length > 0
                ? { clientId: pendingClientIds[0], clientIds: pendingClientIds }
                : { clientIds: [] as number[] }),
              consultantId: pending.consultantId,
              startTime: pending.startTime,
              endTime: pending.endTime,
              spaceId: pending.spaceId ?? null,
              typeId: pending.typeId ?? null,
              notes: pending.notes ?? '',
              meetingLink: null,
              online: true,
              meetingProvider: provider,
              groupEmailOverride: null,
              groupBillingCompanyIdOverride: null,
              payees: Array.isArray(pending.payees) ? pending.payees : [],
            }
          : {
              clientId: pendingClientIds[0],
              clientIds: pendingClientIds,
              consultantId: pending.consultantId,
              startTime: pending.startTime,
              endTime: pending.endTime,
              spaceId: pending.spaceId ?? null,
              typeId: pending.typeId ?? null,
              notes: pending.notes ?? '',
              meetingLink: null,
              online: true,
              meetingProvider: provider,
              groupEmailOverride: null,
              groupBillingCompanyIdOverride: null,
              payees: Array.isArray(pending.payees) ? pending.payees : [],
            }
        api.post('/bookings', payload, {
          headers: { 'X-Skip-Conflict-Toast': 'true' },
        }).then(() => {
          load()
          window.dispatchEvent(new Event('todos-updated'))
          setSelection(null)
          setEditingClientSearch(false)
        }).catch((e: any) => {
          const msg = e?.response?.data?.message || e?.message || 'Failed to book session.'
          setSaveBookingError(String(msg))
        })
      })
    } catch {
      // ignore invalid JSON
    }
  }, [])

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_BOOKING_EDIT_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_BOOKING_EDIT_KEY)
    try {
      const pending = JSON.parse(raw)
      const bookingId = Number(pending.id)
      if (!Number.isFinite(bookingId) || bookingId <= 0 || !pending.startTime || !pending.endTime) return
      const pendingGroupIdRaw = pending.groupId != null ? Number(pending.groupId) : NaN
      const pendingGroupId = Number.isFinite(pendingGroupIdRaw) && pendingGroupIdRaw > 0 ? pendingGroupIdRaw : null
      const pendingClientIds = Array.isArray(pending.clientIds)
        ? pending.clientIds
            .map((v: any) => Number(v))
            .filter((v: number) => Number.isInteger(v) && v > 0)
        : (() => {
            const n = Number(pending.clientId)
            return Number.isInteger(n) && n > 0 ? [n] : []
          })()
      const hasClients = pendingClientIds.length > 0
      if ((!hasClients && !pendingGroupId)) return
      Promise.all([
        api.get('/zoom/status').then((r) => r.data.connected).catch(() => false),
        api.get('/google/status').then((r) => r.data.connected).catch(() => false),
      ]).then(([zoom, google]) => {
        setZoomConnected(zoom)
        setGoogleConnected(google)
        const provider = pending.meetingProvider || 'zoom'
        const connected = provider === 'google' ? google : zoom
        if (!connected) {
          setSaveBookingError(`Still not connected to ${provider === 'google' ? 'Google Meet' : 'Zoom'}. Please try again.`)
          return
        }
        const payload = {
          ...(pendingGroupId && pendingClientIds.length === 0
            ? { clientIds: [] as number[] }
            : { clientId: pendingClientIds[0], clientIds: pendingClientIds }),
          consultantId: pending.consultantId ?? null,
          startTime: pending.startTime,
          endTime: pending.endTime,
          spaceId: pending.spaceId ?? null,
          typeId: pending.typeId ?? null,
          notes: pending.notes ?? '',
          meetingLink: null,
          online: true,
          meetingProvider: provider,
          groupEmailOverride: null,
          groupBillingCompanyIdOverride: null,
          bookingStatus: normalizeStoredBookingStatus(pending.bookingStatus),
          payees: Array.isArray(pending.payees) ? pending.payees : [],
          ...(pending.allowPersonalBlockOverlap ? { allowPersonalBlockOverlap: true } : {}),
        }
        const pendingStatusValidation = getStatusTransitionValidation(
          payload.startTime,
          payload.endTime,
          selectedBookedSession?.bookingStatus ?? payload.bookingStatus,
          payload.bookingStatus,
        )
        if (!pendingStatusValidation.allowed) {
          setSaveBookingError(formatInvalidStatusTransitionMessage(pendingStatusValidation.reason, payload.bookingStatus))
          return
        }
        api.put(`/bookings/${bookingId}`, payload).then(() => {
          setSelectedBookedSession(null)
          setBookedStatusMenuOpen(false)
          notifyBookingAndClientRecordsChanged()
          load()
          leaveCompactFormRouteIfNeeded()
        }).catch((e: any) => {
          const msg = e?.response?.data?.message || e?.message || 'Failed to update session.'
          setSaveBookingError(String(msg))
        })
      })
    } catch {
      // ignore invalid JSON
    }
  }, [])

  const connectZoom = async () => {
    const returnTo = `${location.pathname}${location.search}` || '/calendar'
    setPostZoomReturnPath(returnTo)
    navigate(`/zoom/install?next=${encodeURIComponent(returnTo)}`)
  }
  const connectGoogle = async () => {
    const { data } = await api.get('/google/authorize')
    window.location.href = data.redirectUrl
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const toLocalDateTimeString = (date: Date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  const normalizeToLocalDateTime = (value: string) => {
    if (!value) return value
    // If it includes timezone offset or Z, normalize it to local (no offset) for backend LocalDateTime.
    if (value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value)) {
      return toLocalDateTimeString(new Date(value))
    }
    // If it already looks like local datetime, keep it.
    return value.length === 16 ? `${value}:00` : value
  }

  const fallbackSessionLengthMinutes = Number(settings.SESSION_LENGTH_MINUTES || 60)
  const bookableEnabled = settings.BOOKABLE_ENABLED !== 'false'
  const aiBookingEnabled = settings.AI_BOOKING_ENABLED !== 'false'
  const spacesEnabled = settings.SPACES_ENABLED === 'true'
  /** Spaces setting on and at least one space exists — hide mode + space filters otherwise */
  const calendarSpacesFeatureActive = spacesEnabled && metaSpaces.length > 0
  /** Right rail shows mode switch (spaces) and/or date arrows; omit grid column when unused so the grid fills width */
  const showCalendarRightRail =
    calendarSpacesFeatureActive || (calendarDateNavArrowsInRail && !calendarMobileHeaderNav)

  const spacesUseResourceColumns =
    calendarMode === 'spaces' && spaceFilterId == null && !isNativeAndroid && calendarSpacesFeatureActive

  const bookingsUseResourceColumns =
    calendarMode === 'bookings' && isTenantAdmin && consultantFilterId == null && !isNativeAndroid

  const useResourceColumns = spacesUseResourceColumns || bookingsUseResourceColumns
  const useUnassignedDrawer = spacesUseResourceColumns || bookingsUseResourceColumns

  useEffect(() => {
    if (!personalModuleEnabled) {
      setForm((f: any) => ({ ...f, personal: false }))
      setSelectedPersonalBlock(null)
      setPersonalTaskPresetDropdownOpen(false)
    }
  }, [personalModuleEnabled])

  useEffect(() => {
    if (!todosModuleEnabled) {
      setForm((f: any) => ({ ...f, todo: false }))
      setSelectedTodo(null)
      setAndroidTodoOpen(false)
    }
  }, [todosModuleEnabled])

  const calendarPlugins = useMemo(
    () =>
      isNativeAndroid
        ? [dayGridPlugin, timeGridPlugin, interactionPlugin]
        : [dayGridPlugin, timeGridPlugin, interactionPlugin, resourcePlugin, resourceTimeGridPlugin, resourceDayGridPlugin],
    [],
  )

  const calendarResources = useMemo((): { id: string; title: string }[] | undefined => {
    if (spacesUseResourceColumns) {
      const resources = [
        { id: SPACE_RESOURCE_UNASSIGNED_ID, title: t('spaceUnassigned') },
        ...metaSpaces.map((s: any) => ({ id: String(s.id), title: s.name })),
      ]
      return useUnassignedDrawer
        ? resources.filter((resource) => resource.id !== SPACE_RESOURCE_UNASSIGNED_ID)
        : resources
    }
    if (bookingsUseResourceColumns) {
      const consultants = metaUsers.filter((u: any) => u.consultant || u.role === 'CONSULTANT')
      return consultants.map((u: any) => ({
          id: String(u.id),
          title: `${u.firstName} ${u.lastName}`.trim(),
        }))
    }
    return undefined
  }, [spacesUseResourceColumns, bookingsUseResourceColumns, metaSpaces, metaUsers, t, useUnassignedDrawer])

  const consultantHeaderToneById = useMemo(() => {
    const map = new Map<string, number>()
    metaUsers
      .filter((u: any) => u.consultant || u.role === 'CONSULTANT')
      .forEach((u: any, index: number) => {
        map.set(String(u.id), index % 7)
      })
    return map
  }, [metaUsers])

  /** When FC resource day view omits the date row, show the same stack as dayHeaderContent (belt-and-suspenders). */
  const resourceDayViewHeaderFallbackEl = useMemo(() => {
    if (isNativeAndroid || !useResourceColumns || view !== 'resourceTimeGridDay' || !visibleRange?.start) {
      return null
    }
    const d = new Date(`${visibleRange.start}T12:00:00`)
    if (!Number.isFinite(d.getTime())) return null
    const dowRaw = d.toLocaleDateString(calendarLocaleTag, { weekday: 'short' })
    const dowBase = dowRaw.replace(/\.$/, '').slice(0, 3)
    const dow = dowBase.charAt(0).toUpperCase() + dowBase.slice(1).toLowerCase()
    const dayNum = d.getDate()
    const holidayName = holidaysByDate[toIsoDateKey(d)]
    const now = new Date()
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    return (
      <div className="calendar-resource-day-header-fallback" key={visibleRange.start}>
        <div className="calendar-resource-day-header-fallback-inner">
          <div className="calendar-resource-day-header-fallback-axis" aria-hidden />
          <div className="calendar-resource-day-header-fallback-cell">
            <div
              className="fc-day-header-stack"
              role="button"
              tabIndex={0}
              onClick={() => openCalendarDayView(d)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openCalendarDayView(d)
                }
              }}
            >
              <span
                className={`calendar-header-holiday-pill${holidayName ? '' : ' calendar-header-holiday-pill--empty'}`}
                title={holidayName || ''}
              >
                {holidayName || '\u00A0'}
              </span>
              <span className="fc-day-header-dow">{dow}</span>
              <span className={`fc-day-header-dom${isToday ? ' fc-day-header-dom--today' : ''}`}>{dayNum}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }, [
    isNativeAndroid,
    useResourceColumns,
    view,
    visibleRange?.start,
    holidaysByDate,
    calendarLocaleTag,
    openCalendarDayView,
  ])

  useEffect(() => {
    if (isNativeAndroid) return
    const switchView = () => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      const cur = api.view.type
      const toResource: Record<string, string> = {
        day: 'resourceTimeGridDay',
        week: 'resourceTimeGridWeek',
        threeDay: 'resourceTimeGridThreeDay',
        month: 'resourceDayGridMonth',
      }
      const fromResource: Record<string, string> = {
        day: 'timeGridDay',
        week: 'timeGridWeek',
        threeDay: 'timeGridThreeDay',
        month: 'dayGridMonth',
      }
      const inferViewKind = (value: string): 'day' | 'week' | 'threeDay' | 'month' => {
        if (value === 'timeGridThreeDay' || value === 'resourceTimeGridThreeDay') return 'threeDay'
        if (value === 'dayGridMonth' || value === 'resourceDayGridMonth') return 'month'
        if (value === 'timeGridDay' || value === 'resourceTimeGridDay') return 'day'
        return 'week'
      }
      const currentKind = inferViewKind(cur || view)
      const isResourceView = cur.startsWith('resource')
      if (useResourceColumns) {
        if (!isResourceView) {
          const next = toResource[currentKind]
          api.changeView(next)
          requestAnimationFrame(() => api.updateSize())
        }
      } else {
        if (isResourceView) {
          const next = fromResource[currentKind]
          api.changeView(next)
          requestAnimationFrame(() => api.updateSize())
        }
      }
    }
    // Defer once to avoid flushSync warning while preventing double-switch jitter.
    const t1 = setTimeout(switchView, 0)
    return () => { clearTimeout(t1) }
  }, [calendarMode, spaceFilterId, consultantFilterId, isNativeAndroid, useResourceColumns, view])

  const toCalendarTimeValue = (value: string | undefined, fallback: string) => {
    const v = (value || fallback).trim()
    if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`
    if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v
    return `${fallback}:00`
  }
  const slotMinTime = toCalendarTimeValue(settings.WORKING_HOURS_START, '05:00')
  const slotMaxTime = toCalendarTimeValue(settings.WORKING_HOURS_END, '23:00')
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const
  const calendarSlotDurationMinutes = 15

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX}px)`)
    const apply = () => {
      calendarSmallDragHintViewportRef.current = mq.matches
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const teardownCalendarDragAxisHint = useCallback(() => {
    const cleanup = calendarDragPointerCleanupRef.current
    if (cleanup) {
      cleanup()
      calendarDragPointerCleanupRef.current = null
    }
    const pill = calendarDragTimePillRef.current
    if (pill?.parentNode) {
      pill.remove()
      calendarDragTimePillRef.current = null
    }
  }, [])

  const positionCalendarDragAxisHint = useCallback(
    (clientY: number) => {
      if (!calendarSmallDragHintViewportRef.current || !isDraggingEventRef.current) {
        const p = calendarDragTimePillRef.current
        if (p) p.style.visibility = 'hidden'
        return
      }
      const host = calendarAndroidWeekRef.current
      if (!host) return
      const api = calendarRef.current?.getApi()
      const vt = api?.view.type ?? ''
      if (!vt.includes('timeGrid')) {
        const p = calendarDragTimePillRef.current
        if (p) p.style.visibility = 'hidden'
        return
      }

      const mirror =
        (host.querySelector('.fc-event-mirror') as HTMLElement | null)
        ?? (document.querySelector('.fc .fc-event-mirror') as HTMLElement | null)
      const yAnchor = mirror ? mirror.getBoundingClientRect().top + 1 : clientY

      const rows = Array.from(host.querySelectorAll('.fc-timegrid-slots tbody tr')) as HTMLTableRowElement[]
      if (!rows.length) return

      let row = rows.find((r) => {
        const b = r.getBoundingClientRect()
        return yAnchor >= b.top && yAnchor < b.bottom
      })
      if (!row) {
        const topR = rows[0].getBoundingClientRect()
        const botR = rows[rows.length - 1].getBoundingClientRect()
        if (yAnchor < topR.top) row = rows[0]
        else if (yAnchor > botR.bottom) row = rows[rows.length - 1]
        else return
      }

      const idx = rows.indexOf(row)
      const minParts = slotMinTime.split(':').map((v) => Number(v) || 0)
      const startMin = minParts[0] * 60 + (minParts[1] || 0)
      const tMin = startMin + idx * calendarSlotDurationMinutes
      const hh = Math.floor(tMin / 60)
      const mm = tMin % 60
      const labelDate = new Date(2000, 0, 1, hh, mm, 0, 0)
      const text = labelDate.toLocaleTimeString(calendarLocaleTag, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })

      const labelCell = row.querySelector('.fc-timegrid-slot-label') as HTMLElement | null
      if (!labelCell) return

      let pill = calendarDragTimePillRef.current
      if (!pill) {
        pill = document.createElement('div')
        pill.className = 'calendar-drag-axis-time-hint'
        pill.setAttribute('aria-live', 'polite')
        pill.setAttribute('role', 'status')
        document.body.appendChild(pill)
        calendarDragTimePillRef.current = pill
      }

      const lr = labelCell.getBoundingClientRect()
      pill.textContent = text
      pill.style.visibility = 'visible'
      pill.style.position = 'fixed'
      pill.style.left = `${lr.left}px`
      pill.style.top = `${lr.top}px`
      pill.style.width = `${lr.width}px`
      pill.style.minHeight = `${lr.height}px`
      pill.style.height = `${lr.height}px`
    },
    [slotMinTime, calendarLocaleTag],
  )

  useEffect(() => () => teardownCalendarDragAxisHint(), [teardownCalendarDragAxisHint])

  useEffect(() => {
    if (calendarMode === 'availability' && !bookableEnabled) {
      setCalendarMode('bookings')
      return
    }
    if (calendarMode === 'spaces' && !calendarSpacesFeatureActive) {
      setCalendarMode('bookings')
    }
  }, [calendarMode, bookableEnabled, calendarSpacesFeatureActive])

  useEffect(() => {
    if (isNativeAndroid) return
    setDragSelection(null)
    calendarRef.current?.getApi()?.unselect()
  }, [calendarMode, isNativeAndroid])

  const openAvailabilityModalFromSelection = (
    start: string,
    end: string,
    preferredConsultantId?: number | null,
    opts?: { skipCompactNavigate?: boolean },
  ) => {
    const startLocal = normalizeToLocalDateTime(start)
    const endLocal = normalizeToLocalDateTime(end)
    const availableConsultants = metaUsers.filter((u: any) => u.consultant)
    const selectionResourceConsultantId =
      selection?.resourceId && selection.resourceId !== CONSULTANT_RESOURCE_UNASSIGNED_ID
        ? Number(selection.resourceId)
        : null
    const defaultConsultantId =
      preferredConsultantId
      ?? (Number.isFinite(selectionResourceConsultantId) ? selectionResourceConsultantId : null)
      ?? consultantFilterId
      ?? availableConsultants[0]?.id
      ?? user.id
    const startDateOnly = startLocal.slice(0, 10)
    const endDateOnly = endLocal.slice(0, 10)
    setSelection({ start: startLocal, end: endLocal })
    setAvailabilityError(null)
    setAvailabilityIntent('add')
    setAvailabilitySelection({
      slotId: null,
      consultantId: defaultConsultantId,
      startTime: startLocal,
      endTime: endLocal,
      indefinite: false,
      rangeStartDate: startDateOnly,
      rangeEndDate: endDateOnly,
    })
    if (useBookingSidePanel && !opts?.skipCompactNavigate) {
      const slotQ: NewSlotQuery = {
        start: startLocal,
        end: endLocal,
        consultantId: defaultConsultantId,
        spaceId: form.spaceId !== undefined ? form.spaceId : undefined,
        clientId: form.clientId != null && Number.isInteger(Number(form.clientId)) && Number(form.clientId) > 0 ? form.clientId : undefined,
        resourceId:
          selection?.resourceId != null && selection.resourceId !== ''
            ? String(selection.resourceId)
            : undefined,
        outsideBookable: Boolean(form.outsideBookable),
      }
      const availabilityQ: AvailabilityFormQuery = {
        start: startLocal,
        end: endLocal,
        consultantId: defaultConsultantId,
        slotId: null,
        indefinite: false,
        rangeStartDate: startDateOnly,
        rangeEndDate: endDateOnly,
        fromWorkingHours: false,
      }
      pushCompactFormRoute(`${ROUTE_NEW_BOOKING}?${mergeNewBookingAndAvailabilitySearch(slotQ, availabilityQ)}`)
    }
  }

  const openAvailabilityModalFromSlot = (slot: any) => {
    const date = slot.date || new Date().toISOString().slice(0, 10)
    const startRaw = String(slot.startTime || '09:00:00')
    const endRaw = String(slot.endTime || '10:00:00')
    const startTime = `${date}T${startRaw.slice(0, 5)}:00`
    const endTime = `${date}T${endRaw.slice(0, 5)}:00`
    setSelection({ start: startTime, end: endTime })
    setAvailabilityError(null)
    setAvailabilityIntent('add')
    setAvailabilitySelection({
      slotId: slot.fromWorkingHours ? null : slot.id,
      consultantId: slot.consultant?.id ?? consultantFilterId ?? user.id,
      startTime,
      endTime,
      indefinite: !!slot.indefinite,
      rangeStartDate: slot.startDate || date,
      rangeEndDate: slot.endDate || date,
    })
    if (useBookingSidePanel) {
      const cid = slot.consultant?.id ?? consultantFilterId ?? user.id
      const slotQ: NewSlotQuery = {
        start: startTime,
        end: endTime,
        consultantId: cid,
      }
      const availabilityQ: AvailabilityFormQuery = {
        start: startTime,
        end: endTime,
        consultantId: cid,
        slotId: slot.fromWorkingHours ? null : slot.id,
        indefinite: !!slot.indefinite,
        rangeStartDate: slot.startDate || date,
        rangeEndDate: slot.endDate || date,
        fromWorkingHours: !!slot.fromWorkingHours,
      }
      pushCompactFormRoute(`${ROUTE_NEW_BOOKING}?${mergeNewBookingAndAvailabilitySearch(slotQ, availabilityQ)}`)
    }
  }

  const buildNewFormPanelOrder = (): Array<'booking' | 'personal' | 'todo' | 'availability'> => {
    const o: Array<'booking' | 'personal' | 'todo' | 'availability'> = ['booking']
    if (personalModuleEnabled) o.push('personal')
    if (todosModuleEnabled) o.push('todo')
    o.push('availability')
    return o
  }

  const getActiveNewFormPanel = (): 'booking' | 'personal' | 'todo' | 'availability' => {
    if (availabilitySelection) return 'availability'
    if (form.todo) return 'todo'
    if (form.personal) return 'personal'
    return 'booking'
  }

  const activateNewFormPanel = (panel: 'booking' | 'personal' | 'todo' | 'availability') => {
    if (panel === 'booking') {
      setAvailabilitySelection(null)
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setForm((f: any) => ({ ...f, personal: false, todo: false }))
      return
    }
    if (panel === 'personal') {
      setAvailabilitySelection(null)
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setForm((f: any) => ({ ...f, personal: true, todo: false, online: false, consultantId: user.id }))
      return
    }
    if (panel === 'todo') {
      setAvailabilitySelection(null)
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setForm((f: any) => ({ ...f, todo: true, personal: false, online: false, consultantId: user.id }))
      return
    }
    const start = form.startTime || selection?.start
    const end = form.endTime || selection?.end
    if (!start || !end) return
    openAvailabilityModalFromSelection(start, end, form.consultantId ?? null, { skipCompactNavigate: true })
  }

  const stepNewFormPanel = (dir: -1 | 1) => {
    if (!useBookingSidePanel || isNativeAndroid) return
    const order = buildNewFormPanelOrder()
    const cur = getActiveNewFormPanel()
    const idx = order.indexOf(cur)
    if (idx < 0) return
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= order.length) return
    activateNewFormPanel(order[nextIdx])
  }

  const newFormPanelSwipeRef = useRef<{ x: number; y: number } | null>(null)

  const onNewFormPanelTouchStart = (e: ReactTouchEvent) => {
    if (!useBookingSidePanel || isNativeAndroid) return
    const p = e.touches[0]
    if (!p) return
    newFormPanelSwipeRef.current = { x: p.clientX, y: p.clientY }
  }

  const onNewFormPanelTouchEnd = (e: ReactTouchEvent) => {
    if (!useBookingSidePanel || isNativeAndroid) return
    const start = newFormPanelSwipeRef.current
    newFormPanelSwipeRef.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.15) return
    stepNewFormPanel(dx < 0 ? 1 : -1)
    document.querySelectorAll<HTMLElement>('.booking-type-switcher .booking-type-btn').forEach((el) => {
      el.blur()
    })
  }

  const closeAvailabilityModal = () => {
    setSelection(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingProviderPickerTarget(null)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    if (!isNativeAndroid) {
      setDragSelection(null)
      calendarRef.current?.getApi()?.unselect()
    }
    leaveCompactFormRouteIfNeeded()
  }

  const buildAvailabilityBlockMarkerNotes = (payload: { dayOfWeek: string; startTime: string; endTime: string; indefinite: boolean; startDate: string | null; endDate: string | null }, anchorDate?: string) => {
    const metadataStartDate = payload.indefinite ? (anchorDate || payload.startDate || '') : (payload.startDate || '')
    const metadata = [
      `dayOfWeek=${payload.dayOfWeek}`,
      `startTime=${payload.startTime}`,
      `endTime=${payload.endTime}`,
      `indefinite=${payload.indefinite ? 'true' : 'false'}`,
      `startDate=${metadataStartDate}`,
      `endDate=${payload.indefinite ? '' : payload.endDate || ''}`,
    ].join(';')
    return `Availability blocked
${AVAILABILITY_BLOCK_METADATA_PREFIX}${metadata}`
  }

  const saveAvailabilitySlot = async () => {
    if (!availabilitySelection) return
    setAvailabilityError(null)
    const startDate = new Date(availabilitySelection.startTime)
    const endDate = new Date(availabilitySelection.endTime)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      setAvailabilityError('Please provide valid start and end times.')
      return
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setAvailabilityError('End time must be after start time.')
      return
    }
    const consultantId = isTenantAdmin
      ? Number(availabilitySelection.consultantId)
      : user.id
    if (!consultantId) {
      setAvailabilityError('Please select a consultant.')
      return
    }
    const indefinite = !!availabilitySelection.indefinite
    const payload = {
      dayOfWeek: dayNames[startDate.getDay()],
      startTime: startDate.toTimeString().slice(0, 8),
      endTime: endDate.toTimeString().slice(0, 8),
      consultantId,
      indefinite,
      startDate: indefinite ? null : (availabilitySelection.rangeStartDate || availabilitySelection.startTime.slice(0, 10)),
      endDate: indefinite ? null : (availabilitySelection.rangeEndDate || availabilitySelection.endTime.slice(0, 10)),
    }
    const overlapsDateWindow = (slot: any) => {
      const slotStart = slot.indefinite ? '1970-01-01' : String(slot.startDate || '1970-01-01')
      const slotEnd = slot.indefinite ? '2999-12-31' : String(slot.endDate || '2999-12-31')
      const payloadStart = payload.indefinite ? '1970-01-01' : String(payload.startDate || '1970-01-01')
      const payloadEnd = payload.indefinite ? '2999-12-31' : String(payload.endDate || '2999-12-31')
      return slotStart <= payloadEnd && slotEnd >= payloadStart
    }
    const toMinutes = (timeStr: string) => {
      const [hh, mm] = String(timeStr || '00:00:00').split(':')
      return (Number(hh) || 0) * 60 + (Number(mm) || 0)
    }
    const releaseAvailabilityBlockMarkers = async () => {
      const reqStartMs = startDate.getTime()
      const reqEndMs = endDate.getTime()
      const availabilityBlocks = (calendarData.personal || []).filter((p: any) => {
        if (String(p?.task || '').trim().toLowerCase() !== AVAILABILITY_BLOCK_TASK) return false
        const ownerId = p.consultant?.id ?? p.consultantId ?? p.ownerId
        if (ownerId !== consultantId) return false
        const blockStartMs = new Date(p.startTime).getTime()
        const blockEndMs = new Date(p.endTime).getTime()
        return Number.isFinite(blockStartMs)
          && Number.isFinite(blockEndMs)
          && blockEndMs > blockStartMs
          && blockStartMs < reqEndMs
          && blockEndMs > reqStartMs
      })

      for (const block of availabilityBlocks) {
        if (!block.id) continue
        const blockStartMs = new Date(block.startTime).getTime()
        const blockEndMs = new Date(block.endTime).getTime()
        const blockOwnerId = block.consultant?.id ?? block.consultantId ?? block.ownerId ?? consultantId
        const task = String(block.task || AVAILABILITY_BLOCK_TASK)
        const notes = block.notes || 'Availability blocked'
        const updateBlock = async (nextStartMs: number, nextEndMs: number) => {
          if (!Number.isFinite(nextStartMs) || !Number.isFinite(nextEndMs) || nextEndMs <= nextStartMs) {
            await api.delete(`/bookings/personal-blocks/${block.id}`)
            return
          }
          await api.put(`/bookings/personal-blocks/${block.id}`, {
            startTime: toLocalDateTimeString(new Date(nextStartMs)),
            endTime: toLocalDateTimeString(new Date(nextEndMs)),
            task,
            notes,
          })
        }

        if (reqStartMs <= blockStartMs && reqEndMs >= blockEndMs) {
          await api.delete(`/bookings/personal-blocks/${block.id}`)
          continue
        }

        if (reqStartMs <= blockStartMs && reqEndMs < blockEndMs) {
          await updateBlock(reqEndMs, blockEndMs)
          continue
        }

        if (reqStartMs > blockStartMs && reqEndMs >= blockEndMs) {
          await updateBlock(blockStartMs, reqStartMs)
          continue
        }

        if (reqStartMs > blockStartMs && reqEndMs < blockEndMs) {
          await updateBlock(blockStartMs, reqStartMs)
          await api.post('/bookings/personal-blocks', {
            startTime: toLocalDateTimeString(new Date(reqEndMs)),
            endTime: toLocalDateTimeString(new Date(blockEndMs)),
            task,
            notes,
            consultantId: blockOwnerId,
          })
        }
      }
    }
    setAvailabilitySaving(true)
    try {
      await releaseAvailabilityBlockMarkers()
      if (availabilitySelection.slotId) {
        await api.put(`/bookable-slots/${availabilitySelection.slotId}`, payload)
      } else {
        // Upsert behavior for Bookings-mode creation:
        // if an overlapping slot exists for same consultant/day/date-window,
        // expand/update it to the union instead of creating a second row.
        const sameConsultantDaySlots = (calendarData.bookable || []).filter((slot: any) => {
          const slotConsultantId = slot.consultant?.id ?? slot.consultantId
          if (slotConsultantId !== payload.consultantId) return false
          if (slot.dayOfWeek !== payload.dayOfWeek) return false
          return overlapsDateWindow(slot)
        })
        const touchingOrOverlapping = sameConsultantDaySlots.filter((slot: any) => {
          const slotStartMin = toMinutes(String(slot.startTime || '00:00:00'))
          const slotEndMin = toMinutes(String(slot.endTime || '00:00:00'))
          const payloadStartMin = toMinutes(payload.startTime)
          const payloadEndMin = toMinutes(payload.endTime)
          return slotStartMin <= payloadEndMin && slotEndMin >= payloadStartMin
        })
        const payloadStartMin = toMinutes(payload.startTime)
        const payloadEndMin = toMinutes(payload.endTime)
        const coveredRanges = touchingOrOverlapping
          .map((slot: any) => {
            const slotStartMin = toMinutes(String(slot.startTime || '00:00:00'))
            const slotEndMin = toMinutes(String(slot.endTime || '00:00:00'))
            return {
              startMin: Math.max(payloadStartMin, slotStartMin),
              endMin: Math.min(payloadEndMin, slotEndMin),
            }
          })
          .filter((r: any) => r.endMin > r.startMin)
          .sort((a: any, b: any) => a.startMin - b.startMin)
        let coverageCursor = payloadStartMin
        for (const r of coveredRanges) {
          if (r.endMin <= coverageCursor) continue
          if (r.startMin > coverageCursor) break
          coverageCursor = Math.max(coverageCursor, r.endMin)
          if (coverageCursor >= payloadEndMin) break
        }
        if (coverageCursor >= payloadEndMin) {
          // Already fully available for this consultant/day/date window -> no-op.
          await load()
          closeAvailabilityModal()
          return
        }

        if (touchingOrOverlapping.length > 0) {
          const mergedStart = [payload.startTime, ...touchingOrOverlapping.map((s: any) => String(s.startTime || payload.startTime))].sort()[0]
          const mergedEnd = [payload.endTime, ...touchingOrOverlapping.map((s: any) => String(s.endTime || payload.endTime))].sort().slice(-1)[0]
          const mergedIndefinite = payload.indefinite || touchingOrOverlapping.some((s: any) => !!s.indefinite)
          const mergedStartDate = mergedIndefinite
            ? null
            : [String(payload.startDate), ...touchingOrOverlapping.map((s: any) => String(s.startDate || payload.startDate))].sort()[0]
          const mergedEndDate = mergedIndefinite
            ? null
            : [String(payload.endDate), ...touchingOrOverlapping.map((s: any) => String(s.endDate || payload.endDate))].sort().slice(-1)[0]

          const mergedPayload = {
            ...payload,
            startTime: mergedStart,
            endTime: mergedEnd,
            indefinite: mergedIndefinite,
            startDate: mergedStartDate,
            endDate: mergedEndDate,
          }
          const idsToReplace = touchingOrOverlapping.map((s: any) => s.id).filter((id: any) => id != null)
          if (idsToReplace.length > 0) {
            await Promise.all(idsToReplace.map((id: any) => api.delete(`/bookable-slots/${id}`)))
          }
          await api.post('/bookable-slots', mergedPayload)
        } else {
          await api.post('/bookable-slots', payload)
        }
      }
      await load()
      closeAvailabilityModal()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save availability session.'
      setAvailabilityError(String(msg))
      setAvailabilitySaving(false)
    }
  }

  const blockAvailabilitySlot = async () => {
    if (!availabilitySelection) return
    setAvailabilityError(null)
    const startDate = new Date(availabilitySelection.startTime)
    const endDate = new Date(availabilitySelection.endTime)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      setAvailabilityError('Please provide valid start and end times.')
      return
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setAvailabilityError('End time must be after start time.')
      return
    }
    const consultantId = isTenantAdmin
      ? Number(availabilitySelection.consultantId)
      : user.id
    if (!consultantId) {
      setAvailabilityError('Please select a consultant.')
      return
    }
    const indefinite = !!availabilitySelection.indefinite
    const payload = {
      dayOfWeek: dayNames[startDate.getDay()],
      startTime: startDate.toTimeString().slice(0, 8),
      endTime: endDate.toTimeString().slice(0, 8),
      consultantId,
      indefinite,
      startDate: indefinite ? null : (availabilitySelection.rangeStartDate || availabilitySelection.startTime.slice(0, 10)),
      endDate: indefinite ? null : (availabilitySelection.rangeEndDate || availabilitySelection.endTime.slice(0, 10)),
    }
    const overlapsDateWindow = (slot: any) => {
      const slotStart = slot.indefinite ? '1970-01-01' : String(slot.startDate || '1970-01-01')
      const slotEnd = slot.indefinite ? '2999-12-31' : String(slot.endDate || '2999-12-31')
      const payloadStart = payload.indefinite ? '1970-01-01' : String(payload.startDate || '1970-01-01')
      const payloadEnd = payload.indefinite ? '2999-12-31' : String(payload.endDate || '2999-12-31')
      return slotStart <= payloadEnd && slotEnd >= payloadStart
    }
    const toMinutes = (timeStr: string) => {
      const [hh, mm] = String(timeStr || '00:00:00').split(':')
      return (Number(hh) || 0) * 60 + (Number(mm) || 0)
    }
    setAvailabilitySaving(true)
    try {
      const blockStart = toMinutes(payload.startTime)
      const blockEnd = toMinutes(payload.endTime)
      const candidates = (calendarData.bookable || []).filter((slot: any) => {
        const slotConsultantId = slot.consultant?.id ?? slot.consultantId
        if (slotConsultantId !== payload.consultantId) return false
        if (slot.dayOfWeek !== payload.dayOfWeek) return false
        if (!overlapsDateWindow(slot)) return false
        const slotStart = toMinutes(String(slot.startTime || '00:00:00'))
        const slotEnd = toMinutes(String(slot.endTime || '00:00:00'))
        return slotStart < blockEnd && slotEnd > blockStart
      })

      const toHms = (totalMin: number) => {
        const h = Math.floor(totalMin / 60)
        const m = totalMin % 60
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
      }

      for (const slot of candidates) {
        if (!slot.id) continue
        const slotStart = toMinutes(String(slot.startTime || '00:00:00'))
        const slotEnd = toMinutes(String(slot.endTime || '00:00:00'))
        const overlapStart = Math.max(slotStart, blockStart)
        const overlapEnd = Math.min(slotEnd, blockEnd)
        if (overlapEnd <= overlapStart) continue

        // Fully covered => remove slot.
        if (blockStart <= slotStart && blockEnd >= slotEnd) {
          await api.delete(`/bookable-slots/${slot.id}`)
          continue
        }
        // Clip left edge.
        if (blockStart <= slotStart && blockEnd < slotEnd) {
          await api.put(`/bookable-slots/${slot.id}`, {
            dayOfWeek: slot.dayOfWeek,
            startTime: toHms(blockEnd),
            endTime: slot.endTime,
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
          continue
        }
        // Clip right edge.
        if (blockStart > slotStart && blockEnd >= slotEnd) {
          await api.put(`/bookable-slots/${slot.id}`, {
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: toHms(blockStart),
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
          continue
        }
        // Split middle: keep left by update, create right as a new slot.
        if (blockStart > slotStart && blockEnd < slotEnd) {
          await api.put(`/bookable-slots/${slot.id}`, {
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: toHms(blockStart),
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
          await api.post('/bookable-slots', {
            dayOfWeek: slot.dayOfWeek,
            startTime: toHms(blockEnd),
            endTime: slot.endTime,
            consultantId: slot.consultant?.id ?? slot.consultantId,
            indefinite: !!slot.indefinite,
            startDate: slot.indefinite ? null : slot.startDate,
            endDate: slot.indefinite ? null : slot.endDate,
          })
        }
      }

      // Also add an availability-block marker so working-hours availability
      // is removed for this period as well (not only explicit slots).
      const blockNotes = buildAvailabilityBlockMarkerNotes(payload, availabilitySelection.startTime.slice(0, 10))
      const alreadyHasSameRecurringBlock = (calendarData.personal || []).some((p: any) => {
        const ownerId = p.consultant?.id ?? p.consultantId ?? p.ownerId
        return ownerId === consultantId
          && String(p.task || '').trim().toLowerCase() === AVAILABILITY_BLOCK_TASK
          && String(p.notes || '') === blockNotes
      })
      if (!alreadyHasSameRecurringBlock) {
        await api.post('/bookings/personal-blocks', {
          startTime: availabilitySelection.startTime,
          endTime: availabilitySelection.endTime,
          task: AVAILABILITY_BLOCK_TASK,
          notes: blockNotes,
          consultantId: isTenantAdmin ? consultantId : undefined,
        })
      }

      await load()
      closeAvailabilityModal()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to block availability session.'
      setAvailabilityError(String(msg))
      setAvailabilitySaving(false)
    }
  }

  const confirmAvailabilityFromHeader = () => {
    void (availabilityIntent === 'block' ? blockAvailabilitySlot() : saveAvailabilitySlot())
  }

  const deleteAvailabilitySlot = async () => {
    if (!availabilitySelection?.slotId) return
    setAvailabilitySaving(true)
    setAvailabilityError(null)
    try {
      await api.delete(`/bookable-slots/${availabilitySelection.slotId}`)
      await load()
      closeAvailabilityModal()
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to delete availability session.'
      setAvailabilityError(String(msg))
      setAvailabilitySaving(false)
    }
  }

  const setCalendarModeView = useCallback(
    (mode: 'bookings' | 'availability' | 'spaces') => {
      if (mode === 'availability' && !bookableEnabled) return
      if (mode === 'spaces' && !calendarSpacesFeatureActive) return
      if (mode !== calendarMode) {
        setModeSwitching(true)
        if (modeSwitchingTimerRef.current != null) window.clearTimeout(modeSwitchingTimerRef.current)
        modeSwitchingTimerRef.current = window.setTimeout(() => {
          setModeSwitching(false)
          modeSwitchingTimerRef.current = null
        }, 380)
      }
      setCalendarMode(mode)
      setConfirmNonBookable(null)
      setSelection(null)
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setAvailabilitySelection(null)
      setAvailabilityIntent('add')
      setAvailabilityError(null)
      setAvailabilitySaving(false)
    },
    [bookableEnabled, calendarMode, calendarSpacesFeatureActive],
  )

  useEffect(() => {
    return () => {
      if (modeSwitchingTimerRef.current != null) {
        window.clearTimeout(modeSwitchingTimerRef.current)
      }
    }
  }, [])

  const showAdminConsultantFilter = useMemo(
    () => isTenantAdmin && calendarMode !== 'spaces' && metaUsers.length > 1,
    [user.role, calendarMode, metaUsers.length],
  )

  const shellCalendarFilters = useMemo(
    () => (
      <CalendarHeaderFilters
        showConsultant={showAdminConsultantFilter}
        showSpace={calendarSpacesFeatureActive && calendarMode !== 'availability'}
        consultantFilterId={consultantFilterId}
        onConsultantFilterChange={setConsultantFilterId}
        spaceFilterId={spaceFilterId}
        onSpaceFilterChange={setSpaceFilterId}
        consultantUsers={metaUsers.filter((u: any) => u.consultant)}
        spaces={metaSpaces}
      />
    ),
    [
      showAdminConsultantFilter,
      calendarMode,
      calendarSpacesFeatureActive,
      consultantFilterId,
      spaceFilterId,
      metaUsers,
      metaSpaces,
    ],
  )

  const showWebMobileBottomPanel =
    !isNativeAndroid &&
    calendarFiltersBottomBar &&
    ((isTenantAdmin && calendarMode !== 'spaces') ||
      (calendarSpacesFeatureActive && calendarMode !== 'availability') ||
      aiBookingEnabled)

  useEffect(() => {
    if (isNativeAndroid) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const api = calendarRef.current?.getApi()
      if (!api) return
      const k = e.key.toLowerCase()
      const res = useResourceColumns
      if (k === 'd') {
        e.preventDefault()
        api.changeView(res ? 'resourceTimeGridDay' : 'timeGridDay')
        api.today()
      } else if (k === '3') {
        e.preventDefault()
        goToThreeDayViewWithTodayCentered(calendarRef, res)
      } else if (k === 'w') {
        e.preventDefault()
        api.changeView(res ? 'resourceTimeGridWeek' : 'timeGridWeek')
      } else if (k === 'm') {
        e.preventDefault()
        api.changeView(res ? 'resourceDayGridMonth' : 'dayGridMonth')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isNativeAndroid, useResourceColumns])

  const getTypeMeta = (typeId: number | null | undefined) => {
    if (!typeId) return null
    return metaTypes?.find((x: any) => x.id === typeId) ?? null
  }

  const getTypeDurationMinutes = (typeId: number | null | undefined) => {
    const fallbackDuration = Number.isFinite(fallbackSessionLengthMinutes) && fallbackSessionLengthMinutes > 0
      ? fallbackSessionLengthMinutes
      : 60
    const t = getTypeMeta(typeId)
    const n = Number(t?.durationMinutes ?? fallbackDuration)
    if (!Number.isFinite(n) || n <= 0) return fallbackDuration
    return n
  }

  const getTypeBreakMinutes = (typeId: number | null | undefined) => {
    const t = getTypeMeta(typeId)
    const n = Number(t?.breakMinutes ?? 0)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  }

  const getTypeMaxParticipants = (typeId: number | null | undefined) => {
    const t = getTypeMeta(typeId)
    const n = Number(t?.maxParticipantsPerSession)
    if (!Number.isFinite(n) || n < 1 || n > 99) return null
    return n
  }

  const getBookingBreakMinutes = (booking: any) => {
    const direct = Number(booking?.type?.breakMinutes)
    if (Number.isFinite(direct) && direct >= 0) return direct
    return getTypeBreakMinutes(booking?.type?.id)
  }

  const getBookingBusyEndMs = (booking: any) => {
    const endMs = new Date(booking?.endTime).getTime()
    if (!Number.isFinite(endMs)) return endMs
    return endMs + getBookingBreakMinutes(booking) * 60000
  }

  const getBookingBreakRange = (booking: any) => {
    const breakMinutes = getBookingBreakMinutes(booking)
    if (!Number.isFinite(breakMinutes) || breakMinutes <= 0) return null
    const startMs = new Date(booking?.endTime).getTime()
    if (!Number.isFinite(startMs)) return null
    const endMs = startMs + breakMinutes * 60000
    if (endMs <= startMs) return null
    return { startMs, endMs, breakMinutes }
  }

  const getBookingEndTimeForStart = (startValue: string, typeId: number | null | undefined) => {
    const normalizedStartValue = normalizeToLocalDateTime(startValue)
    const startDate = new Date(normalizedStartValue)
    if (!Number.isFinite(startDate.getTime())) return normalizedStartValue
    return toLocalDateTimeString(new Date(startDate.getTime() + getTypeDurationMinutes(typeId) * 60000))
  }

  const updateBookingFormStartTime = (nextStartTime: string) => {
    const normalizedStartTime = normalizeToLocalDateTime(nextStartTime)
    bookingEndEditedManuallyRef.current = false
    setForm((currentForm: any) => ({
      ...currentForm,
      startTime: normalizedStartTime,
      endTime: getBookingEndTimeForStart(normalizedStartTime, currentForm.typeId),
    }))
  }

  const updateBookingFormEndTime = (nextEndTime: string) => {
    bookingEndEditedManuallyRef.current = true
    setForm((currentForm: any) => ({
      ...currentForm,
      endTime: normalizeToLocalDateTime(nextEndTime),
    }))
  }

  const updateBookingFormType = (nextTypeId: number | null) => {
    setForm((currentForm: any) => {
      const allDay = isLocalBookingAllDay(currentForm.startTime, currentForm.endTime)
      return {
        ...currentForm,
        typeId: nextTypeId,
        endTime: allDay
          ? currentForm.endTime
          : bookingEndEditedManuallyRef.current
            ? currentForm.endTime
            : getBookingEndTimeForStart(currentForm.startTime, nextTypeId),
      }
    })
  }

  const effectiveConsultantFilterId = calendarMode === 'spaces' ? null : consultantFilterId

  /** Bookable / booked rows: non-admin → own consultant only; admin + filter → that consultant; admin + ALL → all. */
  const filterByConsultantRole = (list: any[] | undefined) => {
    if (!Array.isArray(list)) return []
    if (calendarMode === 'spaces') return list
    if (!isTenantAdmin) {
      return list.filter((item: any) => item.consultant?.id === user.id)
    }
    if (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION) return list
    return list.filter((item: any) => item.consultant?.id === effectiveConsultantFilterId)
  }

  const adminConsultantFilterActive = isTenantAdmin && effectiveConsultantFilterId != null
  const selectedConsultantLabel = effectiveConsultantFilterId == null
    ? t('calendarFilterByStaffColumns')
    : effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION
      ? t('calendarFilterAllSessionsMerged')
      : fullName(metaUsers.find((u: any) => u.id === effectiveConsultantFilterId) || { firstName: '', lastName: '' })
  const selectedSpaceLabel = spaceFilterId == null
    ? t('calendarSpaceFilterAllLocations')
    : ((metaSpaces).find((s: any) => s.id === spaceFilterId)?.name || t('calendarSpaceFilterAllLocations'))

  const SLOT_MS = 15 * 60 * 1000

  const events = useMemo(() => {
    const selectedIsSelf = effectiveConsultantFilterId != null && effectiveConsultantFilterId === user.id
    const adminAll = isTenantAdmin && (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION)
    const adminSpecificOther = isTenantAdmin && effectiveConsultantFilterId != null && effectiveConsultantFilterId !== CONSULTANT_FILTER_ALL_SESSION && effectiveConsultantFilterId !== user.id
    const personalOwnerId = (p: any) => p.consultant?.id ?? p.consultantId ?? p.ownerId ?? null

    const splitRangeByBlocks = (startMs: number, endMs: number, blocks: Array<{ startMs: number; endMs: number }>) => {
      let segments: Array<{ startMs: number; endMs: number }> = [{ startMs, endMs }]
      for (const block of blocks) {
        segments = segments.flatMap((seg) => {
          const overlapStart = Math.max(seg.startMs, block.startMs)
          const overlapEnd = Math.min(seg.endMs, block.endMs)
          if (overlapEnd <= overlapStart) return [seg]
          const out: Array<{ startMs: number; endMs: number }> = []
          if (seg.startMs < overlapStart) out.push({ startMs: seg.startMs, endMs: overlapStart })
          if (overlapEnd < seg.endMs) out.push({ startMs: overlapEnd, endMs: seg.endMs })
          return out
        })
        if (segments.length === 0) break
      }
      return segments
    }
    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart
    const parseHmToMinutes = (timeValue: string) => {
      const [hh, mm] = timeValue.split(':').map((x) => Number(x) || 0)
      return hh * 60 + mm
    }

    const isMonthGridView = view === 'dayGridMonth' || view === 'resourceDayGridMonth'

    const multipleSessionsPerSpaceEnabled = settings.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true'
    /** When multiple physical sessions per space are allowed, do not flag break vs. another booking in that same space (mirrors backend space overlap rules). */
    const ignoreSameSpaceBreakOverlap = (a: any, other: any) => {
      if (!multipleSessionsPerSpaceEnabled || !spacesEnabled) return false
      const onlineA = !!(a?.meetingLink && String(a.meetingLink).trim())
      const onlineO = !!(other?.meetingLink && String(other.meetingLink).trim())
      if (onlineA || onlineO) return false
      const sa = a?.space?.id ?? null
      const so = other?.space?.id ?? null
      return sa != null && so != null && sa === so
    }

    const bookedBase = (
      isTenantAdmin
        ? filterByConsultantRole(calendarData.booked)
        : (calendarData.booked || [])
    )
    const bookedAll = bookedBase
      .filter((b: any) => {
        if (calendarMode === 'spaces') {
          const isOnline = !!(b.meetingLink && String(b.meetingLink).trim())
          const resolvedSpaceId = isOnline ? null : (b.space?.id ?? null)
          if (spaceFilterId != null) return resolvedSpaceId === spaceFilterId
          return true
        }
        if (!spacesEnabled) return true
        if (spaceFilterId == null) return true
        return b.space?.id === spaceFilterId
      })
      .map((b: any) => {
        const typeDurationMinutes = getTypeDurationMinutes(b.type?.id)
        const typeBreakMinutes = getTypeBreakMinutes(b.type?.id)
        const bookedOwnerId = b.consultant?.id ?? null
        const maskedBooked = !isTenantAdmin && bookedOwnerId !== user.id
        const breakRange = getBookingBreakRange({ ...b, type: { ...b.type, breakMinutes: typeBreakMinutes } })
        const breakConflict = !!breakRange && (
          bookedBase.some((other: any) => {
            if (other?.id === b.id) return false
            if (ignoreSameSpaceBreakOverlap(b, other)) return false
            const otherStartMs = new Date(other?.startTime).getTime()
            const otherEndMs = new Date(other?.endTime).getTime()
            return Number.isFinite(otherStartMs)
              && Number.isFinite(otherEndMs)
              && otherEndMs > otherStartMs
              && overlaps(breakRange.startMs, breakRange.endMs, otherStartMs, otherEndMs)
          }) ||
          (personalModuleEnabled ? (calendarData.personal || []) : []).some((other: any) => {
            const otherOwnerId = personalOwnerId(other)
            if (bookedOwnerId == null || otherOwnerId !== bookedOwnerId) return false
            const otherStartMs = new Date(other?.startTime).getTime()
            const otherEndMs = new Date(other?.endTime).getTime()
            return Number.isFinite(otherStartMs)
              && Number.isFinite(otherEndMs)
              && otherEndMs > otherStartMs
              && overlaps(breakRange.startMs, breakRange.endMs, otherStartMs, otherEndMs)
          })
        )
        const ev: any = {
          id: `b-${b.id}`,
          title: maskedBooked ? '' : formatBookingClientsLabel(b),
          start: b.startTime,
          end: b.endTime,
          color: '#16A34A',
          order: 1,
          editable: !maskedBooked && !isViewOnly,
          extendedProps: {
            ...b,
            kind: 'booked',
            type: b.type ? { ...b.type, durationMinutes: typeDurationMinutes, breakMinutes: typeBreakMinutes } : b.type,
            masked: maskedBooked,
            breakConflict,
            breakMinutes: typeBreakMinutes,
          },
        }
        if (spacesUseResourceColumns) {
          const isOnline = !!(b.meetingLink && String(b.meetingLink).trim())
          ev.resourceId = !isOnline && b.space?.id != null ? String(b.space.id) : SPACE_RESOURCE_UNASSIGNED_ID
          ev.resourceEditable = !maskedBooked && !isViewOnly
        }
        if (bookingsUseResourceColumns) {
          ev.resourceId = bookedOwnerId != null ? String(bookedOwnerId) : CONSULTANT_RESOURCE_UNASSIGNED_ID
          ev.resourceEditable = !maskedBooked && !isViewOnly
        }
        return ev
      })
    const booked = useUnassignedDrawer
      ? bookedAll.filter((ev: any) => ev.resourceId !== (spacesUseResourceColumns ? SPACE_RESOURCE_UNASSIGNED_ID : CONSULTANT_RESOURCE_UNASSIGNED_ID))
      : bookedAll
    const bookedBreakBackground = isMonthGridView
      ? []
      : booked.flatMap((ev: any) => {
          const breakRange = getBookingBreakRange(ev.extendedProps)
          if (!breakRange) return []
          const breakEv: any = {
            id: `${ev.id}-break`,
            title: '',
            display: 'background',
            start: toLocalDateTimeString(new Date(breakRange.startMs)),
            end: toLocalDateTimeString(new Date(breakRange.endMs)),
            editable: false,
            startEditable: false,
            durationEditable: false,
            extendedProps: {
              kind: 'booking-break',
              bookingId: ev.extendedProps?.id,
              breakConflict: Boolean(ev.extendedProps?.breakConflict),
              breakMinutes: breakRange.breakMinutes,
            },
          }
          if (ev.resourceId != null) breakEv.resourceId = ev.resourceId
          return [breakEv]
        })
    const today = new Date()
    const dayMap: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }
    const visibleBookableSlots = !bookableEnabled ? [] : filterByConsultantRole(calendarData.bookable)
    const userHasWorkingHours = (u: any) => {
      const wh = u?.workingHours
      if (!wh || typeof wh !== 'object') return false
      if (wh.sameForAllDays) return !!(wh.allDays?.start && wh.allDays?.end)
      return dayOptions.some((d) => {
        const x = wh.byDay?.[d]
        return x && String(x.start || '').trim() && String(x.end || '').trim()
      })
    }
    const consultantsForWhVisible = metaUsers.filter((u: any) => {
      if (!userHasWorkingHours(u)) return false
      if (!(u.consultant || u.role === 'CONSULTANT')) return false
      if (!isTenantAdmin) return u.id === user.id
      if (effectiveConsultantFilterId != null) return u.id === effectiveConsultantFilterId
      return true
    })
    const consultantIdsWithWh = new Set(consultantsForWhVisible.map((u: any) => u.id))
    // Keep explicit availability slots even when consultant working-hours exist.
    // This allows admins to open extra one-off windows from Bookings mode
    // (e.g. outside default working-hours), which should remove non-bookable hatch.
    const slotsWithoutWh = visibleBookableSlots
    const visibleConsultantIds = new Set<number>()
    visibleBookableSlots.forEach((slot: any) => {
      const id = slot.consultant?.id
      if (Number.isFinite(id)) visibleConsultantIds.add(id)
    })
    consultantsForWhVisible.forEach((u: any) => visibleConsultantIds.add(u.id))
    const blockingRangesByConsultant = new Map<number, Array<{ startMs: number; endMs: number }>>()
    for (const b of filterByConsultantRole(calendarData.booked || [])) {
      // Spaces + ALL columns: bookings are subtracted per resource column in bookableSpaceBookings.
      // Including them here would strip the interval from bookableVisibleSegments globally and hatch
      // every other space for that consultant at the same time.
      if (spacesUseResourceColumns) continue
      const cid = b.consultant?.id
      if (!Number.isFinite(cid) || !visibleConsultantIds.has(cid)) continue
      const startMs = new Date(b.startTime).getTime()
      const endMs = getBookingBusyEndMs(b)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
      const arr = blockingRangesByConsultant.get(cid) || []
      arr.push({ startMs, endMs })
      blockingRangesByConsultant.set(cid, arr)
    }
    for (const p of calendarData.personal || []) {
      const isAvailabilityBlock = String(p?.task || '').trim().toLowerCase() === AVAILABILITY_BLOCK_TASK
      if (!personalModuleEnabled && !isAvailabilityBlock) continue
      const cid = personalOwnerId(p)
      if (!Number.isFinite(cid) || !visibleConsultantIds.has(cid)) continue
      const startMs = new Date(p.startTime).getTime()
      const endMs = new Date(p.endTime).getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
      const arr = blockingRangesByConsultant.get(cid) || []
      arr.push({ startMs, endMs })
      blockingRangesByConsultant.set(cid, arr)
    }
    const splitIntoStepSegments = (startMs: number, endMs: number, stepMs: number) => {
      const out: Array<{ startMs: number; endMs: number }> = []
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return out
      let cursor = startMs
      while (cursor < endMs) {
        const next = Math.min(endMs, cursor + stepMs)
        out.push({ startMs: cursor, endMs: next })
        cursor = next
      }
      return out
    }

    const companyWhStartMin = whWindowParseHm(slotMinTime)
    const companyWhEndMin = whWindowParseHm(slotMaxTime)
    const dayNamesFull = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const subtractRange = (
      range: { startMs: number; endMs: number },
      blockStartMs: number,
      blockEndMs: number,
    ): Array<{ startMs: number; endMs: number }> => {
      if (blockEndMs <= range.startMs || blockStartMs >= range.endMs) return [range]
      const out: Array<{ startMs: number; endMs: number }> = []
      if (blockStartMs > range.startMs) out.push({ startMs: range.startMs, endMs: Math.min(blockStartMs, range.endMs) })
      if (blockEndMs < range.endMs) out.push({ startMs: Math.max(blockEndMs, range.startMs), endMs: range.endMs })
      return out.filter((x) => x.endMs > x.startMs)
    }
    const bookableFromSlots = slotsWithoutWh.flatMap((slot: any) => {
      const out: any[] = []
      for (let i = 0; i < 30; i++) {
        const date = new Date(today)
        date.setDate(today.getDate() + i)
        const isoDate = date.toISOString().slice(0, 10)
        if (date.getDay() !== dayMap[slot.dayOfWeek]) continue
        if (!slot.indefinite && ((slot.startDate && isoDate < slot.startDate) || (slot.endDate && isoDate > slot.endDate))) continue
        const baseStartMs = new Date(`${isoDate}T${slot.startTime}`).getTime()
        const baseEndMs = new Date(`${isoDate}T${slot.endTime}`).getTime()
        if (!Number.isFinite(baseStartMs) || !Number.isFinite(baseEndMs) || baseEndMs <= baseStartMs) continue
        const blocks = (blockingRangesByConsultant.get(slot.consultant?.id) || [])
          .filter((r) => r.endMs > baseStartMs && r.startMs < baseEndMs)
          .sort((a, b) => a.startMs - b.startMs)
        let visibleSegments = splitRangeByBlocks(baseStartMs, baseEndMs, blocks)
        const slotConsultantId = slot.consultant?.id
        if (Number.isFinite(slotConsultantId) && consultantIdsWithWh.has(slotConsultantId)) {
          const w = consultantDayWindow(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            slotConsultantId,
            metaUsers,
            companyWhStartMin,
            companyWhEndMin,
          )
          if (w != null && 'startMin' in w) {
            const whSpan = windowToDayMs(date.getFullYear(), date.getMonth(), date.getDate(), w.startMin, w.endMin)
            visibleSegments = visibleSegments.flatMap((seg) => subtractRange(seg, whSpan.startMs, whSpan.endMs))
          }
        }
        visibleSegments.forEach((seg, idx) => {
          out.push({
            id: `s-${slot.id}-${isoDate}-${idx}`,
            title: `Available · ${slot.consultant.firstName}`,
            start: toLocalDateTimeString(new Date(seg.startMs)),
            end: toLocalDateTimeString(new Date(seg.endMs)),
            color: '#22c55e',
            editable: false,
            startEditable: false,
            durationEditable: false,
            extendedProps: { ...slot, kind: 'bookable', date: isoDate },
          })
        })
      }
      return out
    })
    const bookableFromWh = !bookableEnabled
      ? []
      : consultantsForWhVisible.flatMap((cu: any) => {
          const out: any[] = []
          for (let i = 0; i < 30; i++) {
            const date = new Date(today)
            date.setDate(today.getDate() + i)
            const isoDate = date.toISOString().slice(0, 10)
            const w = consultantDayWindow(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
              cu.id,
              metaUsers,
              companyWhStartMin,
              companyWhEndMin,
            )
            if (w == null || ('closed' in w && w.closed) || !('startMin' in w)) continue
            const span = windowToDayMs(date.getFullYear(), date.getMonth(), date.getDate(), w.startMin, w.endMin)
            const baseStartMs = span.startMs
            const baseEndMs = span.endMs
            const blocks = (blockingRangesByConsultant.get(cu.id) || [])
              .filter((r) => r.endMs > baseStartMs && r.startMs < baseEndMs)
              .sort((a, b) => a.startMs - b.startMs)
            const visibleSegments = splitRangeByBlocks(baseStartMs, baseEndMs, blocks)
            visibleSegments.forEach((seg, idx) => {
              const sDate = new Date(seg.startMs)
              const eDate = new Date(seg.endMs)
              const startTimeStr = `${String(sDate.getHours()).padStart(2, '0')}:${String(sDate.getMinutes()).padStart(2, '0')}:00`
              const endTimeStr = `${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}:00`
              out.push({
                id: `wh-${cu.id}-${isoDate}-${idx}`,
                title: `Available · ${cu.firstName}`,
                start: toLocalDateTimeString(new Date(seg.startMs)),
                end: toLocalDateTimeString(new Date(seg.endMs)),
                color: '#22c55e',
                editable: false,
                startEditable: false,
                durationEditable: false,
                extendedProps: {
                  kind: 'bookable',
                  date: isoDate,
                  consultant: cu,
                  dayOfWeek: dayNamesFull[date.getDay()],
                  indefinite: true,
                  startTime: startTimeStr,
                  endTime: endTimeStr,
                  fromWorkingHours: true,
                  firstName: cu.firstName,
                  lastName: cu.lastName,
                },
              })
            })
          }
          return out
        })
    const bookableVisibleSegments = [...bookableFromSlots, ...bookableFromWh]
    const _bookingsResourceMode = calendarMode === 'bookings' && isTenantAdmin && consultantFilterId == null && !isNativeAndroid
    const bookableBookings = bookableVisibleSegments.flatMap((seg: any, idx: number) => {
      const startMs = new Date(seg.start).getTime()
      const endMs = new Date(seg.end).getTime()
      const chunks = splitIntoStepSegments(startMs, endMs, SLOT_MS)
      const cid = seg.extendedProps?.consultant?.id
      return chunks.map((chunk, chunkIdx) => {
        const ev: any = {
          ...seg,
          id: `${seg.id}-chunk-${idx}-${chunkIdx}`,
          title: '',
          display: 'background',
          start: toLocalDateTimeString(new Date(chunk.startMs)),
          end: toLocalDateTimeString(new Date(chunk.endMs)),
          extendedProps: {
            ...seg.extendedProps,
            bookableChunkIndex: chunkIdx,
            bookableChunkCount: chunks.length,
          },
        }
        if (_bookingsResourceMode && cid != null) {
          ev.resourceId = String(cid)
        }
        return ev
      })
    })

    /** Per-space-column bookable backgrounds (Space ALL + resource columns): consultant availability minus sessions already in that space. */
    const subtractRangeFromRange = (
      r: { startMs: number; endMs: number },
      bs: number,
      be: number,
    ): { startMs: number; endMs: number }[] => {
      if (be <= r.startMs || bs >= r.endMs) return [r]
      const out: { startMs: number; endMs: number }[] = []
      if (bs > r.startMs) out.push({ startMs: r.startMs, endMs: Math.min(bs, r.endMs) })
      if (be < r.endMs) out.push({ startMs: Math.max(be, r.startMs), endMs: r.endMs })
      return out.filter((x) => x.endMs > x.startMs)
    }

    const bookableSpaceBookings = (() => {
      if (!spacesUseResourceColumns || calendarMode !== 'spaces') return []
      const rawBooked = bookedBase.filter((b: any) => {
        if (spaceFilterId != null) return b.space?.id === spaceFilterId
        return true
      })
      const spaceIds = [SPACE_RESOURCE_UNASSIGNED_ID, ...metaSpaces.map((s: any) => String(s.id))]
      const out: any[] = []
      let segIdx = 0
      for (const seg of bookableVisibleSegments) {
        const startMs = new Date(seg.start).getTime()
        const endMs = new Date(seg.end).getTime()
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          segIdx++
          continue
        }
        for (const spRid of spaceIds) {
          const bookedInSpace = rawBooked.filter((b: any) => {
            if (spRid === SPACE_RESOURCE_UNASSIGNED_ID) return b.space == null || b.space?.id == null
            return b.space?.id != null && String(b.space.id) === spRid
          })
          let remaining: { startMs: number; endMs: number }[] = [{ startMs, endMs }]
          for (const b of bookedInSpace) {
            const bs = new Date(b.startTime).getTime()
            const be = getBookingBusyEndMs(b)
            if (!Number.isFinite(bs) || !Number.isFinite(be) || be <= bs) continue
            remaining = remaining.flatMap((r) => subtractRangeFromRange(r, bs, be))
            if (remaining.length === 0) break
          }
          for (const r of remaining) {
            if (r.endMs <= r.startMs) continue
            const chunks = splitIntoStepSegments(r.startMs, r.endMs, SLOT_MS)
            const chunkCount = chunks.length
            chunks.forEach((chunk, chunkIdx) => {
              out.push({
                id: `bs-${spRid}-${segIdx}-${chunk.startMs}-${chunkIdx}`,
                title: '',
                display: 'background',
                start: toLocalDateTimeString(new Date(chunk.startMs)),
                end: toLocalDateTimeString(new Date(chunk.endMs)),
                resourceId: spRid,
                extendedProps: {
                  ...seg.extendedProps,
                  kind: 'bookable',
                  bookableChunkIndex: chunkIdx,
                  bookableChunkCount: chunkCount,
                },
              })
            })
          }
        }
        segIdx++
      }
      return out
    })()

    const nonBookableBackground = (() => {
      if (!bookableEnabled || (calendarMode !== 'bookings' && calendarMode !== 'spaces') || isMonthGridView) return []

      const buildNonBookableForResource = (
        evs: any[],
        resourceId?: string,
      ) => {
        const availableByDate = new Map<string, Array<{ startMs: number; endMs: number }>>()
        for (const ev of evs) {
          const startMs = new Date(ev.start).getTime()
          const endMs = new Date(ev.end).getTime()
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
          const dateKey = String(ev.start).slice(0, 10)
          const arr = availableByDate.get(dateKey) || []
          arr.push({ startMs, endMs })
          availableByDate.set(dateKey, arr)
        }
        const dayStartMinutes = parseHmToMinutes(slotMinTime)
        const dayEndMinutes = parseHmToMinutes(slotMaxTime)
        const out: any[] = []
        const prefix = resourceId ? `nb-${resourceId}` : 'nb'
        for (let i = 0; i < 30; i++) {
          const day = new Date(today)
          day.setDate(today.getDate() + i)
          const key = day.toISOString().slice(0, 10)
          const dayStart = new Date(day)
          dayStart.setHours(Math.floor(dayStartMinutes / 60), dayStartMinutes % 60, 0, 0)
          const dayEnd = new Date(day)
          dayEnd.setHours(Math.floor(dayEndMinutes / 60), dayEndMinutes % 60, 0, 0)
          const windowStartMs = dayStart.getTime()
          const windowEndMs = dayEnd.getTime()
          if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) continue

          const ranges = (availableByDate.get(key) || [])
            .map((r) => ({ startMs: Math.max(r.startMs, windowStartMs), endMs: Math.min(r.endMs, windowEndMs) }))
            .filter((r) => r.endMs > r.startMs)
            .sort((a, b) => a.startMs - b.startMs)

          let cursor = windowStartMs
          for (const r of ranges) {
            if (r.startMs > cursor) {
              const ev: any = {
                id: `${prefix}-${key}-${cursor}`,
                title: '',
                display: 'background',
                start: toLocalDateTimeString(new Date(cursor)),
                end: toLocalDateTimeString(new Date(r.startMs)),
                editable: false,
                startEditable: false,
                durationEditable: false,
                extendedProps: { kind: 'non-bookable', date: key },
              }
              if (resourceId) ev.resourceId = resourceId
              out.push(ev)
            }
            cursor = Math.max(cursor, r.endMs)
          }
          if (cursor < windowEndMs) {
            const ev: any = {
              id: `${prefix}-${key}-${cursor}`,
              title: '',
              display: 'background',
              start: toLocalDateTimeString(new Date(cursor)),
              end: toLocalDateTimeString(new Date(windowEndMs)),
              editable: false,
              startEditable: false,
              durationEditable: false,
              extendedProps: { kind: 'non-bookable', date: key },
            }
            if (resourceId) ev.resourceId = resourceId
            out.push(ev)
          }
        }
        return out
      }

      if (_bookingsResourceMode) {
        const consultants = metaUsers.filter((u: any) => u.consultant || u.role === 'CONSULTANT')
        const out: any[] = []
        for (const cu of consultants) {
          const rid = String(cu.id)
          const cuBookable = bookableBookings.filter((ev: any) => ev.resourceId === rid)
          out.push(...buildNonBookableForResource(cuBookable, rid))
        }
        return out
      }

      if (spacesUseResourceColumns && calendarMode === 'spaces') {
        const spaceIds = [SPACE_RESOURCE_UNASSIGNED_ID, ...metaSpaces.map((s: any) => String(s.id))]
        const out: any[] = []
        for (const spRid of spaceIds) {
          const spBookable = bookableSpaceBookings.filter((ev: any) => ev.resourceId === spRid)
          out.push(...buildNonBookableForResource(spBookable, spRid))
        }
        return out
      }

      return buildNonBookableForResource(bookableBookings)
    })()
    const bookable =
      calendarMode === 'bookings'
        ? (isMonthGridView ? [] : bookableBookings)
        : calendarMode === 'spaces'
          ? (isMonthGridView ? [] : spacesUseResourceColumns ? bookableSpaceBookings : [])
          : bookableVisibleSegments
    const personalTaskPresetColorByName = (() => {
      const map = new Map<string, string>()
      const raw = String(settings[PERSONAL_TASK_PRESETS_KEY] || '')
      if (!raw) return map
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return map
        for (const row of parsed) {
          const name = String(row?.name || '').trim().toLowerCase()
          const color = String(row?.color || '').trim()
          if (!name) continue
          if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue
          map.set(name, color)
        }
      } catch {
        // Ignore parse errors and fall back to default event color.
      }
      return map
    })()

    const personal = (personalModuleEnabled ? calendarData.personal || [] : [])
      .filter((p: any) => personalOwnerId(p) === user.id)
      .filter((p: any) => {
        if (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION) return true
        return effectiveConsultantFilterId === user.id
      })
      .map((p: any) => {
        if (String(p.task || '').trim().toLowerCase() === AVAILABILITY_BLOCK_TASK) return null
        const taskName = String(p.task || '').trim().toLowerCase()
        const presetColor = personalTaskPresetColorByName.get(taskName)
        const ev: any = {
          id: `p-${p.id}`,
          title: p.task || t('formPersonal'),
          start: p.startTime,
          end: p.endTime,
          color: presetColor || '#F97316',
          order: 2,
          editable: !isViewOnly,
          extendedProps: { ...p, kind: 'personal', masked: false },
        }
        if (calendarMode === 'bookings' && isTenantAdmin && consultantFilterId == null && !isNativeAndroid) {
          ev.resourceId = String(user.id)
        }
        return ev
      })
      .filter(Boolean as any)
    const todosRaw = (todosModuleEnabled ? calendarData.todos || [] : [])
      .filter((t: any) => (t.consultant?.id ?? t.consultantId ?? user.id) === user.id)
      .filter((t: any) => {
        if (effectiveConsultantFilterId == null || effectiveConsultantFilterId === CONSULTANT_FILTER_ALL_SESSION) return true
        return effectiveConsultantFilterId === user.id
      })
      .map((t: any) => {
        const start = t.startTime
        const end = t.endTime || toLocalDateTimeString(new Date(new Date(start).getTime() + 30 * 60 * 1000))
        const ev: any = {
          id: `t-${t.id}`,
          title: t.task || 'ToDo',
          start,
          end,
          color: '#2563EB',
          order: 2,
          editable: !isViewOnly,
          extendedProps: { ...t, kind: 'todo', masked: false },
        }
        if (calendarMode === 'bookings' && isTenantAdmin && consultantFilterId == null && !isNativeAndroid) {
          ev.resourceId = String(user.id)
        }
        return ev
      })

    const hidePersonalAndTodoOnAdminBookingsOverview =
      calendarMode === 'bookings' &&
      isTenantAdmin &&
      (consultantFilterId == null || consultantFilterId === CONSULTANT_FILTER_ALL_SESSION)

    /** Bookings + staff columns (Vsi termini po osebju): blocked availability per consultant as diagonal hatch. */
    const adminStaffColumnsAvailabilityBlocks = (() => {
      if (!bookingsUseResourceColumns) return []
      return (calendarData.personal || []).flatMap((p: any) => {
        if (String(p.task || '').trim().toLowerCase() !== AVAILABILITY_BLOCK_TASK) return []
        const cid = personalOwnerId(p)
        if (!Number.isFinite(cid)) return []
        const startStr = String(p.startTime || '')
        return [
          {
            id: `avail-block-${p.id}-${String(p.startTime || '').replace(/[^0-9A-Za-z]/g, '')}`,
            title: '',
            display: 'background',
            start: p.startTime,
            end: p.endTime,
            resourceId: String(cid),
            editable: false,
            startEditable: false,
            durationEditable: false,
            extendedProps: { kind: 'non-bookable', date: startStr.slice(0, 10) },
          },
        ]
      })
    })()

    const personalCalendar = hidePersonalAndTodoOnAdminBookingsOverview ? [] : personal
    const todosCalendar = hidePersonalAndTodoOnAdminBookingsOverview ? [] : todosRaw

    const sessionDraftPreviewEvents: any[] = (() => {
      if (isViewOnly) return []
      type DraftKind = 'booked' | 'personal' | 'todo' | 'availability'
      let startStr: string | null = null
      let endStr: string | null = null
      let draftKind: DraftKind = 'booked'
      let resourceId: string | undefined

      // Skip edit-* modals: the real event already shows that slot.
      if (selectedBookedSession || selectedPersonalBlock || selectedTodo) {
        return []
      }
      if (availabilitySelection && selection) {
        startStr = availabilitySelection.startTime
        endStr = availabilitySelection.endTime
        draftKind = 'availability'
        if (bookingsUseResourceColumns) {
          const cid = availabilitySelection.consultantId
          resourceId = cid != null ? String(cid) : CONSULTANT_RESOURCE_UNASSIGNED_ID
        }
      } else if (selection && !availabilitySelection) {
        startStr = form?.startTime ?? selection.start
        endStr = form?.endTime ?? selection.end
        if (form?.todo && todosModuleEnabled) draftKind = 'todo'
        else if (form?.personal && personalModuleEnabled) draftKind = 'personal'
        else draftKind = 'booked'
        if (spacesUseResourceColumns && calendarMode === 'spaces') {
          const online = !!form?.online
          const sid = form?.spaceId
          resourceId = !online && sid != null ? String(sid) : SPACE_RESOURCE_UNASSIGNED_ID
        } else if (bookingsUseResourceColumns) {
          const cid = form?.consultantId
          resourceId = cid != null ? String(cid) : CONSULTANT_RESOURCE_UNASSIGNED_ID
        }
        if (
          bookingsUseResourceColumns &&
          resourceId === CONSULTANT_RESOURCE_UNASSIGNED_ID &&
          selection?.resourceId &&
          selection.resourceId !== CONSULTANT_RESOURCE_UNASSIGNED_ID
        ) {
          resourceId = String(selection.resourceId)
        }
        if (
          spacesUseResourceColumns &&
          calendarMode === 'spaces' &&
          resourceId === SPACE_RESOURCE_UNASSIGNED_ID &&
          selection?.resourceId &&
          selection.resourceId !== SPACE_RESOURCE_UNASSIGNED_ID
        ) {
          resourceId = String(selection.resourceId)
        }
        if (
          calendarMode === 'bookings' &&
          isTenantAdmin &&
          consultantFilterId == null &&
          !isNativeAndroid &&
          (draftKind === 'personal' || draftKind === 'todo')
        ) {
          resourceId = String(form?.consultantId ?? user.id)
        }
      } else {
        return []
      }

      if (!startStr || !endStr) return []
      const startNorm = normalizeToLocalDateTime(startStr)
      const endNorm = normalizeToLocalDateTime(endStr)
      const startMs = new Date(startNorm).getTime()
      const endMs = new Date(endNorm).getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return []

      const color =
        draftKind === 'personal'
          ? '#F97316'
          : draftKind === 'todo'
            ? '#2563EB'
            : draftKind === 'availability'
              ? availabilityIntent === 'block'
                ? '#ef4444'
                : '#14b8a6'
              : '#16A34A'
      const ev: any = {
        id: 'session-draft-preview',
        title: '\u00a0',
        start: startNorm,
        end: endNorm,
        color,
        display: 'auto',
        order: 9,
        extendedProps: {
          kind: 'draft-preview',
          draftKind,
          ...(draftKind === 'availability' ? { availabilityIntent } : {}),
        },
        editable: false,
        startEditable: false,
        durationEditable: false,
        resourceEditable: false,
      }
      if (resourceId != null) ev.resourceId = resourceId
      return [ev]
    })()

    const buildOverlapGroupsForCalendar = (inputEvents: any[]) => {
      const compactableView = isWebTimeGridLikeView(view) && !isNativeAndroid && calendarMode !== 'availability'
      if (!compactableView) return inputEvents

      const sessionEvents = inputEvents.filter((ev: any) => {
        const kind = ev?.extendedProps?.kind
        if (kind !== 'booked' && kind !== 'personal' && kind !== 'todo') return false
        if (ev?.extendedProps?.masked) return false
        if (ev?.display === 'background') return false
        const startMs = new Date(ev.start).getTime()
        const endMs = new Date(ev.end).getTime()
        return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      })
      if (sessionEvents.length < 2) return inputEvents

      const eventKey = (ev: any) => String(ev.id ?? `${ev.extendedProps?.kind}-${ev.extendedProps?.id}`)
      const dateKey = (ev: any) => String(ev.start || '').slice(0, 10)
      const visualResourceKey = (ev: any) => String(ev.resourceId ?? '__calendar_single_column__')
      const buckets = new Map<string, any[]>()
      for (const ev of sessionEvents) {
        const key = `${dateKey(ev)}|${visualResourceKey(ev)}`
        const arr = buckets.get(key) || []
        arr.push(ev)
        buckets.set(key, arr)
      }

      const hiddenEventIds = new Set<string>()
      const enhancedMainEvents = new Map<string, any>()
      const enhancedPartialOverlapEvents = new Map<string, any>()
      const syntheticPartialEvents: any[] = []
      const compactMainGroups: Array<{
        bucketKey: string
        groupId: string
        mainId: string
        startMs: number
        endMs: number
      }> = []
      const toOverlapItem = (ev: any, groupId: string, isMain: boolean) => {
        const props = ev.extendedProps || {}
        return {
          eventId: eventKey(ev),
          id: props.id,
          kind: props.kind,
          title: String(ev.title || props.task || props.type?.name || (props.kind === 'personal' ? t('formPersonal') : '') || '').trim() || '—',
          start: ev.start,
          end: ev.end,
          color: ev.color,
          resourceId: ev.resourceId ?? null,
          consultant: props.consultant ?? null,
          space: props.space ?? null,
          type: props.type ?? null,
          client: props.client ?? null,
          clients: Array.isArray(props.clients) ? props.clients : (props.client ? [props.client] : []),
          task: props.task ?? '',
          notes: props.notes ?? '',
          overlapGroupId: groupId,
          isMain,
          extendedProps: props,
        }
      }

      const eventStartMs = (ev: any) => new Date(ev.start).getTime()
      const eventEndMs = (ev: any) => new Date(ev.end).getTime()
      const kindScore = (ev: any) => {
        const kind = ev.extendedProps?.kind
        return kind === 'booked' ? 0 : kind === 'personal' ? 1 : 2
      }

      for (const [bucketKey, bucketEvents] of buckets.entries()) {
        const sorted = [...bucketEvents].sort((a: any, b: any) => {
          const ds = eventStartMs(a) - eventStartMs(b)
          if (ds !== 0) return ds
          const de = eventEndMs(b) - eventEndMs(a)
          if (de !== 0) return de
          const dk = kindScore(a) - kindScore(b)
          if (dk !== 0) return dk
          return eventKey(a).localeCompare(eventKey(b))
        })

        for (const candidate of sorted) {
          const candidateId = eventKey(candidate)
          if (hiddenEventIds.has(candidateId)) continue

          const candidateStartMs = eventStartMs(candidate)
          const candidateEndMs = eventEndMs(candidate)
          if (!Number.isFinite(candidateStartMs) || !Number.isFinite(candidateEndMs) || candidateEndMs <= candidateStartMs) continue

          // Compact sessions into +X more only when they are fully contained by the
          // visible/main session: their start is inside the main session interval
          // (inclusive) and their end does not go past the main session end. A later
          // starting session that runs longer than the main stays as its own block.
          const contained = sorted.filter((ev: any) => {
            const id = eventKey(ev)
            if (id === candidateId || hiddenEventIds.has(id)) return false
            const startMs = eventStartMs(ev)
            const endMs = eventEndMs(ev)
            return startMs >= candidateStartMs && startMs <= candidateEndMs && endMs <= candidateEndMs
          })
          if (contained.length === 0) continue

          const groupEvents = [candidate, ...contained]
          const groupId = `overlap-${dateKey(candidate)}-${visualResourceKey(candidate)}-${candidateStartMs}-${candidateEndMs}-${groupEvents.map(eventKey).sort().join('-')}`
          const overrideId = overlapMainOverride[groupId]
          const overrideMain = groupEvents.find((ev: any) => {
            if (eventKey(ev) !== overrideId) return false
            const overrideStartMs = eventStartMs(ev)
            const overrideEndMs = eventEndMs(ev)
            return groupEvents.every((other: any) => {
              if (eventKey(other) === overrideId) return true
              const startMs = eventStartMs(other)
              const endMs = eventEndMs(other)
              return startMs >= overrideStartMs && startMs <= overrideEndMs && endMs <= overrideEndMs
            })
          })
          const main = overrideMain || candidate
          const mainId = eventKey(main)
          const mainStartMs = eventStartMs(main)
          const mainEndMs = eventEndMs(main)
          const hidden = groupEvents.filter((ev: any) => {
            if (eventKey(ev) === mainId) return false
            const startMs = eventStartMs(ev)
            const endMs = eventEndMs(ev)
            return startMs >= mainStartMs && startMs <= mainEndMs && endMs <= mainEndMs
          })
          if (hidden.length === 0) continue

          hidden.forEach((ev: any) => hiddenEventIds.add(eventKey(ev)))
          enhancedMainEvents.set(mainId, {
            ...main,
            extendedProps: {
              ...(main.extendedProps || {}),
              overlapGroupId: groupId,
              overlapHiddenCount: hidden.length,
              overlapHiddenSessions: hidden.map((ev: any) => toOverlapItem(ev, groupId, false)),
              overlapMainSession: toOverlapItem(main, groupId, true),
              overlapGroupStart: toLocalDateTimeString(new Date(mainStartMs)),
              overlapGroupEnd: toLocalDateTimeString(new Date(mainEndMs)),
            },
          })
          compactMainGroups.push({
            bucketKey,
            groupId,
            mainId,
            startMs: mainStartMs,
            endMs: mainEndMs,
          })
        }
      }

      const groupedMainIds = new Set(compactMainGroups.map((group) => group.mainId))
      if (compactMainGroups.length > 0) {
        const overlapPercent = (value: number, start: number, end: number) => {
          const duration = end - start
          if (!Number.isFinite(value) || !Number.isFinite(start) || !Number.isFinite(end) || duration <= 0) return 0
          return Math.max(0, Math.min(100, ((value - start) / duration) * 100))
        }

        for (const [bucketKey, bucketEvents] of buckets.entries()) {
          const groupsForBucket = compactMainGroups.filter((group) => group.bucketKey === bucketKey)
          if (groupsForBucket.length === 0) continue

          for (const ev of bucketEvents) {
            const id = eventKey(ev)
            if (hiddenEventIds.has(id) || groupedMainIds.has(id)) continue

            const startMs = eventStartMs(ev)
            const endMs = eventEndMs(ev)
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue

            let best: null | {
              groupId: string
              startMs: number
              endMs: number
              overlapStartMs: number
              overlapEndMs: number
              overlapDurationMs: number
            } = null

            for (const group of groupsForBucket) {
              const overlapStartMs = Math.max(startMs, group.startMs)
              const overlapEndMs = Math.min(endMs, group.endMs)
              const overlapDurationMs = overlapEndMs - overlapStartMs
              if (overlapDurationMs <= 0) continue

              const fullyContainedByGroup = startMs >= group.startMs && startMs <= group.endMs && endMs <= group.endMs
              if (fullyContainedByGroup) continue

              if (!best || overlapDurationMs > best.overlapDurationMs) {
                best = {
                  groupId: group.groupId,
                  startMs: group.startMs,
                  endMs: group.endMs,
                  overlapStartMs,
                  overlapEndMs,
                  overlapDurationMs,
                }
              }
            }

            if (!best) continue

            const overlapTopPercent = overlapPercent(best.overlapStartMs, startMs, endMs)
            const overlapEndPercent = overlapPercent(best.overlapEndMs, startMs, endMs)
            const overlapHeightPercent = Math.max(8, overlapEndPercent - overlapTopPercent)
            const placement = startMs >= best.startMs && endMs > best.endMs
              ? 'continues-after'
              : startMs < best.startMs && endMs <= best.endMs
                ? 'starts-before'
                : startMs < best.startMs && endMs > best.endMs
                  ? 'covers-main'
                  : 'crosses-main'

            enhancedPartialOverlapEvents.set(id, {
              ...ev,
              extendedProps: {
                ...(ev.extendedProps || {}),
                partialOverlapGroupId: best.groupId,
                partialOverlapPlacement: placement,
                partialOverlapTopPercent: overlapTopPercent,
                partialOverlapHeightPercent: overlapHeightPercent,
                partialOverlapStart: toLocalDateTimeString(new Date(best.overlapStartMs)),
                partialOverlapEnd: toLocalDateTimeString(new Date(best.overlapEndMs)),
              },
            })

            const mainEvent = [...enhancedMainEvents.values()].find((candidate: any) => candidate?.extendedProps?.overlapGroupId === best?.groupId)
            const startsBeforeMain = startMs < best.startMs
            const endsAfterMain = endMs > best.endMs

            if (mainEvent && (startsBeforeMain || endsAfterMain)) {
              hiddenEventIds.add(id)
              const makeContinuationEvent = (segmentStartMs: number, segmentEndMs: number, placementKind: 'starts-before' | 'continues-after', segmentSuffix: 'before' | 'after') => {
                if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs) || segmentEndMs <= segmentStartMs) return
                syntheticPartialEvents.push({
                  ...ev,
                  id: `${id}__partial_${segmentSuffix}`,
                  start: toLocalDateTimeString(new Date(segmentStartMs)),
                  end: toLocalDateTimeString(new Date(segmentEndMs)),
                  durationEditable: false,
                  extendedProps: {
                    ...(ev.extendedProps || {}),
                    partialOverlapGroupId: best.groupId,
                    partialContinuationSegment: true,
                    partialOverlapPlacement: placementKind,
                    partialOriginalStart: toLocalDateTimeString(new Date(startMs)),
                    partialOriginalEnd: toLocalDateTimeString(new Date(endMs)),
                    partialVisibleStart: toLocalDateTimeString(new Date(segmentStartMs)),
                    partialVisibleEnd: toLocalDateTimeString(new Date(segmentEndMs)),
                  },
                })
              }

              if (startsBeforeMain) {
                makeContinuationEvent(startMs, best.startMs, 'starts-before', 'before')
              }
              if (endsAfterMain) {
                makeContinuationEvent(best.endMs, endMs, 'continues-after', 'after')
              }

              const mainId = eventKey(mainEvent)
              enhancedMainEvents.set(mainId, {
                ...mainEvent,
                extendedProps: {
                  ...(mainEvent.extendedProps || {}),
                  partialOverlapCount: Number(mainEvent.extendedProps?.partialOverlapCount || 0) + 1,
                },
              })
              continue
            }

            if (mainEvent) {
              const mainId = eventKey(mainEvent)
              enhancedMainEvents.set(mainId, {
                ...mainEvent,
                extendedProps: {
                  ...(mainEvent.extendedProps || {}),
                  partialOverlapCount: Number(mainEvent.extendedProps?.partialOverlapCount || 0) + 1,
                },
              })
            }
          }
        }
      }

      const pushSyntheticPartialContinuation = (
        ev: any,
        id: string,
        groupId: string,
        startMs: number,
        endMs: number,
        segmentStartMs: number,
        segmentEndMs: number,
        placementKind: 'starts-before' | 'continues-after',
        segmentSuffix: 'before' | 'after',
      ) => {
        if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs) || segmentEndMs <= segmentStartMs) return
        syntheticPartialEvents.push({
          ...ev,
          id: `${id}__partial_${segmentSuffix}`,
          start: toLocalDateTimeString(new Date(segmentStartMs)),
          end: toLocalDateTimeString(new Date(segmentEndMs)),
          durationEditable: false,
          extendedProps: {
            ...(ev.extendedProps || {}),
            partialOverlapGroupId: groupId,
            partialContinuationSegment: true,
            partialOverlapPlacement: placementKind,
            partialOriginalStart: toLocalDateTimeString(new Date(startMs)),
            partialOriginalEnd: toLocalDateTimeString(new Date(endMs)),
            partialVisibleStart: toLocalDateTimeString(new Date(segmentStartMs)),
            partialVisibleEnd: toLocalDateTimeString(new Date(segmentEndMs)),
          },
        })
      }

      const compareMainPriority = (a: any, b: any) => {
        const aStart = eventStartMs(a)
        const aEnd = eventEndMs(a)
        const bStart = eventStartMs(b)
        const bEnd = eventEndMs(b)
        const aDuration = aEnd - aStart
        const bDuration = bEnd - bStart
        if (aDuration !== bDuration) return bDuration - aDuration
        const ak = kindScore(a)
        const bk = kindScore(b)
        if (ak !== bk) return ak - bk
        if (aStart !== bStart) return bStart - aStart
        if (aEnd !== bEnd) return bEnd - aEnd
        return eventKey(a).localeCompare(eventKey(b))
      }

      const processedPartialPairIds = new Set<string>()
      for (const [bucketKey, bucketEvents] of buckets.entries()) {
        void bucketKey
        const eligible = bucketEvents.filter((ev: any) => {
          const kind = ev?.extendedProps?.kind
          return kind === 'booked' || kind === 'personal'
        })
        for (const ev of eligible) {
          const id = eventKey(ev)
          if (hiddenEventIds.has(id) || groupedMainIds.has(id) || processedPartialPairIds.has(id) || enhancedPartialOverlapEvents.has(id)) continue

          const startMs = eventStartMs(ev)
          const endMs = eventEndMs(ev)
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue

          let bestMain: any = null
          let bestMainStartMs = NaN
          let bestMainEndMs = NaN
          let bestOverlapDuration = -1

          for (const other of eligible) {
            const otherId = eventKey(other)
            if (otherId === id || hiddenEventIds.has(otherId) || processedPartialPairIds.has(otherId)) continue
            const otherStartMs = eventStartMs(other)
            const otherEndMs = eventEndMs(other)
            if (!Number.isFinite(otherStartMs) || !Number.isFinite(otherEndMs) || otherEndMs <= otherStartMs) continue
            const overlapsPartially = startMs < otherEndMs && endMs > otherStartMs
            if (!overlapsPartially) continue

            const evContainsOther = startMs <= otherStartMs && endMs >= otherEndMs
            const otherContainsEv = otherStartMs <= startMs && otherEndMs >= endMs
            if (evContainsOther || otherContainsEv) continue

            const evStartsBeforeOther = startMs < otherStartMs && endMs > otherStartMs && endMs < otherEndMs
            const evEndsAfterOther = startMs > otherStartMs && startMs < otherEndMs && endMs > otherEndMs
            if (!evStartsBeforeOther && !evEndsAfterOther) continue

            const evShouldRemainMain = compareMainPriority(ev, other) <= 0
            if (evShouldRemainMain) continue

            const overlapDuration = Math.min(endMs, otherEndMs) - Math.max(startMs, otherStartMs)
            if (overlapDuration <= 0) continue
            if (
              !bestMain ||
              overlapDuration > bestOverlapDuration ||
              (overlapDuration == bestOverlapDuration && compareMainPriority(other, bestMain) < 0)
            ) {
              bestMain = other
              bestMainStartMs = otherStartMs
              bestMainEndMs = otherEndMs
              bestOverlapDuration = overlapDuration
            }
          }

          if (!bestMain) continue

          const groupId = `partial-overlap-${dateKey(bestMain)}-${visualResourceKey(bestMain)}-${eventKey(bestMain)}-${id}`
          const startsBeforeMain = startMs < bestMainStartMs
          const endsAfterMain = endMs > bestMainEndMs
          hiddenEventIds.add(id)
          processedPartialPairIds.add(id)

          if (startsBeforeMain) {
            pushSyntheticPartialContinuation(ev, id, groupId, startMs, endMs, startMs, Math.min(endMs, bestMainStartMs), 'starts-before', 'before')
          }
          if (endsAfterMain) {
            pushSyntheticPartialContinuation(ev, id, groupId, startMs, endMs, Math.max(startMs, bestMainEndMs), endMs, 'continues-after', 'after')
          }
        }
      }

      if (hiddenEventIds.size === 0 && enhancedMainEvents.size === 0 && enhancedPartialOverlapEvents.size === 0 && syntheticPartialEvents.length === 0) return inputEvents
      return [
        ...inputEvents.flatMap((ev: any) => {
          const id = eventKey(ev)
          if (hiddenEventIds.has(id)) return []
          return [enhancedMainEvents.get(id) || enhancedPartialOverlapEvents.get(id) || ev]
        }),
        ...syntheticPartialEvents,
      ]
    }

    if (modeSwitching) {
      return []
    }
    if (calendarMode === 'availability') {
      return [...bookable, ...sessionDraftPreviewEvents]
    }
    if (calendarMode === 'spaces') {
      if (spacesUseResourceColumns && bookableEnabled) {
        return buildOverlapGroupsForCalendar([...nonBookableBackground, ...bookedBreakBackground, ...booked, ...bookable, ...sessionDraftPreviewEvents])
      }
      return buildOverlapGroupsForCalendar([...bookedBreakBackground, ...booked, ...sessionDraftPreviewEvents])
    }
    return buildOverlapGroupsForCalendar([
      ...nonBookableBackground,
      ...adminStaffColumnsAvailabilityBlocks,
      ...bookedBreakBackground,
      ...booked,
      ...bookable,
      ...personalCalendar,
      ...todosCalendar,
      ...sessionDraftPreviewEvents,
    ])
  }, [
    calendarData,
    user,
    spacesEnabled,
    spaceFilterId,
    metaTypes,
    metaSpaces,
    metaUsers,
    bookableEnabled,
    effectiveConsultantFilterId,
    isNativeAndroid,
    calendarMode,
    slotMinTime,
    slotMaxTime,
    view,
    settings,
    modeSwitching,
    isViewOnly,
    spacesUseResourceColumns,
    bookingsUseResourceColumns,
    useUnassignedDrawer,
    consultantFilterId,
    selection,
    form,
    selectedBookedSession,
    selectedPersonalBlock,
    selectedTodo,
    availabilitySelection,
    availabilityIntent,
    personalModuleEnabled,
    todosModuleEnabled,
    overlapMainOverride,
    t,
    locale,
  ])


  const activeOverlapGroup = useMemo(() => {
    if (!overlapDrawerGroupId) return null
    for (const ev of events as any[]) {
      const props = ev?.extendedProps || {}
      if (props.overlapGroupId !== overlapDrawerGroupId) continue
      const main = props.overlapMainSession
      const hidden = Array.isArray(props.overlapHiddenSessions) ? props.overlapHiddenSessions : []
      if (!main || hidden.length === 0) return null
      return {
        groupId: overlapDrawerGroupId,
        start: props.overlapGroupStart || ev.start,
        end: props.overlapGroupEnd || ev.end,
        main,
        hidden,
      }
    }
    return null
  }, [events, overlapDrawerGroupId])

  useEffect(() => {
    if (overlapDrawerGroupId && !activeOverlapGroup) {
      setOverlapDrawerGroupId(null)
    }
  }, [activeOverlapGroup, overlapDrawerGroupId])

  useEffect(() => {
    if (!sessionQuickActions) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSessionQuickActions(null)
    }
    const onResize = () => setSessionQuickActions(null)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [sessionQuickActions])

  const formatCalendarClock = useCallback((value: string | undefined | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return date.toLocaleTimeString(calendarLocaleTag, { hour: '2-digit', minute: '2-digit', hour12: false })
  }, [calendarLocaleTag])

  const formatCalendarDateLabel = useCallback((value: string | undefined | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return date.toLocaleDateString(calendarLocaleTag, { weekday: 'long', day: '2-digit', month: 'short' })
  }, [calendarLocaleTag])

  const overlapSessionDisplayTitle = useCallback((item: any) => {
    if (item?.kind === 'personal') return String(item?.title || item?.task || t('formPersonal') || '').trim() || '—'
    return String(item?.type?.name || item?.title || '').trim() || '—'
  }, [t])

  const overlapSessionDisplaySubtitle = useCallback((item: any) => {
    if (item?.kind === 'personal') {
      return String(item?.consultant ? fullName(item.consultant) : t('formPersonal') || '').trim() || '—'
    }
    const clients = Array.isArray(item?.clients) ? item.clients : []
    const clientLabel = clients.length > 0 ? clients.map((c: any) => fullName(c)).filter(Boolean).join(', ') : ''
    return clientLabel || String(item?.consultant ? fullName(item.consultant) : '').trim() || '—'
  }, [t])

  const overlapSessionLocationLabel = useCallback((item: any) => {
    if (item?.space?.name) return item.space.name
    if (item?.consultant) return fullName(item.consultant)
    return item?.kind === 'personal' ? t('formPersonal') : t('formUnassigned')
  }, [t])

  const overlapSessionItemCountLabel = useCallback((item: any) => {
    const isTodo = item?.kind === 'todo'
    if (locale === 'sl') return isTodo ? '1 opravilo' : '1 termin'
    return isTodo ? '1 task' : '1 session'
  }, [locale])

  const overlapSessionAccentColor = useCallback((item: any) => {
    if (item?.kind === 'personal') return '#f97316'
    if (item?.kind === 'todo') return '#2563eb'
    return item?.color || '#16a34a'
  }, [])

  const renderOverlapSessionIcon = useCallback((item: any) => {
    if (item?.kind === 'personal') {
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
    }
    if (item?.kind === 'todo') {
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )
    }
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }, [])

  const unassignedDrawerOpenHint = useMemo(() => {
    if (spacesUseResourceColumns) {
      return locale === 'sl'
        ? 'N/A termine lahko odprete, uredite ali jih povlečete v stolpec prostora za hitro dodelitev lokacije.'
        : 'Open, edit, or drag N/A sessions into a space column to assign a location quickly.'
    }
    return locale === 'sl'
      ? 'Nedodeljene rezervirane termine lahko odprete, uredite ali jih povlečete na stolpec zaposlenega za hitro dodelitev.'
      : 'Open, edit, or drag unassigned booked sessions into a staff column to assign them quickly.'
  }, [locale, spacesUseResourceColumns])

  const unassignedDrawerFooterHint = useMemo(() => {
    if (spacesUseResourceColumns) {
      return locale === 'sl'
        ? 'Povlecite termin na stolpec prostora za hitro dodelitev lokacije.'
        : 'Drag a session into a space column to assign its location quickly.'
    }
    return locale === 'sl'
      ? 'Povlecite termin na stolpec zaposlenega za hitro dodelitev.'
      : 'Drag a session into a staff column to assign it quickly.'
  }, [locale, spacesUseResourceColumns])

  const unassignedDrawerSessions = useMemo(() => {
    if (!useUnassignedDrawer) return []

    const visibleStartMs = visibleRange?.start ? new Date(visibleRange.start).getTime() : Number.NEGATIVE_INFINITY
    const visibleEndMs = visibleRange?.end ? new Date(visibleRange.end).getTime() : Number.POSITIVE_INFINITY

    return filterByConsultantRole(calendarData.booked || [])
      .filter((booking: any) => {
        if (bookingsUseResourceColumns) {
          const consultantId = booking?.consultant?.id ?? null
          if (consultantId != null) return false
          if (spaceFilterId != null && spacesEnabled && booking?.space?.id !== spaceFilterId) return false
        }
        if (spacesUseResourceColumns) {
          const isOnline = !!(booking?.meetingLink && String(booking.meetingLink).trim())
          const resolvedSpaceId = isOnline ? null : (booking?.space?.id ?? null)
          if (resolvedSpaceId != null) return false
        }
        const startMs = new Date(booking?.startTime).getTime()
        const endMs = new Date(booking?.endTime).getTime()
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false
        return startMs < visibleEndMs && endMs > visibleStartMs
      })
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map((booking: any) => {
        const typeDurationMinutes = getTypeDurationMinutes(booking.type?.id)
        const typeBreakMinutes = getTypeBreakMinutes(booking.type?.id)
        return {
          ...booking,
          eventId: `b-${booking.id}`,
          kind: 'booked',
          start: booking.startTime,
          end: booking.endTime,
          title: formatBookingClientsLabel(booking),
          color: '#16A34A',
          resourceId: bookingsUseResourceColumns ? CONSULTANT_RESOURCE_UNASSIGNED_ID : SPACE_RESOURCE_UNASSIGNED_ID,
          type: booking.type
            ? { ...booking.type, durationMinutes: typeDurationMinutes, breakMinutes: typeBreakMinutes }
            : booking.type,
          clients: Array.isArray(booking.clients)
            ? booking.clients
            : booking.client
              ? [booking.client]
              : [],
        }
      })
  }, [
    useUnassignedDrawer,
    bookingsUseResourceColumns,
    spacesUseResourceColumns,
    visibleRange,
    calendarData.booked,
    spaceFilterId,
    spacesEnabled,
    getTypeDurationMinutes,
    getTypeBreakMinutes,
  ])


  function normalizeSelectedClientIds(rawIds: any, fallbackClientId?: number | null) {
    const ids = Array.isArray(rawIds) ? rawIds : []
    const out: number[] = []
    ids.forEach((value: any) => {
      const n = Number(value)
      if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n)
    })
    const fallback = Number(fallbackClientId)
    if (Number.isInteger(fallback) && fallback > 0 && !out.includes(fallback)) out.push(fallback)
    return out
  }

  function normalizeBookingPayeeDrafts(
    clientIds: any,
    rawPayees?: any[] | null,
    fallbackCompanyId?: number | null,
  ): BookingPayeeDraft[] {
    const ids = normalizeSelectedClientIds(clientIds)
    const existing = new Map<number, any>()
    ;(Array.isArray(rawPayees) ? rawPayees : []).forEach((item: any) => {
      const clientId = Number(item?.clientId)
      if (!Number.isInteger(clientId) || clientId <= 0) return
      existing.set(clientId, item)
    })
    const fallbackId = Number(fallbackCompanyId)
    const clean = (value: any) => {
      const trimmed = String(value ?? '').trim()
      return trimmed ? trimmed : null
    }
    return ids.map((clientId) => {
      const current = existing.get(clientId)
      const currentType = String(current?.payeeType || current?.type || '').trim().toUpperCase()
      const payeeType: BookingPayeeDraft['payeeType'] = currentType === 'COMPANY' ? 'COMPANY' : 'PERSON'
      const customData = payeeType === 'COMPANY' && Boolean(current?.customData ?? current?.custom ?? current?.customPayeeData)
      const explicitCompanyId = Number(current?.companyId ?? current?.company?.id)
      const companyId = payeeType === 'COMPANY'
        ? (Number.isInteger(explicitCompanyId) && explicitCompanyId > 0
            ? explicitCompanyId
            : (Number.isInteger(fallbackId) && fallbackId > 0 ? fallbackId : null))
        : null
      return {
        clientId,
        payeeType,
        companyId,
        customData,
        firstName: clean(current?.firstName),
        lastName: clean(current?.lastName),
        email: clean(current?.email),
        companyName: clean(current?.companyName),
        address: clean(current?.address),
        city: clean(current?.city),
        postalCode: clean(current?.postalCode),
        vatId: clean(current?.vatId),
        companyEmail: clean(current?.companyEmail ?? current?.recipientCompanyEmail),
      }
    })
  }

  function normalizeBookingPayeesForPayload(
    clientIds: any,
    rawPayees?: any[] | null,
    fallbackCompanyId?: number | null,
  ) {
    return normalizeBookingPayeeDrafts(clientIds, rawPayees, fallbackCompanyId).map((item) => {
      const companyCustomData = item.payeeType === 'COMPANY' && !!item.customData
      return {
        clientId: item.clientId,
        payeeType: item.payeeType,
        companyId: item.payeeType === 'COMPANY' && !companyCustomData ? item.companyId : null,
        customData: companyCustomData,
        firstName: null,
        lastName: null,
        email: null,
        companyName: companyCustomData ? item.companyName : null,
        address: companyCustomData ? item.address : null,
        city: companyCustomData ? item.city : null,
        postalCode: companyCustomData ? item.postalCode : null,
        vatId: companyCustomData ? item.vatId : null,
        companyEmail: companyCustomData ? item.companyEmail : null,
      }
    })
  }

  const applyFormClientIds = useCallback((clientIds: number[]) => {
    const normalized = normalizeSelectedClientIds(clientIds)
    setForm((prev: any) => ({
      ...prev,
      clientIds: normalized,
      clientId: normalized[0] ?? null,
      payees: normalizeBookingPayeeDrafts(normalized, prev.payees),
    }))
  }, [])

  const applyBookedSessionClientIds = useCallback((clientIds: number[]) => {
    const normalized = normalizeSelectedClientIds(clientIds)
    setSelectedBookedSession((prev: any) => {
      if (!prev) return prev
      const clients = normalized
        .map((id) => metaClients.find((c: any) => c.id === id) || prev.clients?.find((c: any) => c.id === id) || (prev.client?.id === id ? prev.client : null))
        .filter(Boolean)
      return {
        ...prev,
        clients,
        client: clients[0] ?? null,
        payees: normalizeBookingPayeeDrafts(normalized, prev.payees),
      }
    })
  }, [metaClients])

  const selectedFormClientIds = useMemo(
    () => normalizeSelectedClientIds(form.clientIds, form.clientId),
    [form.clientIds, form.clientId],
  )

  const selectedBookedClientIds = useMemo(
    () => normalizeSelectedClientIds(selectedBookedSession?.clients?.map((c: any) => c?.id), selectedBookedSession?.client?.id),
    [selectedBookedSession],
  )

  const notifyBookingAndClientRecordsChanged = useCallback(() => {
    window.dispatchEvent(new Event('bookings-updated'))
    window.dispatchEvent(new Event('clients-updated'))
  }, [])

  const visibleClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    const active = metaClients.filter((c: any) => c.active !== false)
    if (!q) return active
    return active.filter((c: any) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [metaClients, clientSearch])

  const visibleGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase()
    const active = metaGroups.filter((g: any) => g.active !== false)
    if (!q) return active
    return active.filter((g: any) => (g.name || '').toLowerCase().includes(q))
  }, [metaGroups, groupSearch])

  const selectedGroup = useMemo(() => {
    if (!form.groupId) return null
    return metaGroups.find((g: any) => g.id === form.groupId) || null
  }, [metaGroups, form.groupId])

  /** Single-group mode: show selected name in the field (button), not only raw input. */
  const bookSessionGroupFieldCompact = !!selectedGroup && !editingGroupSearch

  const visibleBookedClients = useMemo(() => {
    const q = bookedClientSearch.trim().toLowerCase()
    const active = metaClients.filter((c: any) => c.active !== false)
    if (!q) return active
    return active.filter((c: any) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [metaClients, bookedClientSearch])

  const voiceReviewSelectedClient = useMemo(() => {
    if (voiceReviewClientId == null) return null
    return metaClients.find((c: any) => c.id === voiceReviewClientId) || null
  }, [metaClients, voiceReviewClientId])

  const voiceReviewClients = useMemo(() => {
    const active = metaClients.filter((c: any) => c.active !== false)
    if (voicePendingCancellation?.clientId != null && !active.some((c: any) => c.id === voicePendingCancellation.clientId)) {
      const pendingClient = metaClients.find((c: any) => c.id === voicePendingCancellation.clientId)
      if (pendingClient) return [...active, pendingClient]
    }
    return active
  }, [metaClients, voicePendingCancellation])

  const voiceReviewClientLabel = voiceReviewSelectedClient
    ? fullName(voiceReviewSelectedClient)
    : (voicePendingCancellation?.clientName || (locale === 'sl' ? 'Ni določena' : 'Not specified'))

  useEffect(() => {
    if (!voiceReviewOpen) {
      setVoiceReviewClientDropdownOpen(false)
      return
    }
    if (voiceReviewSelectedClient) {
      setVoiceReviewClientQuery(fullName(voiceReviewSelectedClient))
      return
    }
    setVoiceReviewClientQuery(voicePendingCancellation?.clientName || '')
  }, [voiceReviewOpen, voiceReviewSelectedClient, voicePendingCancellation?.clientName])

  useEffect(() => {
    if (!voiceReviewOpen || voicePendingCancellation?.targetType !== 'booking') return
    const id = requestAnimationFrame(() => voiceReviewClientInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [voiceReviewOpen, voicePendingCancellation?.targetType])

  const visibleVoiceReviewClients = useMemo(() => {
    const q = voiceReviewClientQuery.trim().toLowerCase()
    if (!q) return voiceReviewClients
    return voiceReviewClients.filter((client: any) =>
      fullName(client).toLowerCase().includes(q) ||
      (client.email || '').toLowerCase().includes(q) ||
      (client.phone || '').toLowerCase().includes(q)
    )
  }, [voiceReviewClients, voiceReviewClientQuery])

  const voiceReviewResolvedClientName = useMemo(() => {
    const typed = voiceReviewClientQuery.trim()
    if (!typed) return null
    const selectedName = voiceReviewSelectedClient ? fullName(voiceReviewSelectedClient) : ''
    if (voiceReviewClientId != null && selectedName.toLowerCase() === typed.toLowerCase()) {
      return null
    }
    return typed
  }, [voiceReviewClientId, voiceReviewClientQuery, voiceReviewSelectedClient])

  const bookSessionSelectedClients = useMemo(() => {
    if (form.todo || form.personal) return []
    return selectedFormClientIds
      .map((id) => metaClients.find((c: any) => c.id === id) ?? null)
      .filter((c: any) => c && c.active !== false)
  }, [form.todo, form.personal, selectedFormClientIds, metaClients])

  const bookedSessionSelectedClients = useMemo(() => {
    return selectedBookedClientIds
      .map((id) => metaClients.find((c: any) => c.id === id && c.active !== false) || selectedBookedSession?.clients?.find((c: any) => c?.id === id) || (selectedBookedSession?.client?.id === id ? selectedBookedSession.client : null))
      .filter(Boolean)
  }, [selectedBookedClientIds, metaClients, selectedBookedSession])

  const bookSessionSelectedClient = bookSessionSelectedClients[0] ?? null
  const bookedSessionSelectedClient = bookedSessionSelectedClients[0] ?? null

  const formBookingPayeeLinkedCompany = useMemo(() => {
    return selectedGroup?.billingCompany || bookSessionSelectedClient?.billingCompany || null
  }, [selectedGroup, bookSessionSelectedClient])

  const bookedSessionGroupIdRaw = selectedBookedSession?.groupId
  const bookedSessionGroupId =
    bookedSessionGroupIdRaw != null && Number.isFinite(Number(bookedSessionGroupIdRaw)) && Number(bookedSessionGroupIdRaw) > 0
      ? Number(bookedSessionGroupIdRaw)
      : null
  const bookedSessionIsGroup = groupBookingEnabled && bookedSessionGroupId != null
  const bookedSessionResolvedGroup = useMemo(() => {
    if (!bookedSessionGroupId) return null
    return metaGroups.find((g: any) => g.id === bookedSessionGroupId) || null
  }, [metaGroups, bookedSessionGroupId])

  const bookedBookingPayeeLinkedCompany = useMemo(() => {
    return selectedBookedSession?.sessionGroupBillingCompany
      || bookedSessionResolvedGroup?.billingCompany
      || bookedSessionSelectedClient?.billingCompany
      || null
  }, [selectedBookedSession?.sessionGroupBillingCompany, bookedSessionResolvedGroup, bookedSessionSelectedClient])

  /** Payment manager opened from "Dodaj termin" (no persisted booking yet) vs edit booked session. */
  const paymentManagerIsNewBooking =
    bookedPaymentMenuOpen
    && !selectedBookedSession
    && !form.personal
    && !form.todo
    && !availabilitySelection
    && !!selection

  const paymentManagerSessionClients = paymentManagerIsNewBooking ? bookSessionSelectedClients : bookedSessionSelectedClients
  const paymentManagerClientIds = paymentManagerIsNewBooking ? selectedFormClientIds : selectedBookedClientIds
  const paymentManagerPayeeLinkedCompany = paymentManagerIsNewBooking ? formBookingPayeeLinkedCompany : bookedBookingPayeeLinkedCompany
  const paymentManagerSessionClientIdSet = useMemo(
    () => new Set(paymentManagerSessionClients.map((client: any) => Number(client?.id)).filter((id: number) => Number.isInteger(id) && id > 0)),
    [paymentManagerSessionClients],
  )
  const paymentManagerGroupMemberIds = useMemo(
    () => new Set(
      (Array.isArray(bookedSessionResolvedGroup?.members) ? bookedSessionResolvedGroup.members : [])
        .map((client: any) => Number(client?.id))
        .filter((id: number) => Number.isInteger(id) && id > 0),
    ),
    [bookedSessionResolvedGroup?.members],
  )
  const paymentManagerAddClientSelectionActive = bookedSessionIsGroup && selectedBookedPaymentClientId === PAYMENT_MANAGER_ADD_CLIENT_ID
  const paymentManagerAddClientSearchNormalized = bookedPaymentAddSearch.trim().toLowerCase()
  const bookedPaymentGroupAvailableMembers = useMemo(() => {
    const members = Array.isArray(bookedSessionResolvedGroup?.members) ? bookedSessionResolvedGroup.members : []
    return members.filter((client: any) => {
      const clientId = Number(client?.id)
      if (!Number.isInteger(clientId) || clientId <= 0) return false
      if (client?.active === false) return false
      if (paymentManagerSessionClientIdSet.has(clientId)) return false
      if (!paymentManagerAddClientSearchNormalized) return true
      const haystack = `${fullName(client)} ${client?.email || ''} ${client?.phone || ''}`.toLowerCase()
      return haystack.includes(paymentManagerAddClientSearchNormalized)
    })
  }, [bookedSessionResolvedGroup?.members, fullName, paymentManagerAddClientSearchNormalized, paymentManagerSessionClientIdSet])
  const bookedPaymentSessionOnlyCandidates = useMemo(() => {
    return metaClients.filter((client: any) => {
      const clientId = Number(client?.id)
      if (!Number.isInteger(clientId) || clientId <= 0) return false
      if (client?.active === false) return false
      if (paymentManagerSessionClientIdSet.has(clientId)) return false
      if (paymentManagerGroupMemberIds.has(clientId)) return false
      if (!paymentManagerAddClientSearchNormalized) return true
      const haystack = `${fullName(client)} ${client?.email || ''} ${client?.phone || ''}`.toLowerCase()
      return haystack.includes(paymentManagerAddClientSearchNormalized)
    })
  }, [fullName, metaClients, paymentManagerAddClientSearchNormalized, paymentManagerGroupMemberIds, paymentManagerSessionClientIdSet])
  const bookedPaymentAddCandidates = bookedPaymentAddMode === 'group-member'
    ? bookedPaymentGroupAvailableMembers
    : bookedPaymentSessionOnlyCandidates

  useEffect(() => {
    if (!bookedPaymentMenuOpen) {
      setBookedPaymentAddMode('group-member')
      setBookedPaymentAddSearch('')
      if (selectedBookedPaymentClientId === PAYMENT_MANAGER_ADD_CLIENT_ID) {
        setSelectedBookedPaymentClientId(null)
      }
      return
    }
    if (!bookedSessionIsGroup && selectedBookedPaymentClientId === PAYMENT_MANAGER_ADD_CLIENT_ID) {
      setSelectedBookedPaymentClientId(null)
    }
  }, [PAYMENT_MANAGER_ADD_CLIENT_ID, bookedPaymentMenuOpen, bookedSessionIsGroup, selectedBookedPaymentClientId])

  useEffect(() => {
    if (!paymentManagerAddClientSelectionActive) {
      setBookedPaymentAddSearch('')
    }
  }, [paymentManagerAddClientSelectionActive])

  useEffect(() => {
    if (!bookedSessionIsGroup) {
      setBookedPaymentGroupNameDraft('')
      return
    }
    const nextName = String(bookedSessionResolvedGroup?.name || '').trim()
    setBookedPaymentGroupNameDraft(nextName)
  }, [bookedSessionIsGroup, bookedSessionResolvedGroup?.name])

  /** Single-client mode: show selected name in the field (button), not as chips below. */
  const bookSessionClientFieldCompact =
    !multipleClientsPerSessionEnabled && !!bookSessionSelectedClient && !editingClientSearch
  const bookedSessionClientFieldCompact =
    !multipleClientsPerSessionEnabled && !!bookedSessionSelectedClient && !editingBookedClientSearch
  const visibleBookSessionClientChips = bookSessionClientsExpanded
    ? bookSessionSelectedClients
    : bookSessionSelectedClients.slice(0, 3)
  const hiddenBookSessionClientCount = Math.max(0, bookSessionSelectedClients.length - visibleBookSessionClientChips.length)
  const visibleBookedSessionClientChips = bookedSessionClientsExpanded
    ? bookedSessionSelectedClients
    : bookedSessionSelectedClients.slice(0, 3)
  const hiddenBookedSessionClientCount = Math.max(0, bookedSessionSelectedClients.length - visibleBookedSessionClientChips.length)
  const clientSearchPlaceholder = locale === 'sl' ? 'Išči ali dodaj stranko…' : 'Search or add client…'
  const groupSearchPlaceholder = locale === 'sl' ? 'Išči skupino…' : 'Search group…'
  const addClientInlineTitle = locale === 'sl' ? 'Dodaj stranko' : 'Add client'
  const addGroupInlineTitle = t('addGroupInlineTitle')
  const clearSingleClientTitle = locale === 'sl' ? 'Odstrani stranko' : 'Remove client'
  const clearSingleGroupTitle = locale === 'sl' ? 'Odstrani skupino' : 'Remove group'
  const showLessClientsLabel = locale === 'sl' ? 'Prikaži manj' : 'Show less'

  function getMoreClientsLabel(hiddenCount: number) {
    return locale === 'sl' ? `+ ${hiddenCount} več` : `+ ${hiddenCount} more`
  }

  function openBookedSessionGroupScanner() {
    const bookingId = selectedBookedSession?.id
    if (bookingId == null || !Number.isFinite(Number(bookingId)) || Number(bookingId) <= 0) return
    const id = Number(bookingId)
    const params = new URLSearchParams({
      groupBookingId: String(id),
      autoStart: '1',
      returnTo: `/calendar/booking/${id}`,
    })
    navigate(`/scanner?${params.toString()}`)
  }

  function openBookedPaymentEntitlementScanner(status?: BookingPaymentStatus | null, client?: any) {
    const paymentBookingId = Number(status?.bookingId)
    if (!Number.isInteger(paymentBookingId) || paymentBookingId <= 0) return

    const returnBookingIdRaw = Number(selectedBookedSession?.id ?? status?.bookingId)
    const returnBookingId = Number.isInteger(returnBookingIdRaw) && returnBookingIdRaw > 0 ? returnBookingIdRaw : paymentBookingId
    const params = new URLSearchParams({
      paymentBookingId: String(paymentBookingId),
      autoStart: '1',
      returnTo: `/calendar/booking/${returnBookingId}`,
    })
    const clientId = Number(client?.id ?? status?.clientId)
    if (Number.isInteger(clientId) && clientId > 0) {
      params.set('clientId', String(clientId))
    }
    navigate(`/scanner?${params.toString()}`)
  }

  function openBookedPaymentDetailsForClient(clientId?: number | null) {
    const id = Number(clientId)
    if (!Number.isInteger(id) || id <= 0) return
    setBookedStatusMenuOpen(false)
    setBookedPaymentAddSearch('')
    setBookedPaymentMenuOpen(false)
    setSelectedBookedPaymentClientId(id)
    const status = paymentStatusForClient(id)
    const openBillIdRaw = Number(status?.openBillId ?? 0)
    const shouldSyncPerClientBillTabs = selectedBookedSession?.type?.priceCalculationMode !== 'TOTAL' && paymentManagerSessionClients.length > 1
    if (Number.isInteger(openBillIdRaw) && openBillIdRaw > 0 && !shouldSyncPerClientBillTabs) {
      openBookedPaymentOpenBillEditor(status, openBillIdRaw)
      return
    }
    if (status?.status === 'UNPAID' || shouldSyncPerClientBillTabs) {
      void createOpenBillForPaymentStatus(status).then((openBillId) => {
        if (openBillId || openBillIdRaw) openBookedPaymentOpenBillEditor(status, openBillId || openBillIdRaw)
      })
      return
    }
    showToast('info', locale === 'sl' ? 'Odprti račun lahko ustvarite le pri neplačanem terminu.' : 'Open invoice can only be created for unpaid sessions.')
  }

  function openBookedPaymentAddClient() {
    if (!bookedSessionIsGroup) return
    setBookedStatusMenuOpen(false)
    setBookedPaymentManagerTab('details')
    setBookedPaymentAddMode('group-member')
    setBookedPaymentAddSearch('')
    setSelectedBookedPaymentClientId(PAYMENT_MANAGER_ADD_CLIENT_ID)
    setBookedPaymentMenuOpen(true)
  }

  function addBookedPaymentClientToSession(clientId?: number | null) {
    const id = Number(clientId)
    if (!Number.isInteger(id) || id <= 0) return
    const nextIds = multipleClientsPerSessionEnabled
      ? Array.from(new Set([...selectedBookedClientIds, id]))
      : [id]
    applyBookedSessionClientIds(nextIds)
    setBookedPaymentAddSearch('')
    setSelectedBookedPaymentClientId(id)
    setBookedPaymentManagerTab('details')
  }

  function removeBookedPaymentClientFromSession(clientId?: number | null) {
    const id = Number(clientId)
    if (!Number.isInteger(id) || id <= 0) return
    const nextIds = selectedBookedClientIds.filter((clientId) => Number(clientId) !== id)
    applyBookedSessionClientIds(nextIds)
    const nextSelectedId = nextIds[0] ?? PAYMENT_MANAGER_ADD_CLIENT_ID
    setSelectedBookedPaymentClientId(nextSelectedId)
    setBookedPaymentManagerTab('details')
  }

  async function removeBookedPaymentClientFromGroup(clientId?: number | null) {
    const id = Number(clientId)
    const groupId = Number(bookedSessionResolvedGroup?.id)
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(groupId) || groupId <= 0) return
    try {
      const response = await api.delete(`/groups/${groupId}/members/${id}`)
      const updatedGroup = response?.data || null
      setMeta((prev: any) => ({
        ...prev,
        groups: Array.isArray(prev?.groups)
          ? prev.groups.map((group: any) => {
              if (Number(group?.id) !== groupId) return group
              if (updatedGroup) return { ...group, ...updatedGroup }
              return {
                ...group,
                members: Array.isArray(group?.members)
                  ? group.members.filter((member: any) => Number(member?.id) !== id)
                  : group?.members,
              }
            })
          : prev?.groups,
      }))
      removeBookedPaymentClientFromSession(id)
      showToast('success', locale === 'sl' ? 'Klient je odstranjen iz skupine.' : 'Client removed from the group.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.message || (locale === 'sl' ? 'Klienta ni bilo mogoče odstraniti iz skupine.' : 'Failed to remove client from group.'))
    }
  }

  function formatBookingClientsLabel(bookingLike: any) {
    const gidRaw = bookingLike?.groupId
    const gid =
      gidRaw != null && Number.isFinite(Number(gidRaw)) && Number(gidRaw) > 0 ? Number(gidRaw) : null
    if (groupBookingEnabled && gid != null) {
      const g = metaGroups.find((x: any) => x.id === gid)
      const rawClients = Array.isArray(bookingLike?.clients) ? bookingLike.clients : []
      const count =
        rawClients.length > 0 ? rawClients.length : bookingLike?.client?.id ? 1 : 0
      const name = (g?.name && String(g.name).trim()) || `Group #${gid}`
      const maxRaw = bookingLike?.type?.maxParticipantsPerSession ?? getTypeMaxParticipants(bookingLike?.type?.id)
      const max =
        maxRaw != null &&
        Number.isFinite(Number(maxRaw)) &&
        Number(maxRaw) >= 1 &&
        Number(maxRaw) <= 99
          ? Number(maxRaw)
          : null
      if (max != null) {
        return `${name} (${count}/${max})`
      }
      return count > 0 ? `${name} (${count})` : name
    }

    const ids = normalizeSelectedClientIds(bookingLike?.clients?.map((c: any) => c?.id), bookingLike?.client?.id)
    const clients = ids
      .map((id) => metaClients.find((c: any) => c.id === id) || bookingLike?.clients?.find((c: any) => c?.id === id) || (bookingLike?.client?.id === id ? bookingLike.client : null))
      .filter(Boolean)
    if (clients.length === 0) return '-'
    const first = fullName(clients[0] || { firstName: '', lastName: '' }) || '-'
    return clients.length > 1 ? `${first} +${clients.length - 1}` : first
  }

  /** Desktop booked block label: LastName · ServiceType (never includes first name). */
  function formatBookedBlockDesktopLabel(bookingLike: any, fallbackTitle: string) {
    const explicitLastName = String(
      bookingLike?.client?.lastName || bookingLike?.clients?.[0]?.lastName || '',
    ).trim()
    const fallback = String(fallbackTitle || '').trim()
    const parsedLastName = (() => {
      if (explicitLastName) return explicitLastName
      if (!fallback) return '—'
      if (fallback.includes(',')) {
        const left = String(fallback.split(',')[0] || '').trim()
        if (left) return left
      }
      const tokens = fallback.split(/\s+/).filter(Boolean)
      if (tokens.length > 1) return String(tokens[tokens.length - 1])
      return fallback
    })()
    const typeName = String(bookingLike?.type?.name || '').trim()
    return typeName ? `${parsedLastName} · ${typeName}` : parsedLastName
  }

  /** FullCalendar draws a blue/teal `.fc-highlight` during select; we show a colored draft event instead. */
  const hideNativeSelectionWhileDraftPreview = useMemo(
    () =>
      !isNativeAndroid &&
      !isViewOnly &&
      !selectedBookedSession &&
      !selectedPersonalBlock &&
      !selectedTodo &&
      (!!selection || !!availabilitySelection),
    [
      isNativeAndroid,
      isViewOnly,
      selectedBookedSession,
      selectedPersonalBlock,
      selectedTodo,
      selection,
      availabilitySelection,
    ],
  )
  const personalTaskPresets = useMemo(() => {
    const out: string[] = []
    const unique = new Set<string>()

    const rawJson = String(settings[PERSONAL_TASK_PRESETS_KEY] || '')
    if (rawJson.trim()) {
      try {
        const parsed = JSON.parse(rawJson)
        if (Array.isArray(parsed)) {
          for (const row of parsed) {
            const name = String(row?.name || '').trim()
            if (name && !unique.has(name.toLowerCase())) {
              unique.add(name.toLowerCase())
              out.push(name)
            }
          }
        }
      } catch {
        // Ignore parse errors and try legacy format below.
      }
    }

    // Legacy fallback: one task per line from previous setting key.
    const legacyRaw = String(settings.PERSONAL_TASK_PRESETS || '')
    if (legacyRaw.trim()) {
      for (const line of legacyRaw.split(/\r?\n/)) {
        const name = line.trim()
        if (name && !unique.has(name.toLowerCase())) {
          unique.add(name.toLowerCase())
          out.push(name)
        }
      }
    }

    return out
  }, [settings])
  useEffect(() => {
    if (!editingClientSearch || !selection || form.todo || form.personal) return
    const id = requestAnimationFrame(() => clientSearchInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editingClientSearch, selection, form.todo, form.personal])

  useEffect(() => {
    if (!editingGroupSearch || !selection || form.todo || form.personal || !bookingGroupMode || !groupBookingEnabled) return
    const id = requestAnimationFrame(() => groupSearchInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editingGroupSearch, selection, form.todo, form.personal, bookingGroupMode, groupBookingEnabled])

  useEffect(() => {
    if (!form.personal) setPersonalTaskPresetDropdownOpen(false)
  }, [form.personal])

  useEffect(() => {
    if (!selection || form.todo || form.personal || availabilitySelection) return
    setForm((f: any) => {
      const updates: Record<string, unknown> = {}
      if (isTenantAdmin && metaConsultants.length === 1) {
        updates.consultantId = metaConsultants[0].id
      }
      if (settings.SPACES_ENABLED !== 'false') {
        if (metaSpaces.length === 1) {
          updates.spaceId = metaSpaces[0].id
        } else if (metaSpaces.length === 0) {
          updates.spaceId = null
        }
      }
      if (selectableMetaTypes.length === 0) {
        updates.typeId = null
      }
      if (Object.keys(updates).length === 0) return f
      let changed = false
      for (const [k, v] of Object.entries(updates)) {
        if (f[k] !== v) changed = true
      }
      return changed ? { ...f, ...updates } : f
    })
  }, [selection, form.todo, form.personal, availabilitySelection, user.role, metaConsultants, metaSpaces, selectableMetaTypes.length, settings.SPACES_ENABLED])

  useEffect(() => {
    if (!availabilitySelection || !isTenantAdmin || metaConsultants.length !== 1) return
    const id = metaConsultants[0].id
    if (availabilitySelection.consultantId === id) return
    setAvailabilitySelection({ ...availabilitySelection, consultantId: id })
  }, [availabilitySelection, metaConsultants, user.role])

  useEffect(() => {
    if (!selectedPersonalBlock) setPersonalTaskPresetDropdownOpen(false)
  }, [selectedPersonalBlock])

  useEffect(() => {
    if (calendarFiltersBottomBar) setMonthHoverCard(null)
  }, [calendarFiltersBottomBar])

  useEffect(() => {
    if (!selectedBookedSession) return
    setBookedClientSearch('')
    setBookedClientDropdownOpen(false)
    setEditingBookedClientSearch(false)
    setBookedSessionClientsExpanded(false)
  }, [selectedBookedSession?.id])

  useEffect(() => {
    if (!editingBookedClientSearch || !selectedBookedSession) return
    const id = requestAnimationFrame(() => bookedClientSearchInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [editingBookedClientSearch, selectedBookedSession])

  useEffect(() => {
    if (bookSessionSelectedClients.length <= 3) setBookSessionClientsExpanded(false)
  }, [bookSessionSelectedClients.length])

  useEffect(() => {
    if (bookedSessionSelectedClients.length <= 3) setBookedSessionClientsExpanded(false)
  }, [bookedSessionSelectedClients.length])

  useEffect(() => {
    if (selection) setBookSessionClientsExpanded(false)
  }, [selection])

  const createClientFromBooking = async () => {
    setClientError('')
    if (!newClientForm.lastName.trim() && !newClientForm.firstName.trim()) {
      setClientError('Last name (or first and last name) is required.')
      return
    }
    setSavingClient(true)
    try {
      const payload: any = {
        firstName: newClientForm.firstName.trim() || '',
        lastName: newClientForm.lastName.trim() || '',
        email: newClientForm.email.trim() || null,
        phone: newClientForm.phone.trim() || null,
        preferredSlots: [],
      }
      if (isTenantAdmin) {
        payload.assignedToId = selectedBookedSession?.consultant?.id ?? form.consultantId
      }
      const { data } = await api.post('/clients', payload)
      setMeta((m: any) => ({ ...m, clients: [...m.clients, data] }))
      if (selectedBookedSession) {
        const nextIds = multipleClientsPerSessionEnabled
          ? Array.from(new Set([...(selectedBookedClientIds || []), data.id]))
          : [data.id]
        setSelectedBookedSession((prev: any) => prev ? {
          ...prev,
          client: data,
          clients: nextIds
            .map((id) => (id === data.id ? data : metaClients.find((c: any) => c.id === id) || prev.clients?.find((c: any) => c.id === id) || null))
            .filter(Boolean),
        } : prev)
        setBookedClientDropdownOpen(false)
        setEditingBookedClientSearch(false)
      } else {
        const nextIds = multipleClientsPerSessionEnabled
          ? Array.from(new Set([...(selectedFormClientIds || []), data.id]))
          : [data.id]
        setForm((f: any) => ({ ...f, clientId: data.id, clientIds: nextIds }))
        setClientDropdownOpen(false)
        setEditingClientSearch(false)
      }
      setShowAddClientModal(false)
      setNewClientForm({ firstName: '', lastName: '', email: '', phone: '' })
    } catch (e: any) {
      setClientError(e?.response?.data?.message || 'Failed to create client.')
    } finally {
      setSavingClient(false)
    }
  }

  const createGroupFromBooking = async () => {
    setGroupModalError('')
    const name = newGroupForm.name.trim()
    if (!name) {
      setGroupModalError(locale === 'sl' ? 'Ime skupine je obvezno.' : 'Group name is required.')
      return
    }
    setSavingNewGroupModal(true)
    try {
      const { data } = await api.post('/groups', { name, email: newGroupForm.email.trim() || null })
      const memberIds = Array.from(
        new Set(
          (newGroupMemberIds || [])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      )
      let group = data
      for (const memberId of memberIds) {
        const response = await api.post(`/groups/${data.id}/members/${memberId}`)
        if (response?.data) group = response.data
      }
      if (memberIds.length && !Array.isArray(group?.members)) {
        group = {
          ...group,
          members: memberIds
            .map((memberId) => metaClients.find((client: any) => Number(client?.id) === memberId))
            .filter(Boolean),
        }
      }
      setMeta((m: any) => ({ ...m, groups: [...(m.groups || []), group] }))
      setForm((f: any) => ({ ...f, groupId: group.id ?? data.id, clientIds: [], clientId: null }))
      setGroupSearch('')
      setEditingGroupSearch(false)
      setGroupDropdownOpen(false)
      setShowAddGroupModal(false)
      setNewGroupForm({ name: '', email: '' })
      setNewGroupMemberSearch('')
      setNewGroupMemberIds([])
    } catch (e: any) {
      setGroupModalError(e?.response?.data?.message || e?.message || 'Failed to create group.')
    } finally {
      setSavingNewGroupModal(false)
    }
  }

  const postClientFromTypedName = async (typed: string, assignedToIdForAdmin: number | null | undefined) => {
    const { firstName, lastName } = parseClientNameInput(typed)
    if (!lastName.trim() && !firstName.trim()) {
      throw new Error('Client name is required.')
    }
    const payload: any = {
      firstName: firstName.trim() || '',
      lastName: lastName.trim() || '',
      email: null,
      phone: null,
      preferredSlots: [],
    }
    if (isTenantAdmin) {
      if (!assignedToIdForAdmin) {
        throw new Error('Choose a consultant before creating a client.')
      }
      payload.assignedToId = assignedToIdForAdmin
    }
    const { data } = await api.post('/clients', payload)
    setMeta((m: any) => ({ ...m, clients: [...m.clients, data] }))
    return data
  }

  const postGroupFromTypedName = async (typed: string) => {
    const name = typed.trim()
    if (!name) {
      throw new Error('Group name is required.')
    }
    const { data } = await api.post('/groups', { name })
    setMeta((m: any) => ({ ...m, groups: [...(m.groups || []), data] }))
    return data
  }

  const openBookingModal = (
    start: string,
    end: string,
    consultantId?: number,
    keepProvidedEnd = false,
    preselectedSpaceId?: number | null,
    preselectedClientId?: number | null,
    selectedOutsideBookable = false,
    anchorEl?: HTMLElement | null,
    /** Resource column id when using Spaces/Bookings ALL columns (keeps highlight on one column only). */
    selectionResourceId?: string | null,
    opts?: { skipCompactNavigate?: boolean },
  ) => {
    setConfirmNonBookable(null)
    bookingEndEditedManuallyRef.current = false
    setSelectedBookedSession(null)
    const startLocal = normalizeToLocalDateTime(start)
    const defaultTypeId: number | null = selectableMetaTypes?.[0]?.id ?? null
    const endLocal = keepProvidedEnd
      ? normalizeToLocalDateTime(end)
      : toLocalDateTimeString(
          new Date(new Date(startLocal).getTime() + getTypeDurationMinutes(defaultTypeId) * 60000),
        )
    const availableConsultants = metaUsers.filter((u: any) => u.consultant)
    const defaultConsultantId = consultantId || availableConsultants[0]?.id || user.id
    setSelection({
      start: startLocal,
      end: endLocal,
      ...(selectionResourceId !== undefined ? { resourceId: selectionResourceId } : {}),
    })
    setClientSearch('')
    setClientDropdownOpen(false)
    setEditingClientSearch(false)
    setSaveBookingError(null)
    setMeetingProviderPickerOpen(false)
    setMeetingProviderPickerTarget(null)
    setMeetingPickerCancelUnchecksOnline(false)
    setBookSessionNotesExpanded(false)
    setBookingGroupMode(false)
    setGroupSearch('')
    setGroupDropdownOpen(false)
    setEditingGroupSearch(false)
    setForm({
      clientId: preselectedClientId != null ? preselectedClientId : null,
      clientIds: preselectedClientId != null ? [preselectedClientId] : [],
      groupId: null,
      consultantId: defaultConsultantId,
      startTime: startLocal,
      endTime: endLocal,
      spaceId: preselectedSpaceId !== undefined ? preselectedSpaceId : (metaSpaces[0]?.id ?? null),
      typeId: defaultTypeId,
      notes: '',
      personal: false,
      online: false,
      meetingProvider: 'zoom',
      task: '',
      todo: false,
      outsideBookable: selectedOutsideBookable,
    })
    placeSessionPopup(anchorEl)
    if (useBookingSidePanel && !opts?.skipCompactNavigate) {
      const defaultSpaceId = preselectedSpaceId !== undefined ? preselectedSpaceId : (metaSpaces[0]?.id ?? null)
      const ridForUrl =
        selectionResourceId !== undefined && selectionResourceId !== null && selectionResourceId !== ''
          ? String(selectionResourceId)
          : undefined
      const qs = buildNewSlotSearchParams({
        start: startLocal,
        end: endLocal,
        consultantId: defaultConsultantId,
        spaceId: defaultSpaceId,
        clientId: preselectedClientId != null ? preselectedClientId : undefined,
        resourceId: ridForUrl,
        outsideBookable: selectedOutsideBookable,
      })
      pushCompactFormRoute(`${pathForNewForm('booking')}?${qs}`)
    }
  }

  useEffect(() => {
    if (!useBookingSidePanel) return
    const routeMatch = matchCalendarFormRoute(location.pathname)
    const fullKey = `${location.pathname}${location.search || ''}`
    if (!routeMatch) {
      lastHydratedFormRouteKeyRef.current = ''
      return
    }
    if (compactFormHydrateSkipKeyRef.current === fullKey) {
      compactFormHydrateSkipKeyRef.current = null
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }
    if (lastHydratedFormRouteKeyRef.current === fullKey) return

    if (routeMatch.kind === 'new') {
      const sp = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search)
      if (sp.has('fromWh')) {
        const a = parseAvailabilityQuery(location.search)
        if (a) {
          setSelection({ start: a.start, end: a.end })
          setAvailabilityError(null)
          setAvailabilityIntent('add')
          setAvailabilitySelection({
            slotId: a.fromWorkingHours ? null : a.slotId,
            consultantId: a.consultantId,
            startTime: a.start,
            endTime: a.end,
            indefinite: a.indefinite,
            rangeStartDate: a.rangeStartDate,
            rangeEndDate: a.rangeEndDate,
          })
          lastHydratedFormRouteKeyRef.current = fullKey
          return
        }
      }
      if (sp.get('panel') === 'personal' && personalModuleEnabled) {
        const q = parseNewSlotQuery(location.search)
        if (!q.start || !q.end) return
        const startLocal = normalizeToLocalDateTime(q.start)
        const endLocal = normalizeToLocalDateTime(q.end)
        const availableConsultants = metaUsers.filter((u: any) => u.consultant)
        const defaultConsultantId = q.consultantId || availableConsultants[0]?.id || user.id
        const defaultTypeId: number | null = selectableMetaTypes?.[0]?.id ?? null
        setConfirmNonBookable(null)
        bookingEndEditedManuallyRef.current = false
        setSelection({
          start: startLocal,
          end: endLocal,
          ...(q.resourceId ? { resourceId: q.resourceId } : {}),
        })
        setClientSearch('')
        setClientDropdownOpen(false)
        setEditingClientSearch(false)
        setSaveBookingError(null)
        setMeetingProviderPickerOpen(false)
        setMeetingProviderPickerTarget(null)
        setMeetingPickerCancelUnchecksOnline(false)
        setBookSessionNotesExpanded(false)
        setForm({
          clientId: null,
          consultantId: defaultConsultantId,
          startTime: startLocal,
          endTime: endLocal,
          spaceId: q.spaceId !== undefined ? q.spaceId : (metaSpaces[0]?.id ?? null),
          typeId: defaultTypeId,
          notes: '',
          personal: true,
          online: false,
          meetingProvider: 'zoom',
          task: '',
          todo: false,
          outsideBookable: false,
        })
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      if (sp.get('panel') === 'todo' && todosModuleEnabled) {
        const q = parseNewSlotQuery(location.search)
        if (!q.start || !q.end) return
        const startLocal = normalizeToLocalDateTime(q.start)
        const endLocal = normalizeToLocalDateTime(q.end)
        const availableConsultants = metaUsers.filter((u: any) => u.consultant)
        const defaultConsultantId = q.consultantId || availableConsultants[0]?.id || user.id
        const defaultTypeId: number | null = selectableMetaTypes?.[0]?.id ?? null
        setConfirmNonBookable(null)
        bookingEndEditedManuallyRef.current = false
        setSelection({
          start: startLocal,
          end: endLocal,
          ...(q.resourceId ? { resourceId: q.resourceId } : {}),
        })
        setClientSearch('')
        setClientDropdownOpen(false)
        setEditingClientSearch(false)
        setSaveBookingError(null)
        setMeetingProviderPickerOpen(false)
        setMeetingProviderPickerTarget(null)
        setMeetingPickerCancelUnchecksOnline(false)
        setBookSessionNotesExpanded(false)
        setForm({
          clientId: null,
          consultantId: defaultConsultantId,
          startTime: startLocal,
          endTime: endLocal,
          spaceId: q.spaceId !== undefined ? q.spaceId : (metaSpaces[0]?.id ?? null),
          typeId: defaultTypeId,
          notes: '',
          personal: false,
          online: false,
          meetingProvider: 'zoom',
          task: '',
          todo: true,
          outsideBookable: false,
        })
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      const q = parseNewSlotQuery(location.search)
      if (!q.start || !q.end) return
      openBookingModal(
        q.start,
        q.end,
        q.consultantId != null ? q.consultantId : undefined,
        true,
        q.spaceId !== undefined ? q.spaceId : undefined,
        q.clientId ?? null,
        q.outsideBookable ?? false,
        null,
        q.resourceId ?? null,
        { skipCompactNavigate: true },
      )
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }

    if (routeMatch.kind === 'edit' && routeMatch.form === 'booking') {
      const b = (calendarData.booked || []).find((x: any) => x.id === routeMatch.id)
      if (!b) return
      if (selectedBookedSession?.id === routeMatch.id) {
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      sessionPopupAnchorRectRef.current = null
      setSelection(null)
      calendarRef.current?.getApi()?.unselect()
      setSelectedBookedSession({
        ...b,
        online: Boolean(b.online ?? b.meetingLink),
        meetingProvider: b.meetingProvider || 'zoom',
      })
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }

    if (routeMatch.kind === 'edit' && routeMatch.form === 'personal') {
      const p = (calendarData.personal || []).find((x: any) => x.id === routeMatch.id)
      if (!p) return
      if (selectedPersonalBlock?.id === routeMatch.id) {
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      sessionPopupAnchorRectRef.current = null
      setSelection(null)
      calendarRef.current?.getApi()?.unselect()
      setSelectedPersonalBlock(p)
      lastHydratedFormRouteKeyRef.current = fullKey
      return
    }

    if (routeMatch.kind === 'edit' && routeMatch.form === 'todo') {
      const td = (calendarData.todos || []).find((x: any) => x.id === routeMatch.id)
      if (!td) return
      if (selectedTodo?.id === routeMatch.id) {
        lastHydratedFormRouteKeyRef.current = fullKey
        return
      }
      sessionPopupAnchorRectRef.current = null
      setSelection(null)
      calendarRef.current?.getApi()?.unselect()
      setSelectedTodo(td)
      lastHydratedFormRouteKeyRef.current = fullKey
    }
  }, [
    useBookingSidePanel,
    location.pathname,
    location.search,
    personalModuleEnabled,
    todosModuleEnabled,
    calendarData.booked,
    calendarData.personal,
    calendarData.todos,
    metaUsers,
    metaSpaces,
    metaTypes,
    user.id,
    selectedBookedSession?.id,
    selectedPersonalBlock?.id,
    selectedTodo?.id,
    openBookingModal,
  ])

  const formatVoiceReviewDateTime = (value?: string | null) => {
    if (!value) return '—'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return value
    return dt.toLocaleString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const submitVoiceBookingTranscript = async (text: string, confirmCancellation = false, clientIdOverride?: number | null, clientNameOverride?: string | null) => {
    const genericVoiceFailure = locale === 'sl' ? 'Glasovno dejanje ni uspelo.' : 'Voice action failed.'
    const trimmed = text.trim()
    if (!trimmed) {
      setVoiceBookingError(locale === 'sl' ? 'Besedilo je prazno.' : 'The text is empty.')
      return
    }
    if (!confirmCancellation) {
      setVoicePendingCancellation(null)
    }
    setVoiceBookingError(null)
    setVoiceBookingLoading(true)
    try {
      const payload: { transcript: string; confirmCancellation: boolean; locale: string; clientId?: number; clientName?: string } = { transcript: trimmed, confirmCancellation, locale }
      if (clientIdOverride != null) payload.clientId = clientIdOverride
      if (clientNameOverride && clientNameOverride.trim()) payload.clientName = clientNameOverride.trim()
      const res = await api.post('/ai/voice-booking', payload)
      const action = typeof res.data?.action === 'string' ? res.data.action : ''
      if (res.data?.confirmationRequired && (action === 'cancel_review' || action === 'book_review')) {
        setVoiceBookingError(null)
        setVoiceReviewClientId(res.data?.clientId ?? null)
        setVoicePendingCancellation({
          action,
          targetType: res.data?.targetType ?? null,
          targetId: res.data?.targetId ?? null,
          message: res.data?.message,
          bookingId: res.data?.bookingId,
          clientId: res.data?.clientId ?? null,
          clientName: res.data?.clientName ?? null,
          title: res.data?.title ?? null,
          startTime: res.data?.startTime ?? null,
          endTime: res.data?.endTime ?? null,
          confirmationRequired: true,
        })
        setVoiceReviewOpen(true)
        return
      }
      setVoiceReviewOpen(false)
      setVoicePendingCancellation(null)
      setVoiceReviewClientId(null)
      setVoiceReviewClientQuery('')
      setVoiceReviewClientDropdownOpen(false)
      setVoiceBookingError(null)
      await loadRef.current()
      showToast('success', res.data?.message || (locale === 'sl' ? (action === 'cancelled' ? 'Dejanje je uspešno izvedeno.' : 'Dejanje je uspešno izvedeno.') : 'Action completed successfully.'))
      const startStr = res.data?.startTime as string | undefined
      if (startStr) {
        const d = new Date(startStr)
        if (!Number.isNaN(d.getTime())) {
          calendarRef.current?.getApi().gotoDate(d)
        }
      }
    } catch (e: unknown) {
      const err = e as {
        response?: {
          status?: number
          data?: { message?: string; startTime?: string; endTime?: string; clientId?: number; code?: string }
        }
        message?: string
      }
      const d = err?.response?.data
      const status = err?.response?.status
      if (
        d &&
        typeof d.startTime === 'string' &&
        typeof d.endTime === 'string' &&
        (status === 400 || status === 409)
      ) {
        setVoicePendingCancellation(null)
        setVoiceReviewOpen(false)
        setVoiceReviewClientId(null)
        setVoiceReviewClientQuery('')
        setVoiceReviewClientDropdownOpen(false)
        setCalendarMode('bookings')
        setVoiceBookingError(null)
        setSaveBookingError(d.message ?? 'Ta termin ni na voljo.')
        const startS = normalizeToLocalDateTime(d.startTime)
        const endS = normalizeToLocalDateTime(d.endTime)
        window.setTimeout(() => {
          openBookingModal(startS, endS, user.id, true, undefined, d.clientId ?? null)
          const dt = new Date(startS)
          if (!Number.isNaN(dt.getTime())) {
            calendarRef.current?.getApi().gotoDate(dt)
          }
        }, 0)
        return
      }
      const msg = d?.message ?? err?.message ?? genericVoiceFailure
      setVoiceBookingError(String(msg))
    } finally {
      setVoiceBookingLoading(false)
    }
  }

  const showVoiceBookingFallbackError = (fallbackMessage?: string) => {
    if (!fallbackMessage || voiceFallbackErrorShownRef.current) return
    voiceFallbackErrorShownRef.current = true
    setVoiceBookingError(fallbackMessage)
  }

  const startVoiceBooking = () => {
    setVoiceBookingError(null)
    setVoicePendingCancellation(null)
    setVoiceReviewClientId(null)
    setVoiceReviewClientQuery('')
    setVoiceReviewClientDropdownOpen(false)
    voiceFallbackErrorShownRef.current = false
    webSpeechHadTranscriptRef.current = false
    if (!aiBookingEnabled) {
      setVoiceBookingError(locale === 'sl' ? 'AI glasovna dejanja so izklopljena v konfiguraciji.' : 'AI voice actions are disabled in configuration.')
      return
    }
    if (isNativeAndroid) {
      if (nativeReleaseStopTimerRef.current != null) {
        window.clearTimeout(nativeReleaseStopTimerRef.current)
        nativeReleaseStopTimerRef.current = null
      }
      nativeSessionFinalizedRef.current = false
      nativeTranscriptRef.current = ''
      nativeTranscriptBestRef.current = ''
      androidMicShouldListenRef.current = true
      androidMicHoldActiveRef.current = true
      void startVoiceBookingAndroidNative()
      return
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => { start: () => void; stop: () => void }
      webkitSpeechRecognition?: new () => { start: () => void; stop: () => void }
    }
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!Ctor) {
      showVoiceBookingFallbackError(locale === 'sl' ? 'Ta brskalnik ne podpira glasovnega vnosa.' : 'This browser does not support voice input.')
      return
    }
    if (voiceBookingConfigured === false) {
      setVoiceBookingError(locale === 'sl' ? 'Glasovna dejanja niso na voljo. Na strežniku nastavite OPENAI_API_KEY.' : 'Voice actions are unavailable. Configure OPENAI_API_KEY on the server.')
      return
    }
    if (voiceBookingLoading) return
    if (speechRecognitionRef.current) return
    try {
      const r = new Ctor() as {
        lang: string
        interimResults: boolean
        continuous: boolean
        maxAlternatives: number
        onstart: (() => void) | null
        onend: (() => void) | null
        onerror: ((event: { error?: string }) => void) | null
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
        start: () => void
        stop: () => void
      }
      speechRecognitionRef.current = r
      voiceStopRequestedRef.current = false
      webSpeechBestTranscriptRef.current = ''
      webSpeechSubmittedRef.current = false
      webSpeechHadTranscriptRef.current = false
      voiceFallbackErrorShownRef.current = false
      r.lang = voiceRecognitionLang
      r.interimResults = isAndroidWeb
      r.continuous = isAndroidWeb
      r.maxAlternatives = 1
      r.onstart = () => setVoiceListening(true)
      r.onend = () => {
        setVoiceListening(false)
        speechRecognitionRef.current = null
        if (isAndroidWeb && !webSpeechSubmittedRef.current) {
          const text = webSpeechBestTranscriptRef.current.trim()
          if (text) {
            webSpeechSubmittedRef.current = true
            setVoicePendingCancellation(null)
            setVoiceReviewText(text)
            void submitVoiceBookingTranscript(text, false)
          } else if (!voiceStopRequestedRef.current && !webSpeechHadTranscriptRef.current) {
            showVoiceBookingFallbackError(locale === 'sl' ? 'Govor ni bil zaznan.' : 'No speech was detected.')
          }
        }
        voiceStopRequestedRef.current = false
      }
      r.onerror = (event: { error?: string }) => {
        setVoiceListening(false)
        speechRecognitionRef.current = null
        const wasRequested = voiceStopRequestedRef.current
        voiceStopRequestedRef.current = false
        if (wasRequested || webSpeechSubmittedRef.current) return
        if (event?.error === 'no-speech') return
        if (event?.error === 'aborted') return
        const msg = locale === 'sl' ? 'Prepoznavanje govora ni uspelo ali je bilo preklicano.' : 'Speech recognition failed or was cancelled.'
        showVoiceBookingFallbackError(msg)
      }
      r.onresult = (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
        const text = Array.from(event.results)
          .map((row) => row[0]?.transcript ?? '')
          .join(' ')
          .trim()
        if (!text) {
          return
        }
        webSpeechHadTranscriptRef.current = true
        webSpeechBestTranscriptRef.current = text
        if (isAndroidWeb && !voiceStopRequestedRef.current) {
          return
        }
        if (webSpeechSubmittedRef.current) return
        webSpeechSubmittedRef.current = true
        setVoicePendingCancellation(null)
        setVoiceReviewText(text)
        void submitVoiceBookingTranscript(text, false)
      }
      r.start()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (locale === 'sl' ? 'Mikrofona ni bilo mogoče zagnati.' : 'The microphone could not be started.')
      setVoiceBookingError(msg)
    }
  }

  const startVoiceBookingAndroidNative = async () => {
    if (!aiBookingEnabled) {
      setVoiceBookingError(locale === 'sl' ? 'AI glasovna dejanja so izklopljena v konfiguraciji.' : 'AI voice actions are disabled in configuration.')
      return
    }
    if (voiceBookingConfigured === false) {
      setVoiceBookingError(locale === 'sl' ? 'Glasovna dejanja niso na voljo. Na strežniku nastavite OPENAI_API_KEY.' : 'Voice actions are unavailable. Configure OPENAI_API_KEY on the server.')
      return
    }
    if (voiceBookingLoading || voiceListening || nativeStartingRef.current) return
    if (!androidMicShouldListenRef.current) return
    nativeStartingRef.current = true
    try {
      const available = await NativeSpeechRecognition.available()
      if (!available?.available) {
        setVoiceBookingError(locale === 'sl' ? 'Naprava ne podpira glasovnega vnosa.' : 'This device does not support voice input.')
        return
      }
      const perms = await NativeSpeechRecognition.checkPermissions()
      if (perms?.speechRecognition !== 'granted') {
        const req = await NativeSpeechRecognition.requestPermissions()
        if (req?.speechRecognition !== 'granted') {
          setVoiceBookingError(locale === 'sl' ? 'Dovoljenje za mikrofon ni odobreno.' : 'Microphone permission was not granted.')
          return
        }
      }
      if (!androidMicShouldListenRef.current) return

      if (nativeSpeechHandleRef.current) {
        await nativeSpeechHandleRef.current.remove()
        nativeSpeechHandleRef.current = null
      }
      if (!nativeListeningHandleRef.current) {
        nativeListeningHandleRef.current = await NativeSpeechRecognition.addListener(
          'listeningState',
          (event: { status?: 'started' | 'stopped' }) => {
            if (event?.status === 'started') {
              // Ignore stale "started" callbacks that can arrive after finger release.
              if (!androidMicShouldListenRef.current || !androidMicHoldActiveRef.current) {
                setVoiceListening(false)
                void NativeSpeechRecognition.stop().catch(() => {})
                return
              }
              if (nativeRestartTimerRef.current != null) {
                window.clearTimeout(nativeRestartTimerRef.current)
                nativeRestartTimerRef.current = null
              }
              setVoiceListening(true)
            }
            if (event?.status === 'stopped') {
              setVoiceListening(false)
              // In tap mode, recognizer can auto-stop when user finishes speaking.
              // Delay finalize slightly: Android can emit final results just after "stopped".
              if (androidMicShouldListenRef.current) {
                androidMicShouldListenRef.current = false
                androidMicHoldActiveRef.current = false
                if (nativeFinalizeTimerRef.current != null) {
                  window.clearTimeout(nativeFinalizeTimerRef.current)
                }
                nativeFinalizeTimerRef.current = window.setTimeout(() => {
                  nativeFinalizeTimerRef.current = null
                  finalizeNativeTranscript(true)
                }, 420)
              }
            }
          }
        )
      }
      nativeSpeechHandleRef.current = await NativeSpeechRecognition.addListener('partialResults', (event: { matches?: string[] }) => {
        const text = (event?.matches || []).join(' ').trim()
        if (!text) return
        nativeTranscriptRef.current = text
        if (text.length > nativeTranscriptBestRef.current.length) {
          nativeTranscriptBestRef.current = text
        }
      })

      setVoiceListening(true)
      void NativeSpeechRecognition.start({
        language: voiceRecognitionLang,
        partialResults: true,
        maxResults: 1,
        popup: false,
        prompt: locale === 'sl' ? 'Govorite' : 'Speak',
      }).then((result: { matches?: string[] }) => {
        const finalText = (result?.matches || []).join(' ').trim()
        if (finalText) {
          nativeTranscriptRef.current = finalText
          if (finalText.length > nativeTranscriptBestRef.current.length) {
            nativeTranscriptBestRef.current = finalText
          }
        }
      }).catch((e: unknown) => {
        setVoiceListening(false)
        const msg = e instanceof Error ? e.message : (locale === 'sl' ? 'Mikrofona ni bilo mogoče zagnati.' : 'The microphone could not be started.')
        setVoiceBookingError(msg)
      })
    } catch (e: unknown) {
      setVoiceListening(false)
      const msg = e instanceof Error ? e.message : (locale === 'sl' ? 'Mikrofona ni bilo mogoče zagnati.' : 'The microphone could not be started.')
      setVoiceBookingError(msg)
    } finally {
      nativeStartingRef.current = false
    }
  }

  const stopVoiceBooking = async () => {
    if (isNativeAndroid) {
      androidMicShouldListenRef.current = false
      if (nativeRestartTimerRef.current != null) {
        window.clearTimeout(nativeRestartTimerRef.current)
        nativeRestartTimerRef.current = null
      }
      setVoiceListening(false)
      if (nativeReleaseStopTimerRef.current != null) {
        window.clearTimeout(nativeReleaseStopTimerRef.current)
      }
      if (nativeFinalizeTimerRef.current != null) {
        window.clearTimeout(nativeFinalizeTimerRef.current)
        nativeFinalizeTimerRef.current = null
      }
      nativeReleaseStopTimerRef.current = window.setTimeout(() => {
        nativeReleaseStopTimerRef.current = null
        void NativeSpeechRecognition.stop().catch(() => {
          // Ignore; some devices throw when already stopped.
        })
      }, 220)
      if (nativeSpeechHandleRef.current) {
        await nativeSpeechHandleRef.current.remove()
        nativeSpeechHandleRef.current = null
      }
      const text = (nativeTranscriptRef.current.length >= nativeTranscriptBestRef.current.length
        ? nativeTranscriptRef.current
        : nativeTranscriptBestRef.current).trim()
      nativeTranscriptRef.current = text
      nativeTranscriptBestRef.current = text
      if (nativeFinalizeTimerRef.current != null) {
        window.clearTimeout(nativeFinalizeTimerRef.current)
      }
      nativeFinalizeTimerRef.current = window.setTimeout(() => {
        nativeFinalizeTimerRef.current = null
        finalizeNativeTranscript(true)
      }, 250)
      return
    }

    const sr = speechRecognitionRef.current
    if (!sr) return
    voiceStopRequestedRef.current = true
    try {
      sr.stop()
    } catch {
      // Ignore browser-specific stop errors.
    }
  }

  const startVoiceBookingForShellRef = useRef(startVoiceBooking)
  const stopVoiceBookingForShellRef = useRef(stopVoiceBooking)
  startVoiceBookingForShellRef.current = startVoiceBooking
  stopVoiceBookingForShellRef.current = stopVoiceBooking

  const shellCalendarSlots = useMemo(() => {
    if (isNativeAndroid) return null
    const dateNav = (
      <CalendarHeaderDateNav
        calendarRef={calendarRef}
        title={calendarToolbarTitle}
        arrowsPlacement={calendarDateNavArrowsInRail ? 'rail' : 'inline'}
      />
    )
    const viewDropdown = (
      <CalendarHeaderViewDropdown
        calendarRef={calendarRef}
        view={view}
        t={t}
        useResourceViews={useResourceColumns}
      />
    )
    const modeGroupEl =
      calendarMobileHeaderNav && calendarSpacesFeatureActive ? (
        <CalendarHeaderModeGroup
          calendarMode={calendarMode}
          onModeChange={setCalendarModeView}
          bookableEnabled={bookableEnabled}
          spacesEnabled={spacesEnabled}
        />
      ) : null
    const voiceInHeader = showWebMobileBottomPanel && aiBookingEnabled
    const voiceButton = voiceInHeader ? (
      <button
        type="button"
        className={`calendar-voice-fab calendar-voice-fab--bottom-panel calendar-voice-fab--header-toolbar${
          voiceListening ? ' calendar-voice-fab--listening' : ''
        }`}
        disabled={voiceBookingLoading}
        onClick={() => {
          if (voiceListening) {
            void stopVoiceBookingForShellRef.current()
            return
          }
          startVoiceBookingForShellRef.current()
        }}
        title={
          voiceBookingConfigured === false
            ? locale === 'sl'
              ? 'AI glasovna dejanja zahtevajo OPENAI_API_KEY na strežniku'
              : 'AI voice actions require OPENAI_API_KEY on the server'
            : voiceBookingLoading
              ? locale === 'sl'
                ? 'Obdelava…'
                : 'Processing…'
              : voiceListening
                ? locale === 'sl'
                  ? 'Poslušam…'
                  : 'Listening…'
                : locale === 'sl'
                  ? 'Zaženi AI glasovna dejanja'
                  : 'Start AI voice actions'
        }
        aria-label={locale === 'sl' ? 'Zaženi AI glasovna dejanja' : 'Start AI voice actions'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
    ) : null
    const showWebToolbarMonthChip =
      (calendarFiltersBottomBar || calendarMobileHeaderNav) && isWebTimeGridLikeView(view)
    const toolbarMonthLabel = showWebToolbarMonthChip ? (
      <span className="calendar-toolbar-month-chip" aria-hidden="true">
        {calendarToolbarMonthLabel}
      </span>
    ) : null
    return {
      /* Narrow calendar: arrows removed — prev/next remains via rail (wider) or swipe; controls stay in header right */
      left: calendarMobileHeaderNav ? null : calendarHeaderCompact ? dateNav : null,
      center: calendarMobileHeaderNav ? null : calendarHeaderCompact ? null : dateNav,
      filters: !calendarFiltersBottomBar ? shellCalendarFilters : null,
      modeGroup: modeGroupEl,
      showMobileToolbar: calendarMobileHeaderNav,
      toolbarMonthLabel,
      viewDropdown,
      voiceButton,
    }
  }, [
    isNativeAndroid,
    calendarHeaderCompact,
    calendarFiltersBottomBar,
    calendarDateNavArrowsInRail,
    calendarMobileHeaderNav,
    calendarSpacesFeatureActive,
    calendarToolbarMonthLabel,
    calendarToolbarTitle,
    shellCalendarFilters,
    calendarMode,
    bookableEnabled,
    spacesEnabled,
    setCalendarModeView,
    view,
    t,
    useResourceColumns,
    showWebMobileBottomPanel,
    aiBookingEnabled,
    voiceListening,
    voiceBookingLoading,
    voiceBookingConfigured,
    locale,
  ])

  useLayoutEffect(() => {
    if (!shellCalendarSlots) {
      setShellCalendarSlots(null)
      return
    }
    setShellCalendarSlots(shellCalendarSlots)
    return () => setShellCalendarSlots(null)
  }, [shellCalendarSlots, setShellCalendarSlots])

  useEffect(() => {
    const onGlobalVoiceStart = () => {
      if (aiBookingEnabled && !voiceListening && !voiceBookingLoading) {
        startVoiceBooking()
      }
    }
    window.addEventListener('global-voice-start', onGlobalVoiceStart)
    return () => window.removeEventListener('global-voice-start', onGlobalVoiceStart)
  }, [aiBookingEnabled, voiceListening, voiceBookingLoading])

  useEffect(() => {
    return () => {
      androidMicShouldListenRef.current = false
      androidMicHoldActiveRef.current = false
      void stopVoiceBooking()
      if (nativeListeningHandleRef.current) {
        void nativeListeningHandleRef.current.remove()
        nativeListeningHandleRef.current = null
      }
      if (nativeRestartTimerRef.current != null) {
        window.clearTimeout(nativeRestartTimerRef.current)
        nativeRestartTimerRef.current = null
      }
      if (nativeReleaseStopTimerRef.current != null) {
        window.clearTimeout(nativeReleaseStopTimerRef.current)
        nativeReleaseStopTimerRef.current = null
      }
      if (nativeFinalizeTimerRef.current != null) {
        window.clearTimeout(nativeFinalizeTimerRef.current)
        nativeFinalizeTimerRef.current = null
      }
    }
  }, [])

  const finalizeNativeTranscript = (showNoSpeechError: boolean) => {
    if (nativeSessionFinalizedRef.current) return
    nativeSessionFinalizedRef.current = true
    const text = (nativeTranscriptRef.current.length >= nativeTranscriptBestRef.current.length
      ? nativeTranscriptRef.current
      : nativeTranscriptBestRef.current).trim()
    nativeTranscriptRef.current = ''
    nativeTranscriptBestRef.current = ''
    if (text) {
      setVoicePendingCancellation(null)
      setVoiceReviewText(text)
      void submitVoiceBookingTranscript(text, false)
    } else if (showNoSpeechError) {
      setVoiceBookingError(locale === 'sl' ? 'Govor ni bil zaznan.' : 'No speech was detected.')
    }
  }

  useEffect(() => {
    if (!voiceBookingError) return
    showToast('error', voiceBookingError)
    setVoiceBookingError(null)
  }, [showToast, voiceBookingError])

  const getBookableSelectionInfo = (start: string, end: string): { isBookable: boolean; consultantId?: number } => {
    const selectionStartMs = new Date(start).getTime()
    const selectionEndMs = new Date(end).getTime()
    if (!Number.isFinite(selectionStartMs) || !Number.isFinite(selectionEndMs) || selectionEndMs <= selectionStartMs) {
      return { isBookable: false }
    }

    // In Bookings mode, validate against the visible 30-minute availability chunks so
    // users can drag across consecutive chunks and still create one booking.
    if (calendarMode === 'bookings') {
      const rangesByConsultant = new Map<number, Array<{ startMs: number; endMs: number }>>()

      for (const ev of events as any[]) {
        if (ev?.extendedProps?.kind !== 'bookable') continue
        const consultantId = ev?.extendedProps?.consultant?.id
        if (!Number.isFinite(consultantId)) continue
        const eventStartMs = new Date(ev.start).getTime()
        const eventEndMs = new Date(ev.end).getTime()
        if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs) || eventEndMs <= eventStartMs) continue
        if (eventEndMs <= selectionStartMs || eventStartMs >= selectionEndMs) continue
        const clippedStartMs = Math.max(eventStartMs, selectionStartMs)
        const clippedEndMs = Math.min(eventEndMs, selectionEndMs)
        if (clippedEndMs <= clippedStartMs) continue
        const arr = rangesByConsultant.get(consultantId) || []
        arr.push({ startMs: clippedStartMs, endMs: clippedEndMs })
        rangesByConsultant.set(consultantId, arr)
      }

      const fullyCoveringConsultants: number[] = []
      for (const [consultantId, ranges] of rangesByConsultant.entries()) {
        ranges.sort((a, b) => a.startMs - b.startMs)
        let cursor = selectionStartMs
        for (const r of ranges) {
          if (r.endMs <= cursor) continue
          if (r.startMs > cursor) break
          cursor = Math.max(cursor, r.endMs)
          if (cursor >= selectionEndMs) break
        }
        if (cursor >= selectionEndMs) {
          fullyCoveringConsultants.push(consultantId)
        }
      }

      if (fullyCoveringConsultants.length === 0) return { isBookable: false }
      if (fullyCoveringConsultants.length === 1) {
        return { isBookable: true, consultantId: fullyCoveringConsultants[0] }
      }
      if (consultantFilterId != null && fullyCoveringConsultants.includes(consultantFilterId)) {
        return { isBookable: true, consultantId: consultantFilterId }
      }
      return { isBookable: true, consultantId: fullyCoveringConsultants[0] }
    }

    const startDate = new Date(start)
    const endDate = new Date(end)
    const isoDate = startDate.toISOString().slice(0, 10)
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const dayOfWeek = dayNames[startDate.getDay()]
    const startTime = startDate.toTimeString().slice(0, 8)
    const endTime = endDate.toTimeString().slice(0, 8)

    const visibleSlots = filterByConsultantRole(calendarData.bookable)
    const matchingSlot = visibleSlots.find((slot: any) => {
      if (slot.dayOfWeek !== dayOfWeek) return false
      if (!slot.indefinite && ((slot.startDate && isoDate < slot.startDate) || (slot.endDate && isoDate > slot.endDate))) return false
      return slot.startTime <= startTime && slot.endTime >= endTime
    })
    if (matchingSlot) {
      const cid = matchingSlot.consultant?.id
      const st = new Date(start)
      const w = consultantDayWindow(
        st.getFullYear(),
        st.getMonth(),
        st.getDate(),
        cid,
        metaUsers,
        whWindowParseHm(slotMinTime),
        whWindowParseHm(slotMaxTime),
      )
      if (w != null && 'closed' in w && w.closed) return { isBookable: false }
      if (w != null && 'startMin' in w) {
        const span = windowToDayMs(st.getFullYear(), st.getMonth(), st.getDate(), w.startMin, w.endMin)
        if (selectionEndMs <= span.startMs || selectionStartMs >= span.endMs) return { isBookable: false }
      }
      return { isBookable: true, consultantId: cid }
    }

    const whCandidates = metaUsers.filter((u: any) => {
      if (!u?.workingHours || typeof u.workingHours !== 'object') return false
      if (!(u.consultant || u.role === 'CONSULTANT')) return false
      if (!isTenantAdmin) return u.id === user.id
      if (effectiveConsultantFilterId != null) return u.id === effectiveConsultantFilterId
      return true
    })
    const st0 = new Date(start)
    for (const cu of whCandidates) {
      const w = consultantDayWindow(
        st0.getFullYear(),
        st0.getMonth(),
        st0.getDate(),
        cu.id,
        metaUsers,
        whWindowParseHm(slotMinTime),
        whWindowParseHm(slotMaxTime),
      )
      if (w == null || ('closed' in w && w.closed) || !('startMin' in w)) continue
      const span = windowToDayMs(st0.getFullYear(), st0.getMonth(), st0.getDate(), w.startMin, w.endMin)
      if (selectionStartMs >= span.startMs && selectionEndMs <= span.endMs) {
        return { isBookable: true, consultantId: cu.id }
      }
    }
    return { isBookable: false }
  }

  /** Same green-chunk coverage as create, but only for the session's consultant (bookings mode + bookable overlay). */
  const isBookedMoveIntervalBookable = (
    start: string,
    end: string,
    consultantId: number | undefined,
    breakMinutes = 0,
    originalInterval?: { start: string; end: string },
  ): boolean => {
    if (calendarMode === 'spaces') return true
    if (!bookableEnabled || calendarMode !== 'bookings' || view === 'dayGridMonth' || view === 'resourceDayGridMonth') {
      return true
    }
    if (!Number.isFinite(consultantId)) return true
    const selectionStartMs = new Date(start).getTime()
    const baseSelectionEndMs = new Date(end).getTime()
    const selectionEndMs = baseSelectionEndMs + Math.max(0, Number(breakMinutes) || 0) * 60000
    if (!Number.isFinite(selectionStartMs) || !Number.isFinite(selectionEndMs) || selectionEndMs <= selectionStartMs) {
      return false
    }
    const ranges: Array<{ startMs: number; endMs: number }> = []
    for (const ev of events as any[]) {
      if (ev?.extendedProps?.kind !== 'bookable') continue
      if (ev?.extendedProps?.consultant?.id !== consultantId) continue
      const eventStartMs = new Date(ev.start).getTime()
      const eventEndMs = new Date(ev.end).getTime()
      if (!Number.isFinite(eventStartMs) || !Number.isFinite(eventEndMs) || eventEndMs <= eventStartMs) continue
      if (eventEndMs <= selectionStartMs || eventStartMs >= selectionEndMs) continue
      const clippedStartMs = Math.max(eventStartMs, selectionStartMs)
      const clippedEndMs = Math.min(eventEndMs, selectionEndMs)
      if (clippedEndMs <= clippedStartMs) continue
      ranges.push({ startMs: clippedStartMs, endMs: clippedEndMs })
    }
    // While resizing/moving an existing booking, include its original range as available.
    // Bookable chunks can exclude already-booked time, which would otherwise trigger false warnings.
    if (originalInterval?.start && originalInterval?.end) {
      const originalStartMs = new Date(originalInterval.start).getTime()
      const originalEndMs = new Date(originalInterval.end).getTime()
      if (Number.isFinite(originalStartMs) && Number.isFinite(originalEndMs) && originalEndMs > originalStartMs) {
        if (!(originalEndMs <= selectionStartMs || originalStartMs >= selectionEndMs)) {
          ranges.push({
            startMs: Math.max(originalStartMs, selectionStartMs),
            endMs: Math.min(originalEndMs, selectionEndMs),
          })
        }
      }
    }
    ranges.sort((a, b) => a.startMs - b.startMs)
    let cursor = selectionStartMs
    for (const r of ranges) {
      if (r.endMs <= cursor) continue
      if (r.startMs > cursor) break
      cursor = Math.max(cursor, r.endMs)
      if (cursor >= selectionEndMs) break
    }
    return cursor >= selectionEndMs
  }

  const handleCalendarSelection = (
    start: string,
    end: string,
    options?: {
      preserveDraggedRange?: boolean
      anchorEl?: HTMLElement | null
      spaceResourceId?: string | null
      consultantResourceId?: string | null
    },
  ) => {
    const preserveDraggedRange = !!options?.preserveDraggedRange
    const anchorEl = options?.anchorEl ?? null
    if (calendarMode === 'availability') {
      openAvailabilityModalFromSelection(start, end)
      return
    }
    if (calendarMode === 'spaces') {
      if (isNativeAndroid) return
      let preselectedSpaceId: number | null
      if (spaceFilterId != null) {
        preselectedSpaceId = spaceFilterId
      } else if (options?.spaceResourceId == null || options.spaceResourceId === SPACE_RESOURCE_UNASSIGNED_ID) {
        preselectedSpaceId = null
      } else {
        preselectedSpaceId = Number(options.spaceResourceId)
      }
      const selectionInfo = getBookableSelectionInfo(start, end)
      openBookingModal(
        start,
        end,
        selectionInfo.consultantId ?? consultantFilterId ?? user.id,
        preserveDraggedRange,
        preselectedSpaceId,
        undefined,
        !selectionInfo.isBookable,
        anchorEl,
        spacesUseResourceColumns ? options?.spaceResourceId : undefined,
      )
      return
    }
    if (calendarMode === 'bookings' && bookingsUseResourceColumns && options?.consultantResourceId != null) {
      const crid = options.consultantResourceId
      const resolvedConsultant =
        crid === CONSULTANT_RESOURCE_UNASSIGNED_ID ? user.id : Number(crid)
      openBookingModal(
        start,
        end,
        resolvedConsultant,
        preserveDraggedRange,
        undefined,
        undefined,
        false,
        anchorEl,
        crid,
      )
      return
    }
    if (!bookableEnabled) {
      openBookingModal(start, end, user.id, preserveDraggedRange, undefined, undefined, false, anchorEl)
      return
    }
    const selectionInfo = getBookableSelectionInfo(start, end)
    if (selectionInfo.isBookable) {
      openBookingModal(start, end, selectionInfo.consultantId ?? user.id, preserveDraggedRange, undefined, undefined, false, anchorEl)
      return
    }
    openBookingModal(start, end, user.id, preserveDraggedRange, undefined, undefined, true, anchorEl)
  }

  const handleCalendarSelectionFromUi = (
    start: string,
    end: string,
    preserveDraggedRange = false,
    resourceId?: string | null,
  ) => {
    if (!isNativeAndroid && overlapDrawerDismissConsumePointerRef.current) {
      overlapDrawerDismissConsumePointerRef.current = false
      calendarRef.current?.getApi()?.unselect()
      return
    }
    if (isNativeAndroid) {
      const t = Date.now()
      if (t - androidSelectionAtRef.current < 450) return
      androidSelectionAtRef.current = t
      calendarRef.current?.getApi().unselect()
    }
    handleCalendarSelection(start, end, {
      preserveDraggedRange,
      spaceResourceId: spacesUseResourceColumns ? resourceId : undefined,
      consultantResourceId: bookingsUseResourceColumns ? resourceId : undefined,
    })
  }

  const findOverlappingSessionsForBooking = (start: string, end: string, consultantId: number | null, typeId?: number | null) => {
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    const requestedBusyEndMs = endMs + getTypeBreakMinutes(typeId) * 60000
    return (calendarData.booked || []).filter((b: any) => {
      if (b.consultant?.id !== consultantId) return false
      const bStart = new Date(b.startTime).getTime()
      const bEnd = getBookingBusyEndMs(b)
      return startMs < bEnd && requestedBusyEndMs > bStart
    })
  }

  const findOverlappingPersonalBlocksForBooking = (start: string, end: string, consultantId: number | null, breakMinutes = 0) => {
    if (!personalModuleEnabled) return []
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime() + Math.max(0, Number(breakMinutes) || 0) * 60000
    return (calendarData.personal || []).filter((p: any) => {
      if (String(p?.task || '').trim().toLowerCase() === AVAILABILITY_BLOCK_TASK) return false
      const ownerId = p.consultant?.id ?? p.consultantId ?? p.ownerId
      if (ownerId !== consultantId) return false
      const pStart = new Date(p.startTime).getTime()
      const pEnd = new Date(p.endTime).getTime()
      return startMs < pEnd && endMs > pStart
    })
  }

  const saveBooking = async (skipBookedOverlapCheck = false, skipNonBookableConfirm = false, skipPersonalOverlapConfirm = false) => {
    setSaveBookingError(null)
    if (form.personal && !personalModuleEnabled) {
      setForm((f: any) => ({ ...f, personal: false }))
      setSaveBookingError(t('calendarErrorPersonalModuleDisabled'))
      return
    }
    if (form.todo && !todosModuleEnabled) {
      setForm((f: any) => ({ ...f, todo: false }))
      setSaveBookingError(t('calendarErrorTodosModuleDisabled'))
      return
    }
    let resolvedClientIds: number[] = []
    let resolvedGroupId: number | null = form.groupId ?? null
    if (form.personal || form.todo) {
      if (!form.task?.trim()) {
        setSaveBookingError(t('calendarErrorEnterTaskName'))
        return
      }
    } else if (bookingGroupMode) {
      const typed = groupSearch.trim()
      /** When user types a full group name on save, setForm has not re-rendered yet — seed clients from this value. */
      let sessionClientsFromTypedGroup: number[] | null = null
      if (typed) {
        const exact = metaGroups.find(
          (g: any) => g.active !== false && (g.name || '').toLowerCase() === typed.toLowerCase(),
        )
        if (exact) {
          resolvedGroupId = exact.id
          const seedIds = (exact.members ?? []).map((m: any) => m.id).filter((id: number) => Number.isFinite(id) && id > 0)
          sessionClientsFromTypedGroup = seedIds.length > 0 ? [...seedIds] : []
          setForm((f: any) => ({
            ...f,
            groupId: exact.id,
            ...(seedIds.length > 0
              ? { clientIds: seedIds, clientId: seedIds[0] ?? null }
              : { clientIds: [], clientId: null }),
          }))
          setGroupSearch('')
          setEditingGroupSearch(false)
          setGroupDropdownOpen(false)
        } else {
          try {
            const created = await postGroupFromTypedName(typed)
            resolvedGroupId = created.id
            sessionClientsFromTypedGroup = []
            setForm((f: any) => ({ ...f, groupId: created.id, clientIds: [], clientId: null }))
            setGroupSearch('')
            setEditingGroupSearch(false)
            setGroupDropdownOpen(false)
          } catch (e: any) {
            setSaveBookingError(e?.response?.data?.message || e?.message || 'Failed to create group.')
            setEditingGroupSearch(true)
            setGroupDropdownOpen(true)
            return
          }
        }
      }
      if (resolvedGroupId == null) {
        setSaveBookingError(t('calendarErrorSelectGroup'))
        setEditingGroupSearch(true)
        setGroupDropdownOpen(true)
        return
      }
      resolvedClientIds =
        sessionClientsFromTypedGroup !== null ? [...sessionClientsFromTypedGroup] : [...selectedFormClientIds]
      if (resolvedClientIds.length === 0) {
        const g = metaGroups.find((x: any) => x.id === resolvedGroupId)
        const fromGroup = (g?.members ?? []).map((m: any) => m.id).filter((id: number) => Number.isFinite(id) && id > 0)
        resolvedClientIds = fromGroup
        if (resolvedClientIds.length > 0) {
          setForm((f: any) => ({
            ...f,
            clientIds: resolvedClientIds,
            clientId: resolvedClientIds[0] ?? null,
          }))
        }
      }
    } else {
      resolvedClientIds = [...selectedFormClientIds]
      const typed = clientSearch.trim()
      if (typed) {
        const exact = metaClients.find(
          (c: any) => c.active !== false && fullName(c).toLowerCase() === typed.toLowerCase(),
        )
        if (exact) {
          resolvedClientIds = multipleClientsPerSessionEnabled
            ? Array.from(new Set([...resolvedClientIds, exact.id]))
            : [exact.id]
          setForm((f: any) => ({ ...f, clientId: exact.id, clientIds: resolvedClientIds }))
          setClientSearch('')
          setEditingClientSearch(false)
          setClientDropdownOpen(false)
        } else {
          try {
            const created = await postClientFromTypedName(typed, form.consultantId ?? undefined)
            resolvedClientIds = multipleClientsPerSessionEnabled
              ? Array.from(new Set([...resolvedClientIds, created.id]))
              : [created.id]
            setForm((f: any) => ({ ...f, clientId: created.id, clientIds: resolvedClientIds }))
            setClientSearch('')
            setEditingClientSearch(false)
            setClientDropdownOpen(false)
          } catch (e: any) {
            setSaveBookingError(e?.response?.data?.message || e?.message || 'Failed to create client.')
            setEditingClientSearch(true)
            setClientDropdownOpen(true)
            return
          }
        }
      }
      if (resolvedClientIds.length === 0) {
        setSaveBookingError(t('calendarErrorSelectClient'))
        setEditingClientSearch(true)
        setClientDropdownOpen(true)
        return
      }
    }
    if (!form.personal && !form.todo && form.online && form.consultantId === user.id) {
      const provider = form.meetingProvider || 'zoom'
      const needsConnect = provider === 'google' ? googleConnected === false : zoomConnected === false
      if (needsConnect) {
        const groupPending = bookingGroupMode && resolvedGroupId != null
        sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify({
          clientId: resolvedClientIds[0] ?? null,
          clientIds: resolvedClientIds,
          groupId: groupPending ? resolvedGroupId : null,
          consultantId: form.consultantId,
          startTime: form.startTime,
          endTime: form.endTime,
          spaceId: form.spaceId ?? null,
          typeId: form.typeId ?? null,
          notes: form.notes ?? '',
          meetingProvider: provider,
          payees: normalizeBookingPayeesForPayload(resolvedClientIds, form.payees, formBookingPayeeLinkedCompany?.id),
        }))
        if (provider === 'google') connectGoogle()
        else connectZoom()
        return
      }
    }
    if (!form.personal && !form.todo) {
      const typeMaxParticipants = getTypeMaxParticipants(form.typeId)
      if (typeMaxParticipants != null && resolvedClientIds.length > typeMaxParticipants) {
        setSaveBookingError(`This service type allows at most ${typeMaxParticipants} participants per session.`)
        return
      }
    }
    if (!form.personal && !form.todo && form.outsideBookable && !skipNonBookableConfirm) {
      setSelection(null)
      setClientDropdownOpen(false)
      setEditingClientSearch(false)
      calendarRef.current?.getApi()?.unselect()
      setConfirmNonBookable({ mode: 'create' })
      return
    }
    if (!form.personal && !form.todo) {
      if (!skipPersonalOverlapConfirm) {
        const overlappingPersonal = findOverlappingPersonalBlocksForBooking(
          form.startTime,
          form.endTime,
          form.consultantId,
          getTypeBreakMinutes(form.typeId),
        )
        if (overlappingPersonal.length > 0) {
          setConfirmBookedPersonalOverlap({ type: 'create' })
          return
        }
      }
      if (!skipBookedOverlapCheck) {
        const overlapping = findOverlappingSessionsForBooking(form.startTime, form.endTime, form.consultantId, form.typeId)
        if (overlapping.length > 0) {
          setConfirmOverlap({ overlapping, start: form.startTime, end: form.endTime })
          return
        }
      }
    }
    setSaveBookingLoading(true)
    try {
      if (form.todo) {
        await api.post('/bookings/todos', {
          startTime: form.startTime,
          task: form.task.trim(),
          notes: form.notes || '',
        })
      } else if (form.personal) {
        await api.post('/bookings/personal-blocks', {
          consultantId: form.consultantId ?? user.id,
          startTime: form.startTime,
          endTime: form.endTime,
          task: form.task.trim(),
          notes: form.notes || '',
        })
      } else {
        if (confirmOverlap) {
          for (const b of confirmOverlap.overlapping) {
            await api.delete(`/bookings/${b.id}`)
          }
          setConfirmOverlap(null)
        }
        const groupBookingNoClients =
          bookingGroupMode && resolvedGroupId != null && resolvedClientIds.length === 0
        const bookingPayloadBase = {
          ...(groupBookingNoClients
            ? { clientIds: [] as number[] }
            : { clientId: resolvedClientIds[0]!, clientIds: resolvedClientIds }),
          groupId: bookingGroupMode && resolvedGroupId != null ? resolvedGroupId : undefined,
          consultantId: form.consultantId,
          spaceId: form.spaceId ?? null,
          typeId: form.typeId ?? null,
          notes: form.notes ?? '',
          meetingLink: form.meetingLink ?? null,
          online: form.online ?? false,
          meetingProvider: form.meetingProvider || 'zoom',
          groupEmailOverride: null,
          groupBillingCompanyIdOverride: null,
          payees: normalizeBookingPayeesForPayload(resolvedClientIds, form.payees, formBookingPayeeLinkedCompany?.id),
          ...(skipPersonalOverlapConfirm ? { allowPersonalBlockOverlap: true } : {}),
        }
        const bookingDates: Array<{ startTime: string; endTime: string }> = []
        if (form.repeats) {
          const baseStart = new Date(form.startTime)
          const baseEnd = new Date(form.endTime)
          const durationMs = baseEnd.getTime() - baseStart.getTime()
          const repeatInterval = form.repeatInterval ?? 1
          const repeatUnit = form.repeatUnit ?? 'weeks'
          const repeatEndType = form.repeatEndType ?? 'after'
          const repeatEndCount = form.repeatEndCount ?? 5
          const repeatEndDate = form.repeatEndDate ?? ''
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          const targetDayIndex = repeatUnit === 'weeks' ? dayNames.indexOf(form.repeatDay ?? dayNames[baseStart.getDay()]) : -1

          const maxOccurrences = repeatEndType === 'after' ? repeatEndCount : 200
          const endDateMs = repeatEndType === 'on' && repeatEndDate ? new Date(repeatEndDate + 'T23:59:59').getTime() : Infinity

          let cursor = new Date(baseStart)
          // If weekly, adjust first occurrence to the target day
          if (repeatUnit === 'weeks' && targetDayIndex >= 0 && cursor.getDay() !== targetDayIndex) {
            let diff = targetDayIndex - cursor.getDay()
            if (diff < 0) diff += 7
            cursor.setDate(cursor.getDate() + diff)
          }
          for (let i = 0; i < maxOccurrences && cursor.getTime() <= endDateMs; i++) {
            const s = new Date(cursor)
            const e = new Date(s.getTime() + durationMs)
            bookingDates.push({
              startTime: toLocalDateTimeString(s),
              endTime: toLocalDateTimeString(e),
            })
            // Advance cursor
            if (repeatUnit === 'days') {
              cursor.setDate(cursor.getDate() + repeatInterval)
            } else if (repeatUnit === 'weeks') {
              cursor.setDate(cursor.getDate() + 7 * repeatInterval)
            } else if (repeatUnit === 'months') {
              cursor.setMonth(cursor.getMonth() + repeatInterval)
            }
          }
        } else {
          bookingDates.push({ startTime: form.startTime, endTime: form.endTime })
        }
        for (const dt of bookingDates) {
          await api.post('/bookings', {
            ...bookingPayloadBase,
            startTime: dt.startTime,
            endTime: dt.endTime,
          }, {
            headers: { 'X-Skip-Conflict-Toast': 'true' },
          })
        }
      }
      // Keep the booking form open (with saving state) until calendar data refreshes,
      // so users see the new booking immediately after the modal closes.
      await load()
      setSelection(null)
      setConfirmNonBookable(null)
      setEditingClientSearch(false)
      setEditingGroupSearch(false)
      calendarRef.current?.getApi()?.unselect()
      notifyBookingAndClientRecordsChanged()
      window.dispatchEvent(new Event('todos-updated'))
      leaveCompactFormRouteIfNeeded()
    } catch (e: any) {
      const data = e?.response?.data
      const msg = (data?.message ?? data?.error ?? e?.message) || 'Failed to book session.'
      setSaveBookingError(String(msg))
    } finally {
      setSaveBookingLoading(false)
    }
  }

  const deleteBookedSession = async () => {
    if (!selectedBookedSession?.id) return
    await api.delete(`/bookings/${selectedBookedSession.id}`)
    setSelectedBookedSession(null)
    setBookedStatusMenuOpen(false)
    setConfirmDelete(false)
    notifyBookingAndClientRecordsChanged()
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const closeBookedModal = () => {
    if (calendarClientDetailId || calendarGroupDetailId) return
    setSelectedBookedSession(null)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedPaymentManagerTab('invoice')
    setSelectedBookedPaymentClientId(null)
    setConfirmDelete(false)
    leaveCompactFormRouteIfNeeded()
  }

  const selectedBookedStoredStatus: StoredBookingStatus = selectedBookedSession
    ? normalizeStoredBookingStatus(selectedBookedSession.bookingStatus)
    : 'RESERVED'
  const selectedBookedDerivedStatus: DerivedBookingStatus = selectedBookedSession
    ? deriveBookingStatus(selectedBookedSession.startTime, selectedBookedSession.endTime, selectedBookedSession.bookingStatus)
    : 'RESERVED'
  const formatInvalidStatusTransitionMessage = useCallback((
    reason: BookingStatusUpdateValidationReason,
    targetStatus: StoredBookingStatus,
  ) => {
    if (targetStatus === 'CHECKED_OUT' && reason === 'CHECKED_OUT_BEFORE_START') {
      return locale === 'sl'
        ? 'Statusa ZAKLJUČEN ni mogoče nastaviti za termin, ki se še ni začel.'
        : 'Checked out cannot be set for a session that has not started yet.'
    }
    return locale === 'sl'
      ? 'Izbrana sprememba statusa za ta termin ni dovoljena.'
      : 'The selected booking status change is not allowed for this session.'
  }, [locale])
  const getStatusTransitionValidation = useCallback((
    startTime: unknown,
    endTime: unknown,
    currentStoredStatus: unknown,
    targetStoredStatus: StoredBookingStatus,
  ) => validateStoredBookingStatusUpdate(
    startTime,
    endTime,
    currentStoredStatus,
    targetStoredStatus,
  ), [])
  const bookedStatusLabel = bookingStatusDisplayLabel(selectedBookedDerivedStatus, locale)
  const bookedStatusTagColors = bookingStatusTagColors(selectedBookedDerivedStatus)
  const selectedBookedSessionHasClosedOpenBill = useMemo(() => {
    const statuses = Array.isArray(selectedBookedSession?.paymentStatuses)
      ? selectedBookedSession.paymentStatuses
      : []
    return statuses.some((status: BookingPaymentStatus) => (Array.isArray(status?.allocations) ? status.allocations : []).some((allocation: BookingPaymentAllocation) => {
      const source = String(allocation?.source ?? '').toUpperCase()
      const billId = Number(allocation?.billId ?? 0)
      const paymentStatus = String(allocation?.paymentStatus ?? '').trim().toLowerCase()
      return source === 'INVOICE' && Number.isInteger(billId) && billId > 0 && paymentStatus !== 'cancelled'
    }))
  }, [selectedBookedSession?.paymentStatuses])
  const bookedStatusTransitionTargets = useMemo(() => {
    if (!selectedBookedSession) return []
    const targets = allowedStoredTargetsForDerivedStatus(selectedBookedDerivedStatus)
      .filter((target) => noShowModuleEnabled || target !== 'NO_SHOW')
      .filter((target) => {
        if (target !== 'CHECKED_OUT') return true
        return getStatusTransitionValidation(
          selectedBookedSession.startTime,
          selectedBookedSession.endTime,
          selectedBookedSession.bookingStatus,
          target,
        ).allowed
      })
    if (selectedBookedDerivedStatus !== 'CHECKED_OUT' || !selectedBookedSessionHasClosedOpenBill) {
      return targets
    }
    return targets.filter((target) => target !== 'CANCELLED' && target !== 'NO_SHOW')
  }, [getStatusTransitionValidation, noShowModuleEnabled, selectedBookedDerivedStatus, selectedBookedSession, selectedBookedSessionHasClosedOpenBill])

  const paymentManagerPaymentStatuses: BookingPaymentStatus[] = useMemo(() => {
    if (paymentManagerIsNewBooking) return []
    return Array.isArray(selectedBookedSession?.paymentStatuses) ? selectedBookedSession.paymentStatuses : []
  }, [paymentManagerIsNewBooking, selectedBookedSession?.paymentStatuses])
  const paymentStatusForClient = useCallback((clientId?: number | null): BookingPaymentStatus | null => {
    if (!clientId) return null
    return paymentManagerPaymentStatuses.find((status) => Number(status.clientId) === Number(clientId)) ?? null
  }, [paymentManagerPaymentStatuses])
  const bookedPrimaryPaymentStatus: BookingPaymentStatusValue = useMemo(() => {
    const selectedStatuses = bookedSessionSelectedClients
      .map((client: any) => paymentStatusForClient(client?.id)?.status)
      .filter(Boolean) as BookingPaymentStatusValue[]
    if (selectedStatuses.length === 0) return 'UNPAID'
    if (selectedStatuses.every((status) => status === 'PAID')) return 'PAID'
    if (selectedStatuses.some((status) => status === 'PAYMENT_PENDING')) return 'PAYMENT_PENDING'
    if (selectedStatuses.some((status) => status === 'PAID' || status === 'PARTIALLY_PAID')) return 'PARTIALLY_PAID'
    return 'UNPAID'
  }, [bookedSessionSelectedClients, paymentStatusForClient])
  const bookedPaymentMeta = useCallback((status?: BookingPaymentStatusValue | string | null) => {
    switch (status) {
      case 'PAID':
        return { label: locale === 'sl' ? 'Plačano' : 'Paid', tone: 'paid' }
      case 'PARTIALLY_PAID':
        return { label: locale === 'sl' ? 'Delno plačano' : 'Partially paid', tone: 'partial' }
      case 'PAYMENT_PENDING':
        return { label: locale === 'sl' ? 'Plačilo v teku' : 'Payment pending', tone: 'pending' }
      case 'UNPAID':
      default:
        return { label: locale === 'sl' ? 'Neplačano' : 'Unpaid', tone: 'unpaid' }
    }
  }, [locale])
  const bookedPaymentSidebarStatusMeta = useCallback((status?: BookingPaymentStatusValue | string | null) => {
    switch (status) {
      case 'PAID':
        return {
          tone: 'paid',
          symbol: '✓',
          label: locale === 'sl' ? 'Plačano' : 'Paid',
        }
      case 'PAYMENT_PENDING':
      case 'PARTIALLY_PAID':
        return {
          tone: 'pending',
          symbol: '⋯',
          label: locale === 'sl' ? 'Plačilo v teku' : 'Payment pending',
        }
      case 'UNPAID':
      default:
        return {
          tone: 'unpaid',
          symbol: '✕',
          label: locale === 'sl' ? 'Neplačano' : 'Unpaid',
        }
    }
  }, [locale])
  const selectedBookedPaymentStatus = useMemo(() => {
    const fallbackClientId = paymentManagerSessionClients[0]?.id ?? selectedBookedSession?.client?.id ?? null
    const clientId = selectedBookedPaymentClientId ?? fallbackClientId
    return paymentStatusForClient(clientId)
  }, [paymentManagerSessionClients, paymentStatusForClient, selectedBookedPaymentClientId, selectedBookedSession?.client?.id])

  const selectedBookedPaymentClient = useMemo(() => {
    const fallbackClientId = paymentManagerSessionClients[0]?.id ?? selectedBookedSession?.client?.id ?? null
    const clientId = selectedBookedPaymentClientId ?? fallbackClientId
    return paymentManagerSessionClients.find((client: any) => Number(client?.id) === Number(clientId))
      || selectedBookedSession?.client
      || null
  }, [paymentManagerSessionClients, selectedBookedPaymentClientId, selectedBookedSession?.client])

  useEffect(() => {
    const client = selectedBookedPaymentClient
    const clientId = Number(client?.id)
    if (!Number.isInteger(clientId) || clientId <= 0) {
      setSelectedBookedPaymentClientDraft(null)
      return
    }
    let firstName = String(client?.firstName ?? '').trim()
    let lastName = String(client?.lastName ?? '').trim()
    if (!firstName && !lastName) {
      const legacy = String((client as any)?.name || '').trim()
      if (legacy) {
        const parsed = parseClientNameInput(legacy)
        firstName = String(parsed.firstName || '').trim()
        lastName = String(parsed.lastName || '').trim()
      }
    }
    setSelectedBookedPaymentClientDraft({
      clientId,
      firstName,
      lastName,
      email: String(client?.email ?? ''),
      phone: String(client?.phone ?? client?.whatsappPhone ?? ''),
      address: String((client as any)?.address ?? client?.billingCompany?.address ?? ''),
      postalCode: String((client as any)?.postalCode ?? client?.billingCompany?.postalCode ?? ''),
      city: String((client as any)?.city ?? client?.billingCompany?.city ?? ''),
      country: String((client as any)?.country ?? (locale === 'sl' ? 'Slovenija' : 'Slovenia')),
    })
  }, [locale, selectedBookedPaymentClient])

  const bookedPaymentPayeeDrafts = useMemo(() => {
    return normalizeBookingPayeeDrafts(
      paymentManagerClientIds,
      paymentManagerIsNewBooking ? form.payees : selectedBookedSession?.payees,
      paymentManagerPayeeLinkedCompany?.id,
    )
  }, [paymentManagerClientIds, paymentManagerIsNewBooking, form.payees, selectedBookedSession?.payees, paymentManagerPayeeLinkedCompany?.id])

  const selectedBookedPaymentPayeeDraft = useMemo(() => {
    if (!selectedBookedPaymentClient?.id) return null
    return bookedPaymentPayeeDrafts.find((draft) => Number(draft.clientId) === Number(selectedBookedPaymentClient.id)) ?? null
  }, [bookedPaymentPayeeDrafts, selectedBookedPaymentClient?.id])

  const selectedBookedPaymentLinkedCompany = useMemo(() => {
    const selectedCompanyId = Number(selectedBookedPaymentPayeeDraft?.companyId)
    if (Number.isInteger(selectedCompanyId) && selectedCompanyId > 0) {
      return bookingPayeeCompanies.find((company: any) => Number(company?.id) === selectedCompanyId)
        || selectedBookedPaymentClient?.billingCompany
        || paymentManagerPayeeLinkedCompany
        || null
    }
    return selectedBookedPaymentClient?.billingCompany || paymentManagerPayeeLinkedCompany || null
  }, [paymentManagerPayeeLinkedCompany, bookingPayeeCompanies, selectedBookedPaymentClient, selectedBookedPaymentPayeeDraft?.companyId])

  const selectedBookedPaymentClientIsGroupMember = useMemo(() => {
    const clientId = Number(selectedBookedPaymentClient?.id)
    return Number.isInteger(clientId) && clientId > 0 && paymentManagerGroupMemberIds.has(clientId)
  }, [paymentManagerGroupMemberIds, selectedBookedPaymentClient?.id])

  const bookedPaymentPayeesUseSameCompanyForAll = useMemo(() => {
    if (bookedPaymentPayeeDrafts.length <= 1) return false
    const first = bookedPaymentPayeeDrafts[0]
    if (!first || first.payeeType !== 'COMPANY' || first.customData) return false
    return bookedPaymentPayeeDrafts.every((draft) => (
      draft.payeeType === 'COMPANY'
      && !draft.customData
      && Number(draft.companyId ?? 0) === Number(first.companyId ?? 0)
    ))
  }, [bookedPaymentPayeeDrafts])

  const isGroupedSingleInvoiceMode = useMemo(
    () => !paymentManagerIsNewBooking && bookedPaymentPayeesUseSameCompanyForAll && paymentManagerSessionClients.length > 1,
    [bookedPaymentPayeesUseSameCompanyForAll, paymentManagerIsNewBooking, paymentManagerSessionClients.length],
  )

  const groupedSingleInvoiceStatus = useMemo<BookingPaymentStatus | null>(() => {
    if (!isGroupedSingleInvoiceMode || !selectedBookedSession?.id) return null
    const totals = paymentManagerSessionClients.reduce((acc, client: any) => {
      const status = paymentStatusForClient(client?.id)
      const total = Number(status?.sessionTotalGross ?? 0)
      const paid = Number(status?.paidGross ?? 0)
      const pending = Number(status?.pendingGross ?? 0)
      acc.total += Number.isFinite(total) ? total : 0
      acc.paid += Number.isFinite(paid) ? paid : 0
      acc.pending += Number.isFinite(pending) ? pending : 0
      return acc
    }, { total: 0, paid: 0, pending: 0 })
    const allAllocations = paymentManagerPaymentStatuses.flatMap((status) => (
      Array.isArray(status?.allocations) ? status.allocations : []
    ))
    const representative = paymentManagerPaymentStatuses.find((status) => Number(status?.openBillId ?? 0) > 0)
      || paymentManagerPaymentStatuses.find((status) => (status?.allocations ?? []).some((allocation) => allocation?.source === 'INVOICE' && allocation?.billId))
      || paymentManagerPaymentStatuses[0]
      || null
    const fallbackClientId = Number(
      selectedBookedPaymentClient?.id
      ?? paymentManagerSessionClients[0]?.id
      ?? selectedBookedSession?.client?.id
      ?? representative?.clientId
      ?? 0,
    )
    const resolvedClientId = Number.isInteger(fallbackClientId) && fallbackClientId > 0 ? fallbackClientId : 0
    const openBillIdRaw = Number(representative?.openBillId ?? 0)
    return {
      clientId: resolvedClientId,
      bookingId: Number(selectedBookedSession.id),
      status: bookedPrimaryPaymentStatus,
      sessionTotalGross: totals.total,
      paidGross: totals.paid,
      pendingGross: totals.pending,
      openBillId: Number.isInteger(openBillIdRaw) && openBillIdRaw > 0 ? openBillIdRaw : null,
      allocations: allAllocations,
    }
  }, [
    isGroupedSingleInvoiceMode,
    selectedBookedSession?.id,
    selectedBookedSession?.client?.id,
    paymentManagerPaymentStatuses,
    paymentManagerSessionClients,
    paymentStatusForClient,
    selectedBookedPaymentClient?.id,
    bookedPrimaryPaymentStatus,
  ])

  const groupedSingleInvoiceClient = useMemo(() => {
    if (!isGroupedSingleInvoiceMode) return null
    return selectedBookedPaymentClient
      || paymentManagerSessionClients[0]
      || selectedBookedSession?.client
      || null
  }, [isGroupedSingleInvoiceMode, paymentManagerSessionClients, selectedBookedPaymentClient, selectedBookedSession?.client])

  const groupedSingleInvoicePayeeDraft = useMemo(() => {
    if (!isGroupedSingleInvoiceMode) return null
    return bookedPaymentPayeeDrafts[0] ?? null
  }, [bookedPaymentPayeeDrafts, isGroupedSingleInvoiceMode])

  const openBookedPaymentAdvanceEditor = useCallback((status: BookingPaymentStatus | null | undefined, explicitClient?: any | null) => {
    if (settings.BILLING_ADVANCE_ENABLED === 'false') return false
    if (!canIssueAdvanceInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
      return false
    }

    const clientIdRaw = Number(
      explicitClient?.id
        ?? status?.clientId
        ?? selectedBookedPaymentClient?.id
        ?? paymentManagerSessionClients?.[0]?.id
        ?? selectedBookedClientIds?.[0]
        ?? selectedBookedSession?.client?.id
        ?? 0,
    )
    const clientId = Number.isInteger(clientIdRaw) && clientIdRaw > 0 ? clientIdRaw : null
    const payeeDraft = clientId != null
      ? bookedPaymentPayeeDrafts.find((draft) => Number(draft?.clientId) === clientId)
      : (isGroupedSingleInvoiceMode ? groupedSingleInvoicePayeeDraft : null)
    const billingTarget = payeeDraft?.payeeType === 'COMPANY' ? 'COMPANY' : 'PERSON'
    const companyIdRaw = Number(
      payeeDraft?.companyId
        ?? (billingTarget === 'COMPANY' ? explicitClient?.billingCompany?.id : null)
        ?? 0,
    )
    const sessionIdRaw = Number(selectedBookedSession?.id ?? status?.bookingId ?? 0)
    const consultantIdRaw = Number(selectedBookedSession?.consultant?.id ?? user?.id ?? 0)
    const params = new URLSearchParams(location.search)
    params.delete('editOpenBillId')
    params.delete('editBill')
    params.set('createAdvance', '1')
    if (Number.isInteger(sessionIdRaw) && sessionIdRaw > 0) {
      params.set('sessionId', String(sessionIdRaw))
      params.set('advanceSessionId', String(sessionIdRaw))
    }
    if (clientId != null) params.set('advanceClientId', String(clientId))
    params.delete('advanceClientIds')
    if (Number.isInteger(consultantIdRaw) && consultantIdRaw > 0) params.set('advanceConsultantId', String(consultantIdRaw))
    params.set('advanceBillingTarget', billingTarget)
    if (billingTarget === 'COMPANY' && Number.isInteger(companyIdRaw) && companyIdRaw > 0) params.set('advanceCompanyId', String(companyIdRaw))
    bookedSessionBeforeAdvanceEditorRef.current = selectedBookedSession || null
    setBookedPaymentMenuOpen(false)
    setBookedStatusMenuOpen(false)
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: false })
    return true
  }, [
    bookedPaymentPayeeDrafts,
    canIssueAdvanceInvoice,
    groupedSingleInvoicePayeeDraft,
    isGroupedSingleInvoiceMode,
    location.pathname,
    location.search,
    locale,
    navigate,
    paymentManagerSessionClients,
    selectedBookedClientIds,
    selectedBookedPaymentClient?.id,
    settings.BILLING_ADVANCE_ENABLED,
    showToast,
    selectedBookedSession?.client?.id,
    selectedBookedSession?.consultant?.id,
    selectedBookedSession?.id,
    setBookedPaymentMenuOpen,
    setBookedStatusMenuOpen,
    user?.id,
  ])

  const updateBookedPaymentPayeeDrafts = useCallback((
    updater: (drafts: BookingPayeeDraft[]) => BookingPayeeDraft[],
    options?: { allowPaidOverride?: boolean },
  ) => {
    const allowPaidOverride = options?.allowPaidOverride === true
    if (paymentManagerIsNewBooking) {
      setForm((prev: any) => {
        const ids = normalizeSelectedClientIds(prev.clientIds, prev.clientId)
        const current = normalizeBookingPayeeDrafts(ids, Array.isArray(prev.payees) ? prev.payees : [], formBookingPayeeLinkedCompany?.id)
        const nextDrafts = updater(current)
        const payees = allowPaidOverride
          ? nextDrafts
          : (() => {
              const currentByClientId = new Map<number, BookingPayeeDraft>(
                current.map((draft) => [Number(draft.clientId), draft]),
              )
              const lockedClientIds = new Set<number>(
                current
                  .filter((draft) => paymentStatusForClient(draft.clientId)?.status === 'PAID')
                  .map((draft) => Number(draft.clientId)),
              )
              return nextDrafts.map((draft) => {
                const clientId = Number(draft.clientId)
                if (!lockedClientIds.has(clientId)) return draft
                return currentByClientId.get(clientId) ?? draft
              })
            })()
        return { ...prev, payees }
      })
      return
    }
    setSelectedBookedSession((prev: any) => {
      if (!prev) return prev
      const ids = normalizeSelectedClientIds(selectedBookedClientIds, prev.client?.id)
      const current = normalizeBookingPayeeDrafts(ids, prev.payees, bookedBookingPayeeLinkedCompany?.id)
      const nextDrafts = updater(current)
      const payees = allowPaidOverride
        ? nextDrafts
        : (() => {
            const currentByClientId = new Map<number, BookingPayeeDraft>(
              current.map((draft) => [Number(draft.clientId), draft]),
            )
            const lockedClientIds = new Set<number>(
              current
                .filter((draft) => paymentStatusForClient(draft.clientId)?.status === 'PAID')
                .map((draft) => Number(draft.clientId)),
            )
            return nextDrafts.map((draft) => {
              const clientId = Number(draft.clientId)
              if (!lockedClientIds.has(clientId)) return draft
              return currentByClientId.get(clientId) ?? draft
            })
          })()
      return { ...prev, payees }
    })
  }, [bookedBookingPayeeLinkedCompany?.id, formBookingPayeeLinkedCompany?.id, paymentManagerIsNewBooking, paymentStatusForClient, selectedBookedClientIds])

  const updateSelectedBookedPaymentPayee = useCallback((patch: Partial<BookingPayeeDraft>) => {
    const clientId = Number(selectedBookedPaymentClient?.id)
    if (!Number.isInteger(clientId) || clientId <= 0) return
    if (isGroupedSingleInvoiceMode) {
      if (groupedSingleInvoiceStatus?.status === 'PAID') return
    } else if (paymentStatusForClient(clientId)?.status === 'PAID') return
    updateBookedPaymentPayeeDrafts((drafts) => drafts.map((draft) => (
      Number(draft.clientId) === clientId ? { ...draft, ...patch, clientId } : draft
    )))
  }, [groupedSingleInvoiceStatus?.status, isGroupedSingleInvoiceMode, paymentStatusForClient, selectedBookedPaymentClient?.id, updateBookedPaymentPayeeDrafts])

  const toggleBookedPaymentSameCompanyForAll = useCallback(() => {
    updateBookedPaymentPayeeDrafts((drafts) => {
      if (bookedPaymentPayeesUseSameCompanyForAll) {
        return drafts.map((draft) => ({ ...draft, payeeType: 'PERSON', companyId: null, customData: false }))
      }
      const fallbackCompanyId = paymentManagerPayeeLinkedCompany?.id
        ?? drafts.find((draft) => Number(draft.companyId) > 0)?.companyId
        ?? null
      return drafts.map((draft) => ({ ...draft, payeeType: 'COMPANY', companyId: fallbackCompanyId, customData: false }))
    }, { allowPaidOverride: true })
  }, [bookedPaymentPayeesUseSameCompanyForAll, paymentManagerPayeeLinkedCompany?.id, updateBookedPaymentPayeeDrafts])

  const setBookedPaymentSharedCompanyForAll = useCallback((companyId: number | null) => {
    updateBookedPaymentPayeeDrafts((drafts) => drafts.map((draft) => ({
      ...draft,
      payeeType: 'COMPANY',
      companyId,
      customData: false,
    })), { allowPaidOverride: true })
  }, [updateBookedPaymentPayeeDrafts])

  const bookedPaymentTotals = useMemo(() => {
    return paymentManagerSessionClients.reduce((acc, client: any) => {
      const status = paymentStatusForClient(client?.id)
      const total = Number(status?.sessionTotalGross ?? 0)
      const paid = Number(status?.paidGross ?? 0)
      const pending = Number(status?.pendingGross ?? 0)
      const unpaid = Math.max(0, total - paid - pending)
      acc.total += Number.isFinite(total) ? total : 0
      acc.paid += Number.isFinite(paid) ? paid : 0
      acc.pending += Number.isFinite(pending) ? pending : 0
      acc.unpaid += Number.isFinite(unpaid) ? unpaid : 0
      return acc
    }, { total: 0, paid: 0, pending: 0, unpaid: 0 })
  }, [paymentManagerSessionClients, paymentStatusForClient])

  const bookedPaymentPayeeSummary = useMemo(() => {
    const drafts = bookedPaymentPayeeDrafts
    const clientNames = paymentManagerSessionClients.map((client: any) => fullName(client)).filter(Boolean)
    const hasMultiple = drafts.length > 1
    const first = drafts[0]
    const sameCompany = hasMultiple && !!first && drafts.every((draft) => (
      draft.payeeType === 'COMPANY'
      && first.payeeType === 'COMPANY'
      && Number(draft.companyId ?? 0) === Number(first.companyId ?? 0)
      && Boolean(draft.customData) === Boolean(first.customData)
      && String(draft.companyName ?? '') === String(first.companyName ?? '')
    ))
    const companyName = paymentManagerPayeeLinkedCompany?.name
      || drafts.find((draft) => draft.companyName)?.companyName
      || (locale === 'sl' ? 'Ni povezanega podjetja' : 'No linked company')
    return {
      clientNames,
      mode: sameCompany ? 'shared' : 'per-client',
      modeLabel: sameCompany
        ? (locale === 'sl' ? 'Isto podjetje za vse' : 'Same company for all')
        : (locale === 'sl' ? 'Za vsakega klienta posebej' : 'Per client'),
      companyName,
    }
  }, [bookedPaymentPayeeDrafts, paymentManagerSessionClients, paymentManagerPayeeLinkedCompany?.name, locale])

  const selectedBookedPaymentPayeeLocked = useMemo(
    () => (isGroupedSingleInvoiceMode
      ? groupedSingleInvoiceStatus?.status === 'PAID'
      : paymentStatusForClient(selectedBookedPaymentClient?.id)?.status === 'PAID'),
    [groupedSingleInvoiceStatus?.status, isGroupedSingleInvoiceMode, paymentStatusForClient, selectedBookedPaymentClient?.id],
  )

  const bookedPaymentClientDisplay = useCallback((client: any) => {
    const displayName = fullName(client) || String(client?.name || client?.email || '').trim() || '—'
    return {
      typeLabel: locale === 'sl' ? 'Posameznik' : 'Individual',
      displayName,
    }
  }, [locale])

  const bookedPaymentPayeeDisplay = useCallback((client: any, draft?: BookingPayeeDraft | null) => {
    const individualLabel = locale === 'sl' ? 'Posameznik' : 'Individual'
    const companyLabel = locale === 'sl' ? 'Podjetje' : 'Company'
    if (!draft) {
      return {
        typeLabel: individualLabel,
        displayName: fullName(client) || String(client?.name || client?.email || '').trim() || '—',
      }
    }
    if (draft.payeeType === 'COMPANY') {
      const customCompanyName = String(draft.companyName || '').trim()
      const selectedCompanyId = Number(draft.companyId)
      const linkedCompany = (Number.isInteger(selectedCompanyId) && selectedCompanyId > 0
        ? bookingPayeeCompanies.find((company: any) => Number(company?.id) === selectedCompanyId)
        : null)
        || client?.billingCompany
        || paymentManagerPayeeLinkedCompany
        || null
      return {
        typeLabel: companyLabel,
        displayName: customCompanyName || String(linkedCompany?.name || '').trim() || (locale === 'sl' ? 'Ni povezanega podjetja' : 'No linked company'),
      }
    }
    return {
      typeLabel: individualLabel,
      displayName: fullName(client) || String(client?.name || client?.email || '').trim() || '—',
    }
  }, [paymentManagerPayeeLinkedCompany, bookingPayeeCompanies, locale])

  const updateSelectedBookedPaymentClientDraft = useCallback((patch: Partial<NonNullable<typeof selectedBookedPaymentClientDraft>>) => {
    setSelectedBookedPaymentClientDraft((prev) => {
      if (!prev) return prev
      return { ...prev, ...patch }
    })
  }, [])

  const syncUpdatedClientInCalendarState = useCallback((updatedClient: any) => {
    const updatedClientId = Number(updatedClient?.id)
    if (!Number.isInteger(updatedClientId) || updatedClientId <= 0) return
    setMeta((prev: any) => ({
      ...prev,
      clients: Array.isArray(prev?.clients)
        ? prev.clients.map((client: any) => (Number(client?.id) === updatedClientId ? { ...client, ...updatedClient } : client))
        : prev?.clients,
    }))
    setSelectedBookedSession((prev: any) => {
      if (!prev) return prev
      const mapClient = (client: any) => (Number(client?.id) === updatedClientId ? { ...client, ...updatedClient } : client)
      return {
        ...prev,
        client: prev.client ? mapClient(prev.client) : prev.client,
        clients: Array.isArray(prev.clients) ? prev.clients.map((client: any) => mapClient(client)) : prev.clients,
      }
    })
    setCalendarData((prev: any) => ({
      ...prev,
      booked: Array.isArray(prev?.booked)
        ? prev.booked.map((booking: any) => {
            if (!booking) return booking
            const mapClient = (client: any) => (Number(client?.id) === updatedClientId ? { ...client, ...updatedClient } : client)
            return {
              ...booking,
              client: booking.client ? mapClient(booking.client) : booking.client,
              clients: Array.isArray(booking.clients) ? booking.clients.map((client: any) => mapClient(client)) : booking.clients,
            }
          })
        : prev?.booked,
    }))
  }, [])

  const saveSelectedBookedPaymentClientDraft = useCallback(async (): Promise<boolean> => {
    const draft = selectedBookedPaymentClientDraft
    const selectedClientId = Number(selectedBookedPaymentClient?.id)
    if (!draft || !Number.isInteger(selectedClientId) || selectedClientId <= 0) return true
    if (Number(draft.clientId) !== selectedClientId) return true
    const trimmedFirst = String(draft.firstName || '').trim()
    const trimmedLast = String(draft.lastName || '').trim()
    if (!trimmedFirst && !trimmedLast) {
      showToast('error', locale === 'sl' ? 'Vnesite ime ali priimek.' : 'Enter a first or last name.')
      return false
    }
    const payload: any = {
      firstName: trimmedFirst,
      lastName: trimmedLast,
      email: String(draft.email || '').trim() || null,
      phone: String(draft.phone || '').trim() || null,
      address: String(draft.address || '').trim() || null,
      postalCode: String(draft.postalCode || '').trim() || null,
      city: String(draft.city || '').trim() || null,
      country: String(draft.country || '').trim() || null,
    }
    try {
      const response = await api.put(`/clients/${selectedClientId}`, payload)
      const updatedClient = { id: selectedClientId, ...payload, ...(response?.data || {}) }
      syncUpdatedClientInCalendarState(updatedClient)
      window.dispatchEvent(new CustomEvent('clients-updated', { detail: updatedClient }))
      return true
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.message || (locale === 'sl' ? 'Shranjevanje klienta ni uspelo.' : 'Failed to save client.'))
      return false
    }
  }, [locale, selectedBookedPaymentClient?.id, selectedBookedPaymentClientDraft, showToast, syncUpdatedClientInCalendarState])

  const invoiceAllocationForPaymentStatus = useCallback((status: BookingPaymentStatus | null): BookingPaymentAllocation | null => {
    const invoiceAllocations = (status?.allocations ?? [])
      .filter((allocation) => allocation.source === 'INVOICE' && allocation.billId && allocation.paymentStatus !== 'CANCELLED')
    return invoiceAllocations[invoiceAllocations.length - 1] ?? null
  }, [])

  const updateSelectedBookingPaymentStatus = useCallback((bookingId: number | null | undefined, patch: Partial<BookingPaymentStatus>) => {
    if (!bookingId) return
    const applyPatch = (booking: any) => {
      if (!booking || !Array.isArray(booking.paymentStatuses)) return booking
      let changed = false
      const paymentStatuses = booking.paymentStatuses.map((paymentStatus: BookingPaymentStatus) => {
        if (Number(paymentStatus.bookingId) !== Number(bookingId)) return paymentStatus
        changed = true
        return { ...paymentStatus, ...patch }
      })
      return changed ? { ...booking, paymentStatuses } : booking
    }
    setSelectedBookedSession((prev: any) => applyPatch(prev))
    setCalendarData((prev: any) => ({
      ...prev,
      booked: Array.isArray(prev?.booked) ? prev.booked.map((booking: any) => applyPatch(booking)) : prev?.booked,
    }))
  }, [])

  const createOpenBillForPaymentStatus = useCallback(async (status: BookingPaymentStatus | null, options?: { selectedOnly?: boolean; suppressToast?: boolean }) => {
    if (!status?.bookingId) return
    if (!canIssueOpenInvoice) {
      if (!options?.suppressToast) showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
      return null
    }
    const selectedOnly = !!options?.selectedOnly
    const suppressToast = !!options?.suppressToast
    const shouldSyncPerClientBillTabs = !selectedOnly && !isGroupedSingleInvoiceMode
      && selectedBookedSession?.type?.priceCalculationMode !== 'TOTAL'
      && paymentManagerSessionClients.length > 1
    if (status.openBillId && (selectedOnly || (!isGroupedSingleInvoiceMode && !shouldSyncPerClientBillTabs))) return status.openBillId

    const clean = (value: unknown) => {
      const trimmed = String(value ?? '').trim()
      return trimmed ? trimmed : null
    }
    const sameCustomCompany = (left: BookingPayeeDraft, right: BookingPayeeDraft) => (
      left.payeeType === 'COMPANY'
      && right.payeeType === 'COMPANY'
      && !!left.customData
      && !!right.customData
      && String(left.companyName ?? '').trim().toLowerCase() === String(right.companyName ?? '').trim().toLowerCase()
      && String(left.vatId ?? '').trim().toLowerCase() === String(right.vatId ?? '').trim().toLowerCase()
      && String(left.companyEmail ?? '').trim().toLowerCase() === String(right.companyEmail ?? '').trim().toLowerCase()
      && String(left.address ?? '').trim().toLowerCase() === String(right.address ?? '').trim().toLowerCase()
      && String(left.city ?? '').trim().toLowerCase() === String(right.city ?? '').trim().toLowerCase()
      && String(left.postalCode ?? '').trim().toLowerCase() === String(right.postalCode ?? '').trim().toLowerCase()
    )

    try {
      if (!selectedOnly && isGroupedSingleInvoiceMode) {
        const sharedCompanyId = Number(bookedPaymentPayeeDrafts.find((draft) => (
          draft.payeeType === 'COMPANY'
          && !draft.customData
          && Number(draft.companyId ?? 0) > 0
        ))?.companyId ?? 0)
        if (!Number.isInteger(sharedCompanyId) || sharedCompanyId <= 0) {
          showToast('error', locale === 'sl' ? 'Najprej izberite podjetje za skupni račun.' : 'Select a company for the shared invoice first.')
          return
        }

        if (selectedBookedSession?.id) {
          const resolvedClientIds = normalizeSelectedClientIds(
            paymentManagerSessionClients.map((client: any) => client?.id),
            selectedBookedSession.client?.id,
          )
          await api.put(`/bookings/${selectedBookedSession.id}`, {
            clientId: resolvedClientIds[0] ?? null,
            clientIds: resolvedClientIds,
            consultantId: selectedBookedSession.consultant?.id ?? null,
            startTime: selectedBookedSession.startTime,
            endTime: selectedBookedSession.endTime,
            spaceId: selectedBookedSession.space?.id ?? null,
            typeId: selectedBookedSession.type?.id ?? null,
            notes: selectedBookedSession.notes ?? '',
            meetingLink: selectedBookedSession.online ? (selectedBookedSession.meetingLink ?? null) : null,
            online: !!selectedBookedSession.online,
            meetingProvider: selectedBookedSession.online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
            groupEmailOverride: null,
            groupBillingCompanyIdOverride: null,
            bookingStatus: selectedBookedSession.bookingStatus ?? selectedBookedStoredStatus,
            payees: normalizeBookingPayeesForPayload(resolvedClientIds, selectedBookedSession.payees, bookedBookingPayeeLinkedCompany?.id),
          })
        }

        const statusesToBill = paymentManagerSessionClients
          .map((client: any) => paymentStatusForClient(client?.id))
          .filter((item): item is BookingPaymentStatus => !!item?.bookingId && !item.openBillId && item.status !== 'PAID')

        if (statusesToBill.length === 0) {
          showToast('success', locale === 'sl' ? 'Odprti račun je že ustvarjen.' : 'The open invoice has already been created.')
          return status.openBillId ?? null
        }

        let createdOpenBillId = status.openBillId ?? null
        for (const participantStatus of statusesToBill) {
          const { data } = await api.post(`/billing/open-bills/session/${participantStatus.bookingId}`)
          createdOpenBillId = data?.id ?? createdOpenBillId ?? participantStatus.openBillId ?? -1
          updateSelectedBookingPaymentStatus(participantStatus.bookingId, { openBillId: createdOpenBillId })
        }
        if (!suppressToast) showToast('success', locale === 'sl' ? 'Skupni odprti račun je ustvarjen.' : 'The shared open invoice has been created.')
        if (!suppressToast) await loadCalendarRangeOnly(true)
        return createdOpenBillId
      }

      if (!selectedOnly && selectedBookedSession?.id) {
        const statusClientId = Number(status.clientId)
        const resolvedClientIds = normalizeSelectedClientIds(selectedBookedClientIds, selectedBookedSession.client?.id)
        if (Number.isInteger(statusClientId) && statusClientId > 0 && !resolvedClientIds.includes(statusClientId)) {
          resolvedClientIds.push(statusClientId)
        }
        const currentPayees = normalizeBookingPayeeDrafts(resolvedClientIds, selectedBookedSession.payees, bookedBookingPayeeLinkedCompany?.id)
        const customCompanyPayee = currentPayees.find((draft) => Number(draft.clientId) === statusClientId && draft.payeeType === 'COMPANY' && draft.customData)

        if (customCompanyPayee) {
          const companyName = clean(customCompanyPayee.companyName)
          if (!companyName) {
            showToast('error', locale === 'sl' ? 'Naziv podjetja je obvezen za podatke podjetja po meri.' : 'Company name is required for custom company data.')
            return
          }

          const companyVatId = clean(customCompanyPayee.vatId)?.toLowerCase() || ''
          const companyEmail = clean(customCompanyPayee.companyEmail)?.toLowerCase() || ''
          const companyNameKey = companyName.toLowerCase()
          const companyAddress = clean(customCompanyPayee.address)?.toLowerCase() || ''
          const companyCity = clean(customCompanyPayee.city)?.toLowerCase() || ''
          const companyPostalCode = clean(customCompanyPayee.postalCode)?.toLowerCase() || ''
          let company = bookingPayeeCompanies.find((item: any) => {
            const itemVatId = clean(item?.vatId)?.toLowerCase() || ''
            const itemEmail = clean(item?.email)?.toLowerCase() || ''
            const itemName = clean(item?.name)?.toLowerCase() || ''
            const itemAddress = clean(item?.address)?.toLowerCase() || ''
            const itemCity = clean(item?.city)?.toLowerCase() || ''
            const itemPostalCode = clean(item?.postalCode)?.toLowerCase() || ''
            if (companyVatId && itemVatId && companyVatId === itemVatId) return true
            return itemName === companyNameKey
              && itemEmail === companyEmail
              && itemAddress === companyAddress
              && itemCity === companyCity
              && itemPostalCode === companyPostalCode
          })

          if (!company) {
            const response = await api.post('/companies', {
              name: companyName,
              address: clean(customCompanyPayee.address),
              postalCode: clean(customCompanyPayee.postalCode),
              city: clean(customCompanyPayee.city),
              vatId: clean(customCompanyPayee.vatId),
              email: clean(customCompanyPayee.companyEmail),
              telephone: null,
            })
            company = response?.data
            if (company?.id) {
              setBookingPayeeCompanies((prev) => [company, ...prev.filter((item: any) => Number(item?.id) !== Number(company.id))]
                .sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || ''))))
            }
          }

          const companyId = Number(company?.id)
          if (!Number.isInteger(companyId) || companyId <= 0) {
            throw new Error(locale === 'sl' ? 'Profila podjetja ni bilo mogoče ustvariti.' : 'Could not create the company profile.')
          }

          const updatedPayees = currentPayees.map((draft) => (
            sameCustomCompany(draft, customCompanyPayee)
              ? {
                  ...draft,
                  payeeType: 'COMPANY' as const,
                  companyId,
                  customData: false,
                  companyName: null,
                  address: null,
                  city: null,
                  postalCode: null,
                  vatId: null,
                  companyEmail: null,
                }
              : draft
          ))

          await api.put(`/bookings/${selectedBookedSession.id}`, {
            clientId: resolvedClientIds[0] ?? null,
            clientIds: resolvedClientIds,
            consultantId: selectedBookedSession.consultant?.id ?? null,
            startTime: selectedBookedSession.startTime,
            endTime: selectedBookedSession.endTime,
            spaceId: selectedBookedSession.space?.id ?? null,
            typeId: selectedBookedSession.type?.id ?? null,
            notes: selectedBookedSession.notes ?? '',
            meetingLink: selectedBookedSession.online ? (selectedBookedSession.meetingLink ?? null) : null,
            online: !!selectedBookedSession.online,
            meetingProvider: selectedBookedSession.online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
            groupEmailOverride: null,
            groupBillingCompanyIdOverride: null,
            bookingStatus: selectedBookedSession.bookingStatus ?? selectedBookedStoredStatus,
            payees: normalizeBookingPayeesForPayload(resolvedClientIds, updatedPayees, bookedBookingPayeeLinkedCompany?.id),
          })

          setSelectedBookedSession((prev: any) => (prev && Number(prev.id) === Number(selectedBookedSession.id) ? { ...prev, payees: updatedPayees } : prev))
          setCalendarData((prev: any) => ({
            ...prev,
            booked: Array.isArray(prev?.booked)
              ? prev.booked.map((booking: any) => (Number(booking?.id) === Number(selectedBookedSession.id) ? { ...booking, payees: updatedPayees } : booking))
              : prev?.booked,
          }))
        }
      }

      const { data } = await api.post(`/billing/open-bills/session/${status.bookingId}`, null, { params: selectedOnly ? { selectedOnly: true } : undefined })
      updateSelectedBookingPaymentStatus(status.bookingId, { openBillId: data?.id ?? status.openBillId ?? -1 })
      if (!suppressToast) showToast('success', locale === 'sl' ? 'Odprti račun je ustvarjen.' : 'Open invoice has been created.')
      if (!suppressToast) await loadCalendarRangeOnly(true)
      return data?.id ?? status.openBillId ?? null
    } catch (error: any) {
      if (!suppressToast) {
        showToast('error', error?.response?.data?.message || error?.message || (locale === 'sl' ? 'Odprtega računa ni bilo mogoče ustvariti.' : 'Could not create the open invoice.'))
      }
      return null
    }
  }, [bookedBookingPayeeLinkedCompany?.id, bookedPaymentPayeeDrafts, bookingPayeeCompanies, canIssueOpenInvoice, isGroupedSingleInvoiceMode, loadCalendarRangeOnly, locale, paymentManagerSessionClients, paymentStatusForClient, selectedBookedClientIds, selectedBookedSession, selectedBookedStoredStatus, showToast, updateSelectedBookingPaymentStatus])

  const openPaymentInvoicePdf = useCallback(async (status: BookingPaymentStatus | null) => {
    const invoice = invoiceAllocationForPaymentStatus(status)
    if (!invoice?.billId) return
    try {
      const res = await api.get(`/billing/bills/${invoice.billId}/folio-pdf?locale=${locale}`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        const a = document.createElement('a')
        a.href = url
        a.download = `folio-${invoice.billNumber || invoice.billId}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30000)
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (locale === 'sl' ? 'Računa ni bilo mogoče odpreti.' : 'Could not open the invoice.'))
    }
  }, [invoiceAllocationForPaymentStatus, locale, showToast])

  const resendPaymentInvoicePdf = useCallback(async (status: BookingPaymentStatus | null) => {
    const invoice = invoiceAllocationForPaymentStatus(status)
    if (!invoice?.billId) return
    try {
      await api.post(`/billing/bills/${invoice.billId}/resend?locale=${locale}`)
      showToast('success', locale === 'sl' ? 'Račun je bil ponovno poslan.' : 'Invoice has been resent.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (locale === 'sl' ? 'Računa ni bilo mogoče poslati.' : 'Could not resend the invoice.'))
    }
  }, [invoiceAllocationForPaymentStatus, locale, showToast])

  const renderBookedPaymentDetail = useCallback((status: BookingPaymentStatus | null) => {
    const meta = bookedPaymentMeta(status?.status)
    const allocations = status?.allocations ?? []
    const invoiceAllocation = invoiceAllocationForPaymentStatus(status)
    const advanceAllocation = allocations.find((allocation) => allocation.source === 'ADVANCE')
    const entitlementAllocation = allocations.find((allocation) => allocation.source === 'ENTITLEMENT')
    const canCreateOpenBill = status?.status === 'UNPAID' && !status?.openBillId
    const canUseInvoiceActions = !!invoiceAllocation?.billId && (status?.status === 'PARTIALLY_PAID' || status?.status === 'PAYMENT_PENDING' || status?.status === 'PAID')
    const detailSourceLabel = invoiceAllocation
      ? (locale === 'sl' ? 'Odprti računi' : 'Open invoices')
      : advanceAllocation
        ? (locale === 'sl' ? 'Predplačilo' : 'Advance')
        : entitlementAllocation
          ? (locale === 'sl' ? 'Dobroimetje' : 'Entitlement')
          : '—'
    return (
      <div className="calendar-payment-detail">
        <div className="calendar-payment-detail__header">
          <span>{locale === 'sl' ? 'Plačilni status' : 'Payment status'}</span>
          <strong className={`calendar-payment-inline-badge calendar-payment-inline-badge--${meta.tone}`}>{meta.label}</strong>
        </div>
        <div className="calendar-payment-detail__totals">
          <span>{locale === 'sl' ? 'Znesek' : 'Amount'}: <strong>{currency(status?.sessionTotalGross ?? 0)}</strong></span>
          <span>{locale === 'sl' ? 'Plačano' : 'Paid'}: <strong>{currency(status?.paidGross ?? 0)}</strong></span>
          {(status?.pendingGross ?? 0) > 0 && (
            <span>{locale === 'sl' ? 'V teku' : 'Pending'}: <strong>{currency(status?.pendingGross ?? 0)}</strong></span>
          )}
        </div>
        {invoiceAllocation || advanceAllocation || entitlementAllocation ? (
          <div className="calendar-payment-summary-card">
            <div className="calendar-payment-summary-row">
              <span className="calendar-payment-summary-icon" aria-hidden="true">▣</span>
              <span>{invoiceAllocation ? (locale === 'sl' ? 'Račun:' : 'Invoice:') : advanceAllocation ? (locale === 'sl' ? 'Predplačilo:' : 'Advance:') : (locale === 'sl' ? 'Dobroimetje:' : 'Entitlement:')}</span>
              <strong>{invoiceAllocation?.billNumber || advanceAllocation?.billNumber || entitlementAllocation?.entitlementCode || entitlementAllocation?.productName || '—'}</strong>
            </div>
            <div className="calendar-payment-summary-row">
              <span className="calendar-payment-summary-icon" aria-hidden="true">▤</span>
              <span>{locale === 'sl' ? 'Način:' : 'Method:'}</span>
              <strong>{invoiceAllocation?.paymentMethod || advanceAllocation?.paymentMethod || entitlementAllocation?.entitlementType || '—'}</strong>
            </div>
            <div className="calendar-payment-summary-row">
              <span className="calendar-payment-summary-icon" aria-hidden="true">◉</span>
              <span>{locale === 'sl' ? 'Vir:' : 'Source:'}</span>
              <strong>{detailSourceLabel}</strong>
            </div>
          </div>
        ) : (
          <div className="calendar-payment-empty calendar-payment-empty--info">
            <span className="calendar-payment-summary-icon" aria-hidden="true">i</span>
            <span>{locale === 'sl' ? 'Ni povezanega računa ali porabe dobroimetja.' : 'No linked invoice or entitlement usage.'}</span>
          </div>
        )}
        {(canCreateOpenBill || canUseInvoiceActions) && (
          <div className="calendar-payment-actions">
            {canCreateOpenBill && (
              <>
                <button
                  type="button"
                  className="calendar-payment-action calendar-payment-action--primary"
                  onClick={() => void createOpenBillForPaymentStatus(status)}
                >
                  {locale === 'sl' ? 'Ustvari odprti račun' : 'Create open invoice'}
                </button>
                <small>{locale === 'sl' ? 'Prikaže se samo, če odprti račun še ne obstaja.' : 'Shown only when no open invoice exists yet.'}</small>
              </>
            )}
            {canUseInvoiceActions && (
              <div className="calendar-payment-action-grid">
                <button
                  type="button"
                  className="calendar-payment-action calendar-payment-action--outline"
                  onClick={() => void openPaymentInvoicePdf(status)}
                >
                  <span aria-hidden="true">↗</span>
                  {locale === 'sl' ? 'Odpri račun' : 'Open invoice'}
                </button>
                <button
                  type="button"
                  className="calendar-payment-action calendar-payment-action--soft"
                  onClick={() => void resendPaymentInvoicePdf(status)}
                >
                  <span aria-hidden="true">✈</span>
                  {locale === 'sl' ? 'Ponovno pošlji račun' : 'Resend invoice'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }, [bookedPaymentMeta, createOpenBillForPaymentStatus, invoiceAllocationForPaymentStatus, locale, openPaymentInvoicePdf, resendPaymentInvoicePdf])

  useEffect(() => {
    setBookedPaymentMenuOpen(false)
    setBookedPaymentManagerTab('invoice')
    setSelectedBookedPaymentClientId(null)
  }, [selectedBookedSession?.id])

  useEffect(() => {
    if (!bookedPaymentMenuOpen) return
    let cancelled = false
    api
      .get('/companies', { params: {} })
      .then((res) => {
        if (!cancelled) setBookingPayeeCompanies(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (!cancelled) setBookingPayeeCompanies([])
      })
    return () => {
      cancelled = true
    }
  }, [bookedPaymentMenuOpen])

  const markBookedClientsNoShow = useCallback(async (clientIds: number[]) => {
    if (!noShowModuleEnabled) {
      showToast('error', locale === 'sl' ? 'NO SHOW je izklopljen v modulih.' : 'NO SHOW is disabled in modules.')
      return false
    }
    if (!selectedBookedSession?.id) return false
    const selectedClientIds = Array.from(new Set((clientIds ?? [])
      .map((clientId) => Number(clientId))
      .filter((clientId) => Number.isInteger(clientId) && clientId > 0)))
    if (selectedClientIds.length === 0) {
      showToast('error', locale === 'sl' ? 'Izberite vsaj eno stranko.' : 'Select at least one client.')
      return false
    }

    try {
      setSaveBookingLoading(true)
      const { data } = await api.post(`/bookings/${selectedBookedSession.id}/no-show-clients`, { clientIds: selectedClientIds })
      const updatedBooking = data ?? null
      if (updatedBooking?.id) {
        setSelectedBookedSession(updatedBooking)
        setCalendarData((prev: any) => ({
          ...prev,
          booked: Array.isArray(prev?.booked)
            ? prev.booked.map((booking: any) => (
                Number(booking?.id) === Number(updatedBooking.id)
                || (updatedBooking.bookingGroupKey && booking?.bookingGroupKey === updatedBooking.bookingGroupKey)
                  ? updatedBooking
                  : booking
              ))
            : prev?.booked,
        }))
      }

      const selectedStatuses = (Array.isArray(updatedBooking?.paymentStatuses)
        ? updatedBooking.paymentStatuses
        : Array.isArray(selectedBookedSession?.paymentStatuses)
          ? selectedBookedSession.paymentStatuses
          : [])
        .filter((status: BookingPaymentStatus) => selectedClientIds.includes(Number(status?.clientId)))
        .filter((status: BookingPaymentStatus) => !!status?.bookingId)

      let touchedOpenBills = 0
      let editorOpenBillId: number | null = null
      let editorStatus: BookingPaymentStatus | null = null
      for (const status of selectedStatuses) {
        let openBillId = Number(status.openBillId ?? 0)
        if (!Number.isInteger(openBillId) || openBillId <= 0) {
          const createdOpenBillId = await createOpenBillForPaymentStatus(status, { selectedOnly: true, suppressToast: true })
          openBillId = Number(createdOpenBillId ?? 0)
          if (Number.isInteger(openBillId) && openBillId > 0) touchedOpenBills += 1
        }
        if (!editorOpenBillId && Number.isInteger(openBillId) && openBillId > 0) {
          editorOpenBillId = openBillId
          editorStatus = { ...status, openBillId }
        }
      }

      await loadCalendarRangeOnly(true)
      if (editorOpenBillId) {
        openBookedPaymentOpenBillEditor(editorStatus, editorOpenBillId)
      }
      showToast(
        'success',
        locale === 'sl'
          ? `NO SHOW je označen za ${selectedClientIds.length} strank${selectedClientIds.length === 1 ? 'o' : 'e'}${touchedOpenBills > 0 ? ' in odprti računi so posodobljeni.' : '.'}`
          : `NO SHOW has been set for ${selectedClientIds.length} client${selectedClientIds.length === 1 ? '' : 's'}${touchedOpenBills > 0 ? ' and open invoices were updated.' : '.'}`,
      )
      return true
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.message || (locale === 'sl' ? 'Strank ni bilo mogoče označiti kot NO SHOW.' : 'Could not mark clients as NO SHOW.'))
      return false
    } finally {
      setSaveBookingLoading(false)
    }
  }, [createOpenBillForPaymentStatus, loadCalendarRangeOnly, locale, noShowModuleEnabled, openBookedPaymentOpenBillEditor, selectedBookedSession, showToast])

  const transitionBookedStatus = async (targetStatus: StoredBookingStatus) => {
    if (!selectedBookedSession?.id) return
    if (targetStatus === 'NO_SHOW' && !noShowModuleEnabled) {
      showToast('error', locale === 'sl' ? 'NO SHOW je izklopljen v modulih.' : 'NO SHOW is disabled in modules.')
      return
    }
    const alreadySet = selectedBookedStoredStatus === targetStatus
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    if (alreadySet) return
    const transitionValidation = getStatusTransitionValidation(
      selectedBookedSession.startTime,
      selectedBookedSession.endTime,
      selectedBookedSession.bookingStatus,
      targetStatus,
    )
    if (!transitionValidation.allowed) {
      showToast('error', formatInvalidStatusTransitionMessage(transitionValidation.reason, targetStatus))
      return
    }
    if (targetStatus === 'CHECKED_OUT') {
      const checkoutConfirmed = window.confirm(
        locale === 'sl'
          ? 'Preklopim status na ZAKLJUČEN? Termin bo označen kot zaključen.'
          : 'Switch status to CHECKED OUT? The session will be marked as completed.',
      )
      if (!checkoutConfirmed) return
    } else {
      const confirmMessage = targetStatus === 'CANCELLED'
        ? (locale === 'sl'
          ? 'Preklopim status na ODPOVEDAN? To bo sprostilo razpoložljivost termina.'
          : 'Switch status to CANCELLED? This will release the booking availability.')
        : (locale === 'sl'
          ? 'Preklopim status na NI PRIŠEL? To bo sprostilo razpoložljivost termina.'
          : 'Switch status to NO SHOW? This will release the booking availability.')
      if (!window.confirm(confirmMessage)) return
    }
    await updateBookedSession(false, false, false, targetStatus)
  }

  const closePersonalModal = () => {
    setSelectedPersonalBlock(null)
    leaveCompactFormRouteIfNeeded()
  }

  useEffect(() => {
    if (useBookingSidePanel) return
    const hasPopup = !!(selection || selectedBookedSession || selectedPersonalBlock || selectedTodo || availabilitySelection)
    if (!hasPopup) {
      sessionPopupAnchorRectRef.current = null
      return
    }
    const onDown = (e: MouseEvent) => {
      if (calendarClientDetailId || calendarGroupDetailId) return
      const target = e.target as HTMLElement | null
      if (target && sessionPopupRef.current?.contains(target)) return
      // Don't close the booking form while the meeting provider picker is open
      if (target && target.closest('.meeting-provider-picker-backdrop')) return
      // Time picker popover is rendered in a portal outside the popup container.
      if (target && target.closest('.modern-time-picker-popover')) return
      // Nested modals (new client, overlap / personal confirm) sit outside sessionPopupRef
      if (target && target.closest('.calendar-booking-supplement')) return
      // The client/payee payment manager is rendered outside the booked-session popup.
      // Treat clicks inside it as part of the active booked-session workflow so the
      // global outside-click handler does not close both popups before button handlers run.
      if (target && target.closest('.calendar-payment-manager-backdrop')) return
      // Embedded client detail from calendar (ClientsPage overlay) must not dismiss edit session.
      if (target && target.closest('.clients-action-workspace-backdrop--embedded')) return
      if (target && target.closest('.clients-modern-page--embedded-detail')) return
      // Check if the click is on the calendar's selectable time grid area.
      // If so, just close the popup React state — do NOT call unselect() because
      // FullCalendar will handle creating a new selection from this same mousedown.
      const isOnCalendarGrid = !!(target && (
        target.closest('.fc-timegrid-slots') ||
        target.closest('.fc-timegrid-cols') ||
        target.closest('.fc-timegrid-slot') ||
        target.closest('.fc-timegrid-body') ||
        target.closest('.fc-daygrid-body') ||
        target.closest('.fc-scrollgrid-sync-table')
      ))
      if (isOnCalendarGrid) {
        suppressNextCalendarSelectionRef.current = true
        // Keep blocking until after FullCalendar runs select + dateClick for this gesture
        // (select was clearing the flag too early, so dateClick still opened a new session).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            suppressNextCalendarSelectionRef.current = false
          })
        })
      }
      setConfirmDelete(false)
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setAvailabilitySelection(null)
      setAvailabilityIntent('add')
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setSelection(null)
      setClientDropdownOpen(false)
      setEditingClientSearch(false)
      if (!isOnCalendarGrid) {
        calendarRef.current?.getApi()?.unselect()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (calendarClientDetailId || calendarGroupDetailId) return
      if (showAddGroupModal) {
        setShowAddGroupModal(false)
        return
      }
      if (showAddClientModal) {
        setShowAddClientModal(false)
        return
      }
      setConfirmDelete(false)
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setAvailabilitySelection(null)
      setAvailabilityIntent('add')
      setAvailabilityError(null)
      setAvailabilitySaving(false)
      setSelection(null)
      setClientDropdownOpen(false)
      setEditingClientSearch(false)
      calendarRef.current?.getApi()?.unselect()
    }
    const onResize = () => {
      setSessionPopupPosition(getSessionPopupPosition())
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [useBookingSidePanel, calendarClientDetailId, calendarGroupDetailId, selection, selectedBookedSession, selectedPersonalBlock, selectedTodo, availabilitySelection, showAddClientModal, showAddGroupModal])

  // Re-select the calendar highlight when form start/end changes (user edits datetime inputs)
  useEffect(() => {
    if (useBookingSidePanel || !selection || !form) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    const formStart = form.startTime
    const formEnd = form.endTime
    if (!formStart || !formEnd) return
    // Only re-select if form times differ from selection state (user edited the inputs)
    if (formStart !== selection.start || formEnd !== selection.end) {
      const rid = selection.resourceId
      setSelection({ ...selection, start: formStart, end: formEnd })
      try {
        ignoreNextSelectionRef.current = true
        if (
          rid != null &&
          (bookingsUseResourceColumns || spacesUseResourceColumns) &&
          typeof (api as any).select === 'function'
        ) {
          ;(api as any).select({ start: new Date(formStart), end: new Date(formEnd), resourceId: rid })
        } else {
          api.select(new Date(formStart), new Date(formEnd))
        }
      } catch {
        ignoreNextSelectionRef.current = false
      }
    }
  }, [useBookingSidePanel, form?.startTime, form?.endTime, bookingsUseResourceColumns, spacesUseResourceColumns]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateBookedSession = async (
    skipPersonalOverlapConfirm = false,
    allowPersonalBlockOverlap = false,
    skipNonBookableConfirm = false,
    bookingStatusOverride?: StoredBookingStatus,
  ) => {
    if (!selectedBookedSession?.id) return
    let resolvedClientIds = [...selectedBookedClientIds]
    const persistedBooked = (calendarData?.booked || []).find((b: any) => b.id === selectedBookedSession.id) as any
    const typed = bookedClientSearch.trim()
    if (typed) {
      const exact = metaClients.find(
        (c: any) => c.active !== false && fullName(c).toLowerCase() === typed.toLowerCase(),
      )
      if (exact) {
        resolvedClientIds = multipleClientsPerSessionEnabled
          ? Array.from(new Set([...resolvedClientIds, exact.id]))
          : [exact.id]
        setSelectedBookedSession((prev: any) => prev ? {
          ...prev,
          client: exact,
          clients: resolvedClientIds
            .map((id) => metaClients.find((c: any) => c.id === id) || prev.clients?.find((c: any) => c.id === id) || null)
            .filter(Boolean),
        } : prev)
        setBookedClientSearch('')
        setEditingBookedClientSearch(false)
      } else {
        try {
          const created = await postClientFromTypedName(typed, selectedBookedSession.consultant?.id ?? form.consultantId ?? undefined)
          resolvedClientIds = multipleClientsPerSessionEnabled
            ? Array.from(new Set([...resolvedClientIds, created.id]))
            : [created.id]
          setSelectedBookedSession((s: any) => (s ? {
            ...s,
            client: created,
            clients: resolvedClientIds
              .map((id) => (id === created.id ? created : metaClients.find((c: any) => c.id === id) || s.clients?.find((c: any) => c.id === id) || null))
              .filter(Boolean),
          } : s))
          setBookedClientSearch('')
          setEditingBookedClientSearch(false)
          setBookedClientDropdownOpen(false)
        } catch (e: any) {
          showToast('error', e?.response?.data?.message || e?.message || 'Failed to create client.')
          return
        }
      }
    }
    if (resolvedClientIds.length === 0 && Array.isArray(selectedBookedSession.clients)) {
      resolvedClientIds = selectedBookedSession.clients
        .map((c: any) => Number(c?.id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    }
    if (resolvedClientIds.length === 0 && Number.isFinite(selectedBookedSession.client?.id)) {
      resolvedClientIds = [selectedBookedSession.client.id]
    }
    if (resolvedClientIds.length === 0 && persistedBooked) {
      const persistedClientIds = Array.isArray(persistedBooked.clients)
        ? persistedBooked.clients.map((c: any) => Number(c?.id)).filter((id: number) => Number.isFinite(id) && id > 0)
        : []
      if (persistedClientIds.length > 0) resolvedClientIds = persistedClientIds
      else if (Number.isFinite(persistedBooked.client?.id)) resolvedClientIds = [persistedBooked.client.id]
    }
    const requestedStoredStatus = bookingStatusOverride ?? normalizeStoredBookingStatus(selectedBookedSession.bookingStatus)
    const persistedDerivedStatus = persistedBooked
      ? deriveBookingStatus(persistedBooked.startTime, persistedBooked.endTime, persistedBooked.bookingStatus)
      : null
    if (
      persistedDerivedStatus === 'ONGOING' &&
      requestedStoredStatus === 'RESERVED' &&
      new Date(selectedBookedSession.startTime).getTime() > Date.now()
    ) {
      const moveToReservedConfirmed = window.confirm(
        locale === 'sl'
          ? 'Termin je trenutno v teku. Premik v prihodnost bo status preklopil na REZERVIRANO. Nadaljujem?'
          : 'This booking is currently ongoing. Moving it to a future time will switch status to RESERVED. Continue?',
      )
      if (!moveToReservedConfirmed) return
    }
    const statusValidation = getStatusTransitionValidation(
      selectedBookedSession.startTime,
      selectedBookedSession.endTime,
      persistedBooked?.bookingStatus ?? selectedBookedSession.bookingStatus,
      requestedStoredStatus,
    )
    if (!statusValidation.allowed) {
      showToast('error', formatInvalidStatusTransitionMessage(statusValidation.reason, requestedStoredStatus))
      return
    }
    const bookedIsGroupSession = Number.isFinite(selectedBookedSession.groupId) && selectedBookedSession.groupId > 0
    if (resolvedClientIds.length === 0 && !bookedIsGroupSession) return
    const consultantId = selectedBookedSession.consultant?.id
    const typeBreakMinutes = getTypeBreakMinutes(selectedBookedSession.type?.id)
    if (!skipNonBookableConfirm && Number.isFinite(consultantId)) {
      const originalInterval = (
        persistedBooked &&
        persistedBooked.consultant?.id === consultantId &&
        persistedBooked.startTime &&
        persistedBooked.endTime
      )
        ? { start: persistedBooked.startTime, end: persistedBooked.endTime }
        : undefined
      if (!isBookedMoveIntervalBookable(
        selectedBookedSession.startTime,
        selectedBookedSession.endTime,
        consultantId,
        typeBreakMinutes,
        originalInterval,
      )) {
        setConfirmNonBookable({
          mode: 'edit',
          editPayload: {
            id: selectedBookedSession.id,
            clientIds: resolvedClientIds,
            groupId: selectedBookedSession.groupId,
            consultantId: selectedBookedSession.consultant?.id ?? null,
            startTime: selectedBookedSession.startTime,
            endTime: selectedBookedSession.endTime,
            spaceId: selectedBookedSession.space?.id ?? null,
            typeId: selectedBookedSession.type?.id ?? null,
            notes: selectedBookedSession.notes ?? '',
            online: !!selectedBookedSession.online,
            meetingLink: selectedBookedSession.meetingLink ?? null,
            meetingProvider: selectedBookedSession.meetingProvider || 'zoom',
            bookingStatus: requestedStoredStatus,
            payees: normalizeBookingPayeesForPayload(resolvedClientIds, selectedBookedSession.payees, bookedBookingPayeeLinkedCompany?.id),
          },
        })
        return
      }
    }
    if (
      !skipPersonalOverlapConfirm &&
      Number.isFinite(consultantId) &&
      findOverlappingPersonalBlocksForBooking(
        selectedBookedSession.startTime,
        selectedBookedSession.endTime,
        consultantId,
        typeBreakMinutes,
      ).length > 0
    ) {
      setConfirmBookedPersonalOverlap({ type: 'edit' })
      return
    }
    const online = !!selectedBookedSession.online
    const bookedPayloadClients =
      bookedIsGroupSession && resolvedClientIds.length === 0
        ? { clientIds: [] as number[] }
        : { clientId: resolvedClientIds[0], clientIds: resolvedClientIds }
    if (online && consultantId === user.id) {
      const provider = selectedBookedSession.meetingProvider || 'zoom'
      const needsConnect = provider === 'google' ? googleConnected === false : zoomConnected === false
      if (needsConnect) {
        sessionStorage.setItem(PENDING_BOOKING_EDIT_KEY, JSON.stringify({
          id: selectedBookedSession.id,
          clientId: resolvedClientIds[0] ?? null,
          clientIds: resolvedClientIds,
          groupId: selectedBookedSession.groupId ?? null,
          consultantId: selectedBookedSession.consultant?.id ?? null,
          startTime: selectedBookedSession.startTime,
          endTime: selectedBookedSession.endTime,
          spaceId: selectedBookedSession.space?.id ?? null,
          typeId: selectedBookedSession.type?.id ?? null,
          notes: selectedBookedSession.notes ?? '',
          meetingProvider: provider,
          bookingStatus: requestedStoredStatus,
          payees: normalizeBookingPayeesForPayload(resolvedClientIds, selectedBookedSession.payees, bookedBookingPayeeLinkedCompany?.id),
          allowPersonalBlockOverlap,
        }))
        if (provider === 'google') await connectGoogle()
        else await connectZoom()
        return
      }
    }
    let updatedBookingFromApi: any = null
    try {
      setSaveBookingLoading(true)
      const response = await api.put(`/bookings/${selectedBookedSession.id}`, {
        ...bookedPayloadClients,
        consultantId: selectedBookedSession.consultant?.id ?? null,
        startTime: selectedBookedSession.startTime,
        endTime: selectedBookedSession.endTime,
        spaceId: selectedBookedSession.space?.id ?? null,
        typeId: selectedBookedSession.type?.id ?? null,
        notes: selectedBookedSession.notes ?? '',
        meetingLink: online ? (selectedBookedSession.meetingLink ?? null) : null,
        online,
        meetingProvider: online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
        groupEmailOverride: null,
        groupBillingCompanyIdOverride: null,
        bookingStatus: requestedStoredStatus,
        payees: normalizeBookingPayeesForPayload(resolvedClientIds, selectedBookedSession.payees, bookedBookingPayeeLinkedCompany?.id),
        ...(allowPersonalBlockOverlap ? { allowPersonalBlockOverlap: true } : {}),
      })
      updatedBookingFromApi = response?.data ?? null
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Failed to update session.')
      setSaveBookingLoading(false)
      return
    }
    if (requestedStoredStatus === 'CHECKED_OUT') {
      const fallbackStatuses = Array.isArray(selectedBookedSession?.paymentStatuses) ? selectedBookedSession.paymentStatuses : []
      const paymentStatuses = Array.isArray(updatedBookingFromApi?.paymentStatuses) ? updatedBookingFromApi.paymentStatuses : fallbackStatuses
      const targetStatus = paymentStatuses.find((status: BookingPaymentStatus) => {
        const openBillId = Number(status?.openBillId ?? 0)
        return status?.status === 'UNPAID'
          && !!status?.bookingId
          && (!Number.isInteger(openBillId) || openBillId <= 0)
      }) ?? null
      if (targetStatus) {
        const createdOpenBillId = await createOpenBillForPaymentStatus(targetStatus, { suppressToast: true })
        const resolvedOpenBillId = Number(createdOpenBillId ?? targetStatus?.openBillId ?? 0)
        if (!Number.isInteger(resolvedOpenBillId) || resolvedOpenBillId <= 0) {
          showToast(
            'error',
            locale === 'sl'
              ? 'Termin je zaključen, odprtega računa pa ni bilo mogoče ustvariti. Poskusite ponovno v Plačilih.'
              : 'Session is checked out, but open invoice could not be created. Please try again from Payments.',
          )
        }
      }
    }
    // Create repeated future bookings if repeats is enabled
    if (selectedBookedSession.repeats) {
      const baseStart = new Date(selectedBookedSession.startTime)
      const baseEnd = new Date(selectedBookedSession.endTime)
      const durationMs = baseEnd.getTime() - baseStart.getTime()
      const repeatInterval = selectedBookedSession.repeatInterval ?? 1
      const repeatUnit = selectedBookedSession.repeatUnit ?? 'weeks'
      const repeatEndType = selectedBookedSession.repeatEndType ?? 'after'
      const repeatEndCount = selectedBookedSession.repeatEndCount ?? 5
      const repeatEndDate = selectedBookedSession.repeatEndDate ?? ''
      const dayNamesArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const targetDayIndex = repeatUnit === 'weeks' ? dayNamesArr.indexOf(selectedBookedSession.repeatDay ?? dayNamesArr[baseStart.getDay()]) : -1

      const maxOccurrences = repeatEndType === 'after' ? repeatEndCount : 200
      const endDateMs = repeatEndType === 'on' && repeatEndDate ? new Date(repeatEndDate + 'T23:59:59').getTime() : Infinity

      let cursor = new Date(baseStart)
      if (repeatUnit === 'weeks' && targetDayIndex >= 0 && cursor.getDay() !== targetDayIndex) {
        let diff = targetDayIndex - cursor.getDay()
        if (diff < 0) diff += 7
        cursor.setDate(cursor.getDate() + diff)
      }
      // Skip the first occurrence (that's the current session being edited)
      if (repeatUnit === 'days') cursor.setDate(cursor.getDate() + repeatInterval)
      else if (repeatUnit === 'weeks') cursor.setDate(cursor.getDate() + 7 * repeatInterval)
      else if (repeatUnit === 'months') cursor.setMonth(cursor.getMonth() + repeatInterval)

      for (let i = 1; i < maxOccurrences && cursor.getTime() <= endDateMs; i++) {
        const s = new Date(cursor)
        const e = new Date(s.getTime() + durationMs)
        try {
          await api.post('/bookings', {
            ...bookedPayloadClients,
            ...(bookedIsGroupSession ? { groupId: selectedBookedSession.groupId } : {}),
            consultantId: selectedBookedSession.consultant?.id ?? null,
            startTime: toLocalDateTimeString(s),
            endTime: toLocalDateTimeString(e),
            spaceId: selectedBookedSession.space?.id ?? null,
            typeId: selectedBookedSession.type?.id ?? null,
            notes: selectedBookedSession.notes ?? '',
            meetingLink: online ? (selectedBookedSession.meetingLink ?? null) : null,
            online,
            meetingProvider: online ? (selectedBookedSession.meetingProvider || 'zoom') : null,
            groupEmailOverride: null,
            groupBillingCompanyIdOverride: null,
            bookingStatus: requestedStoredStatus,
            payees: normalizeBookingPayeesForPayload(resolvedClientIds, selectedBookedSession.payees, bookedBookingPayeeLinkedCompany?.id),
          }, { headers: { 'X-Skip-Conflict-Toast': 'true' } })
        } catch { /* skip failed occurrences */ }
        if (repeatUnit === 'days') cursor.setDate(cursor.getDate() + repeatInterval)
        else if (repeatUnit === 'weeks') cursor.setDate(cursor.getDate() + 7 * repeatInterval)
        else if (repeatUnit === 'months') cursor.setMonth(cursor.getMonth() + repeatInterval)
      }
    }
    setSelectedBookedSession(null)
    setBookedStatusMenuOpen(false)
    notifyBookingAndClientRecordsChanged()
    load()
    leaveCompactFormRouteIfNeeded()
    setSaveBookingLoading(false)
  }

  const saveBookedPaymentManager = useCallback(async () => {
    const clientSaved = await saveSelectedBookedPaymentClientDraft()
    if (!clientSaved) return
    if (!paymentManagerIsNewBooking && bookedSessionIsGroup && bookedSessionResolvedGroup?.id) {
      const nextGroupName = String(bookedPaymentGroupNameDraft || '').trim()
      const currentGroupName = String(bookedSessionResolvedGroup?.name || '').trim()
      if (!nextGroupName) {
        showToast('error', locale === 'sl' ? 'Ime skupine je obvezno.' : 'Group name is required.')
        return
      }
      if (nextGroupName !== currentGroupName) {
        const payload = {
          name: nextGroupName,
          email: String(bookedSessionResolvedGroup?.email || '').trim() || null,
          billingCompanyId: bookedSessionResolvedGroup?.billingCompany?.id ?? null,
          batchPaymentEnabled: Boolean(bookedSessionResolvedGroup?.batchPaymentEnabled),
          individualPaymentEnabled: bookedSessionResolvedGroup?.individualPaymentEnabled !== false,
        }
        const groupResponse = await api.put(`/groups/${bookedSessionResolvedGroup.id}`, payload)
        const updatedGroup = groupResponse?.data || { ...bookedSessionResolvedGroup, ...payload }
        setMeta((prev: any) => ({
          ...prev,
          groups: Array.isArray(prev?.groups)
            ? prev.groups.map((group: any) => (Number(group?.id) === Number(updatedGroup?.id) ? { ...group, ...updatedGroup } : group))
            : prev?.groups,
        }))
      }
    }
    if (paymentManagerIsNewBooking) {
      setBookedPaymentMenuOpen(false)
      return
    }
    await updateBookedSession()
    setBookedPaymentMenuOpen(false)
  }, [bookedPaymentGroupNameDraft, bookedSessionIsGroup, bookedSessionResolvedGroup, locale, paymentManagerIsNewBooking, saveSelectedBookedPaymentClientDraft, showToast, updateBookedSession])

  const updatePersonalBlock = async () => {
    if (!selectedPersonalBlock?.id) return
    if (!personalModuleEnabled) {
      setSelectedPersonalBlock(null)
      showToast('error', t('calendarErrorPersonalModuleDisabled'))
      return
    }
    await api.put(`/bookings/personal-blocks/${selectedPersonalBlock.id}`, {
      startTime: selectedPersonalBlock.startTime,
      endTime: selectedPersonalBlock.endTime,
      task: selectedPersonalBlock.task,
      notes: selectedPersonalBlock.notes || '',
    })
    setSelectedPersonalBlock(null)
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const deletePersonalBlock = async () => {
    if (!selectedPersonalBlock?.id) return
    if (!personalModuleEnabled) {
      setSelectedPersonalBlock(null)
      return
    }
    await api.delete(`/bookings/personal-blocks/${selectedPersonalBlock.id}`)
    setSelectedPersonalBlock(null)
    load()
    leaveCompactFormRouteIfNeeded()
  }

  const closeTodoModal = () => {
    setSelectedTodo(null)
    leaveCompactFormRouteIfNeeded()
  }
  const updateTodo = async () => {
    if (!selectedTodo?.id) return
    if (!todosModuleEnabled) {
      setSelectedTodo(null)
      showToast('error', t('calendarErrorTodosModuleDisabled'))
      return
    }
    await api.put(`/bookings/todos/${selectedTodo.id}`, {
      startTime: selectedTodo.startTime,
      task: selectedTodo.task,
      notes: selectedTodo.notes || '',
    })
    setSelectedTodo(null)
    load()
    window.dispatchEvent(new Event('todos-updated'))
    leaveCompactFormRouteIfNeeded()
  }
  const deleteTodo = async () => {
    if (!selectedTodo?.id) return
    if (!todosModuleEnabled) {
      setSelectedTodo(null)
      return
    }
    await api.delete(`/bookings/todos/${selectedTodo.id}`)
    setSelectedTodo(null)
    load()
    window.dispatchEvent(new Event('todos-updated'))
    leaveCompactFormRouteIfNeeded()
  }

  /** When moving across consultant columns, pass targetConsultantId (null = unassigned) so overlaps match the destination pool. */
  const findOverlappingBooked = (
    newStart: Date,
    newEnd: Date,
    excludeId: number,
    targetConsultantId?: number | null,
    draggedBreakMinutes = 0,
  ) => {
    const bookedList = calendarData.booked || []
    const dragged = bookedList.find((b: any) => b.id === excludeId)
    const sourceCid = dragged?.consultant?.id ?? null
    const effectiveCid = targetConsultantId !== undefined ? targetConsultantId : sourceCid

    const booked =
      effectiveCid == null
        ? bookedList.filter((b: any) => !b.consultant?.id)
        : bookedList.filter((b: any) => b.consultant?.id === effectiveCid)

    const draggedBusyEndMs = newEnd.getTime() + Math.max(0, Number(draggedBreakMinutes) || 0) * 60000
    return booked.find((b: any) => {
      if (b.id === excludeId) return false
      const bStartMs = new Date(b.startTime).getTime()
      const bEndMs = getBookingBusyEndMs(b)
      return newStart.getTime() < bEndMs && draggedBusyEndMs > bStartMs
    })
  }

  const performMove = async (
    booking: any,
    newStartStr: string,
    newEndStr: string,
    allowPersonalBlockOverlap = false,
    spaceIdOverride?: number | null,
    consultantIdOverride?: number | null,
  ) => {
    const currentStoredStatus = normalizeStoredBookingStatus(booking?.bookingStatus)
    const moveStatusValidation = getStatusTransitionValidation(
      newStartStr,
      newEndStr,
      booking?.bookingStatus,
      currentStoredStatus,
    )
    if (!moveStatusValidation.allowed) {
      showToast('error', formatInvalidStatusTransitionMessage(moveStatusValidation.reason, currentStoredStatus))
      const blockedError: any = new Error('BOOKING_STATUS_TRANSITION_BLOCKED')
      blockedError.localStatusValidation = true
      throw blockedError
    }
    const online = Boolean(
      booking.online ?? (booking.meetingLink != null && String(booking.meetingLink).trim() !== ''),
    )
    const resolvedSpaceId = spaceIdOverride !== undefined ? spaceIdOverride : (booking.space?.id ?? null)
    let resolvedConsultantId = consultantIdOverride !== undefined ? consultantIdOverride : (booking.consultant?.id ?? null)
    if (typeof resolvedConsultantId === 'number' && !Number.isFinite(resolvedConsultantId)) {
      resolvedConsultantId = booking.consultant?.id ?? null
    }
    await api.put(`/bookings/${booking.id}`, {
      clientId: (booking.clients?.[0]?.id ?? booking.client?.id),
      clientIds: (booking.clients || []).map((c: any) => c.id),
      consultantId: resolvedConsultantId,
      startTime: newStartStr,
      endTime: newEndStr,
      spaceId: resolvedSpaceId,
      typeId: booking.type?.id ?? null,
      notes: booking.notes ?? '',
      meetingLink: online ? (booking.meetingLink ?? null) : null,
      online,
      meetingProvider: online ? (booking.meetingProvider || 'zoom') : null,
      groupEmailOverride: null,
      groupBillingCompanyIdOverride: null,
      ...(allowPersonalBlockOverlap ? { allowPersonalBlockOverlap: true } : {}),
    })
  }

  const performMovePersonal = async (block: any, newStartStr: string, newEndStr: string) => {
    if (!personalModuleEnabled) throw new Error('PERSONAL_MODULE_DISABLED')
    await api.put(`/bookings/personal-blocks/${block.id}`, {
      startTime: newStartStr,
      endTime: newEndStr,
      task: block.task,
      notes: block.notes || '',
    })
  }

  const performMoveTodo = async (todo: any, newStartStr: string) => {
    if (!todosModuleEnabled) throw new Error('TODOS_MODULE_DISABLED')
    await api.put(`/bookings/todos/${todo.id}`, {
      startTime: newStartStr,
      task: todo.task,
      notes: todo.notes || '',
    })
  }

  const isHttpConflict = (err: any) => Number(err?.response?.status) === 409 || err?.localStatusValidation === true

  const handleEventDrop = async (info: any) => {
    isDraggingEventRef.current = false
    dragEdgeSideRef.current = 0
    calendarSwipeStartRef.current = null
    const props = info.event.extendedProps
    const newStart = info.event.start!
    const partialOriginalStartMs = props.partialContinuationSegment
      ? new Date(String(props.partialOriginalStart || props.startTime || '')).getTime()
      : NaN
    const partialOriginalEndMs = props.partialContinuationSegment
      ? new Date(String(props.partialOriginalEnd || props.endTime || '')).getTime()
      : NaN
    const partialOriginalDurationMs =
      Number.isFinite(partialOriginalStartMs) && Number.isFinite(partialOriginalEndMs) && partialOriginalEndMs > partialOriginalStartMs
        ? partialOriginalEndMs - partialOriginalStartMs
        : NaN
    const newStartStr = toLocalDateTimeString(newStart)

    // Extract resource change info early so all checks below can use the TARGET resource
    const rawResourceId = info.newResource?.id ?? info.event.getResources?.()[0]?.id
    const newResourceId =
      rawResourceId !== undefined && rawResourceId !== null ? String(rawResourceId) : undefined

    const spaceIdOverride =
      spacesUseResourceColumns && newResourceId !== undefined
        ? newResourceId === SPACE_RESOURCE_UNASSIGNED_ID
          ? null
          : (() => {
              const n = Number(newResourceId)
              return Number.isFinite(n) ? n : undefined
            })()
        : undefined
    const consultantIdOverride: number | null | undefined =
      bookingsUseResourceColumns && newResourceId !== undefined
        ? newResourceId === CONSULTANT_RESOURCE_UNASSIGNED_ID
          ? null
          : (() => {
              const n = Number(newResourceId)
              return Number.isFinite(n) ? n : undefined
            })()
        : undefined

    if (props.kind === 'personal') {
      if (!personalModuleEnabled) {
        info.revert()
        return
      }
      const newEnd = Number.isFinite(partialOriginalDurationMs)
        ? new Date(newStart.getTime() + partialOriginalDurationMs)
        : (info.event.end || new Date(newStart.getTime() + 60 * 60000))
      const newEndStr = toLocalDateTimeString(newEnd)
      setCalendarData((prev: any) => ({ ...prev, personal: (prev.personal || []).map((p: any) => p.id === props.id ? { ...p, startTime: newStartStr, endTime: newEndStr } : p) }))
      if (selectedPersonalBlock?.id === props.id) setSelectedPersonalBlock({ ...selectedPersonalBlock, startTime: newStartStr, endTime: newEndStr })
      cleanupDragArtifacts()
      try {
        await performMovePersonal(props, newStartStr, newEndStr)
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({ ...prev, personal: (prev.personal || []).map((p: any) => p.id === props.id ? { ...p, startTime: props.startTime, endTime: props.endTime } : p) }))
        info.revert()
      }
      return
    }

    if (props.kind === 'todo') {
      if (!todosModuleEnabled) {
        info.revert()
        return
      }
      const newEnd = info.event.end || new Date(newStart.getTime() + 30 * 60 * 1000)
      const newEndStr = toLocalDateTimeString(newEnd)
      setCalendarData((prev: any) => ({
        ...prev,
        todos: (prev.todos || []).map((t: any) =>
          t.id === props.id ? { ...t, startTime: newStartStr, endTime: newEndStr } : t,
        ),
      }))
      setSelectedTodo((st: any) =>
        st?.id === props.id ? { ...st, startTime: newStartStr, endTime: newEndStr } : st,
      )
      cleanupDragArtifacts()
      try {
        await performMoveTodo(props, newStartStr)
        window.dispatchEvent(new Event('todos-updated'))
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          todos: (prev.todos || []).map((t: any) =>
            t.id === props.id ? { ...t, startTime: props.startTime, endTime: props.endTime } : t,
          ),
        }))
        setSelectedTodo((st: any) =>
          st?.id === props.id ? { ...st, startTime: props.startTime, endTime: props.endTime } : st,
        )
        info.revert()
      }
      return
    }

    if (props.kind !== 'booked') return

    const typeDuration = props.type?.durationMinutes ?? fallbackSessionLengthMinutes ?? 60
    const newEnd = Number.isFinite(partialOriginalDurationMs)
      ? new Date(newStart.getTime() + partialOriginalDurationMs)
      : (info.event.end || new Date(newStart.getTime() + Number(typeDuration) * 60000))
    const newEndStr = toLocalDateTimeString(newEnd)

    const typeBreakMinutes = props.type?.breakMinutes ?? getTypeBreakMinutes(props.type?.id)
    const overlapping = findOverlappingBooked(newStart, newEnd, props.id, consultantIdOverride, typeBreakMinutes)
    if (overlapping) {
      cleanupDragArtifacts()
      setConfirmSwap({ dragged: props, target: overlapping, revert: info.revert })
      return
    }

    const targetConsultantId = consultantIdOverride !== undefined ? consultantIdOverride : (props.consultant?.id ?? null)

    if (
      targetConsultantId != null &&
      Number.isFinite(targetConsultantId) &&
      findOverlappingPersonalBlocksForBooking(newStartStr, newEndStr, targetConsultantId, typeBreakMinutes).length > 0
    ) {
      cleanupDragArtifacts()
      info.revert()
      setConfirmBookedPersonalOverlap({ type: 'move', booking: props, newStartStr, newEndStr, spaceIdOverride, consultantIdOverride })
      return
    }

    if (
      targetConsultantId != null &&
      !isBookedMoveIntervalBookable(
        newStartStr,
        newEndStr,
        targetConsultantId,
        typeBreakMinutes,
        (targetConsultantId === (props.consultant?.id ?? null))
          ? { start: props.startTime, end: props.endTime }
          : undefined,
      )
    ) {
      cleanupDragArtifacts()
      info.revert()
      setConfirmNonBookableMove({
        booking: props,
        newStartStr,
        newEndStr,
        spaceIdOverride,
        consultantIdOverride,
        allowPersonalBlockOverlap: true,
      })
      return
    }

    const mapBookingAfterDrop = (b: any) => {
      if (b.id !== props.id) return b
      let next = { ...b, startTime: newStartStr, endTime: newEndStr }
      if (spaceIdOverride !== undefined) {
        const sid = spaceIdOverride
        const spaceObj =
          sid == null ? null : (metaSpaces).find((s: any) => s.id === sid) ?? { id: sid, name: '' }
        next = { ...next, space: spaceObj }
      }
      if (consultantIdOverride !== undefined) {
        const consultantObj = consultantIdOverride == null
          ? null
          : metaUsers.find((u: any) => u.id === consultantIdOverride) ?? { id: consultantIdOverride, firstName: '', lastName: '' }
        next = { ...next, consultant: consultantObj }
      }
      return next
    }

    setCalendarData((prev: any) => ({
      ...prev,
      booked: (prev.booked || []).map((b: any) => mapBookingAfterDrop(b)),
    }))
    cleanupDragArtifacts()
    try {
      await performMove(props, newStartStr, newEndStr, false, spaceIdOverride, consultantIdOverride)
    } catch (e) {
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) =>
          b.id === props.id
            ? { ...b, startTime: props.startTime, endTime: props.endTime, space: props.space, consultant: props.consultant }
            : b,
        ),
      }))
      info.revert()
      if (isHttpConflict(e)) {
        await loadCalendarRangeOnly(true)
        return
      }
      console.error(e)
    }
  }

  const handleEventResize = async (info: any) => {
    const props = info.event.extendedProps
    if (props.kind === 'personal') {
      if (!personalModuleEnabled) {
        info.revert()
        return
      }
      const newStart = info.event.start!
      const newEnd = info.event.end || new Date(newStart.getTime() + 60 * 60000)
      const newStartStr = toLocalDateTimeString(newStart)
      const newEndStr = toLocalDateTimeString(newEnd)
      setCalendarData((prev: any) => ({
        ...prev,
        personal: (prev.personal || []).map((p: any) =>
          p.id === props.id ? { ...p, startTime: newStartStr, endTime: newEndStr } : p,
        ),
      }))
      if (selectedPersonalBlock?.id === props.id) {
        setSelectedPersonalBlock({ ...selectedPersonalBlock, startTime: newStartStr, endTime: newEndStr })
      }
      try {
        await performMovePersonal(props, newStartStr, newEndStr)
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          personal: (prev.personal || []).map((p: any) =>
            p.id === props.id ? { ...p, startTime: props.startTime, endTime: props.endTime } : p,
          ),
        }))
        if (selectedPersonalBlock?.id === props.id) {
          setSelectedPersonalBlock({ ...selectedPersonalBlock, startTime: props.startTime, endTime: props.endTime })
        }
        info.revert()
      }
      return
    }
    if (props.kind !== 'booked') return
    const newStart = info.event.start!
    const typeDuration = props.type?.durationMinutes ?? fallbackSessionLengthMinutes ?? 60
    const newEnd = info.event.end || new Date(newStart.getTime() + Number(typeDuration) * 60000)
    const newStartStr = toLocalDateTimeString(newStart)
    const newEndStr = toLocalDateTimeString(newEnd)

    const typeBreakMinutes = props.type?.breakMinutes ?? getTypeBreakMinutes(props.type?.id)
    const overlapping = findOverlappingBooked(newStart, newEnd, props.id, undefined, typeBreakMinutes)
    if (overlapping) {
      setConfirmSwap({ dragged: props, target: overlapping, revert: info.revert })
      return
    }

    const consultantId = props.consultant?.id
    if (
      Number.isFinite(consultantId) &&
      findOverlappingPersonalBlocksForBooking(newStartStr, newEndStr, consultantId, typeBreakMinutes).length > 0
    ) {
      info.revert()
      setConfirmBookedPersonalOverlap({ type: 'move', booking: props, newStartStr, newEndStr })
      return
    }

    if (
      !isBookedMoveIntervalBookable(
        newStartStr,
        newEndStr,
        consultantId,
        typeBreakMinutes,
        { start: props.startTime, end: props.endTime },
      )
    ) {
      info.revert()
      setConfirmNonBookableMove({ booking: props, newStartStr, newEndStr, allowPersonalBlockOverlap: true })
      return
    }

    // Optimistic update before await so the re-render has correct times immediately (no flash)
    setCalendarData((prev: any) => ({ ...prev, booked: (prev.booked || []).map((b: any) => b.id === props.id ? { ...b, startTime: newStartStr, endTime: newEndStr } : b) }))
    try {
      await performMove(props, newStartStr, newEndStr)
    } catch (e) {
      setCalendarData((prev: any) => ({ ...prev, booked: (prev.booked || []).map((b: any) => b.id === props.id ? { ...b, startTime: props.startTime, endTime: props.endTime } : b) }))
      info.revert()
      if (isHttpConflict(e)) {
        await loadCalendarRangeOnly(true)
        return
      }
      console.error(e)
    }
  }

  const confirmSwapSessions = async () => {
    if (!confirmSwap) return
    const { dragged, target } = confirmSwap
    try {
      await api.post('/bookings/swap', { firstId: dragged.id, secondId: target.id })
      setConfirmSwap(null)
      load()
    } catch (e) {
      console.error(e)
      confirmSwap.revert()
      setConfirmSwap(null)
    }
  }

  const cancelSwap = () => {
    if (confirmSwap) {
      confirmSwap.revert()
      setConfirmSwap(null)
    }
  }

  const cancelBookedPersonalOverlap = () => setConfirmBookedPersonalOverlap(null)

  const cancelNonBookableMove = () => setConfirmNonBookableMove(null)

  const confirmNonBookableMoveYes = async () => {
    const c = confirmNonBookableMove
    if (!c) return
    setConfirmNonBookableMove(null)
    try {
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) => {
          if (b.id !== c.booking.id) return b
          let next = { ...b, startTime: c.newStartStr, endTime: c.newEndStr }
          if (c.consultantIdOverride !== undefined) {
            next = { ...next, consultant: c.consultantIdOverride == null ? null : metaUsers.find((u: any) => u.id === c.consultantIdOverride) ?? { id: c.consultantIdOverride, firstName: '', lastName: '' } }
          }
          if (c.spaceIdOverride !== undefined) {
            next = { ...next, space: c.spaceIdOverride == null ? null : metaSpaces.find((s: any) => s.id === c.spaceIdOverride) ?? { id: c.spaceIdOverride, name: '' } }
          }
          return next
        }),
      }))
      await performMove(c.booking, c.newStartStr, c.newEndStr, !!c.allowPersonalBlockOverlap, c.spaceIdOverride, c.consultantIdOverride)
      load()
    } catch (e) {
      if (!isHttpConflict(e)) {
        console.error(e)
      }
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) =>
          b.id === c.booking.id ? { ...b, startTime: c.booking.startTime, endTime: c.booking.endTime, consultant: c.booking.consultant, space: c.booking.space } : b,
        ),
      }))
    }
  }

  const performEditNonBookableUpdate = async (editPayload: ConfirmNonBookableEditPayload) => {
    const editClientIds = Array.isArray(editPayload.clientIds)
      ? editPayload.clientIds.filter((id: any) => Number.isFinite(id) && Number(id) > 0).map((id: any) => Number(id))
      : []
    const editGroupId = typeof editPayload.groupId === 'number' ? editPayload.groupId : null
    const editIsGroupSession = editGroupId != null && Number.isFinite(editGroupId) && editGroupId > 0
    const payloadClients =
      editIsGroupSession && editClientIds.length === 0
        ? { clientIds: [] as number[] }
        : { clientId: editClientIds[0], clientIds: editClientIds }
    if (!!editPayload.online && editPayload.consultantId === user.id) {
      const provider = editPayload.meetingProvider || 'zoom'
      const needsConnect = provider === 'google' ? googleConnected === false : zoomConnected === false
      if (needsConnect) {
        sessionStorage.setItem(PENDING_BOOKING_EDIT_KEY, JSON.stringify({
          id: editPayload.id,
          clientId: editClientIds[0] ?? null,
          clientIds: editClientIds,
          groupId: editPayload.groupId ?? null,
          consultantId: editPayload.consultantId,
          startTime: editPayload.startTime,
          endTime: editPayload.endTime,
          spaceId: editPayload.spaceId ?? null,
          typeId: editPayload.typeId ?? null,
          notes: editPayload.notes ?? '',
          meetingProvider: provider,
          bookingStatus: editPayload.bookingStatus ?? 'RESERVED',
          payees: editPayload.payees ?? [],
          allowPersonalBlockOverlap: true,
        }))
        if (provider === 'google') await connectGoogle()
        else await connectZoom()
        return
      }
    }
    try {
      setSaveBookingLoading(true)
      const editStatus = normalizeStoredBookingStatus(editPayload.bookingStatus ?? 'RESERVED')
      const editStatusValidation = getStatusTransitionValidation(
        editPayload.startTime,
        editPayload.endTime,
        selectedBookedSession?.bookingStatus ?? editStatus,
        editStatus,
      )
      if (!editStatusValidation.allowed) {
        showToast('error', formatInvalidStatusTransitionMessage(editStatusValidation.reason, editStatus))
        return
      }
      await api.put(`/bookings/${editPayload.id}`, {
        ...payloadClients,
        consultantId: editPayload.consultantId,
        startTime: editPayload.startTime,
        endTime: editPayload.endTime,
        spaceId: editPayload.spaceId,
        typeId: editPayload.typeId,
        notes: editPayload.notes,
        meetingLink: editPayload.online ? editPayload.meetingLink : null,
        online: !!editPayload.online,
        meetingProvider: editPayload.online ? (editPayload.meetingProvider || 'zoom') : null,
        groupEmailOverride: null,
        groupBillingCompanyIdOverride: null,
        bookingStatus: editStatus,
        payees: editPayload.payees ?? [],
        allowPersonalBlockOverlap: true,
      })
      setSelectedBookedSession(null)
      setBookedStatusMenuOpen(false)
      notifyBookingAndClientRecordsChanged()
      load()
      leaveCompactFormRouteIfNeeded()
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Failed to update session.')
    } finally {
      setSaveBookingLoading(false)
    }
  }

  const confirmNonBookableYes = async () => {
    const c = confirmNonBookable
    if (!c) return
    setConfirmNonBookable(null)
    if (c.mode === 'edit') {
      await performEditNonBookableUpdate(c.editPayload)
      return
    }
    await saveBooking(false, true)
  }

  const confirmBookedPersonalOverlapYes = async () => {
    const c = confirmBookedPersonalOverlap
    if (!c) return
    setConfirmBookedPersonalOverlap(null)
    if (c.type === 'create') {
      await saveBooking(false, false, true)
      return
    }
    if (c.type === 'edit') {
      await updateBookedSession(true, true)
      return
    }
    const moveSpaceId = c.type === 'move' ? c.spaceIdOverride : undefined
    const moveCid = c.type === 'move' ? c.consultantIdOverride : undefined
    const targetCid = moveCid !== undefined ? moveCid : (c.booking.consultant?.id ?? null)
    try {
      if (targetCid != null && !isBookedMoveIntervalBookable(c.newStartStr, c.newEndStr, targetCid)) {
        setConfirmNonBookableMove({
          booking: c.booking,
          newStartStr: c.newStartStr,
          newEndStr: c.newEndStr,
          allowPersonalBlockOverlap: true,
          spaceIdOverride: moveSpaceId,
          consultantIdOverride: moveCid,
        })
        return
      }
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) => {
          if (b.id !== c.booking.id) return b
          let next = { ...b, startTime: c.newStartStr, endTime: c.newEndStr }
          if (moveCid !== undefined) {
            next = { ...next, consultant: moveCid == null ? null : metaUsers.find((u: any) => u.id === moveCid) ?? { id: moveCid, firstName: '', lastName: '' } }
          }
          if (moveSpaceId !== undefined) {
            next = { ...next, space: moveSpaceId == null ? null : metaSpaces.find((s: any) => s.id === moveSpaceId) ?? { id: moveSpaceId, name: '' } }
          }
          return next
        }),
      }))
      await performMove(c.booking, c.newStartStr, c.newEndStr, true, moveSpaceId, moveCid)
      load()
    } catch (e) {
      if (!isHttpConflict(e)) {
        console.error(e)
      }
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) =>
          b.id === c.booking.id ? { ...b, startTime: c.booking.startTime, endTime: c.booking.endTime, consultant: c.booking.consultant, space: c.booking.space } : b,
        ),
      }))
    }
  }


  const resolveOverlapDropTarget = useCallback((clientX: number, clientY: number) => {
    if (!isWebTimeGridLikeView(view)) return null
    const rawEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (!rawEl) return null
    const dayCol = rawEl.closest('.fc-timegrid-col[data-date]') as HTMLElement | null
    if (!dayCol?.dataset?.date) return null
    const shell = (calendarRef.current as any)?.el as HTMLElement | undefined
    const slotsEl = shell?.querySelector?.('.fc-timegrid-slots') as HTMLElement | null
      || document.querySelector('.calendar-fc-shell .fc-timegrid-slots') as HTMLElement | null
    if (!slotsEl) return null
    const slotsRect = slotsEl.getBoundingClientRect()
    if (slotsRect.height <= 0) return null
    const minMinutes = whWindowParseHm(slotMinTime)
    const maxMinutes = whWindowParseHm(slotMaxTime)
    const totalMinutes = Math.max(15, maxMinutes - minMinutes)
    const localY = Math.min(Math.max(clientY - slotsRect.top, 0), slotsRect.height)
    const rawMinutes = minMinutes + (localY / slotsRect.height) * totalMinutes
    const snappedMinutes = Math.min(maxMinutes - 15, Math.max(minMinutes, Math.round(rawMinutes / 15) * 15))
    const [year, month, day] = String(dayCol.dataset.date).split('-').map((part) => Number(part))
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    const start = new Date(year, month - 1, day, 0, 0, 0, 0)
    start.setMinutes(snappedMinutes)
    const resourceEl = rawEl.closest('[data-resource-id]') as HTMLElement | null
    const resourceId = resourceEl?.dataset?.resourceId || dayCol.dataset.resourceId || undefined
    return { start, resourceId }
  }, [slotMaxTime, slotMinTime, view])

  const setOverlapSessionAsMain = useCallback((item: any) => {
    if (!item?.overlapGroupId || !item?.eventId) return
    setOverlapMainOverride((prev) => ({ ...prev, [String(item.overlapGroupId)]: String(item.eventId) }))
    setOverlapDrawerGroupId(String(item.overlapGroupId))
  }, [])

  const overlapTimeInputValue = useCallback((value: string | undefined | null) => {
    if (!value) return ''
    return normalizeToLocalDateTime(String(value)).slice(0, 16)
  }, [normalizeToLocalDateTime])

  const beginOverlapInlineTimeEdit = useCallback((item: any) => {
    const eventId = String(item?.eventId || `${item?.kind || 'session'}-${item?.id || ''}`)
    setOverlapInlineTimeEdit({
      eventId,
      start: overlapTimeInputValue(item?.start || item?.extendedProps?.startTime),
      end: overlapTimeInputValue(item?.end || item?.extendedProps?.endTime),
      saving: false,
      error: null,
    })
  }, [overlapTimeInputValue])

  const saveOverlapInlineTimeEdit = useCallback(async (item: any) => {
    const eventId = String(item?.eventId || `${item?.kind || 'session'}-${item?.id || ''}`)
    if (!overlapInlineTimeEdit || overlapInlineTimeEdit.eventId !== eventId) return
    const newStartStr = normalizeToLocalDateTime(overlapInlineTimeEdit.start)
    const newEndStr = normalizeToLocalDateTime(overlapInlineTimeEdit.end)
    const newStart = new Date(newStartStr)
    const newEnd = new Date(newEndStr)
    if (!Number.isFinite(newStart.getTime()) || !Number.isFinite(newEnd.getTime()) || newEnd.getTime() <= newStart.getTime()) {
      setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId
        ? { ...prev, error: locale === 'sl' ? 'Vnesite veljaven začetni in končni čas.' : 'Enter a valid start and end time.' }
        : prev)
      return
    }

    const original = item?.extendedProps || item
    const originalStart = original?.startTime || normalizeToLocalDateTime(String(item?.start || ''))
    const originalEnd = original?.endTime || normalizeToLocalDateTime(String(item?.end || ''))
    if (newStartStr === originalStart && newEndStr === originalEnd) {
      setOverlapInlineTimeEdit(null)
      return
    }

    setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, saving: true, error: null } : prev)

    if (item?.kind === 'personal') {
      setCalendarData((prev: any) => ({
        ...prev,
        personal: (prev.personal || []).map((p: any) => p.id === original.id ? { ...p, startTime: newStartStr, endTime: newEndStr } : p),
      }))
      setSelectedPersonalBlock((prev: any) => prev?.id === original.id ? { ...prev, startTime: newStartStr, endTime: newEndStr } : prev)
      try {
        await performMovePersonal(original, newStartStr, newEndStr)
        setOverlapInlineTimeEdit(null)
        load()
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          personal: (prev.personal || []).map((p: any) => p.id === original.id ? { ...p, startTime: originalStart, endTime: originalEnd } : p),
        }))
        setSelectedPersonalBlock((prev: any) => prev?.id === original.id ? { ...prev, startTime: originalStart, endTime: originalEnd } : prev)
        setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId
          ? { ...prev, saving: false, error: locale === 'sl' ? 'Časa ni bilo mogoče shraniti.' : 'Could not save the time.' }
          : prev)
      }
      return
    }

    if (item?.kind === 'todo') {
      setCalendarData((prev: any) => ({
        ...prev,
        todos: (prev.todos || []).map((todo: any) => todo.id === original.id ? { ...todo, startTime: newStartStr, endTime: newEndStr } : todo),
      }))
      setSelectedTodo((prev: any) => prev?.id === original.id ? { ...prev, startTime: newStartStr, endTime: newEndStr } : prev)
      try {
        await performMoveTodo(original, newStartStr)
        setOverlapInlineTimeEdit(null)
        window.dispatchEvent(new Event('todos-updated'))
        load()
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          todos: (prev.todos || []).map((todo: any) => todo.id === original.id ? { ...todo, startTime: originalStart, endTime: originalEnd } : todo),
        }))
        setSelectedTodo((prev: any) => prev?.id === original.id ? { ...prev, startTime: originalStart, endTime: originalEnd } : prev)
        setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId
          ? { ...prev, saving: false, error: locale === 'sl' ? 'Časa ni bilo mogoče shraniti.' : 'Could not save the time.' }
          : prev)
      }
      return
    }

    if (item?.kind !== 'booked') return
    const booking = original
    const typeBreakMinutes = booking.type?.breakMinutes ?? getTypeBreakMinutes(booking.type?.id)
    const overlapping = findOverlappingBooked(newStart, newEnd, booking.id, undefined, typeBreakMinutes)
    if (overlapping) {
      setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, saving: false } : prev)
      setConfirmSwap({ dragged: booking, target: overlapping, revert: () => undefined })
      return
    }

    const consultantId = booking.consultant?.id
    if (
      Number.isFinite(consultantId) &&
      findOverlappingPersonalBlocksForBooking(newStartStr, newEndStr, consultantId, typeBreakMinutes).length > 0
    ) {
      setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, saving: false } : prev)
      setConfirmBookedPersonalOverlap({ type: 'move', booking, newStartStr, newEndStr })
      return
    }

    if (
      !isBookedMoveIntervalBookable(
        newStartStr,
        newEndStr,
        consultantId,
        typeBreakMinutes,
        { start: booking.startTime, end: booking.endTime },
      )
    ) {
      setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, saving: false } : prev)
      setConfirmNonBookableMove({ booking, newStartStr, newEndStr, allowPersonalBlockOverlap: true })
      return
    }

    setCalendarData((prev: any) => ({
      ...prev,
      booked: (prev.booked || []).map((b: any) => b.id === booking.id ? { ...b, startTime: newStartStr, endTime: newEndStr } : b),
    }))
    setSelectedBookedSession((prev: any) => prev?.id === booking.id ? { ...prev, startTime: newStartStr, endTime: newEndStr } : prev)
    try {
      await performMove(booking, newStartStr, newEndStr)
      setOverlapInlineTimeEdit(null)
      load()
    } catch (e) {
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) => b.id === booking.id ? { ...b, startTime: originalStart, endTime: originalEnd } : b),
      }))
      setSelectedBookedSession((prev: any) => prev?.id === booking.id ? { ...prev, startTime: originalStart, endTime: originalEnd } : prev)
      if (isHttpConflict(e)) {
        await loadCalendarRangeOnly(true)
      } else {
        console.error(e)
      }
      setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId
        ? { ...prev, saving: false, error: locale === 'sl' ? 'Časa ni bilo mogoče shraniti.' : 'Could not save the time.' }
        : prev)
    }
  }, [findOverlappingBooked, findOverlappingPersonalBlocksForBooking, getTypeBreakMinutes, isBookedMoveIntervalBookable, isHttpConflict, load, loadCalendarRangeOnly, locale, normalizeToLocalDateTime, overlapInlineTimeEdit, performMove, performMovePersonal, performMoveTodo])

  const moveOverlapSessionToCalendar = useCallback(async (item: any, newStart: Date, resourceId?: string) => {
    if (!item?.id || !item?.kind) return
    const oldStart = new Date(item.start)
    const oldEnd = new Date(item.end)
    const durationMs = Math.max(15 * 60 * 1000, oldEnd.getTime() - oldStart.getTime())
    const newEnd = new Date(newStart.getTime() + durationMs)
    const newStartStr = toLocalDateTimeString(newStart)
    const newEndStr = toLocalDateTimeString(newEnd)
    const originalStartStr = normalizeToLocalDateTime(String(item.start || ''))
    const originalResourceId = item.resourceId != null ? String(item.resourceId) : undefined
    if (newStartStr === originalStartStr && String(resourceId || '') === String(originalResourceId || '')) {
      setOverlapSessionAsMain(item)
      return
    }

    if (item.kind === 'personal') {
      const original = item.extendedProps || item
      setCalendarData((prev: any) => ({
        ...prev,
        personal: (prev.personal || []).map((p: any) => p.id === original.id ? { ...p, startTime: newStartStr, endTime: newEndStr } : p),
      }))
      try {
        await performMovePersonal(original, newStartStr, newEndStr)
        setOverlapDrawerGroupId(null)
        load()
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          personal: (prev.personal || []).map((p: any) => p.id === original.id ? { ...p, startTime: original.startTime, endTime: original.endTime } : p),
        }))
      }
      return
    }

    if (item.kind === 'todo') {
      const original = item.extendedProps || item
      setCalendarData((prev: any) => ({
        ...prev,
        todos: (prev.todos || []).map((todo: any) => todo.id === original.id ? { ...todo, startTime: newStartStr, endTime: newEndStr } : todo),
      }))
      try {
        await performMoveTodo(original, newStartStr)
        window.dispatchEvent(new Event('todos-updated'))
        setOverlapDrawerGroupId(null)
        load()
      } catch (e) {
        console.error(e)
        setCalendarData((prev: any) => ({
          ...prev,
          todos: (prev.todos || []).map((todo: any) => todo.id === original.id ? { ...todo, startTime: original.startTime, endTime: original.endTime } : todo),
        }))
      }
      return
    }

    if (item.kind !== 'booked') return
    const booking = item.extendedProps || item
    const spaceIdOverride =
      spacesUseResourceColumns && resourceId !== undefined
        ? resourceId === SPACE_RESOURCE_UNASSIGNED_ID
          ? null
          : (() => {
              const n = Number(resourceId)
              return Number.isFinite(n) ? n : undefined
            })()
        : undefined
    const consultantIdOverride =
      bookingsUseResourceColumns && resourceId !== undefined
        ? resourceId === CONSULTANT_RESOURCE_UNASSIGNED_ID
          ? null
          : (() => {
              const n = Number(resourceId)
              return Number.isFinite(n) ? n : undefined
            })()
        : undefined

    const typeBreakMinutes = booking.type?.breakMinutes ?? getTypeBreakMinutes(booking.type?.id)
    const overlapping = findOverlappingBooked(newStart, newEnd, booking.id, consultantIdOverride, typeBreakMinutes)
    if (overlapping) {
      setConfirmSwap({ dragged: booking, target: overlapping, revert: () => undefined })
      return
    }

    const targetConsultantId = consultantIdOverride !== undefined ? consultantIdOverride : (booking.consultant?.id ?? null)
    if (
      targetConsultantId != null &&
      Number.isFinite(targetConsultantId) &&
      findOverlappingPersonalBlocksForBooking(newStartStr, newEndStr, targetConsultantId, typeBreakMinutes).length > 0
    ) {
      setConfirmBookedPersonalOverlap({ type: 'move', booking, newStartStr, newEndStr, spaceIdOverride, consultantIdOverride })
      return
    }

    if (
      targetConsultantId != null &&
      !isBookedMoveIntervalBookable(
        newStartStr,
        newEndStr,
        targetConsultantId,
        typeBreakMinutes,
        targetConsultantId === (booking.consultant?.id ?? null) ? { start: booking.startTime, end: booking.endTime } : undefined,
      )
    ) {
      setConfirmNonBookableMove({
        booking,
        newStartStr,
        newEndStr,
        spaceIdOverride,
        consultantIdOverride,
        allowPersonalBlockOverlap: true,
      })
      return
    }

    setCalendarData((prev: any) => ({
      ...prev,
      booked: (prev.booked || []).map((b: any) => {
        if (b.id !== booking.id) return b
        let next = { ...b, startTime: newStartStr, endTime: newEndStr }
        if (spaceIdOverride !== undefined) {
          next = { ...next, space: spaceIdOverride == null ? null : metaSpaces.find((s: any) => s.id === spaceIdOverride) ?? { id: spaceIdOverride, name: '' } }
        }
        if (consultantIdOverride !== undefined) {
          next = { ...next, consultant: consultantIdOverride == null ? null : metaUsers.find((u: any) => u.id === consultantIdOverride) ?? { id: consultantIdOverride, firstName: '', lastName: '' } }
        }
        return next
      }),
    }))

    try {
      await performMove(booking, newStartStr, newEndStr, false, spaceIdOverride, consultantIdOverride)
      setOverlapDrawerGroupId(null)
      load()
    } catch (e) {
      if (!isHttpConflict(e)) console.error(e)
      setCalendarData((prev: any) => ({
        ...prev,
        booked: (prev.booked || []).map((b: any) => b.id === booking.id ? { ...b, startTime: booking.startTime, endTime: booking.endTime, consultant: booking.consultant, space: booking.space } : b),
      }))
      if (isHttpConflict(e)) await loadCalendarRangeOnly(true)
    }
  }, [bookingsUseResourceColumns, findOverlappingBooked, findOverlappingPersonalBlocksForBooking, getTypeBreakMinutes, isBookedMoveIntervalBookable, load, loadCalendarRangeOnly, metaSpaces, metaUsers, normalizeToLocalDateTime, performMove, performMovePersonal, performMoveTodo, setOverlapSessionAsMain, spacesUseResourceColumns, toLocalDateTimeString])

  const handleOverlapSidebarDragStart = useCallback((item: any, e: ReactDragEvent<HTMLElement>) => {
    overlapSidebarDragRef.current = item
    setMonthHoverCard(null)
    setOverlapSidebarDraggingId(String(item?.eventId || ''))
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(item?.eventId || 'calendar-overlap-session'))

    const clearSidebarDragState = () => {
      overlapSidebarDragRef.current = null
      setOverlapSidebarDraggingId(null)
    }

    setOverlapInlineTimeEdit(null)

    if (typeof window !== 'undefined') {
      window.addEventListener('dragend', clearSidebarDragState, { once: true })
      window.requestAnimationFrame(() => {
        setOverlapDrawerGroupId(null)
        window.requestAnimationFrame(() => {
          calendarRef.current?.getApi()?.updateSize()
        })
      })
    } else {
      setOverlapDrawerGroupId(null)
    }
  }, [])

  const handleOverlapSidebarDragEnd = useCallback(() => {
    overlapSidebarDragRef.current = null
    setOverlapSidebarDraggingId(null)
  }, [])

  const handleOverlapCalendarDragOver = useCallback((e: ReactDragEvent<HTMLElement>) => {
    if (!overlapSidebarDragRef.current) return
    if (!resolveOverlapDropTarget(e.clientX, e.clientY)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [resolveOverlapDropTarget])

  const handleOverlapCalendarDrop = useCallback((e: ReactDragEvent<HTMLElement>) => {
    const item = overlapSidebarDragRef.current
    if (!item) return
    const target = resolveOverlapDropTarget(e.clientX, e.clientY)
    if (!target) return
    e.preventDefault()
    overlapSidebarDragRef.current = null
    setOverlapSidebarDraggingId(null)
    void moveOverlapSessionToCalendar(item, target.start, target.resourceId)
  }, [moveOverlapSessionToCalendar, resolveOverlapDropTarget])

  const clearDraggingState = useCallback(() => {
    isDraggingEventRef.current = false
    dragEdgeSideRef.current = 0
    cleanupDragArtifacts()
    if (calendarSwipeIsHorizontalRef.current) {
      const wrap = swipeWrapRef.current
      if (wrap) {
        wrap.style.setProperty('--calendar-slide-x', '0px')
        wrap.classList.remove('calendar-sliding-enabled', 'calendar-is-swiping', 'calendar-not-swiping')
      }
      setCalendarIsSwiping(false)
      setCalendarSlideX(0)
      if (calendarSnapshotRef.current) {
        calendarSnapshotRef.current.remove()
        calendarSnapshotRef.current = null
      }
      setSwipeTransitionActive(false)
    }
    calendarSwipeAxisDecidedRef.current = false
    calendarSwipeIsHorizontalRef.current = false
    calendarSwipeStartRef.current = null
  }, [cleanupDragArtifacts])

  const closeBookingSelection = () => {
    setSelection(null)
    setAvailabilitySelection(null)
    setAvailabilityIntent('add')
    setAvailabilityError(null)
    setAvailabilitySaving(false)
    setClientDropdownOpen(false)
    setMeetingProviderPickerOpen(false)
    setMeetingProviderPickerTarget(null)
    setMeetingPickerCancelUnchecksOnline(false)
    setEditingClientSearch(false)
    calendarRef.current?.getApi()?.unselect()
    leaveCompactFormRouteIfNeeded()
  }

  const renderBookingModeTitle = () => {
    const helpId = calendarBookingPanelHelpId({
      hasAvailabilitySelection: Boolean(availabilitySelection),
      todo: Boolean(form.todo),
      personal: Boolean(form.personal),
    })
    const title = helpTitle(t, helpId)
    const tooltip = helpTooltip(t, helpId)
    const aria = helpAria(t, helpId)
    return (
      <span className="booking-title-with-help">
        <span>{title}</span>
        <span className="config-help-hint booking-mode-help" data-tooltip={tooltip} role="img" aria-label={aria} tabIndex={0}>?</span>
      </span>
    )
  }

  const formatTooltipTime = (date: Date | null) => {
    if (!date) return ''
    return date.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  const buildMonthEventTooltip = (event: any) => {
    const props: any = event.extendedProps || {}
    if (props.kind !== 'booked' && props.kind !== 'personal') return null
    if (props.masked) return null
    const start = formatTooltipTime(event.start || null)
    const end = formatTooltipTime(event.end || null)
    const timeRange = start && end ? `${start} - ${end}` : (start || end || '')
    const typeLabel = props.kind === 'personal' ? t('formPersonal') : (props.type?.name || t('calendarEventTypeBooked'))
    const clientLabel = props.kind === 'booked' ? formatBookingClientsLabel(props) : null
    const gidRaw = props.groupId
    const bookingIsGroup =
      groupBookingEnabled &&
      props.kind === 'booked' &&
      gidRaw != null &&
      Number.isFinite(Number(gidRaw)) &&
      Number(gidRaw) > 0
    const consultantId = props.consultant?.id ?? props.consultantId ?? props.ownerId ?? null
    const consultantFromMeta = Number.isFinite(consultantId)
      ? metaUsers.find((u: any) => u.id === consultantId)
      : null
    const consultantLabel = fullName(props.consultant || consultantFromMeta || { firstName: '', lastName: '' }) || '-'
    const meetingLink = props.kind === 'booked' ? (props.meetingLink ?? null) : null
    const meetingProvider = props.kind === 'booked' ? (props.meetingProvider ?? null) : null
    return {
      timeRange,
      typeLabel,
      clientLabel,
      bookingIsGroup,
      consultantLabel,
      meetingLink,
      meetingProvider,
    }
  }

  const buildOverlapItemTooltip = (item: any) => {
    const props: any = item?.extendedProps || item || {}
    if (props.kind !== 'booked' && props.kind !== 'personal') return null
    if (props.masked) return null
    const startDate = item?.start ? new Date(item.start) : null
    const endDate = item?.end ? new Date(item.end) : null
    const start = formatTooltipTime(startDate && Number.isFinite(startDate.getTime()) ? startDate : null)
    const end = formatTooltipTime(endDate && Number.isFinite(endDate.getTime()) ? endDate : null)
    const timeRange = start && end ? `${start} - ${end}` : (start || end || '')
    const typeLabel = props.kind === 'personal' ? t('formPersonal') : (props.type?.name || item?.type?.name || t('calendarEventTypeBooked'))
    const clientLabel = props.kind === 'booked' ? formatBookingClientsLabel(props) : null
    const gidRaw = props.groupId
    const bookingIsGroup =
      groupBookingEnabled &&
      props.kind === 'booked' &&
      gidRaw != null &&
      Number.isFinite(Number(gidRaw)) &&
      Number(gidRaw) > 0
    const consultantId = props.consultant?.id ?? props.consultantId ?? props.ownerId ?? item?.consultant?.id ?? null
    const consultantFromMeta = Number.isFinite(consultantId)
      ? metaUsers.find((u: any) => u.id === consultantId)
      : null
    const consultantLabel = fullName(props.consultant || item?.consultant || consultantFromMeta || { firstName: '', lastName: '' }) || '-'
    const meetingLink = props.kind === 'booked' ? (props.meetingLink ?? item?.meetingLink ?? null) : null
    const meetingProvider = props.kind === 'booked' ? (props.meetingProvider ?? item?.meetingProvider ?? null) : null
    return {
      timeRange,
      typeLabel,
      clientLabel,
      bookingIsGroup,
      consultantLabel,
      meetingLink,
      meetingProvider,
    }
  }

  const getHoverCardPosition = useCallback((viewType: string, eventEl: HTMLElement) => {
    const cardWidth = 250
    const estimatedCardHeight = 138
    const gap = 10
    const rect = eventEl.getBoundingClientRect()
    const bounds = calendarAndroidWeekRef.current?.getBoundingClientRect()
    const minX = (bounds?.left ?? 0) + 8
    const maxX = Math.max(minX, (bounds?.right ?? window.innerWidth) - cardWidth - 8)
    const minY = (bounds?.top ?? 0) + 8
    const maxY = Math.max(minY, (bounds?.bottom ?? window.innerHeight) - estimatedCardHeight - 8)

    if (
      viewType === 'timeGridWeek' ||
      viewType === 'timeGridThreeDay' ||
      viewType === 'resourceTimeGridWeek' ||
      viewType === 'resourceTimeGridThreeDay'
    ) {
      let x = rect.left - cardWidth - gap
      if (x < minX) x = Math.min(maxX, rect.right + gap)
      const y = Math.max(minY, Math.min(maxY, rect.top + (rect.height / 2) - (estimatedCardHeight / 2)))
      return { x, y, transform: 'none' }
    }

    if (viewType === 'timeGridDay' || viewType === 'resourceTimeGridDay') {
      const x = Math.max(minX, Math.min(maxX, rect.left))
      let y = rect.bottom + gap
      let transform = 'none'
      if (y + estimatedCardHeight > (bounds?.bottom ?? window.innerHeight) - 8) {
        y = rect.top - gap
        transform = 'translateY(-100%)'
      }
      return { x, y, transform }
    }

    const x = Math.max(10, Math.min(window.innerWidth - cardWidth - 10, rect.left + (rect.width / 2) - (cardWidth / 2)))
    const y = Math.max(12, rect.top - 10)
    return { x, y, transform: 'translateY(-100%)' }
  }, [])

  /** Stable key so layout recenters when a different popup opens, not on every in-form state update. */
  const sessionPopupLayoutKey = useMemo(() => {
    if (selectedBookedSession?.id != null) return `b:${selectedBookedSession.id}`
    if (selectedPersonalBlock?.id != null) return `p:${selectedPersonalBlock.id}`
    if (selectedTodo?.id != null) return `t:${selectedTodo.id}`
    if (availabilitySelection) {
      return `a:${availabilitySelection.slotId ?? 'x'}:${availabilitySelection.startTime}:${availabilitySelection.endTime}`
    }
    if (selection) {
      return `n:${selection.start}:${selection.end}:${selection.resourceId ?? ''}`
    }
    return ''
  }, [
    selection?.start,
    selection?.end,
    selection?.resourceId,
    selectedBookedSession?.id,
    selectedPersonalBlock?.id,
    selectedTodo?.id,
    availabilitySelection?.slotId,
    availabilitySelection?.startTime,
    availabilitySelection?.endTime,
  ])

  /** Center in viewport (matches `.calendar-session-popup` width / max-height). Uses measured size when ref is mounted. */
  const getSessionPopupPosition = useCallback(() => {
    const pad = 12
    const el = sessionPopupRef.current
    const fallbackWidth = Math.min(560, window.innerWidth - 24)
    const fallbackHeight = Math.min(760, window.innerHeight - 24)
    const w = el ? el.getBoundingClientRect().width : fallbackWidth
    const h = el ? el.getBoundingClientRect().height : fallbackHeight
    const left = Math.round((window.innerWidth - w) / 2)
    const top = Math.round((window.innerHeight - h) / 2)
    return {
      left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
      top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
    }
  }, [])

  const placeSessionPopup = useCallback((_anchorEl?: HTMLElement | null) => {
    if (isNativeAndroid) return
    setSessionPopupPosition({ ...getSessionPopupPosition(), key: sessionPopupLayoutKey })
  }, [getSessionPopupPosition, isNativeAndroid, sessionPopupLayoutKey])


  const getSessionPopupInlineStyle = useCallback((withDynamicMaxHeight = false): CSSProperties | undefined => {
    if (useBookingSidePanel || !sessionPopupPosition) return undefined
    if (sessionPopupPosition.key !== undefined && sessionPopupPosition.key !== sessionPopupLayoutKey) return undefined
    const style: CSSProperties = {
      left: sessionPopupPosition.left,
      top: sessionPopupPosition.top,
      transform: 'none',
    }
    if (withDynamicMaxHeight) {
      style.maxHeight = `calc(100vh - ${sessionPopupPosition.top + 12}px)`
    }
    return style
  }, [sessionPopupLayoutKey, sessionPopupPosition, useBookingSidePanel])

  const clampSessionPopupPosition = useCallback((left: number, top: number) => {
    const pad = 8
    const popup = sessionPopupRef.current
    const width = popup?.offsetWidth || Math.min(780, Math.max(360, window.innerWidth - (pad * 2)))
    const height = popup?.offsetHeight || Math.min(760, Math.max(420, window.innerHeight - (pad * 2)))
    const maxLeft = Math.max(pad, window.innerWidth - width - pad)
    const maxTop = Math.max(pad, window.innerHeight - Math.min(height, window.innerHeight - (pad * 2)) - pad)
    return {
      left: Math.min(maxLeft, Math.max(pad, left)),
      top: Math.min(maxTop, Math.max(pad, top)),
    }
  }, [])

  const onSessionPopupDragPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (useBookingSidePanel || isNativeAndroid || e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea, label, [role="button"]')) return
    const popup = sessionPopupRef.current
    if (!popup) return
    const rect = popup.getBoundingClientRect()
    sessionPopupDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    }
    setSessionPopupPosition({ ...clampSessionPopupPosition(rect.left, rect.top), key: sessionPopupLayoutKey })
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }, [clampSessionPopupPosition, isNativeAndroid, sessionPopupLayoutKey, useBookingSidePanel])

  const onSessionPopupDragPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const drag = sessionPopupDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const nextLeft = drag.originLeft + (e.clientX - drag.startX)
    const nextTop = drag.originTop + (e.clientY - drag.startY)
    setSessionPopupPosition({ ...clampSessionPopupPosition(nextLeft, nextTop), key: sessionPopupLayoutKey })
  }, [clampSessionPopupPosition, sessionPopupLayoutKey])

  const onSessionPopupDragPointerEnd = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const drag = sessionPopupDragRef.current
    if (drag?.pointerId === e.pointerId) {
      sessionPopupDragRef.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    }
  }, [])

  const getSessionPopupDragHandleProps = useCallback(() => (useBookingSidePanel || isNativeAndroid ? {} : {
    onPointerDown: onSessionPopupDragPointerDown,
    onPointerMove: onSessionPopupDragPointerMove,
    onPointerUp: onSessionPopupDragPointerEnd,
    onPointerCancel: onSessionPopupDragPointerEnd,
  }), [isNativeAndroid, onSessionPopupDragPointerDown, onSessionPopupDragPointerEnd, onSessionPopupDragPointerMove, useBookingSidePanel])

  useLayoutEffect(() => {
    if (useBookingSidePanel || isNativeAndroid) return
    if (!sessionPopupLayoutKey) return
    placeSessionPopup()
  }, [useBookingSidePanel, isNativeAndroid, sessionPopupLayoutKey, placeSessionPopup])

  const todayRemainingSessions = useMemo(() => {
    const now = new Date()
    const todayKey = toIsoDateKey(now)
    return (events as any[])
      .filter((ev) => ev?.extendedProps?.kind === 'booked')
      .map((ev) => {
        const start = ev?.start ? new Date(ev.start) : null
        const end = ev?.end ? new Date(ev.end) : null
        const props = ev?.extendedProps || {}
        const title = String(ev?.title || `${props?.client?.firstName || ''} ${props?.client?.lastName || ''}`).trim() || 'Session'
        const durationMinutes = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)) : 0
        return { start, end, props, title, durationMinutes }
      })
      .filter((row) => row.start && row.end && toIsoDateKey(row.start) === todayKey && row.end.getTime() > now.getTime())
      .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0))
  }, [events])

  const bottomPillLabel = useMemo(() => {
    const useTodayWord = calendarFiltersBottomBar || isNativeAndroid
    const dateLabel = useTodayWord
      ? t('calendarToday')
      : new Date().toLocaleDateString(calendarLocaleTag, { day: 'numeric', month: 'short' })
    const count = todayRemainingSessions.length
    const sessionsWord =
      locale === 'sl' ? slovenianTerminCountForm(count) : count === 1 ? 'session' : 'sessions'
    return `${dateLabel} · ${count} ${sessionsWord}`
  }, [calendarFiltersBottomBar, calendarLocaleTag, isNativeAndroid, locale, t, todayRemainingSessions.length])

  const openSessionsSheet = useCallback(() => {
    setSessionsSheetDragOffset(0)
    setSessionsSheetState('expanded')
  }, [])

  const closeSessionsSheet = useCallback(() => {
    setSessionsSheetDragOffset(0)
    setSessionsSheetState('closed')
  }, [])

  const openOverlapSidebarSession = useCallback((item: any, anchorEl?: HTMLElement | null) => {
    if (!item?.kind || item?.extendedProps?.masked) return
    const props = item.extendedProps || item
    setMonthHoverCard(null)
    setSelection(null)
    setSelectedTodo(null)
    calendarRef.current?.getApi()?.unselect()
    if (!isNativeAndroid) placeSessionPopup(anchorEl || undefined)

    if (item.kind === 'booked') {
      setSelectedPersonalBlock(null)
      setSelectedBookedSession({
        ...props,
        clients: Array.isArray(props.clients) && props.clients.length > 0 ? props.clients : (props.client ? [props.client] : []),
        online: Boolean(props.online ?? props.meetingLink),
        meetingProvider: props.meetingProvider || 'zoom',
      })
      if (useBookingSidePanel && props.id != null) {
        pushCompactFormRoute(`/calendar/booking/${props.id}`)
      }
      return
    }

    if (item.kind === 'personal') {
      setSelectedBookedSession(null)
      setSelectedTodo(null)
      setSelectedPersonalBlock(props)
      if (useBookingSidePanel && props.id != null) {
        pushCompactFormRoute(`/calendar/personal/${props.id}`)
      }
      return
    }

    if (item.kind === 'todo') {
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(props)
      if (useBookingSidePanel && props.id != null) {
        pushCompactFormRoute(`/calendar/todo/${props.id}`)
      }
    }
  }, [isNativeAndroid, placeSessionPopup, pushCompactFormRoute, useBookingSidePanel])

  const openBookedSessionFromSheet = useCallback((row: any, anchorEl?: HTMLElement | null) => {
    if (!row?.props || row.props.masked) return
    setMonthHoverCard(null)
    setSelection(null)
    calendarRef.current?.getApi()?.unselect()
    if (!isNativeAndroid) placeSessionPopup(anchorEl || undefined)
    setSelectedBookedSession({
      ...row.props,
      clients: Array.isArray(row.props.clients) && row.props.clients.length > 0 ? row.props.clients : (row.props.client ? [row.props.client] : []),
      online: Boolean(row.props.online ?? row.props.meetingLink),
      meetingProvider: row.props.meetingProvider || 'zoom',
    })
    if (useBookingSidePanel && row.props.id != null) {
      pushCompactFormRoute(`/calendar/booking/${row.props.id}`)
    }
    closeSessionsSheet()
  }, [closeSessionsSheet, isNativeAndroid, placeSessionPopup, useBookingSidePanel, pushCompactFormRoute])

  const onSessionsSheetHandlePointerDown = useCallback((e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY
    if (clientY == null || sessionsSheetState === 'closed') return
    sessionsSheetStartYRef.current = clientY
    sessionsSheetStartStateRef.current = sessionsSheetState === 'expanded' ? 'expanded' : 'collapsed'
    setSessionsSheetDragOffset(0)
  }, [sessionsSheetState])

  const onSessionsSheetHandlePointerMove = useCallback((e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    const startY = sessionsSheetStartYRef.current
    if (startY == null) return
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY
    if (clientY == null) return
    const delta = clientY - startY
    setSessionsSheetDragOffset(Math.max(-260, Math.min(260, delta)))
  }, [])

  const onSessionsSheetHandlePointerUp = useCallback(() => {
    const startY = sessionsSheetStartYRef.current
    if (startY == null) return
    const delta = sessionsSheetDragOffset
    const startState = sessionsSheetStartStateRef.current
    if (startState === 'collapsed') {
      if (delta < -54) setSessionsSheetState('expanded')
      else if (delta > 90) setSessionsSheetState('closed')
      else setSessionsSheetState('collapsed')
    } else {
      if (delta > 90) setSessionsSheetState('collapsed')
      else setSessionsSheetState('expanded')
    }
    sessionsSheetStartYRef.current = null
    setSessionsSheetDragOffset(0)
  }, [sessionsSheetDragOffset])

  const sessionsSheetTransform = sessionsSheetState === 'expanded'
    ? `translateY(${sessionsSheetDragOffset}px)`
    : `translateY(calc(46% + ${sessionsSheetDragOffset}px))`


  const closeSessionQuickActions = () => {
    setSessionQuickActions(null)
    calendarRef.current?.getApi()?.unselect()
  }

  const openSessionQuickActionMenu = (_info: any) => {
    // Compact mobile (<=939px) now uses inline "+" and "+N" buttons on the block itself,
    // so the floating Novo/Odpri quick-action menu is no longer opened on click.
    return false
  }

  const openSessionQuickActionExisting = () => {
    const action = sessionQuickActions
    if (!action) return
    const props = action.props || {}
    sessionPopupAnchorRectRef.current = action.anchorRect
    setSessionQuickActions(null)
    setOverlapDrawerGroupId(null)
    setSelection(null)
    calendarRef.current?.getApi()?.unselect()
    placeSessionPopup(null)

    if (action.kind === 'booked') {
      setSelectedPersonalBlock(null)
      setSelectedTodo(null)
      setSelectedBookedSession({
        ...props,
        clients: Array.isArray(props.clients) && props.clients.length > 0 ? props.clients : (props.client ? [props.client] : []),
        online: Boolean(props.online ?? props.meetingLink),
        meetingProvider: props.meetingProvider || 'zoom',
      })
      if (useBookingSidePanel && props.id != null) {
        pushCompactFormRoute(`/calendar/booking/${props.id}`)
      }
      return
    }

    if (action.kind === 'personal') {
      setSelectedBookedSession(null)
      setSelectedTodo(null)
      setSelectedPersonalBlock(props)
      if (useBookingSidePanel && props.id != null) {
        pushCompactFormRoute(`/calendar/personal/${props.id}`)
      }
      return
    }

    if (action.kind === 'todo') {
      setSelectedBookedSession(null)
      setSelectedPersonalBlock(null)
      setSelectedTodo(props)
      if (useBookingSidePanel && props.id != null) {
        pushCompactFormRoute(`/calendar/todo/${props.id}`)
      }
    }
  }

  const openSessionQuickActionNew = () => {
    const action = sessionQuickActions
    if (!action || isViewOnly) return
    sessionPopupAnchorRectRef.current = action.anchorRect
    setSessionQuickActions(null)
    setOverlapDrawerGroupId(null)
    handleCalendarSelection(action.start, action.end, {
      preserveDraggedRange: true,
      anchorEl: null,
      spaceResourceId: spacesUseResourceColumns ? action.resourceId : undefined,
      consultantResourceId: bookingsUseResourceColumns ? action.resourceId : undefined,
    })
  }

  const openSessionQuickActionMore = () => {
    const action = sessionQuickActions
    if (!action?.overlapGroupId) return
    setSessionQuickActions(null)
    setOverlapDrawerGroupId(action.overlapGroupId)
  }

  const calendarSessionModalProps = {BookingTypeTabIcon,CalendarFormFooterDeleteIcon,CalendarFormFooterSaveIcon,CalendarLocalTimeDateRow,CalendarLocalTimespanRow,CalendarPaymentCompanyIcon,CalendarPaymentPersonIcon,CalendarScannerIcon,GuestConfigSaveIcon,LanguageModal,PageHeader,PersonalTaskCombo,REPEAT_WEEKDAY_EN,ROUTE_NEW_BOOKING,SessionNotesTextarea,activateNewFormPanel,addBookingGroupCaptionId,addBookingOnlineCaptionId,addClientInlineTitle,addGroupInlineTitle,androidLanguageModal,applyBookedSessionClientIds,applyFormClientIds,availabilityAllDayCaptionId,availabilityError,availabilityIntent,availabilityRangeEndInputRef,availabilityRangeStartInputRef,availabilitySaving,availabilitySelection,bookSessionClientFieldCompact,bookSessionClientsExpanded,bookSessionGroupFieldCompact,bookSessionNotesExpanded,bookSessionSelectedClient,bookSessionSelectedClients,bookedClientDropdownOpen,bookedClientSearch,bookedClientSearchInputRef,bookedPaymentClientDisplay,bookedPaymentManagerTab,bookedPaymentMenuOpen,bookedPaymentMeta,bookedPaymentPayeeDisplay,bookedPaymentPayeeDrafts,bookedPaymentPayeesUseSameCompanyForAll,bookedPaymentSidebarStatusMeta,bookedPaymentTotals,bookedPrimaryPaymentStatus,bookedSessionClientFieldCompact,bookedSessionClientsExpanded,bookedSessionGroupId,bookedSessionIsGroup,bookedSessionOnlineCaptionId,bookedSessionResolvedGroup,bookedSessionSelectedClient,bookedSessionSelectedClients,bookedStatusLabel,bookedStatusMenuOpen,bookedStatusTagColors,bookedStatusTransitionTargets,bookingEndEditedManuallyRef,bookingGroupMode,bookingPayeeCompanies,bookingStatusTagColors,calendarClientDetailId,calendarFiltersBottomBar,cancelBookedPersonalOverlap,cancelNonBookableMove,clearSingleClientTitle,clearSingleGroupTitle,clientDropdownOpen,clientError,clientSearch,clientSearchInputRef,clientSearchPlaceholder,closeBookedModal,closeBookingSelection,closePersonalModal,closeTodoModal,compactSelectionCheckAria,compactSelectionHeader,compactSessionEditHeader,confirmAvailabilityFromHeader,confirmBookedPersonalOverlap,confirmBookedPersonalOverlapYes,confirmDelete,confirmNonBookable,confirmNonBookableMove,confirmNonBookableMoveYes,confirmNonBookableYes,confirmOverlap,createClientFromBooking,createGroupFromBooking,createOpenBillForPaymentStatus,currency,deleteBookedSession,deletePersonalBlock,deleteTodo,editBookedAllDayCaptionId,form,formatDateTime,formatRepeatWeekdayLabel,fullName,getBookingEndTimeForStart,getMoreClientsLabel,getSessionPopupDragHandleProps,getSessionPopupInlineStyle,groupBookingEnabled,groupDropdownOpen,groupModalError,groupSearch,groupSearchInputRef,groupSearchPlaceholder,groupedSingleInvoiceClient,groupedSingleInvoicePayeeDraft,groupedSingleInvoiceStatus,hiddenBookSessionClientCount,hiddenBookedSessionClientCount,invoiceAllocationForPaymentStatus,isGroupedSingleInvoiceMode,isLocalBookingAllDay,isLocalTodoAllDayStart,isNativeAndroid,localTodayYmd,locale,meetingPickerCancelUnchecksOnline,meetingProviderPickerOpen,meetingProviderPickerTarget,metaClients,metaConsultants,metaSpaces,metaTypes,metaUsers,multipleClientsPerSessionEnabled,newBookingAllDayCaptionId,newClientForm,newClientInitials,newGroupForm,newGroupMemberIds,newGroupMemberSearch,normalizeToLocalDateTime,onNewFormPanelTouchEnd,onNewFormPanelTouchStart,openAvailabilityModalFromSelection,openCalendarGroupDetail,openBookedPaymentAddClient,openBookedPaymentDetailsForClient,openBookedSessionGroupScanner,openBookedPaymentEntitlementScanner,openPaymentInvoicePdf,openBookedPaymentOpenBillEditor,openBookedPaymentAdvanceEditor,openCalendarClientDetail,parseClientNameInput,paymentManagerIsNewBooking,paymentManagerSessionClients,paymentStatusForClient,personInitials,personalEditAllDayCaptionId,personalFormAllDayCaptionId,personalModuleEnabled,personalTaskPresetDropdownOpen,personalTaskPresets,renderBookingModeTitle,resendPaymentInvoicePdf,saveBookedPaymentManager,saveBooking,saveBookingError,saveBookingLoading,savingClient,savingNewGroupModal,selectableMetaTypes,selectedBookedClientIds,selectedBookedPaymentClient,selectedBookedPaymentClientDraft,selectedBookedPaymentLinkedCompany,selectedBookedPaymentPayeeDraft,selectedBookedPaymentPayeeLocked,selectedBookedPaymentClientIsGroupMember,selectedBookedPaymentStatus,selectedBookedSession,selectedFormClientIds,selectedGroup,selectedPersonalBlock,selectedTodo,selection,sessionPopupRef,setAndroidLanguageModal,setAvailabilityError,setAvailabilityIntent,setAvailabilitySelection,setBookSessionClientsExpanded,setBookSessionNotesExpanded,setBookedClientDropdownOpen,setBookedClientSearch,setBookedPaymentAddMode,setBookedPaymentAddSearch,setBookedPaymentManagerTab,setBookedPaymentMenuOpen,setBookedSessionClientsExpanded,setBookedStatusMenuOpen,setBookedPaymentGroupNameDraft,setBookedPaymentSharedCompanyForAll,setBookingGroupMode,setClientDropdownOpen,setClientSearch,setConfirmDelete,setConfirmNonBookable,setConfirmOverlap,setEditingBookedClientSearch,setEditingClientSearch,setEditingGroupSearch,setForm,setGroupDropdownOpen,setGroupModalError,setGroupSearch,setMeetingPickerCancelUnchecksOnline,setMeetingProviderPickerOpen,setMeetingProviderPickerTarget,setNewClientForm,setNewGroupForm,setNewGroupMemberIds,setNewGroupMemberSearch,setPersonalTaskPresetDropdownOpen,setSaveBookingError,setSelectedBookedPaymentClientId,setSelectedBookedSession,setSelectedPersonalBlock,setSelectedTodo,setShowAddClientModal,setShowAddGroupModal,settings,showAddClientModal,showAddGroupModal,showBookingConsultantRow,showBookingSpaceRow,showBookingTypeRow,showLessClientsLabel,showSelectionFormFooter,splitLocalDateTimeParts,t,toCalendarTimeValue,todoEditAllDayCaptionId,todoFormAllDayCaptionId,todosModuleEnabled,toggleBookedPaymentSameCompanyForAll,markBookedClientsNoShow,transitionBookedStatus,updateBookedSession,updateBookingFormEndTime,updateBookingFormStartTime,updateBookingFormType,updatePersonalBlock,updateSelectedBookedPaymentClientDraft,updateSelectedBookedPaymentPayee,updateTodo,useBookingSidePanel,user,visibleBookSessionClientChips,visibleBookedClients,visibleBookedSessionClientChips,visibleClients,visibleGroups,bookedPaymentAddCandidates,bookedPaymentAddMode,bookedPaymentAddSearch,paymentManagerAddClientSelectionActive,PAYMENT_MANAGER_ADD_CLIENT_ID,addBookedPaymentClientToSession,removeBookedPaymentClientFromGroup,removeBookedPaymentClientFromSession,bookedPaymentGroupNameDraft}

  return (
    <div className={isNativeAndroid ? 'calendar-page-android-root' : 'calendar-page-web-root'}>
      <Card data-onboarding-panel="calendar" className={isNativeAndroid ? 'calendar-card-android' : 'calendar-web-flush'}>
        {voiceReviewOpen && (
          <div
            className="modal-backdrop"
            style={{ zIndex: 20 }}
            onClick={() => {
              if (!voiceBookingLoading) {
                setVoiceReviewOpen(false)
                setVoicePendingCancellation(null)
                setVoiceReviewClientId(null)
                setVoiceReviewClientQuery('')
                setVoiceReviewClientDropdownOpen(false)
              }
            }}
          >
            <div className="modal" style={{ maxWidth: 440, width: 'min(440px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
              <PageHeader
                title={t('calendarVoiceConfirmTitle')}
                subtitle={t('calendarVoiceConfirmSubtitle')}
              />
              <div className="stack gap-md" style={{ marginTop: 12 }}>
                {voicePendingCancellation && (
                  <div style={{ border: '1px solid var(--border-color, #d6d3d1)', borderRadius: 12, padding: 12, background: 'rgba(245, 158, 11, 0.08)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      {t('calendarVoiceActionToConfirm')}
                    </div>
                    {voicePendingCancellation.targetType === 'booking' ? (
                      <div><strong>{locale === 'sl' ? 'Stranka' : 'Client'}:</strong> {voiceReviewClientLabel}</div>
                    ) : (
                      <div><strong>{locale === 'sl' ? 'Naziv' : 'Title'}:</strong> {voicePendingCancellation.title || (locale === 'sl' ? 'Ni določen' : 'Not specified')}</div>
                    )}
                    <div><strong>{locale === 'sl' ? 'Začetek' : 'Start'}:</strong> {formatVoiceReviewDateTime(voicePendingCancellation.startTime)}</div>
                    {voicePendingCancellation.endTime && (
                      <div><strong>{locale === 'sl' ? 'Konec' : 'End'}:</strong> {formatVoiceReviewDateTime(voicePendingCancellation.endTime)}</div>
                    )}
                    <div style={{ marginTop: 8 }}>{voicePendingCancellation.message || (locale === 'sl' ? 'Potrdite dejanje.' : 'Please confirm the action.')}</div>
                  </div>
                )}
                {voicePendingCancellation?.targetType === 'booking' && (
                  <Field label={t('formClient')}>
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className="client-search-wrap calendar-client-picker__search-wrap">
                          <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          </span>
                          <input
                            ref={voiceReviewClientInputRef}
                            className="input"
                            placeholder={locale === 'sl' ? 'Iščite ali vpišite stranko' : 'Search or type a client'}
                            value={voiceReviewClientQuery}
                            onChange={(e) => {
                              const nextValue = e.target.value
                              const normalized = nextValue.trim().toLowerCase()
                              const exact = normalized
                                ? voiceReviewClients.find((client: any) => fullName(client).toLowerCase() === normalized)
                                : null
                              setVoiceReviewClientQuery(nextValue)
                              setVoiceReviewClientId(exact?.id ?? null)
                              setVoiceReviewClientDropdownOpen(true)
                            }}
                            onFocus={() => setVoiceReviewClientDropdownOpen(true)}
                            onBlur={() => {
                              window.setTimeout(() => setVoiceReviewClientDropdownOpen(false), 0)
                            }}
                          />
                        </div>
                        <div className="calendar-client-picker__actions">
                          {(voiceReviewClientId != null || voiceReviewClientQuery.trim()) && (
                            <button
                              type="button"
                              className="secondary calendar-client-picker__clear-btn"
                              title={locale === 'sl' ? 'Počisti stranko' : 'Clear client'}
                              aria-label={locale === 'sl' ? 'Počisti stranko' : 'Clear client'}
                              onClick={(e) => {
                                e.stopPropagation()
                                setVoiceReviewClientId(null)
                                setVoiceReviewClientQuery('')
                                setVoiceReviewClientDropdownOpen(false)
                                requestAnimationFrame(() => voiceReviewClientInputRef.current?.focus())
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          )}
                        </div>
                        {voiceReviewClientDropdownOpen && (
                          <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                            {visibleVoiceReviewClients.slice(0, 10).map((client: any) => (
                              <button
                                key={client.id}
                                type="button"
                                className={`client-list-item ${voiceReviewClientId === client.id ? 'selected' : ''}`}
                                onClick={() => {
                                  setVoiceReviewClientId(client.id)
                                  setVoiceReviewClientQuery(fullName(client))
                                  setVoiceReviewClientDropdownOpen(false)
                                }}
                              >
                                {fullName(client)}
                              </button>
                            ))}
                            {voiceReviewClientQuery.trim() && !visibleVoiceReviewClients.some((client: any) => fullName(client).toLowerCase() === voiceReviewClientQuery.trim().toLowerCase()) && (
                              <div className="muted" style={{ padding: '8px 4px 0' }}>
                                {voicePendingCancellation?.action === 'book_review'
                                  ? (locale === 'sl'
                                    ? 'Če stranke ni na seznamu, jo samo vpišite in ob potrditvi bo ustvarjena.'
                                    : 'If the client is not in the list, just type the name and it will be created when you confirm.')
                                  : (locale === 'sl'
                                    ? 'Vpišite ali izberite obstoječo stranko.'
                                    : 'Type or choose an existing client.')}
                              </div>
                            )}
                            {visibleVoiceReviewClients.length === 0 && !voiceReviewClientQuery.trim() && <span className="muted">{t('formNoClientsFoundAddOne')}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </Field>
                )}
                <div className="row gap" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="secondary" disabled={voiceBookingLoading} onClick={() => { setVoiceReviewOpen(false); setVoicePendingCancellation(null); setVoiceReviewClientId(null); setVoiceReviewClientQuery(''); setVoiceReviewClientDropdownOpen(false) }}>
                    {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={voiceBookingLoading}
                    onClick={() => {
                      setVoiceReviewOpen(false)
                      setVoicePendingCancellation(null)
                      setVoiceReviewClientId(null)
                      setVoiceReviewClientQuery('')
                      setVoiceReviewClientDropdownOpen(false)
                      window.setTimeout(() => startVoiceBooking(), 0)
                    }}
                  >
                    {locale === 'sl' ? 'Poslušaj znova' : 'Listen again'}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={voiceBookingLoading || !voicePendingCancellation || (voicePendingCancellation?.action === 'book_review' && voicePendingCancellation?.targetType === 'booking' && !(voiceReviewClientId != null || voiceReviewResolvedClientName))}
                    onClick={() => submitVoiceBookingTranscript(
                      voiceReviewText,
                      !!voicePendingCancellation,
                      voicePendingCancellation?.targetType === 'booking' && !voiceReviewResolvedClientName ? voiceReviewClientId : undefined,
                      voicePendingCancellation?.targetType === 'booking' ? voiceReviewResolvedClientName : undefined,
                    )}
                  >
                    {voiceBookingLoading
                      ? '…'
                        : (locale === 'sl' ? 'Potrdi dejanje' : 'Confirm action')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div
          ref={calendarAndroidWeekRef}
          className={isNativeAndroid ? 'calendar-android-week' : 'calendar-web-main'}
          onTouchStartCapture={handleCalendarSwipeTouchStart}
          onTouchEndCapture={handleCalendarSwipeTouchEnd}
          onTouchCancelCapture={clearDraggingState}
          onTouchMoveCapture={handleCalendarTouchMove}
          onMouseDownCapture={!isNativeAndroid ? handleCalendarSwipeTouchStart : undefined}
          onMouseUpCapture={!isNativeAndroid ? handleCalendarSwipeTouchEnd : undefined}
          onMouseMoveCapture={!isNativeAndroid ? handleCalendarTouchMove : undefined}
          onMouseLeave={!isNativeAndroid ? clearDraggingState : undefined}
        >
        {isNativeAndroid && (
          <div
            className="calendar-android-toolbar"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="calendar-android-toolbar-leading">
              {isWebTimeGridLikeView(view) ? (
                <span className="calendar-android-toolbar-month" aria-hidden="true">
                  {calendarToolbarMonthLabel}
                </span>
              ) : null}
            </div>
            {isWebTimeGridLikeView(view) ? (
              <div className="calendar-android-toolbar-spacer" aria-hidden="true" />
            ) : (
              <div className="calendar-android-toolbar-title">{calendarToolbarTitle}</div>
            )}
            <div className="fc-button-group calendar-android-view-toggle" ref={androidScheduleRef} style={{ position: 'relative' }}>
              {todosModuleEnabled && (
              <button
                type="button"
                className="calendar-android-toolbar-icon-btn calendar-android-todo-btn"
                onClick={() => setAndroidTodoOpen(true)}
                title={t('calendarTodo')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M22 5.18 10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83L20.59 3.76 22 5.18ZM19.79 11.22c.05.25.05.51.05.78 0 4.31-3.48 7.8-7.79 7.8s-7.79-3.49-7.79-7.8 3.48-7.8 7.79-7.8c1.08 0 2.11.22 3.06.62l1.57-1.57A9.86 9.86 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-.8-.1-1.58-.29-2.33l-1.92 1.55Z" />
                </svg>
              </button>
              )}
              <button
                type="button"
                className="fc-button fc-button-primary"
                onClick={() => { setAndroidScheduleOpen((o) => !o); setAndroidConfigOpen(false) }}
              >
                {t('calendarSchedule')}
              </button>
              {androidScheduleOpen && (
                <div className="config-dropdown" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 140, zIndex: 10 }}>
                  <button type="button" className="config-dropdown-item" onClick={() => { goToTodayAndroid(); setAndroidScheduleOpen(false) }}>{t('calendarToday')}</button>
                  <button type="button" className="config-dropdown-item" onClick={() => { calendarRef.current?.getApi().changeView('timeGridWeek'); setAndroidScheduleOpen(false) }}>{t('viewWeek')}</button>
                  <button type="button" className="config-dropdown-item" onClick={() => { calendarRef.current?.getApi().changeView('dayGridMonth'); setAndroidScheduleOpen(false) }}>{t('viewMonth')}</button>
                </div>
              )}
            </div>
            <div className="calendar-android-config-wrap" ref={androidConfigRef}>
              <button
                type="button"
                className="calendar-android-toolbar-icon-btn"
                onClick={() => { setAndroidConfigOpen((o) => !o); setAndroidScheduleOpen(false) }}
                title={t('calendarConfiguration')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              {androidConfigOpen && (
                <div className="config-dropdown" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180, zIndex: 11 }}>
                  <button type="button" className="config-dropdown-item" onClick={() => { navigate('/configuration'); setAndroidConfigOpen(false) }}>
                    {t('settingsGroup')}
                  </button>
                  <button
                    type="button"
                    className="config-dropdown-item"
                    onClick={() => {
                      setAndroidConfigOpen(false)
                      setAndroidLanguageModal(true)
                    }}
                  >
                    {t('language')}
                  </button>
                  <button type="button" className="config-dropdown-item" onClick={() => { toggleTheme(); setAndroidConfigOpen(false) }}>
                    {theme === 'dark' ? t('lightMode') : t('darkMode')}
                  </button>
                  <button type="button" className="config-dropdown-item" onClick={() => { setAndroidConfigOpen(false); logout() }}>{t('logout')}</button>
                </div>
              )}
            </div>
          </div>
        )}
        <div
          ref={isNativeAndroid ? calendarPinchLayerRef : undefined}
          className={isNativeAndroid ? 'calendar-android-pinch-scale' : undefined}
          style={
            isNativeAndroid
              ? {
                  overflow: 'auto',
                  overflowX: view === 'dayGridMonth' ? 'hidden' : 'auto',
                }
              : undefined
          }
        >
        <div
          ref={swipeWrapRef}
          className={[
            calendarMode === 'spaces' ? 'calendar-mode-spaces' : (calendarMode === 'bookings' ? 'calendar-mode-bookings' : ''),
            modeSwitching ? 'calendar-mode-switching' : '',
            !isNativeAndroid ? 'calendar-web-wrap' : '',
            calendarIsSwiping ? 'calendar-is-swiping' : 'calendar-not-swiping',
            swipeTransitionActive ? 'calendar-sliding-enabled' : ''
          ].filter(Boolean).join(' ')}
          style={{
            ...(isNativeAndroid ? {
              width: `${(view === 'dayGridMonth' ? 1 : calendarPinchZoom) * 100}%`,
              height: `${(view === 'dayGridMonth' ? 1 : calendarPinchZoom) * 100}%`,
              transformOrigin: `${pinchOriginPct.x}% ${pinchOriginPct.y}%`
            } : {}),
            '--calendar-slide-x': `${calendarSlideX}px`,
          } as React.CSSProperties}
        >
        <div
          className={
            isNativeAndroid
              ? 'calendar-android-inner'
              : [
                  'calendar-web-inner',
                  calendarFiltersBottomBar ? 'calendar-web-inner--bottom-panel' : '',
                  !showCalendarRightRail ? 'calendar-web-inner--no-right-rail' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
          }
        >
        <div
          className={
            !isNativeAndroid
              ? ['calendar-fc-shell', hideNativeSelectionWhileDraftPreview ? 'calendar-hide-native-selection-highlight' : '']
                  .filter(Boolean)
                  .join(' ')
              : undefined
          }
          onDragOver={!isNativeAndroid ? handleOverlapCalendarDragOver : undefined}
          onDrop={!isNativeAndroid ? handleOverlapCalendarDrop : undefined}
        >
        {resourceDayViewHeaderFallbackEl}
        <FullCalendar
          /* Remount when resource *meaning* changes (e.g. bookings-all → spaces-all). Otherwise FC can keep
             stale custom resourceLabelContent (consultant avatars) over the new space column headers. */
          key={`fc-${calendarMode}-${bookingsUseResourceColumns}-${spacesUseResourceColumns}-${useUnassignedDrawer}`}
          ref={calendarRef}
          locales={FULLCALENDAR_LOCALES}
          locale={locale === 'sl' ? 'sl' : 'en-gb'}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          plugins={calendarPlugins}
          resources={calendarResources}
          /* Multi-column resource views (Space mode, or Bookings “Vsi termini” / po osebju): weekday row above resource labels. */
          datesAboveResources={useResourceColumns}
          eventResourceEditable={true}
          resourceLabelClassNames={
            useResourceColumns
              ? (arg) => {
                  const rid = String(arg.resource.id)
                  if (bookingsUseResourceColumns && rid === CONSULTANT_RESOURCE_UNASSIGNED_ID) {
                    return ['calendar-resource-label--unassigned']
                  }
                  if (spacesUseResourceColumns && rid === SPACE_RESOURCE_UNASSIGNED_ID) {
                    return ['calendar-resource-label--unassigned']
                  }
                  if (!bookingsUseResourceColumns) return []
                  if (!consultantResourceLabelsCompact) return []
                  const u = metaUsers.find((x: any) => String(x.id) === rid)
                  return u ? ['calendar-resource-label--initials'] : []
                }
              : undefined
          }
          resourceLabelContent={
            useResourceColumns
              ? (arg) => {
                  const rid = String(arg.resource.id)
                  if (spacesUseResourceColumns && rid === SPACE_RESOURCE_UNASSIGNED_ID) {
                    const unassignedTitle = arg.resource.title
                    return (
                      <span className="calendar-resource-label-wrap" title={unassignedTitle}>
                        <span className="calendar-resource-label-avatar calendar-resource-label-avatar--na" aria-hidden="true">
                          N/A
                        </span>
                        <span className="calendar-resource-label-sr">{unassignedTitle}</span>
                      </span>
                    )
                  }
                  if (!bookingsUseResourceColumns) {
                    return arg.resource.title
                  }
                  if (rid === CONSULTANT_RESOURCE_UNASSIGNED_ID) {
                    const unassignedTitle = arg.resource.title
                    return (
                      <span className="calendar-resource-label-wrap" title={unassignedTitle}>
                        <span className="calendar-resource-label-avatar calendar-resource-label-avatar--na" aria-hidden="true">
                          N/A
                        </span>
                        <span className="calendar-resource-label-sr">{unassignedTitle}</span>
                      </span>
                    )
                  }
                  const u = metaUsers.find((x: any) => String(x.id) === rid)
                  if (!u) return arg.resource.title
                  const name = fullName(u)
                  const toneIndex = consultantHeaderToneById.get(rid) ?? 0
                  if (!consultantResourceLabelsCompact) {
                    return (
                      <span className="calendar-resource-label-wrap" title={name}>
                        <span className={`calendar-resource-label-avatar calendar-resource-label-avatar--tone-${toneIndex}`} aria-hidden="true">
                          {personInitials(u)}
                        </span>
                        <span className={`calendar-resource-label-text calendar-resource-label-text--tone-${toneIndex}`}>{name}</span>
                      </span>
                    )
                  }
                  return (
                    <span className="calendar-resource-label-wrap" title={name}>
                      <span className={`calendar-resource-label-avatar calendar-resource-label-avatar--tone-${toneIndex}`} aria-hidden="true">
                        {personInitials(u)}
                      </span>
                      <span className="calendar-resource-label-sr">{name}</span>
                    </span>
                  )
                }
              : undefined
          }
          initialView={view}
          eventOrder="order"
          firstDay={isNativeAndroid && view === 'dayGridMonth' ? androidMonthFirstDay : 1}
          weekends
          dayHeaderFormat={undefined}
          dayHeaderContent={
            (arg) => {
              const d = arg.date
              const isMonthView = arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth'
              if (isMonthView) {
                const monthDow = d
                  .toLocaleDateString(calendarLocaleTag, { weekday: 'short' })
                  .replace(/\.$/, '')
                  .slice(0, 3)
                  .toUpperCase()
                return <span className="fc-day-header-month-label">{monthDow}</span>
              }
              const dowRaw = d.toLocaleDateString(calendarLocaleTag, { weekday: 'short' })
              const dowBase = dowRaw.replace(/\.$/, '').slice(0, 3)
              const dow = dowBase.charAt(0).toUpperCase() + dowBase.slice(1).toLowerCase()
              const dayNum = d.getDate()
              const holidayName = holidaysByDate[toIsoDateKey(d)]
              const viewType = arg.view.type
              const isResourceWeekLike =
                viewType === 'resourceTimeGridWeek' || viewType === 'resourceTimeGridThreeDay'
              const holidayPillText =
                holidayName && isResourceWeekLike
                  ? truncateCalendarHolidayPillText(holidayName, 18)
                  : holidayName
              const isToday = (() => {
                const now = new Date()
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
              })()
              return (
                <div
                  className={`fc-day-header-stack${isNativeAndroid ? ' fc-day-header-stack--android' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCalendarDayView(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openCalendarDayView(d)
                    }
                  }}
                >
                  <span className={`calendar-header-holiday-pill${holidayName ? '' : ' calendar-header-holiday-pill--empty'}`} title={holidayName || ''}>
                    {holidayPillText || '\u00A0'}
                  </span>
                  <span className="fc-day-header-dow">{dow}</span>
                  <span className={`fc-day-header-dom${isToday ? ' fc-day-header-dom--today' : ''}`}>{dayNum}</span>
                </div>
              )
            }
          }
          dayCellClassNames={(arg) => {
            if (!useResourceColumns) return []
            const isMonthView = arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth'
            if (isMonthView) return []
            const start = new Date(arg.view.currentStart)
            start.setHours(0, 0, 0, 0)
            const current = new Date(arg.date)
            current.setHours(0, 0, 0, 0)
            const diffDays = Math.round((current.getTime() - start.getTime()) / 86400000)
            return diffDays % 2 === 1 ? ['calendar-day-column--alt'] : []
          }}
          dayCellDidMount={(arg) => {
            if (arg.view.type !== 'dayGridMonth' && arg.view.type !== 'resourceDayGridMonth') return
            const dayNumberEl = arg.el.querySelector('.fc-daygrid-day-number') as HTMLElement | null
            if (!dayNumberEl) return
            dayNumberEl.classList.add('calendar-month-day-number-link')
            dayNumberEl.setAttribute('role', 'button')
            dayNumberEl.setAttribute('tabindex', '0')
            const openFromDayNumber = () => {
              ignoreNextSelectionRef.current = true
              window.setTimeout(() => {
                ignoreNextSelectionRef.current = false
              }, 0)
              openCalendarDayView(arg.date)
            }
            dayNumberEl.onmousedown = (e) => {
              e.preventDefault()
              e.stopPropagation()
            }
            dayNumberEl.onclick = (e) => {
              e.preventDefault()
              e.stopPropagation()
              openFromDayNumber()
            }
            dayNumberEl.onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                openFromDayNumber()
              }
            }
            const existingLabel = arg.el.querySelector('.calendar-holiday-label')
            if (existingLabel) existingLabel.remove()
            const dayTop = arg.el.querySelector('.fc-daygrid-day-top') as HTMLElement | null
            const holidayName = holidaysByDate[toIsoDateKey(arg.date)]
            if (dayTop && holidayName) {
              const label = document.createElement('div')
              label.className = 'calendar-holiday-label'
              label.title = holidayName
              label.textContent = holidayName
              dayTop.appendChild(label)
            }
          }}
          datesSet={(arg) => {
            setView(arg.view.type)
            setMonthHoverCard(null)
            setVisibleRange({ start: arg.startStr, end: arg.endStr })
            if (datesSetCalendarLoadTimerRef.current != null) {
              window.clearTimeout(datesSetCalendarLoadTimerRef.current)
            }
            datesSetCalendarLoadTimerRef.current = window.setTimeout(() => {
              datesSetCalendarLoadTimerRef.current = null
              loadCalendarRangeOnly().catch(() => {})
            }, DATE_SET_CALENDAR_DEBOUNCE_MS)
            if (isDraggingEventRef.current) {
              document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
              requestAnimationFrame(() => {
                document.querySelectorAll('.fc-event-mirror').forEach((n) => n.remove())
              })
            }
            if (isNativeAndroid) {
              requestAnimationFrame(() => {
                const api = calendarRef.current?.getApi()
                const anchor = api?.getDate() ?? new Date(arg.start)
                if (arg.view.type === 'dayGridMonth') {
                  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
                  setAndroidMonthFirstDay(first.getDay())
                }
                const vtAndroid = arg.view.type
                setCalendarToolbarTitle(
                  isWebTimeGridLikeView(vtAndroid)
                    ? ''
                    : anchor.toLocaleDateString(calendarLocaleTag, { month: 'long', year: 'numeric' }),
                )
                renderAndroidCornerViewToggle(vtAndroid)
                api?.updateSize()
              })
            } else {
              setCalendarToolbarTitle(arg.view.title)
              const vt = arg.view.type
              if (
                vt === 'timeGridDay' ||
                vt === 'timeGridThreeDay' ||
                vt === 'resourceTimeGridDay' ||
                vt === 'resourceTimeGridThreeDay'
              ) {
                requestAnimationFrame(() => {
                  calendarRef.current?.getApi().updateSize()
                })
              }
            }
          }}
          editable={!isNativeAndroid && !isViewOnly}
          customButtons={{}}
          buttonText={{
            week: t('viewWeek'),
            month: t('viewMonth'),
          }}
          headerToolbar={false}
          {...(isNativeAndroid
            ? {
                views: {
                  timeGridWeek: { allDaySlot: false },
                  timeGridDay: { allDaySlot: false },
                  timeGridThreeDay: {
                    type: 'timeGrid',
                    duration: { days: 3 },
                    dateAlignment: 'day',
                    allDaySlot: false,
                  },
                  dayGridMonth: { dayHeaders: false, showNonCurrentDates: false, fixedWeekCount: false },
                },
              }
            : {
                views: {
                  timeGridDay: { dayHeaderFormat: { weekday: 'long' }, allDaySlot: false },
                  timeGridWeek: { allDaySlot: false },
                  timeGridThreeDay: {
                    type: 'timeGrid',
                    duration: { days: 3 },
                    dateAlignment: 'day',
                    allDaySlot: false,
                  },
                  dayGridMonth: { dayHeaderFormat: { weekday: 'long' } },
                  resourceTimeGridDay: {
                    dayHeaderFormat: { weekday: 'long' },
                    allDaySlot: false,
                    datesAboveResources: true,
                  },
                  resourceTimeGridWeek: { allDaySlot: false },
                  resourceTimeGridThreeDay: {
                    type: 'resourceTimeGrid',
                    duration: { days: 3 },
                    dateAlignment: 'day',
                    allDaySlot: false,
                    datesAboveResources: true,
                  },
                  resourceDayGridMonth: { dayHeaderFormat: { weekday: 'long' } },
                },
              })}
          dateClick={(arg) => {
            if (suppressNextCalendarSelectionRef.current) {
              calendarRef.current?.getApi()?.unselect()
              return
            }
            if (!isNativeAndroid && sessionQuickActions) {
              closeSessionQuickActions()
              return
            }
            if (!isNativeAndroid && overlapDrawerDismissConsumePointerRef.current) {
              overlapDrawerDismissConsumePointerRef.current = false
              setDragSelection(null)
              calendarRef.current?.getApi()?.unselect()
              return
            }
            if (!isNativeAndroid && overlapDrawerGroupId) {
              overlapDrawerDismissConsumePointerRef.current = true
              armOverlapDrawerDismissPointerCleanup()
              setOverlapDrawerGroupId(null)
              setDragSelection(null)
              calendarRef.current?.getApi()?.unselect()
              return
            }
            if (arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth') {
              if (isNativeAndroid) {
                const api = calendarRef.current?.getApi()
                if (!api) return
                api.gotoDate(arg.date)
                api.changeView('timeGridDay')
                return
              }
              if (isViewOnly) return
              if (calendarMode === 'bookings') {
                const [startHour, startMinute] = slotMinTime.split(':').map((value) => Number(value) || 0)
                const startDate = new Date(arg.date)
                startDate.setHours(startHour, startMinute, 0, 0)
                const crid = (arg as { resource?: { id?: string } }).resource?.id
                const resolvedConsultant =
                  bookingsUseResourceColumns && crid && crid !== CONSULTANT_RESOURCE_UNASSIGNED_ID
                    ? Number(crid)
                    : (consultantFilterId ?? undefined)
                openBookingModal(
                  toLocalDateTimeString(startDate),
                  toLocalDateTimeString(startDate),
                  resolvedConsultant,
                  false,
                  undefined,
                  undefined,
                  false,
                  undefined,
                  bookingsUseResourceColumns && crid != null ? String(crid) : undefined,
                )
                return
              }
              if (calendarMode === 'spaces') {
                const [startHour, startMinute] = slotMinTime.split(':').map((value) => Number(value) || 0)
                const startDate = new Date(arg.date)
                startDate.setHours(startHour, startMinute, 0, 0)
                const rid = (arg as { resource?: { id?: string } }).resource?.id
                let preselectedSpaceId: number | null
                if (spaceFilterId != null) preselectedSpaceId = spaceFilterId
                else if (rid == null || rid === SPACE_RESOURCE_UNASSIGNED_ID) preselectedSpaceId = null
                else preselectedSpaceId = Number(rid)
                const selectionInfo = getBookableSelectionInfo(
                  toLocalDateTimeString(startDate),
                  toLocalDateTimeString(startDate),
                )
                openBookingModal(
                  toLocalDateTimeString(startDate),
                  toLocalDateTimeString(startDate),
                  selectionInfo.consultantId ?? consultantFilterId ?? user.id,
                  false,
                  preselectedSpaceId,
                  undefined,
                  !selectionInfo.isBookable,
                  undefined,
                  spacesUseResourceColumns && rid != null ? String(rid) : undefined,
                )
                return
              }
              return
            }
            if (arg.allDay) {
              if (!isNativeAndroid) return
              const startDate = new Date(arg.date)
              startDate.setHours(0, 0, 0, 0)
              const endDate = new Date(startDate)
              endDate.setHours(23, 59, 0, 0)
              handleCalendarSelectionFromUi(toLocalDateTimeString(startDate), toLocalDateTimeString(endDate), true)
              return
            }
            if (
              arg.view.type !== 'timeGridWeek' &&
              arg.view.type !== 'timeGridDay' &&
              arg.view.type !== 'timeGridThreeDay' &&
              arg.view.type !== 'resourceTimeGridWeek' &&
              arg.view.type !== 'resourceTimeGridDay' &&
              arg.view.type !== 'resourceTimeGridThreeDay'
            )
              return
            if (!isNativeAndroid && calendarMode !== 'bookings' && calendarMode !== 'spaces') return
            if (isViewOnly) return
            const start = new Date(arg.date)
            const end = new Date(start.getTime() + SLOT_MS)
            const rid = (arg as { resource?: { id?: string } }).resource?.id
            handleCalendarSelectionFromUi(toLocalDateTimeString(start), toLocalDateTimeString(end), false, rid)
          }}
          slotDuration="00:15:00"
          snapDuration="00:15:00"
          slotLabelInterval="00:30:00"
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          height={isNativeAndroid ? '100%' : 'auto'}
          contentHeight={isNativeAndroid ? undefined : 'auto'}
          expandRows={false}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          nowIndicator
          stickyHeaderDates
          stickyFooterScrollbar={false}
          selectable={!isNativeAndroid && !isViewOnly}
          unselectAuto={false}
          selectMinDistance={0}
          selectAllow={(info) => {
            if (!isNativeAndroid && sessionQuickActions) {
              setSessionQuickActions(null)
              setDragSelection(null)
              calendarRef.current?.getApi()?.unselect()
              return false
            }
            if (!isNativeAndroid && overlapDrawerDismissConsumePointerRef.current) {
              setDragSelection(null)
              calendarRef.current?.getApi()?.unselect()
              return false
            }
            if (!isNativeAndroid && overlapDrawerGroupId) {
              overlapDrawerDismissConsumePointerRef.current = true
              armOverlapDrawerDismissPointerCleanup()
              setOverlapDrawerGroupId(null)
              setDragSelection(null)
              calendarRef.current?.getApi()?.unselect()
              return false
            }
            if (!isNativeAndroid && (calendarMode === 'bookings' || calendarMode === 'spaces') && !info.allDay) {
              const now =
                typeof performance !== 'undefined' && typeof performance.now === 'function'
                  ? performance.now()
                  : Date.now()
              if (now - dragSelectThrottleAtRef.current < 56) return true
              dragSelectThrottleAtRef.current = now
              const res = (info as { resource?: { id?: string } }).resource
              setDragSelection({
                start: toLocalDateTimeString(info.start),
                end: toLocalDateTimeString(info.end),
                resourceId: res?.id != null ? String(res.id) : undefined,
              })
              // Inject time label directly into the highlight element
              const hl = document.querySelector('.fc-highlight') as HTMLElement | null
              if (hl) {
                hl.style.position = 'relative'
                let label = hl.querySelector('.fc-highlight-time-label') as HTMLElement | null
                const fmt = (d: Date) => d.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                const text = `${fmt(info.start)} – ${fmt(info.end)}`
                if (!label) {
                  label = document.createElement('div')
                  label.className = 'fc-highlight-time-label'
                  label.style.cssText = 'position:absolute;top:4px;left:6px;font-size:0.78rem;font-weight:600;color:#3b82f6;pointer-events:none;white-space:nowrap;line-height:1.2;z-index:1'
                  hl.appendChild(label)
                }
                label.textContent = text
              }
            }
            return true
          }}
          selectOverlap={(event) => {
            if (calendarMode === 'bookings' || calendarMode === 'spaces') return true
            const kind = event?.extendedProps?.kind
            return kind === 'bookable' || kind === 'non-bookable'
          }}
          events={events}
          select={
            isNativeAndroid
              ? undefined
              : (info) => {
                  setDragSelection(null)
                  if (!isNativeAndroid && overlapDrawerDismissConsumePointerRef.current) {
                    overlapDrawerDismissConsumePointerRef.current = false
                    calendarRef.current?.getApi()?.unselect()
                    return
                  }
                  if (isViewOnly) return
                  if (ignoreNextSelectionRef.current) {
                    ignoreNextSelectionRef.current = false
                    return
                  }
                  if (suppressNextCalendarSelectionRef.current) {
                    calendarRef.current?.getApi()?.unselect()
                    return
                  }
                  if (sessionQuickActions) {
                    closeSessionQuickActions()
                    return
                  }
                  if (overlapDrawerGroupId) {
                    overlapDrawerDismissConsumePointerRef.current = true
                    armOverlapDrawerDismissPointerCleanup()
                    setOverlapDrawerGroupId(null)
                    calendarRef.current?.getApi()?.unselect()
                    return
                  }
                  let startDate: Date
                  let endDate: Date
                  if (info.allDay) {
                    startDate = new Date(info.start)
                    startDate.setHours(0, 0, 0, 0)
                    endDate = new Date(info.end.getTime() - 1)
                    endDate.setHours(23, 59, 0, 0)
                  } else {
                    startDate = info.start
                    endDate = info.end
                  }
                  const start = toLocalDateTimeString(startDate)
                  const end = toLocalDateTimeString(endDate)
                  const highlightEl = document.querySelector('.fc-highlight') as HTMLElement | null
                  const resourceId = (info as { resource?: { id?: string } }).resource?.id ?? null
                  handleCalendarSelection(start, end, {
                    preserveDraggedRange: true,
                    anchorEl: highlightEl,
                    spaceResourceId: spacesUseResourceColumns ? resourceId : undefined,
                    consultantResourceId: bookingsUseResourceColumns ? resourceId : undefined,
                  })
                }
          }
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventDidMount={(info) => {
            // Prevent native browser drag ghost while keeping FullCalendar drag/drop active.
            info.el.setAttribute('draggable', 'false')
            info.el.style.userSelect = 'none'
            ;(info.el.style as any).webkitUserDrag = 'none'
            ;(info.el.style as any).webkitTouchCallout = 'none'
            const k = info.event.extendedProps?.kind

            const isResourceTimeGrid =
              info.view.type === 'resourceTimeGridWeek' ||
              info.view.type === 'resourceTimeGridDay' ||
              info.view.type === 'resourceTimeGridThreeDay'

            // Reserve a lane on the right in normal week/day views (columns are wide enough).
            // In resource week (Consultant ALL / Space ALL) each day cell is already narrow — 34px makes events look like slivers.
            if (
              !isResourceTimeGrid &&
              (info.view.type === 'timeGridWeek' ||
                info.view.type === 'timeGridDay' ||
                info.view.type === 'timeGridThreeDay') &&
              (k === 'booked' || k === 'personal' || k === 'todo' || k === 'draft-preview')
            ) {
              const isNarrowMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) harness.style.setProperty('right', isNarrowMobile ? '0' : '34px', 'important')
            } else if (
              isResourceTimeGrid &&
              (k === 'booked' || k === 'personal' || k === 'todo' || k === 'draft-preview')
            ) {
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) harness.style.setProperty('right', '0', 'important')
            }

            const hasPartialOverlap = !!info.event.extendedProps?.partialOverlapGroupId
            const hasPartialOverlapMain = Number(info.event.extendedProps?.partialOverlapCount || 0) > 0
            const z =
              k === 'draft-preview'
                ? 9
                : hasPartialOverlapMain
                  ? 8
                  : hasPartialOverlap
                    ? 7
                    : k === 'todo'
                      ? 6
                      : k === 'personal'
                        ? 5
                        : k === 'booked'
                          ? 4
                          : k === 'booking-break'
                            ? 3
                            : k === 'bookable'
                              ? 2
                              : 1
            info.el.style.zIndex = String(z)
            if (hasPartialOverlap) {
              const top = Number(info.event.extendedProps?.partialOverlapTopPercent)
              const height = Number(info.event.extendedProps?.partialOverlapHeightPercent)
              if (Number.isFinite(top)) info.el.style.setProperty('--calendar-partial-overlap-top', `${Math.max(0, Math.min(100, top))}%`)
              if (Number.isFinite(height)) info.el.style.setProperty('--calendar-partial-overlap-height', `${Math.max(8, Math.min(100, height))}%`)
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) {
                harness.style.setProperty('z-index', String(z), 'important')
                harness.style.setProperty('left', '0px', 'important')
                harness.style.setProperty('right', '0px', 'important')
                harness.style.setProperty('inset-inline', '0px', 'important')
                harness.style.setProperty('width', 'auto', 'important')
              }
              info.el.style.setProperty('left', '0px', 'important')
              info.el.style.setProperty('right', '0px', 'important')
              info.el.style.setProperty('width', '100%', 'important')
            }
            if (hasPartialOverlapMain) {
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) {
                harness.style.setProperty('z-index', String(z), 'important')
                harness.style.setProperty('left', '0px', 'important')
                harness.style.setProperty('right', '0px', 'important')
                harness.style.setProperty('inset-inline', '0px', 'important')
                harness.style.setProperty('width', 'auto', 'important')
              }
              info.el.style.setProperty('left', '0px', 'important')
              info.el.style.setProperty('right', '0px', 'important')
              info.el.style.setProperty('width', '100%', 'important')
            }
            if (info.event.extendedProps?.overlapGroupId) {
              const harness = info.el.closest('.fc-timegrid-event-harness') as HTMLElement | null
              if (harness) {
                harness.style.setProperty('left', '0px', 'important')
                harness.style.setProperty('right', '0px', 'important')
                harness.style.setProperty('inset-inline', '0px', 'important')
                harness.style.setProperty('width', 'auto', 'important')
              }
              info.el.style.setProperty('left', '0px', 'important')
              info.el.style.setProperty('right', '0px', 'important')
              info.el.style.setProperty('width', '100%', 'important')
            }
            if (k === 'draft-preview') info.el.style.pointerEvents = 'none'
            info.el.removeAttribute('title')
            if (k === 'booked' && info.event.extendedProps?.breakConflict) {
              info.el.title = 'Break overlaps another booking or a personal block.'
            } else if (k === 'booking-break') {
              info.el.title = info.event.extendedProps?.breakConflict
                ? 'Break time overlaps another booking or a personal block.'
                : 'Break time kept unavailable after the session.'
            }
          }}
          eventMouseEnter={(info) => {
            if (isNativeAndroid) return
            if (calendarFiltersBottomBar) return
            if (hideCardTimerRef.current) {
              clearTimeout(hideCardTimerRef.current)
              hideCardTimerRef.current = null
            }
            const tooltip = buildMonthEventTooltip(info.event)
            if (!tooltip) {
              setMonthHoverCard(null)
              return
            }
            const position = getHoverCardPosition(info.view.type, info.el)
            setMonthHoverCard({
              x: position.x,
              y: position.y,
              transform: position.transform,
              timeRange: tooltip.timeRange,
              typeLabel: tooltip.typeLabel,
              clientLabel: tooltip.clientLabel,
              bookingIsGroup: tooltip.bookingIsGroup,
              consultantLabel: tooltip.consultantLabel,
              meetingLink: tooltip.meetingLink,
              meetingProvider: tooltip.meetingProvider,
            })
          }}
          eventMouseLeave={(info) => {
            const hasMeetingLink = !!info.event.extendedProps?.meetingLink
            if (!hasMeetingLink) {
              if (hideCardTimerRef.current) {
                clearTimeout(hideCardTimerRef.current)
                hideCardTimerRef.current = null
              }
              setMonthHoverCard(null)
              return
            }
            const related = (info.jsEvent as MouseEvent).relatedTarget as Node | null
            if (related && hoverCardRef.current?.contains(related)) return
            if (hideCardTimerRef.current) clearTimeout(hideCardTimerRef.current)
            hideCardTimerRef.current = setTimeout(() => {
              setMonthHoverCard(null)
              hideCardTimerRef.current = null
            }, 200)
          }}
          eventDragStart={(info) => {
            setMonthHoverCard(null)
            if (info.event.extendedProps?.kind === 'draft-preview') return
            isDraggingEventRef.current = true
            dragEdgeSideRef.current = 0
            dragEdgeNavAtRef.current = 0
            // Drag mirror can inherit layout; keep harness full-width in dense resource grids.
            requestAnimationFrame(() => {
              document
                .querySelectorAll(
                  '.fc-resourceTimeGridWeek-view .fc-timegrid-event-harness, .fc-resourceTimeGridDay-view .fc-timegrid-event-harness, .fc-resourceTimeGridThreeDay-view .fc-timegrid-event-harness',
                )
                .forEach((el) => (el as HTMLElement).style.setProperty('right', '0', 'important'))
            })
            const kind = info.event.extendedProps?.kind
            if (kind === 'booked' || kind === 'personal' || kind === 'todo') {
              teardownCalendarDragAxisHint()
              const onMove = (ev: PointerEvent) => positionCalendarDragAxisHint(ev.clientY)
              const onTouchMove = (ev: TouchEvent) => {
                const y = ev.touches[0]?.clientY
                if (y != null) positionCalendarDragAxisHint(y)
              }
              const onEnd = () => {
                document.removeEventListener('pointermove', onMove, true)
                document.removeEventListener('pointerup', onEnd, true)
                document.removeEventListener('pointercancel', onEnd, true)
                document.removeEventListener('touchmove', onTouchMove, true)
                calendarDragPointerCleanupRef.current = null
              }
              document.addEventListener('pointermove', onMove, true)
              document.addEventListener('pointerup', onEnd, true)
              document.addEventListener('pointercancel', onEnd, true)
              document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
              calendarDragPointerCleanupRef.current = onEnd
              window.requestAnimationFrame(() => positionCalendarDragAxisHint(info.jsEvent.clientY))
            }
          }}
          eventDragStop={() => {
            setMonthHoverCard(null)
            isDraggingEventRef.current = false
            dragEdgeNavAtRef.current = 0
            dragEdgeSideRef.current = 0
            teardownCalendarDragAxisHint()
            // Delay cleanup so eventDrop/eventResize can read newResource before DOM is altered
            setTimeout(cleanupDragArtifacts, 150)
          }}
          eventClassNames={(arg) => {
            const kind = arg.event.extendedProps?.kind
            if (kind === 'draft-preview') {
              const dk = arg.event.extendedProps?.draftKind || 'booked'
              const previewKind =
                dk === 'availability' && arg.event.extendedProps?.availabilityIntent === 'block'
                  ? 'availability-block'
                  : dk
              return ['calendar-event-draft-preview', `calendar-event-draft-preview--${previewKind}`, 'calendar-event-hover-scale']
            }
            if (kind === 'booked') {
              return [
                'calendar-event-hover-scale',
                'calendar-event-booked-visual',
                ...(sessionQuickActions?.eventKey === String(arg.event.id ?? `booked-${arg.event.extendedProps?.id ?? ''}`) ? ['calendar-event-quick-actions-active'] : []),
                ...(arg.event.extendedProps?.breakConflict ? ['calendar-event-booked-break-conflict'] : []),
                ...(arg.event.extendedProps?.partialOverlapGroupId ? ['calendar-event-partial-overlap-visual', `calendar-event-partial-overlap-${arg.event.extendedProps.partialOverlapPlacement || 'crosses-main'}`] : []),
                ...(Number(arg.event.extendedProps?.partialOverlapCount || 0) > 0 ? ['calendar-event-overlap-main-has-partial'] : []),
                ...(arg.event.extendedProps?.overlapGroupId && arg.event.extendedProps?.overlapGroupId === overlapDrawerGroupId ? ['calendar-event-overlap-main-active'] : []),
              ]
            }
            if (kind === 'booking-break') {
              return [
                'calendar-booking-break-background',
                ...(arg.event.extendedProps?.breakConflict ? ['calendar-booking-break-background--conflict'] : []),
              ]
            }
            if (kind === 'personal') {
              return [
                'calendar-event-hover-scale',
                'calendar-event-personal-visual',
                ...(sessionQuickActions?.eventKey === String(arg.event.id ?? `personal-${arg.event.extendedProps?.id ?? ''}`) ? ['calendar-event-quick-actions-active'] : []),
                ...(arg.event.extendedProps?.partialOverlapGroupId ? ['calendar-event-partial-overlap-visual', `calendar-event-partial-overlap-${arg.event.extendedProps.partialOverlapPlacement || 'crosses-main'}`] : []),
                ...(Number(arg.event.extendedProps?.partialOverlapCount || 0) > 0 ? ['calendar-event-overlap-main-has-partial'] : []),
                ...(arg.event.extendedProps?.overlapGroupId && arg.event.extendedProps?.overlapGroupId === overlapDrawerGroupId ? ['calendar-event-overlap-main-active'] : []),
              ]
            }
            if (kind === 'todo') {
              return [
                'calendar-event-hover-scale',
                'calendar-event-todo-visual',
                ...(sessionQuickActions?.eventKey === String(arg.event.id ?? `todo-${arg.event.extendedProps?.id ?? ''}`) ? ['calendar-event-quick-actions-active'] : []),
              ]
            }
            if (kind === 'bookable' && (calendarMode === 'bookings' || calendarMode === 'spaces')) {
              const classes = ['calendar-availability-bookings-selectable']
              const chunkIndex = Number(arg.event.extendedProps?.bookableChunkIndex)
              const chunkCount = Number(arg.event.extendedProps?.bookableChunkCount)
              if (Number.isFinite(chunkIndex) && Number.isFinite(chunkCount) && chunkCount > 1) {
                if (chunkIndex > 0) classes.push('calendar-availability-chunk-continued-up')
                if (chunkIndex < chunkCount - 1) classes.push('calendar-availability-chunk-continued-down')
              }
              const activeSelection = dragSelection ?? selection
              if (activeSelection?.start && activeSelection?.end && arg.event.start && arg.event.end) {
                const selectionStartMs = new Date(activeSelection.start).getTime()
                const selectionEndMs = new Date(activeSelection.end).getTime()
                const eventStartMs = arg.event.start.getTime()
                const eventEndMs = arg.event.end.getTime()
                const overlapsSelection = selectionStartMs < eventEndMs && selectionEndMs > eventStartMs
                if (bookingsUseResourceColumns) {
                  const selRid = activeSelection.resourceId
                  if (selRid == null) {
                    return classes
                  }
                  const evRid = arg.event.getResources?.()?.[0]?.id
                  if (String(evRid ?? '') !== String(selRid)) {
                    return classes
                  }
                }
                if (spacesUseResourceColumns) {
                  const selRid = activeSelection.resourceId
                  if (selRid == null) {
                    return classes
                  }
                  const evRid = arg.event.getResources?.()?.[0]?.id
                  if (String(evRid ?? '') !== String(selRid)) {
                    return classes
                  }
                }
                if (Number.isFinite(selectionStartMs) && Number.isFinite(selectionEndMs) && overlapsSelection) {
                  classes.push('calendar-availability-bookings-selected')
                  // Mark if the selection extends into the adjacent chunk so we can remove the shared border
                  if (chunkIndex > 0 && selectionStartMs < eventStartMs) classes.push('calendar-availability-selection-joined-up')
                  if (chunkIndex < chunkCount - 1 && selectionEndMs > eventEndMs) classes.push('calendar-availability-selection-joined-down')
                }
              }
              return classes
            }
            if (kind === 'bookable' && calendarMode === 'availability') {
              return ['calendar-availability-clickable']
            }
            if (kind === 'non-bookable' && (calendarMode === 'bookings' || calendarMode === 'spaces')) {
              return ['calendar-non-bookable-background']
            }
            return []
          }}
          eventClick={(info) => {
            setMonthHoverCard(null)
            const clickTarget = info.jsEvent?.target as HTMLElement | null
            if (clickTarget?.closest?.('.calendar-event-overlap-inline-session, .calendar-event-overlap-more, .calendar-event-overlap-mobile-count, .calendar-event-quick-add')) {
              info.jsEvent.preventDefault()
              return
            }
            const props = info.event.extendedProps
            if (openSessionQuickActionMenu(info)) {
              info.jsEvent.preventDefault()
              return
            }
            if (overlapDrawerGroupId) setOverlapDrawerGroupId(null)
            if (props.kind === 'draft-preview') {
              info.jsEvent.preventDefault()
              return
            }
            if (props.kind === 'booked') {
              if (props.masked) return
              setSelection(null)
              calendarRef.current?.getApi()?.unselect()
              placeSessionPopup(info.el)
              setSelectedBookedSession({
                ...props,
                clients: Array.isArray(props.clients) && props.clients.length > 0 ? props.clients : (props.client ? [props.client] : []),
                online: Boolean(props.online ?? props.meetingLink),
                meetingProvider: props.meetingProvider || 'zoom',
              })
              if (useBookingSidePanel && props.id != null) {
                pushCompactFormRoute(`/calendar/booking/${props.id}`)
              }
              clearSessionEventClickChrome(info.el)
              return
            }
            if (props.kind === 'personal') {
              if (props.masked) return
              setSelection(null)
              calendarRef.current?.getApi()?.unselect()
              placeSessionPopup(info.el)
              setSelectedPersonalBlock(props)
              if (useBookingSidePanel && props.id != null) {
                pushCompactFormRoute(`/calendar/personal/${props.id}`)
              }
              clearSessionEventClickChrome(info.el)
              return
            }
            if (props.kind === 'todo') {
              if (props.masked) return
              setSelection(null)
              calendarRef.current?.getApi()?.unselect()
              placeSessionPopup(info.el)
              setSelectedTodo(props)
              if (useBookingSidePanel && props.id != null) {
                pushCompactFormRoute(`/calendar/todo/${props.id}`)
              }
              clearSessionEventClickChrome(info.el)
              return
            }
            if (props.kind === 'bookable' && calendarMode === 'availability') {
              openAvailabilityModalFromSlot(props)
              return
            }
            if (props.kind === 'bookable') {
              if (calendarMode === 'bookings') {
                const start = info.event.start ? toLocalDateTimeString(info.event.start) : selection?.start
                const end = info.event.end ? toLocalDateTimeString(info.event.end) : selection?.end
                const res0 = info.event.getResources?.()?.[0]
                const sr =
                  bookingsUseResourceColumns && res0?.id != null ? String(res0.id) : undefined
                openBookingModal(start, end, props.consultant?.id, false, undefined, undefined, false, info.el, sr)
              }
              if (calendarMode === 'spaces') {
                const start = info.event.start ? toLocalDateTimeString(info.event.start) : selection?.start
                const end = info.event.end ? toLocalDateTimeString(info.event.end) : selection?.end
                const res0 = info.event.getResources?.()?.[0]
                const rid = res0?.id
                let preselectedSpaceId: number | null
                if (spaceFilterId != null) preselectedSpaceId = spaceFilterId
                else if (rid == null || rid === SPACE_RESOURCE_UNASSIGNED_ID) preselectedSpaceId = null
                else preselectedSpaceId = Number(rid)
                const selectionInfo = getBookableSelectionInfo(start, end)
                const sr = spacesUseResourceColumns && rid != null ? String(rid) : undefined
                openBookingModal(
                  start,
                  end,
                  selectionInfo.consultantId ?? props.consultant?.id ?? consultantFilterId ?? user.id,
                  false,
                  preselectedSpaceId,
                  undefined,
                  !selectionInfo.isBookable,
                  info.el,
                  sr,
                )
              }
              return
            }
            if (props.kind === 'booking-break' || props.kind === 'non-bookable') {
              return
            }
            const start = info.event.start ? toLocalDateTimeString(info.event.start) : selection?.start
            const end = info.event.end ? toLocalDateTimeString(info.event.end) : selection?.end
            openBookingModal(start, end, props.consultant?.id, false, undefined, undefined, false, info.el)
          }}
          eventContent={(arg) => {
            const props: any = arg.event.extendedProps
            if (props.kind === 'draft-preview') {
              return <div className="calendar-event-draft-preview-fill" aria-hidden />
            }
            if ((props.kind === 'booked' || props.kind === 'personal' || props.kind === 'todo') && props.masked) {
              return <div style={{ width: '100%', height: '100%' }} />
            }
            const overlapHiddenSessions = Array.isArray(props.overlapHiddenSessions) ? props.overlapHiddenSessions : []
            const overlapHiddenCount = overlapHiddenSessions.length || Number(props.overlapHiddenCount || 0)
            const eventStartMs = arg.event.start ? arg.event.start.getTime() : NaN
            const eventEndMs = arg.event.end ? arg.event.end.getTime() : NaN
            const eventDurationMinutes = Number.isFinite(eventStartMs) && Number.isFinite(eventEndMs)
              ? Math.max(0, Math.round((eventEndMs - eventStartMs) / 60000))
              : 0
            const mainStartTime = props.partialOriginalStart ? formatCalendarClock(props.partialOriginalStart) : (arg.event.start ? formatCalendarClock(arg.event.start.toISOString()) : '')
            const mainEndTime = props.partialOriginalEnd ? formatCalendarClock(props.partialOriginalEnd) : (arg.event.end ? formatCalendarClock(arg.event.end.toISOString()) : '')
            const mainTimeRange = mainStartTime && mainEndTime ? `${mainStartTime} – ${mainEndTime}` : (mainStartTime || mainEndTime || '')
            const maxInlineOverlapSessions = eventDurationMinutes >= 120
              ? 4
              : eventDurationMinutes >= 90
                ? 3
                : eventDurationMinutes >= 55
                  ? 2
                  : eventDurationMinutes >= 40
                    ? 1
                    : 0
            const inlineOverlapSessions = overlapHiddenSessions.slice(0, Math.min(overlapHiddenSessions.length, maxInlineOverlapSessions))
            const remainingInlineOverlapCount = Math.max(0, overlapHiddenSessions.length - inlineOverlapSessions.length)
            const openOverlapGroup = (e: ReactMouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
              e.preventDefault()
              e.stopPropagation()
              if (props.overlapGroupId) setOverlapDrawerGroupId(String(props.overlapGroupId))
            }
            const openQuickAddFromEvent = (e: ReactMouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
              e.preventDefault()
              e.stopPropagation()
              if (isViewOnly) return
              const start = arg.event.start ? toLocalDateTimeString(arg.event.start) : normalizeToLocalDateTime(String(props.startTime || props.start || ''))
              const end = arg.event.end ? toLocalDateTimeString(arg.event.end) : normalizeToLocalDateTime(String(props.endTime || props.end || ''))
              if (!start || !end) return
              const resourceId = String(arg.event.getResources?.()?.[0]?.id ?? '') || undefined
              handleCalendarSelection(start, end, {
                preserveDraggedRange: true,
                anchorEl: e.currentTarget,
                spaceResourceId: spacesUseResourceColumns ? resourceId : undefined,
                consultantResourceId: bookingsUseResourceColumns ? resourceId : undefined,
              })
            }
            const quickAddButton = !isViewOnly && (props.kind === 'booked' || props.kind === 'personal' || props.kind === 'todo') ? (
              <span
                role="button"
                tabIndex={0}
                className="calendar-event-quick-add"
                title={locale === 'sl' ? 'Dodaj nov termin v tem času' : 'Add a new session at this time'}
                aria-label={locale === 'sl' ? 'Dodaj nov termin v tem času' : 'Add a new session at this time'}
                onMouseDown={(e: ReactMouseEvent<HTMLElement>) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={openQuickAddFromEvent}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  openQuickAddFromEvent(e)
                }}
              >
                +
              </span>
            ) : null
            const overlapQueueIndicator = overlapHiddenCount > 0 && props.overlapGroupId ? (
              <span
                className="calendar-event-overlap-queue-indicator"
                aria-label={locale === 'sl' ? `${overlapHiddenCount} dodatnih terminov` : `${overlapHiddenCount} additional sessions`}
                title={locale === 'sl' ? `${overlapHiddenCount} dodatnih terminov` : `${overlapHiddenCount} additional sessions`}
              >
                <span className="calendar-event-overlap-queue-indicator__rail" aria-hidden="true" />
                <span className="calendar-event-overlap-queue-indicator__count" aria-hidden="true">{overlapHiddenCount}</span>
              </span>
            ) : null
            const overlapMore = overlapHiddenCount > 0 && props.overlapGroupId ? (
              <span
                role="button"
                tabIndex={0}
                className="calendar-event-overlap-more"
                title={locale === 'sl' ? 'Prikaži druge rezervirane termine' : 'Show other booked sessions'}
                onMouseDown={(e: ReactMouseEvent<HTMLElement>) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={openOverlapGroup}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  openOverlapGroup(e)
                }}
              >
                {getMoreClientsLabel(overlapHiddenCount)}
              </span>
            ) : null
            const overlapMobileCountButton = overlapHiddenCount > 0 && props.overlapGroupId ? (
              <span
                role="button"
                tabIndex={0}
                className="calendar-event-overlap-mobile-count"
                title={locale === 'sl' ? `${overlapHiddenCount} dodatnih terminov` : `${overlapHiddenCount} additional sessions`}
                aria-label={locale === 'sl' ? `${overlapHiddenCount} dodatnih terminov` : `${overlapHiddenCount} additional sessions`}
                onMouseDown={(e: ReactMouseEvent<HTMLElement>) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={openOverlapGroup}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  openOverlapGroup(e)
                }}
              >
                <span className="calendar-event-overlap-mobile-count__plus" aria-hidden="true">+</span>
                <span className="calendar-event-overlap-mobile-count__num" aria-hidden="true">{overlapHiddenCount}</span>
              </span>
            ) : null
            const overlapInlineSessions = inlineOverlapSessions.length > 0 ? (
              <div className="calendar-event-overlap-inline-list" aria-label={locale === 'sl' ? 'Dodatni termini' : 'Additional sessions'}>
                {inlineOverlapSessions.map((item: any) => {
                  const itemEventId = String(item?.eventId || `${item?.kind || 'session'}-${item?.id || ''}`)
                  const itemTitle = overlapSessionDisplayTitle(item)
                  const itemSubtitle = overlapSessionDisplaySubtitle(item)
                  const itemStart = formatCalendarClock(item?.start)
                  const itemEnd = formatCalendarClock(item?.end)
                  const itemTime = itemStart && itemEnd ? `${itemStart} – ${itemEnd}` : (itemStart || itemEnd || '')
                  const itemLabel = [itemTitle, itemSubtitle, itemTime].filter(Boolean).join(' · ')
                  const showInlineHoverCard = (target: HTMLElement) => {
                    if (isNativeAndroid || calendarFiltersBottomBar) return
                    if (hideCardTimerRef.current) {
                      clearTimeout(hideCardTimerRef.current)
                      hideCardTimerRef.current = null
                    }
                    const tooltip = buildOverlapItemTooltip(item)
                    if (!tooltip) {
                      setMonthHoverCard(null)
                      return
                    }
                    const position = getHoverCardPosition(arg.view.type, target)
                    setMonthHoverCard({
                      x: position.x,
                      y: position.y,
                      transform: position.transform,
                      timeRange: tooltip.timeRange,
                      typeLabel: tooltip.typeLabel,
                      clientLabel: tooltip.clientLabel,
                      bookingIsGroup: tooltip.bookingIsGroup,
                      consultantLabel: tooltip.consultantLabel,
                      meetingLink: tooltip.meetingLink,
                      meetingProvider: tooltip.meetingProvider,
                    })
                  }
                  const hideInlineHoverCard = (relatedTarget?: EventTarget | null) => {
                    const tooltip = buildOverlapItemTooltip(item)
                    if (!tooltip?.meetingLink) {
                      if (hideCardTimerRef.current) {
                        clearTimeout(hideCardTimerRef.current)
                        hideCardTimerRef.current = null
                      }
                      setMonthHoverCard(null)
                      return
                    }
                    const related = relatedTarget as Node | null
                    if (related && hoverCardRef.current?.contains(related)) return
                    if (hideCardTimerRef.current) clearTimeout(hideCardTimerRef.current)
                    hideCardTimerRef.current = setTimeout(() => {
                      setMonthHoverCard(null)
                      hideCardTimerRef.current = null
                    }, 200)
                  }
                  return (
                    <span
                      key={itemEventId}
                      role="button"
                      tabIndex={0}
                      draggable={!isViewOnly}
                      className={["calendar-event-overlap-inline-session", item?.kind === 'personal' ? 'calendar-event-overlap-inline-session--personal' : 'calendar-event-overlap-inline-session--booked'].filter(Boolean).join(' ')}
                      title={itemLabel}
                      aria-label={itemLabel}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e: ReactMouseEvent<HTMLElement>) => e.stopPropagation()}
                      onMouseEnter={(e) => showInlineHoverCard(e.currentTarget)}
                      onMouseLeave={(e) => hideInlineHoverCard(e.relatedTarget)}
                      onFocus={(e) => showInlineHoverCard(e.currentTarget)}
                      onBlur={() => hideInlineHoverCard(null)}
                      onClick={(e: ReactMouseEvent<HTMLElement>) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openOverlapSidebarSession(item, e.currentTarget)
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        e.stopPropagation()
                        openOverlapSidebarSession(item, e.currentTarget)
                      }}
                      onDragStart={(e) => {
                        e.stopPropagation()
                        handleOverlapSidebarDragStart(item, e)
                      }}
                      onDragEnd={(e) => {
                        e.stopPropagation()
                        handleOverlapSidebarDragEnd()
                      }}
                      style={{ '--calendar-overlap-accent': item?.color || (item?.kind === 'personal' ? '#f97316' : item?.kind === 'todo' ? '#2563eb' : '#16a34a') } as React.CSSProperties}
                    >
                      <span className="calendar-event-overlap-inline-session__dot" aria-hidden="true" />
                      <span className="calendar-event-overlap-inline-session__title">{itemTitle}</span>
                      <span className="calendar-event-overlap-inline-session__time">{itemTime}</span>
                    </span>
                  )
                })}
                {remainingInlineOverlapCount > 0 && props.overlapGroupId ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="calendar-event-overlap-more calendar-event-overlap-more--inline-rest"
                    title={locale === 'sl' ? 'Prikaži preostale termine' : 'Show remaining sessions'}
                    onMouseDown={(e: ReactMouseEvent<HTMLElement>) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={openOverlapGroup}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      openOverlapGroup(e)
                    }}
                  >
                    {getMoreClientsLabel(remainingInlineOverlapCount)}
                  </span>
                ) : null}
              </div>
            ) : null
            const overlapCompactContent = overlapInlineSessions || overlapMore
            const partialOverlapPlacement = String(props.partialOverlapPlacement || '')
            const partialOverlapTopPercent = Number(props.partialOverlapTopPercent || 0)
            const partialOverlapHeightPercent = Number(props.partialOverlapHeightPercent || 0)
            const partialOverlapHasBeforeLabel = partialOverlapPlacement === 'starts-before' || partialOverlapPlacement === 'covers-main'
            const partialOverlapHasAfterLabel = partialOverlapPlacement === 'continues-after' || partialOverlapPlacement === 'covers-main' || partialOverlapPlacement === 'crosses-main'
            const partialOverlapAfterTopPercent = Math.max(0, Math.min(100, partialOverlapTopPercent + partialOverlapHeightPercent))
            const renderPartialOverlapContent = (title: string) => {
              if (!props.partialOverlapGroupId) return null
              return (
                <div className="calendar-event-partial-content" aria-label={locale === 'sl' ? 'Delno prekrivajoči termin' : 'Partially overlapping session'}>
                  {partialOverlapHasBeforeLabel ? (
                    <div
                      className="calendar-event-partial-segment calendar-event-partial-segment--before"
                      style={{ height: `${Math.max(0, Math.min(100, partialOverlapTopPercent))}%` }}
                    >
                      <div className="calendar-event-partial-label-row">
                        <span className="calendar-event-partial-label-title">{title}</span>
                        {mainTimeRange ? <span className="calendar-event-partial-label-time">{mainTimeRange}</span> : null}
                      </div>
                    </div>
                  ) : null}
                  {partialOverlapHasAfterLabel ? (
                    <div
                      className="calendar-event-partial-segment calendar-event-partial-segment--after"
                      style={{ top: `${partialOverlapAfterTopPercent}%` }}
                    >
                      <div className="calendar-event-partial-label-row">
                        <span className="calendar-event-partial-label-title">{title}</span>
                        {mainTimeRange ? <span className="calendar-event-partial-label-time">{mainTimeRange}</span> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            }
            if (
              (arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth') &&
              props.kind === 'booked'
            ) {
              const startTime = mainTimeRange
              if (groupBookingEnabled && props.groupId != null && Number(props.groupId) > 0) {
                const label = String(arg.event.title || '').trim() || '—'
                return (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <span className="calendar-event-booked-label--narrow">{label}</span>
                      <span className="calendar-event-booked-label--wide">{label}</span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: '0.82em', opacity: 0.95 }}>{startTime}</span>
                  </div>
                )
              }
              const fallbackTitle = String(arg.event.title || '').trim()
              const narrow = formatBookedBlockDesktopLabel(props, fallbackTitle).split(' · ')[0] || '—'
              const wide = formatBookedBlockDesktopLabel(props, fallbackTitle)
              return (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    <span className="calendar-event-booked-label--narrow">{narrow}</span>
                    <span className="calendar-event-booked-label--wide">{wide}</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: '0.82em', opacity: 0.95 }}>{startTime}</span>
                </div>
              )
            }
            if (
              (arg.view.type === 'dayGridMonth' || arg.view.type === 'resourceDayGridMonth') &&
              props.kind === 'personal'
            ) {
              const startTime = mainTimeRange
              return (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arg.event.title}</span>
                  <span style={{ flexShrink: 0, fontSize: '0.82em', opacity: 0.95 }}>{startTime}</span>
                </div>
              )
            }
            if (props.kind === 'booked') {
              if (groupBookingEnabled && props.groupId != null && Number(props.groupId) > 0) {
                const label = String(arg.event.title || '').trim() || '—'
                const showTimeBelowTitle = Boolean(mainTimeRange) && !overlapCompactContent && !overlapQueueIndicator
                if (props.partialOverlapGroupId && !props.partialContinuationSegment) {
                  return renderPartialOverlapContent(label)
                }
                return (
                  <div className="calendar-event-mobile-content calendar-event-mobile-content--single">
                    <div className="calendar-event-main-row">
                      <div className="calendar-event-main-title-wrap">
                        <div className="calendar-event-mobile-title calendar-event-booked-label--narrow">
                          <span className="calendar-event-mobile-title__name">{label}</span>
                        </div>
                        <div className="calendar-event-mobile-title calendar-event-booked-label--wide">{label}</div>
                      </div>
                      {mainTimeRange && !showTimeBelowTitle ? <div className="calendar-event-main-time">{mainTimeRange}</div> : null}
                    </div>
                    {showTimeBelowTitle ? <div className="calendar-event-main-time calendar-event-main-time--below">{mainTimeRange}</div> : null}
                    {quickAddButton}
                    {overlapMobileCountButton}
                    {overlapQueueIndicator}
                    {overlapCompactContent}
                  </div>
                )
              }
              const fn = String(props?.client?.firstName || '').trim()
              const ln = String(props?.client?.lastName || '').trim()
              const fallbackTitle = String(arg.event.title || '').trim()
              const titleParts = fallbackTitle.split(/\s+/).filter(Boolean)
              const resolvedLastName = ln || (titleParts.length > 1 ? titleParts[titleParts.length - 1] : fallbackTitle)
              const mobileLabel = fallbackTitle || [fn, ln].filter(Boolean).join(' ') || resolvedLastName
              const wide = formatBookedBlockDesktopLabel(props, fallbackTitle || mobileLabel)
              const narrowTypeName = String(props?.type?.name || '').trim()
              const bookingClients = Array.isArray(props?.clients) ? props.clients : []
              const isMultiClient = bookingClients.length > 1
              const narrowPrimaryLabel = isMultiClient
                ? (narrowTypeName || resolvedLastName || mobileLabel || '—')
                : (resolvedLastName || mobileLabel || '—')
              const showTimeBelowTitle = Boolean(mainTimeRange) && !overlapCompactContent && !overlapQueueIndicator
              if (props.partialOverlapGroupId && !props.partialContinuationSegment) {
                return renderPartialOverlapContent(wide)
              }
              return (
                <div className="calendar-event-mobile-content calendar-event-mobile-content--single">
                  <div className="calendar-event-main-row">
                    <div className="calendar-event-main-title-wrap">
                      <div className="calendar-event-mobile-title calendar-event-booked-label--narrow">
                        <span className="calendar-event-mobile-title__name">{narrowPrimaryLabel}</span>
                      </div>
                      <div className="calendar-event-mobile-title calendar-event-booked-label--wide">{wide}</div>
                    </div>
                    {mainTimeRange && !showTimeBelowTitle ? <div className="calendar-event-main-time">{mainTimeRange}</div> : null}
                  </div>
                  {showTimeBelowTitle ? <div className="calendar-event-main-time calendar-event-main-time--below">{mainTimeRange}</div> : null}
                  {quickAddButton}
                  {overlapMobileCountButton}
                  {overlapQueueIndicator}
                  {overlapCompactContent}
                </div>
              )
            }
            if (props.kind === 'personal') {
              const fullTitle = String(arg.event.title || '').trim() || '—'
              const titleParts = fullTitle.split(/\s+/).filter(Boolean)
              const shortTitle =
                titleParts.length > 1 ? String(titleParts[titleParts.length - 1]) : fullTitle
              const showTimeBelowTitle = Boolean(mainTimeRange) && !overlapCompactContent && !overlapQueueIndicator
              if (props.partialOverlapGroupId && !props.partialContinuationSegment) {
                return renderPartialOverlapContent(fullTitle)
              }
              return (
                <div className="calendar-event-mobile-content calendar-event-mobile-content--single">
                  <div className="calendar-event-main-row">
                    <div className="calendar-event-main-title-wrap">
                      <div className="calendar-event-mobile-title calendar-event-personal-title--full">{fullTitle}</div>
                      <div className="calendar-event-mobile-title calendar-event-personal-title--short">{shortTitle}</div>
                    </div>
                    {mainTimeRange && !showTimeBelowTitle ? <div className="calendar-event-main-time">{mainTimeRange}</div> : null}
                  </div>
                  {showTimeBelowTitle ? <div className="calendar-event-main-time calendar-event-main-time--below">{mainTimeRange}</div> : null}
                  {quickAddButton}
                  {overlapMobileCountButton}
                  {overlapQueueIndicator}
                  {overlapCompactContent}
                </div>
              )
            }
            if (props.kind !== 'todo') {
              return (
                <div style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {arg.event.title}
                </div>
              )
            }
            return (
              <div className="calendar-event-todo-row">
                <span className="calendar-event-todo-title">{arg.event.title}</span>
                {quickAddButton}
                {overlapMobileCountButton}
              </div>
            )
          }}
        />
        </div>
        {sessionQuickActions ? (
          <div
            className="calendar-session-action-menu-layer"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault()
                closeSessionQuickActions()
              }
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault()
                closeSessionQuickActions()
              }
            }}
          >
            <div
              className="calendar-session-action-menu"
              style={{ left: sessionQuickActions.menuLeft, top: sessionQuickActions.menuTop }}
              role="menu"
              aria-label={locale === 'sl' ? 'Možnosti termina' : 'Session options'}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" role="menuitem" className="calendar-session-action-menu__item" onClick={openSessionQuickActionExisting}>
                <span className="calendar-session-action-menu__icon" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </span>
                <span>{locale === 'sl' ? 'Odpri' : 'Open'}</span>
              </button>
              <button type="button" role="menuitem" className="calendar-session-action-menu__item" onClick={openSessionQuickActionNew} disabled={isViewOnly}>
                <span className="calendar-session-action-menu__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </span>
                <span>{locale === 'sl' ? 'Novo' : 'New'}</span>
              </button>
              {sessionQuickActions.overlapGroupId && sessionQuickActions.overlapCount > 0 ? (
                <button type="button" role="menuitem" className="calendar-session-action-menu__item calendar-session-action-menu__item--primary" onClick={openSessionQuickActionMore}>
                  <span className="calendar-session-action-menu__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                  <span>+{sessionQuickActions.overlapCount} {locale === 'sl' ? 'več' : 'more'}</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {!isNativeAndroid && showCalendarRightRail ? (
          <div className="calendar-rail-stack">
            {calendarSpacesFeatureActive ? (
              <div className="calendar-mode-toolbar calendar-mode-toolbar--rail">
                <CalendarHeaderModeGroup
                  calendarMode={calendarMode}
                  onModeChange={setCalendarModeView}
                  bookableEnabled={bookableEnabled}
                  spacesEnabled={spacesEnabled}
                />
              </div>
            ) : null}
            {calendarDateNavArrowsInRail && !calendarMobileHeaderNav ? (
              <div className="calendar-rail-stack__tail">
                <div className="calendar-rail-date-nav">
                  <CalendarHeaderDateNavArrows calendarRef={calendarRef} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {showWebMobileBottomPanel && (
          <>
            <div className="calendar-bottom-panel-spacer" aria-hidden />
            <div className="calendar-bottom-panel calendar-bottom-panel--fixed">
            <div className="calendar-bottom-panel__start">
              {showAdminConsultantFilter ? (
                <CalendarRailIconFilters
                  layout="footer"
                  showConsultant
                  showSpace={false}
                  consultantFilterId={consultantFilterId}
                  onConsultantFilterChange={setConsultantFilterId}
                  spaceFilterId={spaceFilterId}
                  onSpaceFilterChange={setSpaceFilterId}
                  consultantUsers={metaUsers.filter((u: any) => u.consultant)}
                  spaces={metaSpaces}
                />
              ) : null}
            </div>
            <div className="calendar-bottom-panel__center" style={{ gap: 12 }}>
              <button type="button" className="calendar-bottom-panel-pill calendar-bottom-panel-pill--button" onClick={openSessionsSheet}>
                {bottomPillLabel}
              </button>
            </div>
            <div className="calendar-bottom-panel__end">
              {calendarSpacesFeatureActive && calendarMode !== 'availability' ? (
                <CalendarRailIconFilters
                  layout="footer"
                  showConsultant={false}
                  showSpace
                  consultantFilterId={consultantFilterId}
                  onConsultantFilterChange={setConsultantFilterId}
                  spaceFilterId={spaceFilterId}
                  onSpaceFilterChange={setSpaceFilterId}
                  consultantUsers={metaUsers.filter((u: any) => u.consultant)}
                  spaces={metaSpaces}
                />
              ) : null}
            </div>
          </div>
          </>
        )}
        {!isNativeAndroid && useUnassignedDrawer && !activeOverlapGroup && (
          <aside className="calendar-overlap-drawer calendar-unassigned-hover-drawer" aria-label={locale === 'sl' ? 'Nedodeljeni termini' : 'Unassigned sessions'} tabIndex={0}>
            <div className="calendar-overlap-drawer__handle" aria-hidden="true">
              <span className="calendar-unassigned-hover-drawer__handle-label">N/A</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
            <div className="calendar-overlap-drawer__header">
              <div>
                <h3>{locale === 'sl' ? 'N/A termini' : 'N/A sessions'}</h3>
                <p>
                  {unassignedDrawerSessions.length} {locale === 'sl' ? (unassignedDrawerSessions.length === 1 ? 'nedodeljen termin' : 'nedodeljenih terminov') : `unassigned session${unassignedDrawerSessions.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <div className="calendar-overlap-drawer__hint">
              {unassignedDrawerOpenHint}
            </div>
            <div className="calendar-overlap-drawer__list">
              {unassignedDrawerSessions.length === 0 ? (
                <div className="calendar-overlap-drawer__empty">
                  {locale === 'sl' ? 'Trenutno ni nedodeljenih terminov v prikazanem obdobju.' : 'There are no unassigned sessions in the visible range.'}
                </div>
              ) : unassignedDrawerSessions.map((item: any) => {
                const eventId = String(item.eventId || `${item.kind}-${item.id}`)
                const editingTime = overlapInlineTimeEdit?.eventId === eventId
                return (
                  <div
                    key={eventId}
                    className={[
                      'calendar-overlap-session-card',
                      overlapSidebarDraggingId === eventId ? 'calendar-overlap-session-card--dragging' : '',
                      editingTime ? 'calendar-overlap-session-card--editing-time' : '',
                    ].filter(Boolean).join(' ')}
                    draggable={!editingTime}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      const target = e.target as HTMLElement
                      if (target.closest('button, input, select, textarea, a, .calendar-overlap-session-card__time-editor')) return
                      openOverlapSidebarSession(item, e.currentTarget)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      const target = e.target as HTMLElement
                      if (target.closest('button, input, select, textarea, a, .calendar-overlap-session-card__time-editor')) return
                      e.preventDefault()
                      openOverlapSidebarSession(item, e.currentTarget)
                    }}
                    onDragStart={(e) => handleOverlapSidebarDragStart(item, e)}
                    onDragEnd={handleOverlapSidebarDragEnd}
                    style={{ '--calendar-overlap-accent': overlapSessionAccentColor(item) } as React.CSSProperties}
                  >
                    <div className="calendar-overlap-session-card__icon" aria-hidden="true">
                      {renderOverlapSessionIcon(item)}
                    </div>
                    <div className="calendar-overlap-session-card__body">
                      <div className="calendar-overlap-session-card__title">{overlapSessionDisplayTitle(item)}</div>
                      <div className="calendar-overlap-session-card__subtitle">{overlapSessionDisplaySubtitle(item)}</div>
                      <div className="calendar-overlap-session-card__meta">
                        <span>{overlapSessionLocationLabel(item)}</span>
                        <button
                          type="button"
                          className="calendar-overlap-session-card__time"
                          onClick={(e) => {
                            e.stopPropagation()
                            beginOverlapInlineTimeEdit(item)
                          }}
                          title={locale === 'sl' ? 'Uredi čas' : 'Edit time'}
                        >
                          {formatCalendarClock(item.start)} – {formatCalendarClock(item.end)}
                        </button>
                      </div>
                    </div>
                    <span className="calendar-overlap-session-card__count">N/A</span>
                    {editingTime && overlapInlineTimeEdit ? (
                      <div
                        className="calendar-overlap-session-card__time-editor"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        <label>
                          <span>{locale === 'sl' ? 'Začetek' : 'Start'}</span>
                          <input
                            type="datetime-local"
                            value={overlapInlineTimeEdit.start}
                            disabled={!!overlapInlineTimeEdit.saving}
                            onChange={(e) => setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, start: e.target.value, error: null } : prev)}
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Konec' : 'End'}</span>
                          <input
                            type="datetime-local"
                            value={overlapInlineTimeEdit.end}
                            disabled={!!overlapInlineTimeEdit.saving}
                            onChange={(e) => setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, end: e.target.value, error: null } : prev)}
                          />
                        </label>
                        {overlapInlineTimeEdit.error ? (
                          <div className="calendar-overlap-session-card__time-error">{overlapInlineTimeEdit.error}</div>
                        ) : null}
                        <div className="calendar-overlap-session-card__time-actions">
                          <button
                            type="button"
                            className="calendar-overlap-session-card__time-cancel"
                            disabled={!!overlapInlineTimeEdit.saving}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOverlapInlineTimeEdit(null)
                            }}
                          >
                            {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            className="calendar-overlap-session-card__time-save"
                            disabled={!!overlapInlineTimeEdit.saving}
                            onClick={(e) => {
                              e.stopPropagation()
                              void saveOverlapInlineTimeEdit(item)
                            }}
                          >
                            {overlapInlineTimeEdit.saving ? (locale === 'sl' ? 'Shranjevanje…' : 'Saving…') : (locale === 'sl' ? 'Shrani čas' : 'Save time')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="calendar-overlap-drawer__footer">
              {unassignedDrawerFooterHint}
            </div>
          </aside>
        )}
        {!isNativeAndroid && activeOverlapGroup && (
          <aside className="calendar-overlap-drawer" aria-label={locale === 'sl' ? 'Ostali termini' : 'Other sessions'}>
            <div className="calendar-overlap-drawer__handle" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
            <div className="calendar-overlap-drawer__header">
              <div>
                <h3>{locale === 'sl' ? 'Ostali termini' : 'Other sessions'}</h3>
                <p>
                  {formatCalendarDateLabel(activeOverlapGroup.start)} · {formatCalendarClock(activeOverlapGroup.start)} – {formatCalendarClock(activeOverlapGroup.end)}
                </p>
              </div>
              <button
                type="button"
                className="calendar-overlap-drawer__close"
                aria-label={locale === 'sl' ? 'Zapri' : 'Close'}
                onClick={() => setOverlapDrawerGroupId(null)}
              >
                ×
              </button>
            </div>
            <div className="calendar-overlap-drawer__hint">
              {locale === 'sl'
                ? 'Vsi termini potekajo hkrati. Za urejanje posameznega termina ga odprite.'
                : 'All sessions happen at the same time. Open an individual session to manage it.'}
            </div>
            <div
              className="calendar-overlap-session-card calendar-overlap-session-card--summary"
              role="button"
              tabIndex={0}
              onClick={(e) => openOverlapSidebarSession(activeOverlapGroup.main, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                openOverlapSidebarSession(activeOverlapGroup.main, e.currentTarget)
              }}
              style={{ '--calendar-overlap-accent': overlapSessionAccentColor(activeOverlapGroup.main) } as React.CSSProperties}
            >
              <div className="calendar-overlap-session-card__icon" aria-hidden="true">
                {renderOverlapSessionIcon(activeOverlapGroup.main)}
              </div>
              <div className="calendar-overlap-session-card__body">
                <div className="calendar-overlap-session-card__title">{overlapSessionDisplayTitle(activeOverlapGroup.main)}</div>
                <div className="calendar-overlap-session-card__subtitle">{overlapSessionDisplaySubtitle(activeOverlapGroup.main)}</div>
                <div className="calendar-overlap-session-card__meta">
                  <span>{overlapSessionLocationLabel(activeOverlapGroup.main)}</span>
                  <span className="calendar-overlap-session-card__time calendar-overlap-session-card__time--static">
                    {formatCalendarClock(activeOverlapGroup.main.start)} – {formatCalendarClock(activeOverlapGroup.main.end)}
                  </span>
                </div>
              </div>
              <span className="calendar-overlap-session-card__count calendar-overlap-session-card__count--visible">
                {activeOverlapGroup.hidden.length + 1} {locale === 'sl' ? 'termini' : 'sessions'}
              </span>
            </div>
            <div className="calendar-overlap-drawer__list">
              {activeOverlapGroup.hidden.map((item: any) => {
                const eventId = String(item.eventId || `${item.kind}-${item.id}`)
                const editingTime = overlapInlineTimeEdit?.eventId === eventId
                return (
                  <div
                    key={eventId}
                    className={["calendar-overlap-session-card", overlapSidebarDraggingId === eventId ? 'calendar-overlap-session-card--dragging' : '', editingTime ? 'calendar-overlap-session-card--editing-time' : ''].filter(Boolean).join(' ')}
                    draggable={!editingTime}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      const target = e.target as HTMLElement
                      if (target.closest('button, input, select, textarea, a, .calendar-overlap-session-card__time-editor')) return
                      openOverlapSidebarSession(item, e.currentTarget)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      const target = e.target as HTMLElement
                      if (target.closest('button, input, select, textarea, a, .calendar-overlap-session-card__time-editor')) return
                      e.preventDefault()
                      openOverlapSidebarSession(item, e.currentTarget)
                    }}
                    onDragStart={(e) => handleOverlapSidebarDragStart(item, e)}
                    onDragEnd={handleOverlapSidebarDragEnd}
                    style={{ '--calendar-overlap-accent': overlapSessionAccentColor(item) } as React.CSSProperties}
                  >
                    <div className="calendar-overlap-session-card__icon" aria-hidden="true">
                      {renderOverlapSessionIcon(item)}
                    </div>
                    <div className="calendar-overlap-session-card__body">
                      <div className="calendar-overlap-session-card__title">{overlapSessionDisplayTitle(item)}</div>
                      <div className="calendar-overlap-session-card__subtitle">{overlapSessionDisplaySubtitle(item)}</div>
                      <div className="calendar-overlap-session-card__meta">
                        <span>{overlapSessionLocationLabel(item)}</span>
                        <button
                          type="button"
                          className="calendar-overlap-session-card__time"
                          onClick={(e) => {
                            e.stopPropagation()
                            beginOverlapInlineTimeEdit(item)
                          }}
                          title={locale === 'sl' ? 'Uredi čas' : 'Edit time'}
                        >
                          {formatCalendarClock(item.start)} – {formatCalendarClock(item.end)}
                        </button>
                      </div>
                    </div>
                    <span className="calendar-overlap-session-card__count">{overlapSessionItemCountLabel(item)}</span>
                    <button
                      type="button"
                      className="calendar-overlap-session-card__main"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOverlapSessionAsMain(item)
                      }}
                    >
                      {locale === 'sl' ? 'Glavni' : 'Main'}
                    </button>
                    {editingTime && overlapInlineTimeEdit ? (
                      <div
                        className="calendar-overlap-session-card__time-editor"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        <label>
                          <span>{locale === 'sl' ? 'Začetek' : 'Start'}</span>
                          <input
                            type="datetime-local"
                            value={overlapInlineTimeEdit.start}
                            disabled={!!overlapInlineTimeEdit.saving}
                            onChange={(e) => setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, start: e.target.value, error: null } : prev)}
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Konec' : 'End'}</span>
                          <input
                            type="datetime-local"
                            value={overlapInlineTimeEdit.end}
                            disabled={!!overlapInlineTimeEdit.saving}
                            onChange={(e) => setOverlapInlineTimeEdit((prev) => prev && prev.eventId === eventId ? { ...prev, end: e.target.value, error: null } : prev)}
                          />
                        </label>
                        {overlapInlineTimeEdit.error ? (
                          <div className="calendar-overlap-session-card__time-error">{overlapInlineTimeEdit.error}</div>
                        ) : null}
                        <div className="calendar-overlap-session-card__time-actions">
                          <button
                            type="button"
                            className="calendar-overlap-session-card__time-cancel"
                            disabled={!!overlapInlineTimeEdit.saving}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOverlapInlineTimeEdit(null)
                            }}
                          >
                            {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            className="calendar-overlap-session-card__time-save"
                            disabled={!!overlapInlineTimeEdit.saving}
                            onClick={(e) => {
                              e.stopPropagation()
                              void saveOverlapInlineTimeEdit(item)
                            }}
                          >
                            {overlapInlineTimeEdit.saving ? (locale === 'sl' ? 'Shranjevanje…' : 'Saving…') : (locale === 'sl' ? 'Shrani čas' : 'Save time')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="calendar-overlap-drawer__footer">
              {locale === 'sl'
                ? `${activeOverlapGroup.hidden.length} dodatnih terminov`
                : `${activeOverlapGroup.hidden.length} additional session${activeOverlapGroup.hidden.length === 1 ? '' : 's'}`}
            </div>
          </aside>
        )}
        </div>
        {monthHoverCard && !calendarFiltersBottomBar && (
          <div
            ref={hoverCardRef}
            className="calendar-month-hover-card"
            style={{ left: monthHoverCard.x, top: monthHoverCard.y, transform: monthHoverCard.transform }}
            onMouseEnter={() => {
              if (hideCardTimerRef.current) {
                clearTimeout(hideCardTimerRef.current)
                hideCardTimerRef.current = null
              }
            }}
            onMouseLeave={() => {
              setMonthHoverCard(null)
            }}
          >
            <div className="calendar-month-hover-row calendar-month-hover-time">{monthHoverCard.timeRange}</div>
            <div className="calendar-month-hover-row">{t('calendarHoverType')}: {monthHoverCard.typeLabel}</div>
            {monthHoverCard.clientLabel && (
              <div className="calendar-month-hover-row">
                {monthHoverCard.bookingIsGroup ? t('formGroup') : t('formClient')}: {monthHoverCard.clientLabel}
              </div>
            )}
            <div className="calendar-month-hover-row">{t('calendarConsultant')}: {monthHoverCard.consultantLabel}</div>
            {monthHoverCard.meetingLink && (
              <div className="calendar-month-hover-row">
                {t('calendarHoverMeetingLink')}:{' '}
                <a
                  href={monthHoverCard.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="linkish"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(monthHoverCard.meetingProvider === 'google' || monthHoverCard.meetingLink.includes('meet.google.com')) ? t('formOpenGoogleMeet') : t('formOpenZoom')}
                </a>
              </div>
            )}
          </div>
        )}
        </div>
        </div>
        {isNativeAndroid && (isTenantAdmin || spacesEnabled) && (
          <div
            className="calendar-android-filters-footer"
            style={{ position: 'relative', zIndex: 5 }}
          >
            <div className="calendar-android-filter-footer-left">
              {showAdminConsultantFilter && (
                <button
                  type="button"
                  className="calendar-android-filter-chip"
                  title={t('calendarConsultant')}
                  onClick={() => setAndroidFilterPicker('consultant')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>{selectedConsultantLabel}</span>
                </button>
              )}
            </div>
            <div className="calendar-android-filter-footer-center">
              <button type="button" className="calendar-bottom-panel-pill calendar-bottom-panel-pill--button calendar-bottom-panel-pill--android" onClick={openSessionsSheet}>
                {bottomPillLabel}
              </button>
            </div>
            <div className="calendar-android-filter-footer-right">
              {calendarSpacesFeatureActive && calendarMode !== 'availability' && (
                <button
                  type="button"
                  className="calendar-android-filter-chip"
                  title={t('calendarSpace')}
                  onClick={() => setAndroidFilterPicker('space')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span>{selectedSpaceLabel}</span>
                </button>
              )}
            </div>
          </div>
        )}
        {isNativeAndroid && androidFilterPicker && (
          <div className="modal-backdrop" onClick={() => setAndroidFilterPicker(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <PageHeader title={androidFilterPicker === 'consultant' ? t('calendarConsultant') : t('calendarSpace')} />
              <div className="stack gap-sm">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (androidFilterPicker === 'consultant') setConsultantFilterId(null)
                    else setSpaceFilterId(null)
                    setAndroidFilterPicker(null)
                  }}
                >
                  {androidFilterPicker === 'consultant' ? t('calendarFilterByStaffColumns') : t('calendarSpaceFilterAllLocations')}
                </button>
                {androidFilterPicker === 'consultant' && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setConsultantFilterId(CONSULTANT_FILTER_ALL_SESSION)
                      setAndroidFilterPicker(null)
                    }}
                  >
                    {t('calendarFilterAllSessionsMerged')}
                  </button>
                )}
                {androidFilterPicker === 'consultant'
                  ? metaUsers.filter((u: any) => u.consultant).map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setConsultantFilterId(u.id)
                          setAndroidFilterPicker(null)
                        }}
                      >
                        {fullName(u)}
                      </button>
                    ))
                  : (metaSpaces).map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setSpaceFilterId(s.id)
                          setAndroidFilterPicker(null)
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
              </div>
            </div>
          </div>
        )}
        {isNativeAndroid && todosModuleEnabled && androidTodoOpen && (
          <div className="modal-backdrop" onClick={() => setAndroidTodoOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <PageHeader title={t('calendarTodoTasks')} />
              <div className="stack gap-sm">
                {(todosModuleEnabled ? calendarData.todos || [] : []).length === 0 ? (
                  <div className="muted">{t('calendarNoTasks')}</div>
                ) : (
                  (todosModuleEnabled ? calendarData.todos || [] : []).map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setSelectedTodo(t)
                        setAndroidTodoOpen(false)
                      }}
                    >
                      {t.task || t('calendarTodo')}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        </div>

      </Card>

      {sessionsSheetState !== 'closed' && (
        <div className="calendar-sessions-sheet-layer" onClick={closeSessionsSheet}>
          <div
            className={`calendar-sessions-sheet calendar-sessions-sheet--${sessionsSheetState}`}
            style={{ transform: sessionsSheetTransform }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="calendar-sessions-sheet-handle-wrap"
              onMouseDown={onSessionsSheetHandlePointerDown}
              onMouseMove={onSessionsSheetHandlePointerMove}
              onMouseUp={onSessionsSheetHandlePointerUp}
              onMouseLeave={onSessionsSheetHandlePointerUp}
              onTouchStart={onSessionsSheetHandlePointerDown}
              onTouchMove={onSessionsSheetHandlePointerMove}
              onTouchEnd={onSessionsSheetHandlePointerUp}
            >
              <div className="calendar-sessions-sheet-handle" />
              <div className="calendar-sessions-sheet-title">{bottomPillLabel}</div>
            </div>
            <div className="calendar-sessions-sheet-list">
              {todayRemainingSessions.length === 0 ? (
                <div className="calendar-sessions-sheet-empty">{t('calendarSessionsRemainingEmpty')}</div>
              ) : (
                todayRemainingSessions.map((row) => (
                  <button
                    key={`${row.props?.id || row.title}-${row.start?.toISOString() || ''}`}
                    type="button"
                    className="calendar-sessions-sheet-card"
                    onClick={(e) => openBookedSessionFromSheet(row, e.currentTarget)}
                  >
                    <div className="calendar-sessions-sheet-card-top">
                      <strong>{row.title}</strong>
                      <span>{fullName(row.props?.consultant || { firstName: '', lastName: '' })}</span>
                    </div>
                    <div className="calendar-sessions-sheet-card-meta">
                      <span>{row.start?.toLocaleTimeString(calendarLocaleTag, { hour: '2-digit', minute: '2-digit', hour12: false })} - {row.end?.toLocaleTimeString(calendarLocaleTag, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                      <span>{row.durationMinutes} min</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {confirmSwap && (
        <div className="modal-backdrop" onClick={cancelSwap}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title="Switch sessions?"
              subtitle={`This will swap "${fullName(confirmSwap.dragged.client)}" with "${fullName(confirmSwap.target.client)}". Both sessions will exchange their time slots.`}
            />
            <div className="row gap">
              <button onClick={confirmSwapSessions}>Yes, switch</button>
              <button className="secondary" onClick={cancelSwap}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <CalendarSessionModals ctx={calendarSessionModalProps} />

      {(calendarClientDetailId || calendarGroupDetailId) && (
        <Suspense fallback={null}>
          <EmbeddedClientsPage
            embeddedClientId={calendarClientDetailId}
            embeddedGroupId={calendarGroupDetailId}
            onEmbeddedClose={closeCalendarClientDetail}
            onEmbeddedSaved={refreshCalendarAfterClientEdit}
          />
        </Suspense>
      )}

      {calendarEditOpenBillId && (
        <Suspense fallback={null}>
          <EmbeddedBillingPage
            embeddedOpenBillId={calendarEditOpenBillId}
            onEmbeddedClose={closeCalendarOpenBillEditor}
            onEmbeddedSaved={refreshCalendarAfterOpenBillEdit}
          />
        </Suspense>
      )}

      {calendarCreateAdvanceRequest && (
        <Suspense fallback={null}>
          <EmbeddedBillingPage
            embeddedCreateBill={calendarCreateAdvanceRequest}
            onEmbeddedClose={closeCalendarAdvanceEditor}
            onEmbeddedSaved={refreshCalendarAfterOpenBillEdit}
          />
        </Suspense>
      )}

      {aiBookingEnabled &&
        (isNativeAndroid || !calendarFiltersBottomBar) &&
        createPortal(
          <button
            type="button"
            className={`calendar-voice-fab${isNativeAndroid ? ' calendar-voice-fab--android' : ''}${voiceListening ? ' calendar-voice-fab--listening' : ''}`}
            disabled={voiceBookingLoading}
            onClick={() => {
              if (voiceListening) {
                void stopVoiceBooking()
                return
              }
              startVoiceBooking()
            }}
            title={
              voiceBookingConfigured === false
                ? (locale === 'sl' ? 'AI glasovna dejanja zahtevajo OPENAI_API_KEY na strežniku' : 'AI voice actions require OPENAI_API_KEY on the server')
                : voiceBookingLoading
                  ? (locale === 'sl' ? 'Obdelava…' : 'Processing…')
                  : voiceListening
                    ? (locale === 'sl' ? 'Poslušam…' : 'Listening…')
                    : (locale === 'sl' ? 'Zaženi AI glasovna dejanja' : 'Start AI voice actions')
            }
            aria-label={locale === 'sl' ? 'Zaženi AI glasovna dejanja' : 'Start AI voice actions'}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>,
          document.body,
        )}
    </div>
  )
}
