// @ts-nocheck
import { DesktopSelect } from '../../../components/DesktopSelect'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { createPortal } from 'react-dom'
import { api } from '../../../api'
import { bookingStatusDisplayLabel, deriveBookingStatus } from '../calendarStatus'
import { CalendarServiceChainEditor, serviceDescription } from './CalendarServiceChainEditor'
import { CalendarSectionIcon } from './CalendarIcons'
import { CalendarSessionQuickBilling } from './CalendarSessionQuickBilling'
import { useMobileKeyboardOpen } from '../../../hooks/useMobileKeyboardOpen'
import { SimpleClientCreatePage } from '../../clients/SimpleClientCreatePage'
import { hasEmployeePermission } from '../../../lib/employeePermissions'
import { urlForNewForm } from '../../calendarFormRoutes'
import {
  ConfirmDialog,
  PanelActionBar,
  PanelBanner,
  PanelBody,
  PanelButton,
  PanelFooter,
  PanelHeader,
  PanelMenuItem,
  PanelOverflowMenu,
  PanelSection,
  PanelTabs,
  SidePanel,
  useConfirm,
} from '../../../components/panel'

function CalendarWarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

function CalendarGroupFormIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function CalendarBookingQuickOptionIcon({ name }: { name: 'group' | 'online' | 'allDay' | 'repeat' | 'notes' }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (name === 'group') {
    return (
      <svg {...common}>
        <circle cx="9" cy="7" r="3" />
        <path d="M3.5 19c.45-3.1 2.25-4.7 5.5-4.7s5.05 1.6 5.5 4.7" />
        <path d="M16 4.7a2.7 2.7 0 0 1 0 5.2M15.2 14.5c3.1-.1 5 1.4 5.5 4.5" />
      </svg>
    )
  }

  if (name === 'online') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.1 2.35 3.15 5.35 3.15 9S14.1 18.65 12 21M12 3C9.9 5.35 8.85 8.35 8.85 12S9.9 18.65 12 21" />
      </svg>
    )
  }

  if (name === 'allDay') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 9h16" />
      </svg>
    )
  }

  if (name === 'notes') {
    return (
      <svg {...common}>
        <path d="M6 3.5h9l3 3V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5Z" />
        <path d="M15 3.5V7h3M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M20 7h-5V2" />
      <path d="M4.6 9A8 8 0 0 1 18.8 5L20 7" />
      <path d="M4 17h5v5" />
      <path d="M19.4 15A8 8 0 0 1 5.2 19L4 17" />
    </svg>
  )
}

function CalendarBookingHeaderSaveIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function CalendarBookingMeetingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  )
}

function CalendarBookingEditIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function CalendarBookingAddIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function CalendarClientProfileSectionIcon({ name }: { name: 'person' | 'email' | 'phone' }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'email') {
    return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
  }
  if (name === 'phone') {
    return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" /></svg>
  }
  return <svg {...common}><circle cx="12" cy="7" r="4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></svg>
}

/** "sob., 15. avg. · 10:15 – 11:45" — the date line under a panel title. */
function formatPanelSlotSubtitle(start?: string | null, end?: string | null, locale?: string): string {
  if (!start) return ''
  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) return ''
  const tag = locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB'
  const day = startDate.toLocaleDateString(tag, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = (value: Date) =>
    value.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit', hour12: false })
  const endDate = end ? new Date(end) : null
  const range =
    endDate && !Number.isNaN(endDate.getTime()) ? `${time(startDate)} – ${time(endDate)}` : time(startDate)
  return `${day} · ${range}`
}

/** Joins the pieces of a collapsed-section summary, falling back to an em dash. */
function joinSummary(...parts: Array<string | null | undefined | false>): string {
  const kept = parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
  return kept.length > 0 ? kept.join(' · ') : '—'
}

function truncateSummary(value: string | null | undefined, max = 60): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function bookingFormSignature(session: any, clientIds: any[], services: any[]) {
  if (!session) return ''
  const normalizedNumber = (value: any) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null
  }
  return JSON.stringify({
    clients: Array.from(new Set((clientIds || []).map(Number).filter((value) => Number.isFinite(value) && value > 0))).sort((left, right) => left - right),
    groupId: normalizedNumber(session?.group?.id ?? session?.groupId),
    maxParticipantsOverride: normalizedNumber(session?.maxParticipantsOverride),
    consultantId: normalizedNumber(session?.consultant?.id ?? session?.consultantId),
    startTime: String(session?.startTime ?? ''),
    endTime: String(session?.endTime ?? ''),
    services: (services || []).map((service: any) => ({
      typeId: normalizedNumber(service?.typeId ?? service?.type?.id),
      spaceId: normalizedNumber(service?.spaceId ?? service?.space?.id),
      durationMinutesOverride: Number.isFinite(Number(service?.durationMinutesOverride)) ? Number(service.durationMinutesOverride) : null,
      grossPriceOverride: Number.isFinite(Number(service?.grossPriceOverride)) ? Number(service.grossPriceOverride) : null,
    })),
    notes: String(session?.notes ?? ''),
    online: Boolean(session?.online),
    meetingProvider: String(session?.meetingProvider ?? ''),
    meetingLink: String(session?.meetingLink ?? ''),
    repeats: Boolean(session?.repeats),
    repeatInterval: Number(session?.repeatInterval ?? 1),
    repeatUnit: String(session?.repeatUnit ?? ''),
    repeatDay: String(session?.repeatDay ?? ''),
    repeatEndType: String(session?.repeatEndType ?? ''),
    repeatEndCount: Number(session?.repeatEndCount ?? 0),
    repeatEndDate: String(session?.repeatEndDate ?? ''),
    sessionConsumables: Array.isArray(session?.sessionConsumables) ? session.sessionConsumables : null,
    resetSessionConsumablesToDefaults: Boolean(session?.resetSessionConsumablesToDefaults),
  })
}

export function CalendarSessionModals({ ctx }: { ctx: any }) {
  const useResponsiveDesktopCreatePanels = true
  const {BookingTypeTabIcon,CalendarFormFooterDeleteIcon,CalendarFormFooterSaveIcon,CalendarLocalTimeDateRow,CalendarLocalTimespanRow,CalendarPaymentCompanyIcon,CalendarPaymentPersonIcon,CalendarScannerIcon,GuestConfigSaveIcon,LanguageModal,PageHeader,PersonalTaskCombo,REPEAT_WEEKDAY_EN,ROUTE_NEW_BOOKING,SessionNotesTextarea,activateNewFormPanel,addBookingGroupCaptionId,addBookingOnlineCaptionId,addClientInlineTitle,addGroupInlineTitle,androidLanguageModal,applyBookedSessionClientIds,applyFormClientIds,availabilityAllDayCaptionId,availabilityError,availabilityIntent,availabilityRangeEndInputRef,availabilityRangeStartInputRef,availabilitySaving,availabilitySelection,bookSessionClientFieldCompact,bookSessionClientsExpanded,bookSessionGroupFieldCompact,bookSessionNotesExpanded,bookSessionSelectedClient,bookSessionSelectedClients,bookedClientDropdownOpen,bookedClientSearch,bookedClientSearchInputRef,bookedPaymentClientDisplay,bookedPaymentManagerTab,bookedPaymentMenuOpen,bookedPaymentMeta,bookedPaymentPayeeDisplay,bookedPaymentPayeeDrafts,bookedPaymentPayeesUseSameCompanyForAll,bookedPaymentSidebarStatusMeta,bookedPaymentTotals,bookedPrimaryPaymentStatus,bookedSessionClientFieldCompact,bookedSessionClientsExpanded,bookedSessionGroupId,bookedSessionIsGroup,bookedSessionOnlineCaptionId,bookedSessionResolvedGroup,bookedSessionSelectedClient,bookedSessionSelectedClients,bookedStatusLabel,bookedStatusMenuOpen,bookedStatusTagColors,bookedStatusTransitionTargets,bookingEndEditedManuallyRef,bookingGroupMode,bookingPayeeCompanies,bookingStatusTagColors,calendarClientDetailId,calendarDashboardSelectionOnly,calendarFiltersBottomBar,calendarFormPageLayout,cancelBookedPersonalOverlap,cancelNonBookableMove,clearSingleClientTitle,clearSingleGroupTitle,clientDropdownOpen,clientError,clientSearch,clientSearchInputRef,clientSearchPlaceholder,closeBookedModal,closeBookingSelection,closePersonalModal,closeTodoModal,compactSelectionCheckAria,compactSessionEditHeader,confirmAvailabilityFromHeader,confirmBookedPersonalOverlap,confirmBookedPersonalOverlapYes,confirmDelete,confirmNonBookable,confirmNonBookableMove,confirmNonBookableMoveYes,confirmNonBookableYes,confirmOverlap,createClientFromBooking,createGroupFromBooking,createOpenBillForPaymentStatus,currency,deleteBookedSession,deletePersonalBlock,deleteTodo,completeTodo,editBookedAllDayCaptionId,form,formatDateTime,formatRepeatWeekdayLabel,fullName,getBookingEndTimeForStart,getMoreClientsLabel,getSessionPopupDragHandleProps,getSessionPopupInlineStyle,groupBookingEnabled,groupDropdownOpen,groupModalError,groupSearch,groupSearchInputRef,groupSearchPlaceholder,groupedSingleInvoiceClient,groupedSingleInvoicePayeeDraft,groupedSingleInvoiceStatus,hiddenBookSessionClientCount,hiddenBookedSessionClientCount,invoiceAllocationForPaymentStatus,isGroupedSingleInvoiceMode,isLocalBookingAllDay,isLocalTodoAllDayStart,isNativeAndroid,localTodayYmd,locale,locationFilterId,meetingPickerCancelUnchecksOnline,meetingProviderPickerOpen,meetingProviderPickerTarget,metaClients,metaConsultants,metaLocations,metaSpaces,metaTypes,metaUsers,multipleClientsPerSessionEnabled,newBookingAllDayCaptionId,newClientForm,newClientInitials,newGroupForm,newGroupMemberIds,newGroupMemberSearch,normalizeToLocalDateTime,onNewFormPanelTouchEnd,onNewFormPanelTouchStart,openAvailabilityModalFromSelection,openBookedPaymentAddClient,openBookedPaymentDetailsForClient,openBookedSessionGroupScanner,openBookedPaymentEntitlementScanner,openPaymentInvoicePdf,openBookedPaymentOpenBillEditor,openBookedPaymentAdvanceEditor,openCalendarClientDetail,openCalendarGroupDetail,openBookedSessionGroupGuests,parseClientNameInput,paymentManagerIsNewBooking,paymentManagerSessionClients,paymentStatusForClient,personInitials,personalEditAllDayCaptionId,personalFormAllDayCaptionId,personalModuleEnabled,personalTaskPresetDropdownOpen,personalTaskPresets,renderBookingModeTitle,resendPaymentInvoicePdf,saveBookedPaymentManager,saveBooking,saveBookingError,saveBookingLoading,savingClient,savingNewGroupModal,selectableMetaTypes,selectedBookedClientIds,selectedBookedPaymentClient,selectedBookedPaymentClientDraft,selectedBookedPaymentLinkedCompany,selectedBookedPaymentPayeeDraft,selectedBookedPaymentPayeeLocked,selectedBookedPaymentClientIsGroupMember,selectedBookedPaymentStatus,selectedBookedSession,selectedFormClientIds,selectedGroup,selectedPersonalBlock,selectedTodo,selection,sessionPopupRef,setAndroidLanguageModal,setAvailabilityError,setAvailabilityIntent,setAvailabilitySelection,setBookSessionClientsExpanded,setBookSessionNotesExpanded,setBookedClientDropdownOpen,setBookedClientSearch,setBookedPaymentAddMode,setBookedPaymentAddSearch,setBookedPaymentGroupNameDraft,setBookedPaymentManagerTab,setBookedPaymentMenuOpen,setBookedSessionClientsExpanded,setBookedStatusMenuOpen,setBookedPaymentSharedCompanyForAll,setBookingGroupMode,setClientDropdownOpen,setClientSearch,setConfirmDelete,setConfirmNonBookable,setConfirmOverlap,setEditingBookedClientSearch,setEditingClientSearch,setEditingGroupSearch,setForm,setGroupDropdownOpen,setGroupModalError,setGroupSearch,setMeetingPickerCancelUnchecksOnline,setMeetingProviderPickerOpen,setMeetingProviderPickerTarget,setNewClientForm,setNewGroupForm,setNewGroupMemberIds,setNewGroupMemberSearch,setPersonalTaskPresetDropdownOpen,setSaveBookingError,setSelectedBookedPaymentClientId,setSelectedBookedSession,setSelectedPersonalBlock,setSelectedTodo,setShowAddClientModal,setShowAddGroupModal,settings,showAddClientModal,showAddGroupModal,showBookingConsultantRow,showBookingSpaceRow,showBookingTypeRow,showLessClientsLabel,showSelectionFormFooter,splitLocalDateTimeParts,t,toCalendarTimeValue,todoEditAllDayCaptionId,todoFormAllDayCaptionId,todosModuleEnabled,toggleBookedPaymentSameCompanyForAll,markBookedClientsNoShow,transitionBookedStatus,updateBookedSession,updateBookingFormEndTime,updateBookingFormStartTime,updateBookingFormType,updateBookingFormServices,updateSelectedBookedSessionServices,updateSelectedBookedSessionStartTime,formServiceDrafts,formServiceChain,bookedServiceDrafts,bookedServiceChain,formServiceWarnings,bookedServiceWarnings,updatePersonalBlock,updateSelectedBookedPaymentClientDraft,updateSelectedBookedPaymentPayee,updateTodo,useBookingSidePanel,user,showToast,loadCalendarRangeOnly,visibleBookSessionClientChips,visibleBookedClients,visibleBookedSessionClientChips,visibleClients,visibleGroups,bookedPaymentAddCandidates,bookedPaymentAddMode,bookedPaymentAddSearch,paymentManagerAddClientSelectionActive,PAYMENT_MANAGER_ADD_CLIENT_ID,addBookedPaymentClientToSession,removeBookedPaymentClientFromGroup,removeBookedPaymentClientFromSession,bookedPaymentGroupNameDraft,canIssueOpenInvoice,canIssueAdvanceInvoice} = ctx

  const canViewConsumables = hasEmployeePermission(user, 'CONSUMABLES_VIEW')
  const canEditConsumables = hasEmployeePermission(user, 'CONSUMABLES_EDIT')

  const confirm = useConfirm()
  const location = useLocation()
  /** Which "dodaj termin" tab the form state currently represents. */
  const activeNewFormPanel = availabilitySelection
    ? 'availability'
    : form.todo
      ? 'todo'
      : form.personal
        ? 'personal'
        : 'booking'
  const newFormPanelSubtitle = formatPanelSlotSubtitle(
    form.startTime || selection?.start,
    form.endTime || selection?.end,
    locale,
  )
  const bookedPanelSubtitle = formatPanelSlotSubtitle(
    selectedBookedSession?.startTime,
    selectedBookedSession?.endTime,
    locale,
  )
  const personalPanelSubtitle = formatPanelSlotSubtitle(
    selectedPersonalBlock?.startTime,
    selectedPersonalBlock?.endTime,
    locale,
  )
  const todoPanelSubtitle = formatPanelSlotSubtitle(selectedTodo?.startTime, selectedTodo?.endTime, locale)

  const [bookedEditPanelTab, setBookedEditPanelTab] = useState<'basic' | 'notes' | 'invoice' | 'advance'>('basic')

  useEffect(() => {
    setBookedEditPanelTab('basic')
  }, [selectedBookedSession?.id])

  // --- Collapsed-section summaries -----------------------------------------
  // Each collapsed card reports what it holds, so nothing is hidden without a trace.
  const sectionLabels = {
    clients: t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient'),
    group: t('formGroup'),
    service: locale === 'sl' ? 'Storitev' : locale === 'sr' ? 'Usluga' : 'Service',
    consumables: locale === 'sl' ? 'Porabni material' : locale === 'sr' ? 'Potrošni materijal' : 'Consumables',
    schedule: locale === 'sl' ? 'Čas in datum' : locale === 'sr' ? 'Vreme i datum' : 'Time and date',
    notes: t('formNotes'),
    repeats: t('formRepeats'),
    allDay: t('formAllDay'),
    online: locale === 'sl' ? 'Online' : 'Online',
    noneSelected: locale === 'sl' ? 'Ni izbrano' : locale === 'sr' ? 'Nije izabrano' : 'Not selected',
  }

  const clientNamesSummary = (clients: any[]) => {
    const names = (clients || []).map((client: any) => fullName(client)).filter(Boolean)
    if (names.length === 0) return ''
    if (names.length <= 2) return names.join(', ')
    return `${names[0]}, ${names[1]} +${names.length - 2}`
  }

  const servicesSummary = (drafts: any[]) => {
    const names = (drafts || [])
      .map((draft: any) => {
        const type = metaTypes?.find((entry: any) => Number(entry.id) === Number(draft?.typeId))
        return type ? serviceDescription(type, locale) : ''
      })
      .filter(Boolean)
    if (names.length === 0) return ''
    return names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`
  }

  const scheduleSummary = (start: any, end: any, opts?: { repeats?: boolean }) =>
    joinSummary(
      formatPanelSlotSubtitle(start, end, locale),
      isLocalBookingAllDay(start, end) ? sectionLabels.allDay : null,
      opts?.repeats ? sectionLabels.repeats : null,
    )

  const newFormClientsSummary = bookingGroupMode
    ? joinSummary(selectedGroup?.name, sectionLabels.group)
    : joinSummary(clientNamesSummary(bookSessionSelectedClients), form.online ? sectionLabels.online : null)
  const newFormServiceSummary = joinSummary(servicesSummary(formServiceDrafts))
  const newFormScheduleSummary = scheduleSummary(
    form.startTime || selection?.start,
    form.endTime || selection?.end,
    { repeats: Boolean(form.repeats) },
  )
  const newFormNotesSummary = joinSummary(truncateSummary(form.notes))

  const bookedClientsSummary = bookedSessionIsGroup
    ? joinSummary(bookedSessionResolvedGroup?.name ?? selectedBookedSession?.groupName, sectionLabels.group)
    : joinSummary(
        clientNamesSummary(bookedSessionSelectedClients),
        selectedBookedSession?.online ? sectionLabels.online : null,
      )
  const bookedServiceSummary = joinSummary(servicesSummary(bookedServiceDrafts))
  const bookedScheduleSummary = scheduleSummary(
    selectedBookedSession?.startTime,
    selectedBookedSession?.endTime,
    { repeats: Boolean(selectedBookedSession?.repeats) },
  )
  const bookedNotesSummary = joinSummary(truncateSummary(selectedBookedSession?.notes))

  const closeMeetingProviderPicker = () => {
    setMeetingProviderPickerOpen(false)
    setMeetingProviderPickerTarget(null)
    setMeetingPickerCancelUnchecksOnline(false)
  }

  /** Dismissing without a choice turns Online back off when the picker was opened by that checkbox. */
  const dismissMeetingProviderPicker = () => {
    if (meetingPickerCancelUnchecksOnline) {
      if (meetingProviderPickerTarget === 'edit') {
        setSelectedBookedSession((s: any) => (s ? { ...s, online: false } : s))
      } else {
        setForm((f: any) => ({ ...f, online: false }))
      }
    }
    closeMeetingProviderPicker()
  }

  const pickMeetingProvider = (provider: 'zoom' | 'google') => {
    if (meetingProviderPickerTarget === 'edit') {
      setSelectedBookedSession((s: any) => (s ? { ...s, meetingProvider: provider, online: true } : s))
    } else {
      setForm((f: any) => ({ ...f, meetingProvider: provider, online: true }))
    }
    closeMeetingProviderPicker()
  }

  const spacesForLocation = (locationId: unknown) => {
    const normalized = Number(locationId)
    if (!Number.isFinite(normalized) || normalized <= 0) return metaSpaces
    return metaSpaces.filter((space: any) => Number(space?.location?.id ?? space?.locationId) === normalized)
  }
  const formSpaces = spacesForLocation(locationFilterId)
  const bookedSpaces = spacesForLocation(locationFilterId)
  const consultantsForLocation = (locationId: unknown) => {
    const normalized = Number(locationId)
    return metaUsers.filter((candidate: any) => {
      if (!candidate?.consultant || candidate?.active === false) return false
      if (!Number.isFinite(normalized) || normalized <= 0 || candidate?.availableAllLocations !== false) return true
      return Array.isArray(candidate?.locationIds)
        && candidate.locationIds.some((id: unknown) => Number(id) === normalized)
    })
  }
  const formConsultants = consultantsForLocation(form?.locationId ?? locationFilterId)
  const bookedConsultants = consultantsForLocation(selectedBookedSession?.location?.id ?? locationFilterId)
  const typesForLocation = (types: any[], locationId: unknown) => {
    const normalized = Number(locationId)
    if (!Number.isFinite(normalized) || normalized <= 0) return types
    return types.filter((type: any) => type?.availableAllLocations !== false
      || (Array.isArray(type?.locationIds) && type.locationIds.some((id: unknown) => Number(id) === normalized)))
  }
  const formSelectableMetaTypes = typesForLocation(selectableMetaTypes, form?.locationId)
  const bookedSessionSelectableMetaTypes = bookedSessionIsGroup
    ? metaTypes.filter((type: any) => type?.active !== false && type?.groupBookingEnabled === true)
    : metaTypes
  const bookedSessionSelectableMetaTypesForLocation = typesForLocation(
    bookedSessionSelectableMetaTypes,
    selectedBookedSession?.location?.id,
  )

  // Consultant and space live in the Storitev card, which the chain editor owns,
  // so both panels hand them to the editor as children.
  const newFormShowSpaceRow =
    showBookingSpaceRow
    && (!showBookingTypeRow || formServiceDrafts.filter((service: any) => service.typeId != null).length <= 1)
  const newFormServiceExtraRows = (showBookingConsultantRow || newFormShowSpaceRow) ? (
    <>
      {showBookingConsultantRow && (
        <div className="form-row form-row-infield calendar-booking-field--consultant">
          <span className="form-field-inline-label">{t('formConsultant')}</span>
          <div className="form-field-inline-control">
            <DesktopSelect
              disabled={form.todo || form.personal}
              value={form.consultantId ?? ''}
              onChange={(e) => setForm({ ...form, consultantId: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">{t('formUnassigned')}</option>
              {formConsultants.map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
            </DesktopSelect>
          </div>
        </div>
      )}
      {newFormShowSpaceRow && (
        <div className="form-row form-row-infield calendar-booking-field--space">
          <span className="form-field-inline-label">{t('formCalendarBookingSpace')}</span>
          <div className="form-field-inline-control">
            <DesktopSelect
              value={form.spaceId || ''}
              onChange={(e) => {
                const nextSpaceId = Number(e.target.value) || null
                updateBookingFormServices(formServiceDrafts.map((service: any, index: number) => (
                  index === 0 ? { ...service, spaceId: nextSpaceId } : service
                )))
              }}
            >
              <option value="">{t('formNoSpace')}</option>
              {formSpaces.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </DesktopSelect>
          </div>
        </div>
      )}
    </>
  ) : null

  const bookedShowSpaceRow =
    showBookingSpaceRow
    && (!showBookingTypeRow || bookedServiceDrafts.filter((service: any) => service.typeId != null).length <= 1)


  const toggleNewBookingAllDay = () => {
    if (isLocalBookingAllDay(form.startTime, form.endTime)) {
      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(form.startTime)).date || localTodayYmd()
      const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
      updateBookingFormStartTime(normalizeToLocalDateTime(`${d}T${hm}:00`))
      return
    }
    const d = splitLocalDateTimeParts(normalizeToLocalDateTime(form.startTime)).date || localTodayYmd()
    bookingEndEditedManuallyRef.current = true
    setForm({
      ...form,
      startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
      endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
    })
  }

  const scrollNewBookingMobileSectionIntoView = (selector: string, fallbackSelector?: string) => {
    const tryScroll = (attempt: number) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const body = document.getElementById('calendar-new-booking-scroll-body')
          if (!body) return

          const primaryTarget = body.querySelector(selector)
          const fallbackTarget = attempt >= 3 && fallbackSelector ? body.querySelector(fallbackSelector) : null
          const target = (primaryTarget || fallbackTarget) as HTMLElement | null
          if (!target) {
            if (attempt < 4) window.setTimeout(() => tryScroll(attempt + 1), 35)
            return
          }

          const bodyRect = body.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const targetTop = body.scrollTop + targetRect.top - bodyRect.top - 8
          body.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
        })
      })
    }

    tryScroll(0)
  }

  const toggleNewBookingGroupMode = (next?: boolean) => {
    const on = typeof next === 'boolean' ? next : !bookingGroupMode
    setBookingGroupMode(on)
    if (on) {
      const firstGroupType = metaTypes.find((type: any) => type?.active !== false && type?.groupBookingEnabled === true)
      const compatibleServices = formServiceDrafts.filter((service: any) => {
        if (service.typeId == null) return true
        const type = metaTypes.find((entry: any) => Number(entry?.id) === Number(service.typeId))
        return type?.active !== false && type?.groupBookingEnabled === true
      })
      const nextServices = compatibleServices.some((service: any) => service.typeId != null)
        ? compatibleServices
        : [{ typeId: firstGroupType?.id ?? null, spaceId: formServiceDrafts[0]?.spaceId ?? form.spaceId ?? null }]
      setForm((prev: any) => ({ ...prev, clientId: null, clientIds: [] }))
      updateBookingFormServices(nextServices)
      return
    }

    const firstActiveType = metaTypes.find((type: any) => type?.active !== false)
    setForm((prev: any) => ({ ...prev, groupId: null }))
    if (!formServiceDrafts.some((service: any) => service.typeId != null) && firstActiveType) {
      updateBookingFormServices([{ typeId: firstActiveType.id, spaceId: formServiceDrafts[0]?.spaceId ?? form.spaceId ?? null }])
    }
    setGroupSearch('')
    setGroupDropdownOpen(false)
    setEditingGroupSearch(false)
  }

  const toggleNewBookingOnline = (next?: boolean) => {
    const on = typeof next === 'boolean' ? next : !form.online
    if (on) {
      setForm((prev: any) => ({ ...prev, online: true }))
      setMeetingPickerCancelUnchecksOnline(true)
      setMeetingProviderPickerTarget('create')
      setMeetingProviderPickerOpen(true)
      return
    }

    setForm((prev: any) => ({ ...prev, online: false }))
    setMeetingProviderPickerOpen(false)
    setMeetingProviderPickerTarget(null)
    setMeetingPickerCancelUnchecksOnline(false)
  }

  const toggleNewBookingRepeats = (next?: boolean) => {
    const on = typeof next === 'boolean' ? next : !form.repeats
    const startDate = form.startTime ? new Date(form.startTime) : null
    const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
    setForm((prev: any) => ({ ...prev, repeats: on, repeatDay: sessionDay }))
  }

  const renderNewBookingRepeats = (includeToggleRow: boolean) => {
    const dateLoc = locale === 'sl' ? 'sl-SI' : 'en-GB'
    const startDate = form.startTime ? new Date(form.startTime) : null
    const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
    const sessionDateStr = startDate
      ? startDate.toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      : ''
    const repeatInterval = form.repeatInterval ?? 1
    const repeatUnit = form.repeatUnit ?? 'weeks'
    const repeatEndType = form.repeatEndType ?? 'after'
    const repeatEndCount = Math.max(2, Math.min(100, Math.floor(Number(form.repeatEndCount) || 2)))
    const repeatEndDate = form.repeatEndDate ?? ''
    const summaryTail = repeatEndType === 'after'
      ? t('formRepeatEndsAfter').replace('{count}', String(repeatEndCount))
      : repeatEndDate
        ? t('formRepeatEndsOn').replace(
            '{date}',
            new Date(repeatEndDate).toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
          )
        : t('formRepeatNoEndDate')
    const summaryLine = t('formRepeatSummaryLine').replace('{from}', sessionDateStr).replace('{tail}', summaryTail)

    return (
      <div className={`form-row-repeats-section calendar-booking-repeats-section${form.repeats ? ' calendar-booking-repeats-section--expanded' : ''}`}>
        {includeToggleRow && (
          <div className="form-row form-row-infield form-row--bare">
            <span className="form-field-inline-label">{t('formRepeats')}</span>
            <div className="form-field-inline-control">
              <label className="repeats-toggle-switch">
                <input
                  type="checkbox"
                  checked={!!form.repeats}
                  onChange={(e) => setForm({ ...form, repeats: e.target.checked, repeatDay: sessionDay })}
                />
                <span className="repeats-toggle-slider" />
              </label>
            </div>
          </div>
        )}
        {form.repeats && (
          <div className="form-repeats-config">
            <div className="form-repeats-row form-repeats-row--every">
              <span className="form-repeats-leading-icon" aria-hidden>
                <CalendarBookingQuickOptionIcon name="repeat" />
              </span>
              <span className="form-repeats-label">{t('formRepeatsEvery')}</span>
              <input
                type="number"
                min={1}
                max={52}
                className="form-repeats-number form-repeats-number--interval"
                value={repeatInterval}
                onChange={(e) => setForm({ ...form, repeatInterval: Math.max(1, Number(e.target.value) || 1) })}
              />
              <DesktopSelect
                className="form-repeats-select form-repeats-select--unit"
                value={repeatUnit}
                onChange={(e) => setForm({ ...form, repeatUnit: e.target.value })}
              >
                <option value="days">{t('formRepeatUnitDays')}</option>
                <option value="weeks">{t('formRepeatUnitWeeks')}</option>
                <option value="months">{t('formRepeatUnitMonths')}</option>
              </DesktopSelect>
            </div>
            {repeatUnit === 'weeks' && (
              <div className="form-repeats-row form-repeats-row--day">
                <span className="form-repeats-label">{t('formRepeatsOnDay')}</span>
                <DesktopSelect
                  className="form-repeats-select form-repeats-select--day"
                  value={form.repeatDay ?? sessionDay}
                  onChange={(e) => setForm({ ...form, repeatDay: e.target.value })}
                >
                  {REPEAT_WEEKDAY_EN.map((d) => (
                    <option key={d} value={d}>{formatRepeatWeekdayLabel(locale, d)}</option>
                  ))}
                </DesktopSelect>
              </div>
            )}
            <div className="form-repeats-row form-repeats-row--ends">
              <span className="form-repeats-label">{t('formRepeatsEnds')}</span>
              <DesktopSelect
                className="form-repeats-select form-repeats-select--end-type"
                value={repeatEndType}
                onChange={(e) => setForm({ ...form, repeatEndType: e.target.value })}
              >
                <option value="after">{t('formRepeatEndAfter')}</option>
                <option value="on">{t('formRepeatEndOnDate')}</option>
              </DesktopSelect>
              {repeatEndType === 'after' && (
                <input
                  type="number"
                  min={2}
                  max={100}
                  className="form-repeats-number form-repeats-number--end-count"
                  value={form.repeatEndCount ?? 5}
                  onChange={(e) => {
                    const raw = e.target.value
                    setForm({
                      ...form,
                      repeatEndCount: raw === '' ? '' : Math.min(100, Math.max(0, Math.floor(Number(raw) || 0))),
                    })
                  }}
                  onBlur={(e) =>
                    setForm({
                      ...form,
                      repeatEndCount: Math.max(2, Math.min(100, Math.floor(Number(e.target.value) || 2))),
                    })
                  }
                />
              )}
              {repeatEndType === 'on' && (
                <input
                  type="date"
                  className="form-repeats-date form-repeats-date--end-date"
                  value={repeatEndDate}
                  onChange={(e) => setForm({ ...form, repeatEndDate: e.target.value })}
                />
              )}
            </div>
            <p className="form-repeats-summary muted">
              {summaryLine}
            </p>
          </div>
        )}
      </div>
    )
  }

  const toggleBookedSessionAllDay = () => {
    if (!selectedBookedSession) return
    if (isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime)) {
      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(selectedBookedSession.startTime)).date || localTodayYmd()
      const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
      updateSelectedBookedSessionStartTime(normalizeToLocalDateTime(`${d}T${hm}:00`))
      return
    }
    const d = splitLocalDateTimeParts(normalizeToLocalDateTime(selectedBookedSession.startTime)).date || localTodayYmd()
    setSelectedBookedSession({
      ...selectedBookedSession,
      startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
      endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
    })
  }

  const toggleSelectedPersonalAllDay = () => {
    setSelectedPersonalBlock((prev: any) => {
      if (!prev) return prev
      if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
        const d = splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
        const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
        const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
        const end = getBookingEndTimeForStart(start, null)
        return { ...prev, startTime: start, endTime: end }
      }
      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
      return {
        ...prev,
        startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
        endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
      }
    })
  }

  const toggleSelectedTodoAllDay = () => {
    setSelectedTodo((prev: any) => {
      if (!prev) return prev
      if (isLocalTodoAllDayStart(prev.startTime)) {
        const d = splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
        const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
        return { ...prev, startTime: normalizeToLocalDateTime(`${d}T${hm}:00`) }
      }
      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
      return { ...prev, startTime: normalizeToLocalDateTime(`${d}T00:00:00`) }
    })
  }

  const toggleNewTodoAllDay = () => {
    setForm((current: any) => {
      if (isLocalTodoAllDayStart(current.startTime)) {
        const d = splitLocalDateTimeParts(normalizeToLocalDateTime(current.startTime)).date || localTodayYmd()
        const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
        return { ...current, startTime: normalizeToLocalDateTime(`${d}T${hm}:00`) }
      }
      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(current.startTime)).date || localTodayYmd()
      return { ...current, startTime: normalizeToLocalDateTime(`${d}T00:00:00`) }
    })
  }

  const toggleNewPersonalAllDay = () => {
    setForm((current: any) => {
      if (isLocalBookingAllDay(current.startTime, current.endTime)) {
        const d = splitLocalDateTimeParts(normalizeToLocalDateTime(current.startTime)).date || localTodayYmd()
        const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
        const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
        const end = getBookingEndTimeForStart(start, null)
        return { ...current, startTime: start, endTime: end }
      }
      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(current.startTime)).date || localTodayYmd()
      return {
        ...current,
        startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
        endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
      }
    })
  }

  const renderBookedRepeats = (includeToggleRow: boolean) => {
    if (!selectedBookedSession) return null
    const dateLoc = locale === 'sl' ? 'sl-SI' : 'en-GB'
    const startDate = selectedBookedSession.startTime ? new Date(selectedBookedSession.startTime) : null
    const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
    const sessionDateStr = startDate
      ? startDate.toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      : ''
    const repeatInterval = selectedBookedSession.repeatInterval ?? 1
    const repeatUnit = selectedBookedSession.repeatUnit ?? 'weeks'
    const repeatEndType = selectedBookedSession.repeatEndType ?? 'after'
    const repeatEndCount = Math.max(2, Math.min(100, Math.floor(Number(selectedBookedSession.repeatEndCount) || 2)))
    const repeatEndDate = selectedBookedSession.repeatEndDate ?? ''
    const summaryTail = repeatEndType === 'after'
      ? t('formRepeatEndsAfter').replace('{count}', String(repeatEndCount))
      : repeatEndDate
        ? t('formRepeatEndsOn').replace(
            '{date}',
            new Date(repeatEndDate).toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
          )
        : t('formRepeatNoEndDate')
    const summaryLine = t('formRepeatSummaryLine').replace('{from}', sessionDateStr).replace('{tail}', summaryTail)

    return (
      <div className={`form-row-repeats-section calendar-booking-repeats-section${selectedBookedSession.repeats ? ' calendar-booking-repeats-section--expanded' : ''}`}>
        {includeToggleRow && (
          <div className="form-row form-row-infield form-row--bare">
            <span className="form-field-inline-label">{t('formRepeats')}</span>
            <div className="form-field-inline-control">
              <label className="repeats-toggle-switch">
                <input
                  type="checkbox"
                  checked={!!selectedBookedSession.repeats}
                  onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeats: e.target.checked, repeatDay: sessionDay })}
                />
                <span className="repeats-toggle-slider" />
              </label>
            </div>
          </div>
        )}
        {selectedBookedSession.repeats && (
          <div className="form-repeats-config">
            <div className="form-repeats-row form-repeats-row--every">
              <span className="form-repeats-leading-icon" aria-hidden>
                <CalendarBookingQuickOptionIcon name="repeat" />
              </span>
              <span className="form-repeats-label">{t('formRepeatsEvery')}</span>
              <input
                type="number"
                min={1}
                max={52}
                className="form-repeats-number form-repeats-number--interval"
                value={repeatInterval}
                onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatInterval: Math.max(1, Number(e.target.value) || 1) })}
              />
              <DesktopSelect
                className="form-repeats-select form-repeats-select--unit"
                value={repeatUnit}
                onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatUnit: e.target.value })}
              >
                <option value="days">{t('formRepeatUnitDays')}</option>
                <option value="weeks">{t('formRepeatUnitWeeks')}</option>
                <option value="months">{t('formRepeatUnitMonths')}</option>
              </DesktopSelect>
            </div>
            {repeatUnit === 'weeks' && (
              <div className="form-repeats-row form-repeats-row--day">
                <span className="form-repeats-label">{t('formRepeatsOnDay')}</span>
                <DesktopSelect
                  className="form-repeats-select form-repeats-select--day"
                  value={selectedBookedSession.repeatDay ?? sessionDay}
                  onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatDay: e.target.value })}
                >
                  {REPEAT_WEEKDAY_EN.map((d) => (
                    <option key={d} value={d}>{formatRepeatWeekdayLabel(locale, d)}</option>
                  ))}
                </DesktopSelect>
              </div>
            )}
            <div className="form-repeats-row form-repeats-row--ends">
              <span className="form-repeats-label">{t('formRepeatsEnds')}</span>
              <DesktopSelect
                className="form-repeats-select form-repeats-select--end-type"
                value={repeatEndType}
                onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndType: e.target.value })}
              >
                <option value="after">{t('formRepeatEndAfter')}</option>
                <option value="on">{t('formRepeatEndOnDate')}</option>
              </DesktopSelect>
              {repeatEndType === 'after' && (
                <input
                  type="number"
                  min={2}
                  max={100}
                  className="form-repeats-number form-repeats-number--end-count"
                  value={selectedBookedSession.repeatEndCount ?? 5}
                  onChange={(e) => {
                    const raw = e.target.value
                    setSelectedBookedSession({
                      ...selectedBookedSession,
                      repeatEndCount: raw === '' ? '' : Math.min(100, Math.max(0, Math.floor(Number(raw) || 0))),
                    })
                  }}
                  onBlur={(e) =>
                    setSelectedBookedSession({
                      ...selectedBookedSession,
                      repeatEndCount: Math.max(2, Math.min(100, Math.floor(Number(e.target.value) || 2))),
                    })
                  }
                />
              )}
              {repeatEndType === 'on' && (
                <input
                  type="date"
                  className="form-repeats-date form-repeats-date--end-date"
                  value={repeatEndDate}
                  onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndDate: e.target.value })}
                />
              )}
            </div>
            <p className="form-repeats-summary muted">{summaryLine}</p>
          </div>
        )}
      </div>
    )
  }

  const [bookedBillingActionMenu, setBookedBillingActionMenu] = useState<null | 'advance' | 'invoice'>(null)
  const [bookedBillingView, setBookedBillingView] = useState<null | 'advances' | 'invoices'>(null)
  const [bookedBillingViewSourceSession, setBookedBillingViewSourceSession] = useState<any>(null)
  const [noShowClientPickerOpen, setNoShowClientPickerOpen] = useState(false)
  const [noShowSelectedClientIds, setNoShowSelectedClientIds] = useState<number[]>([])
  const [noShowSubmitting, setNoShowSubmitting] = useState(false)
  const [bookedEntitlementTarget, setBookedEntitlementTarget] = useState<any>(null)
  const [bookedEntitlementStep, setBookedEntitlementStep] = useState<'choice' | 'scanner' | 'manual' | 'wallet'>('choice')
  const [bookedEntitlementManualCode, setBookedEntitlementManualCode] = useState('')
  const [bookedEntitlementSubmitting, setBookedEntitlementSubmitting] = useState(false)
  const [bookedEntitlementScanResult, setBookedEntitlementScanResult] = useState<{ tone: 'success' | 'error' | 'info'; text: string; detail?: string } | null>(null)
  const [bookedEntitlementWalletOptions, setBookedEntitlementWalletOptions] = useState<any[]>([])
  const [bookedEntitlementWalletLoading, setBookedEntitlementWalletLoading] = useState(false)
  const [bookedEntitlementCameraActive, setBookedEntitlementCameraActive] = useState(false)
  const [newSlotWaitlistMatches, setNewSlotWaitlistMatches] = useState<any>(null)
  const [newSlotWaitlistLoading, setNewSlotWaitlistLoading] = useState(false)
  const [newSlotWaitlistOpen, setNewSlotWaitlistOpen] = useState(false)
  const [mobileBookingStatusDraft, setMobileBookingStatusDraft] = useState<string | null>(null)
  const [isCalendarCreateMobile, setIsCalendarCreateMobile] = useState(false)
  const [newBookingMobileNotesOpen, setNewBookingMobileNotesOpen] = useState(false)
  // Appointment panels now use the same information architecture at every breakpoint.
  // Responsive CSS may stack/reflow controls, but tablet/mobile must not switch back
  // to the legacy collapsed (+/−) section structure.
  const compactAppointmentStructure = false
  const calendarFormKeyboardOpen = useMobileKeyboardOpen(1024)
  const calendarCreateKeyboardOpen = calendarFormKeyboardOpen

  useEffect(() => {
    if (!selection || activeNewFormPanel !== 'booking') {
      setNewBookingMobileNotesOpen(false)
    }
  }, [selection, activeNewFormPanel])
  const [releasedSlotWaitlistPrompt, setReleasedSlotWaitlistPrompt] = useState<any>(null)
  const [releasedSlotWaitlistLoading, setReleasedSlotWaitlistLoading] = useState(false)
  const bookedEntitlementVideoRef = useRef<HTMLVideoElement | null>(null)
  const bookedEntitlementScannerControlsRef = useRef<any>(null)
  const bookedEntitlementQrReaderRef = useRef<any>(null)
  const bookedEntitlementScanningLockRef = useRef(false)
  const bookedEntitlementWalletRequestRef = useRef(0)
  const bookedSessionInitialSignatureRef = useRef<{ id: number | null; signature: string }>({ id: null, signature: '' })
  const currentBookedSessionSignature = bookingFormSignature(selectedBookedSession, selectedBookedClientIds, bookedServiceDrafts)
  const selectedBookedSessionId = Number.isFinite(Number(selectedBookedSession?.id)) ? Number(selectedBookedSession.id) : null
  const bookedSessionHasChanges = selectedBookedSessionId != null
    && bookedSessionInitialSignatureRef.current.id === selectedBookedSessionId
    && bookedSessionInitialSignatureRef.current.signature !== currentBookedSessionSignature
  // The footer keeps a fixed place in every panel; it only yields to the mobile keyboard.
  const showBookedSessionFooter = !compactSessionEditHeader || !calendarFormKeyboardOpen

  useEffect(() => {
    if (selectedBookedSessionId == null) {
      bookedSessionInitialSignatureRef.current = { id: null, signature: '' }
      return
    }
    if (bookedSessionInitialSignatureRef.current.id !== selectedBookedSessionId) {
      bookedSessionInitialSignatureRef.current = {
        id: selectedBookedSessionId,
        signature: currentBookedSessionSignature,
      }
    }
  }, [selectedBookedSessionId, currentBookedSessionSignature])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 1024px)')
    const sync = () => setIsCalendarCreateMobile(false)
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])
  const onlineSessionBookingEnabled = settings?.ONLINE_SESSION_BOOKING_ENABLED !== 'false'
  const scannerModuleEnabled =
    settings?.ENTITLEMENTS_ENABLED !== 'false' &&
    settings?.SCANNER_MODULE_ENABLED === 'true'
  const multipleServicesEnabled = (() => {
    try {
      return JSON.parse(String(settings?.GUEST_APP_SETTINGS_JSON || '{}'))?.multipleServicesEnabled === true
    } catch {
      return false
    }
  })()
  const waitlistModuleEnabled = settings?.WAITLIST_ENABLED === 'true'
  const allDayDateRangeLabels = {
    startLabel: locale === 'sl' ? 'Od datuma' : 'From date',
    endLabel: locale === 'sl' ? 'Do datuma' : 'To date',
  }
  const allDayRangeStartTime = (ymd: string) => normalizeToLocalDateTime(`${ymd}T00:00:00`)
  const allDayRangeEndTime = (ymd: string) => normalizeToLocalDateTime(`${ymd}T23:59:59`)
  const advanceBillingEnabled = settings?.BILLING_ADVANCE_ENABLED !== 'false'
  const warningCopy = locale === 'sl'
    ? {
        overlappingTitle: 'Prekrivajoči se termini',
        overlappingSubtitle: (count: number) => `Obstaja ${count} obstoječih terminov v tem času. Ali jih želite izbrisati in ustvariti novega?`,
        overlappingConfirm: 'Da, izbriši in ustvari',
        overlappingCancel: 'Ne, obdrži obrazec rezervacije',
        personalTimeTitle: 'Osebni čas',
        personalTimeSubtitle: 'V tem času že imate planiran termin. Ali ste prepričani?',
        warningTitle: 'Opozorilo',
        nonBookablePastTime: 'Ali res želite rezervirati termin v preteklosti (pred trenutnim časom)?',
        nonBookableSlot: 'Ali res želite rezervirati stranko v terminu, ki ni na voljo za rezervacijo?',
        yes: 'Da',
        no: 'Ne',
        cancel: 'Prekliči',
      }
    : locale === 'sr'
      ? {
          overlappingTitle: 'Preklapajući termini',
          overlappingSubtitle: (count: number) => `Postoji ${count} postojećih termina u ovom vremenu. Da li želite da ih obrišete i kreirate novi?`,
          overlappingConfirm: 'Da, obriši i kreiraj',
          overlappingCancel: 'Ne, zadrži formu rezervacije',
          personalTimeTitle: 'Lično vreme',
          personalTimeSubtitle: 'U ovom vremenu već imate zakazan termin. Da li ste sigurni?',
          warningTitle: 'Upozorenje',
          nonBookablePastTime: 'Da li zaista želite da rezervišete termin u prošlosti (pre trenutnog vremena)?',
          nonBookableSlot: 'Da li zaista želite da rezervišete klijenta u terminu koji nije dostupan za rezervaciju?',
          yes: 'Da',
          no: 'Ne',
          cancel: 'Otkaži',
        }
      : {
          overlappingTitle: 'Overlapping sessions',
          overlappingSubtitle: (count: number) => `There are ${count} existing session(s) at this time. Do you want to delete them and create the new one?`,
          overlappingConfirm: 'Yes, delete and create',
          overlappingCancel: 'No, keep booking form',
          personalTimeTitle: 'Personal time',
          personalTimeSubtitle: 'You already have a session planned at this time. Are you sure?',
          warningTitle: 'Warning',
          nonBookablePastTime: 'Do you really want to book a session that is in the past (before the current time)?',
          nonBookableSlot: 'Do you really want to book a client on non bookable time slot?',
          yes: 'Yes',
          no: 'No',
          cancel: 'Cancel',
        }
  const bookingSourceCode = String(selectedBookedSession?.bookingSource || 'MANUAL').toUpperCase()
  const bookingSourceLabels = locale === 'sl'
    ? {
        MANUAL: { label: 'Ročno', description: 'Termin je ustvaril uporabnik v spletni aplikaciji.' },
        MOBILE_APP: { label: 'Mobilna aplikacija', description: 'Rezervacija prek aplikacije za goste.' },
        WEBSITE_WIDGET: { label: 'Spletni vtičnik', description: 'Rezervacija prek spletne strani stranke.' },
        PUBLIC_BOOKING_PAGE: { label: 'Javna rezervacijska stran', description: 'Rezervacija prek javne strani Calendra.' },
      }
    : locale === 'sr'
      ? {
          MANUAL: { label: 'Ručno', description: 'Termin je kreirao korisnik u veb aplikaciji.' },
          MOBILE_APP: { label: 'Mobilna aplikacija', description: 'Rezervacija preko aplikacije za goste.' },
          WEBSITE_WIDGET: { label: 'Veb dodatak', description: 'Rezervacija preko veb stranice klijenta.' },
          PUBLIC_BOOKING_PAGE: { label: 'Javna stranica za rezervacije', description: 'Rezervacija preko javne Calendra stranice.' },
        }
      : {
          MANUAL: { label: 'Manual', description: 'Created by a user in the web application.' },
          MOBILE_APP: { label: 'Mobile app', description: 'Booked through the guest mobile app.' },
          WEBSITE_WIDGET: { label: 'Website widget', description: "Booked through the business's own website." },
          PUBLIC_BOOKING_PAGE: { label: 'Public booking page', description: 'Booked through the Calendra public website.' },
        }
  const bookingSourceMeta = bookingSourceLabels[bookingSourceCode] || bookingSourceLabels.MANUAL
  const bookingSourceFieldLabel = locale === 'sl' ? 'Vir rezervacije' : locale === 'sr' ? 'Izvor rezervacije' : 'Booking source'

  const bookedSessionSelectedTypeId = Number(selectedBookedSession?.type?.id ?? 0)
  const bookedSessionTypeFromMeta = metaTypes.find((type: any) => Number(type?.id) === bookedSessionSelectedTypeId)
  const formatSessionTypeOptionLabel = (ty: any): string => {
    const code = String(ty?.name ?? '').trim()
    const description = String(ty?.description ?? '').trim()
    return description ? `${code} - ${description}` : code
  }
  const waitlistMatchCountLabel = (value: any): string => {
    const count = Math.max(0, Number(value) || 0)
    if (locale === 'sl') {
      if (count === 1) return '1 ustrezna zahteva'
      if (count === 2) return '2 ustrezni zahtevi'
      if (count === 3 || count === 4) return `${count} ustrezne zahteve`
      return `${count} ustreznih zahtev`
    }
    if (locale === 'sr') return `${count} odgovarajućih zahteva`
    return `${count} matching ${count === 1 ? 'request' : 'requests'}`
  }
  const formatWaitlistJoinedAt = (value: any): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${date.getFullYear()}`
  }
  const bookedSessionSelectedTypeAllowed = !bookedSessionIsGroup
    || !Number.isFinite(bookedSessionSelectedTypeId)
    || bookedSessionSelectedTypeId <= 0
    || (bookedSessionTypeFromMeta?.active !== false && bookedSessionTypeFromMeta?.groupBookingEnabled === true)
  const bookedSessionHasClientDraft = selectedBookedClientIds.length > 0 || bookedClientSearch.trim().length > 0
  const bookedSessionSaveDisabled = (!bookedSessionIsGroup && !bookedSessionHasClientDraft)
    || (bookedSessionIsGroup && !bookedSessionSelectedTypeAllowed)

  const showRecurringDeleteDialog = Boolean(confirmDelete && selectedBookedSession?.recurrenceSeriesKey)

  useEffect(() => {
    if (!selection) {
      setNewSlotWaitlistOpen(false)
    }
  }, [selection])

  const closeNewSlotWaitlist = (event?: {
    stopPropagation?: () => void
    preventDefault?: () => void
    nativeEvent?: { stopImmediatePropagation?: () => void }
  }) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    event?.nativeEvent?.stopImmediatePropagation?.()
    setNewSlotWaitlistOpen(false)
    setClientDropdownOpen(false)
    setEditingClientSearch(false)
  }

  const newWaitlistSlotKey = [form?.typeId ?? '', form?.startTime ?? '', form?.endTime ?? '', form?.consultantId ?? '', form?.spaceId ?? ''].join('|')
  const visibleNewSlotWaitlistMatches = newSlotWaitlistMatches?.slotKey === newWaitlistSlotKey
    ? newSlotWaitlistMatches
    : null

  // While the waitlist ("Čakalna vrsta") picker is open, mark the body so the calendar's
  // global outside-click / Escape handlers keep the underlying "Dodaj termin" popup open,
  // and let Escape close only the waitlist picker (returning to the booking form).
  const waitlistPickerVisible = newSlotWaitlistOpen && (visibleNewSlotWaitlistMatches?.count ?? 0) > 0
  useEffect(() => {
    if (typeof document === 'undefined' || !waitlistPickerVisible) return
    document.body.setAttribute('data-waitlist-picker-open', 'true')
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeNewSlotWaitlist()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.body.removeAttribute('data-waitlist-picker-open')
      document.removeEventListener('keydown', onKey, true)
    }
  }, [waitlistPickerVisible])

  const newWaitlistMatchPayload = () => ({
    serviceId: Number(form?.typeId),
    slotStart: form?.startTime,
    slotEnd: form?.endTime,
    employeeId: form?.consultantId ? Number(form.consultantId) : null,
    roomId: form?.spaceId ? Number(form.spaceId) : null,
    sessionId: null,
    releasedSlot: false,
    limit: 5,
  })

  useEffect(() => {
    if (form?.waitlistRequestId && form?.waitlistSlotKey !== newWaitlistSlotKey) {
      setForm((current: any) => ({ ...current, waitlistRequestId: null, waitlistSlotKey: null }))
    }
  }, [newWaitlistSlotKey])

  useEffect(() => {
    const canCheck = waitlistModuleEnabled
      && !!selection
      && !availabilitySelection
      && !form?.todo
      && !form?.personal
      && !bookingGroupMode
      && Number(form?.typeId) > 0
      && !!form?.startTime
      && !!form?.endTime
      && selectedFormClientIds.length === 0
      && !form?.waitlistRequestId
    if (!canCheck) {
      setNewSlotWaitlistMatches((current: any) => {
        const keepForSelectedClient = selectedFormClientIds.length > 0
          && current?.slotKey === newWaitlistSlotKey
          && Number(current?.count) > 0
        return keepForSelectedClient ? current : null
      })
      setNewSlotWaitlistLoading(false)
      return
    }
    // Matching is intentionally silent. Hide any result for the previous
    // service/time combination immediately and only reveal the waitlist card
    // after the current background request returns at least one match.
    setNewSlotWaitlistMatches(null)
    let cancelled = false
    const requestedSlotKey = newWaitlistSlotKey
    const timer = window.setTimeout(async () => {
      setNewSlotWaitlistLoading(true)
      try {
        const { data } = await api.post('/waitlists/matches', newWaitlistMatchPayload())
        if (!cancelled) {
          setNewSlotWaitlistMatches(data?.count > 0
            ? { ...data, slotKey: requestedSlotKey }
            : null)
        }
      } catch {
        if (!cancelled) setNewSlotWaitlistMatches(null)
      } finally {
        if (!cancelled) setNewSlotWaitlistLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [waitlistModuleEnabled, selection, availabilitySelection, form?.todo, form?.personal, bookingGroupMode, newWaitlistSlotKey, selectedFormClientIds.length, form?.waitlistRequestId])

  const pullFirstWaitlistedGuestIntoBooking = async (candidate?: any) => {
    if (!waitlistModuleEnabled) return
    const first = candidate || visibleNewSlotWaitlistMatches?.first
    const clientId = Number(first?.clientId)
    const requestId = Number(first?.requestId)
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(requestId) || requestId <= 0) return
    const confirmed = await confirm({
      title: locale === 'sl'
        ? `Dodam stranko ${first.clientName} neposredno v ta termin?`
        : `Add ${first.clientName} directly to this session?`,
      text: locale === 'sl'
        ? 'Rezervacija bo ustvarjena brez čakanja na potrditev ponudbe.'
        : 'The booking will be created without waiting for offer acceptance.',
    })
    if (!confirmed) return
    applyFormClientIds([clientId])
    setForm((current: any) => ({
      ...current,
      clientId,
      clientIds: [clientId],
      waitlistRequestId: requestId,
      waitlistSlotKey: newWaitlistSlotKey,
    }))
    setNewSlotWaitlistOpen(false)
    setNewSlotWaitlistMatches(null)
    showToast?.('success', locale === 'sl' ? 'Stranka s čakalne vrste je dodana v termin.' : 'The waitlisted client was added to the booking.')
  }

  const releasedSlotPayload = () => ({
    serviceId: Number(selectedBookedSession?.type?.id),
    slotStart: selectedBookedSession?.startTime,
    slotEnd: selectedBookedSession?.endTime,
    employeeId: selectedBookedSession?.consultant?.id ? Number(selectedBookedSession.consultant.id) : null,
    roomId: selectedBookedSession?.space?.id ? Number(selectedBookedSession.space.id) : null,
    sessionId: selectedBookedSession?.id ? Number(selectedBookedSession.id) : null,
    releasedSlot: true,
    limit: 10,
  })

  const runReleasedSlotAction = async (prompt: any, offerFirst: boolean) => {
    if (!prompt || releasedSlotWaitlistLoading) return
    setReleasedSlotWaitlistLoading(true)
    let createdOfferId: number | null = null
    try {
      if (offerFirst) {
        const { data } = await api.post('/waitlists/offer-first', prompt.payload)
        createdOfferId = Number(data?.currentOffer?.id) || null
      }
      if (prompt.action === 'DELETE') {
        await deleteBookedSession(prompt.scope || 'SINGLE')
      } else {
        const cancelled = await transitionBookedStatus('CANCELLED', true, true)
        if (cancelled !== true) throw new Error('Booking cancellation was not completed.')
      }
      if (offerFirst) {
        showToast?.('success', locale === 'sl' ? 'Sproščeni termin je bil ponujen prvi ustrezni stranki.' : 'The released slot was offered to the first eligible client.')
      }
      setReleasedSlotWaitlistPrompt(null)
    } catch (error: any) {
      if (createdOfferId) {
        try {
          await api.delete(`/waitlists/offers/${createdOfferId}`)
          await loadCalendarRangeOnly(true).catch(() => undefined)
        } catch { /* best-effort rollback */ }
      }
      showToast?.('error', error?.response?.data?.message || (locale === 'sl' ? 'Dejanja ni bilo mogoče dokončati.' : 'The action could not be completed.'))
    } finally {
      setReleasedSlotWaitlistLoading(false)
    }
  }

  const requestBookedSessionDelete = async () => {
    if (!selectedBookedSession?.id || releasedSlotWaitlistLoading) return
    if (selectedBookedSession?.recurrenceSeriesKey || !waitlistModuleEnabled) {
      setConfirmDelete(true)
      return
    }
    const payload = releasedSlotPayload()
    setReleasedSlotWaitlistLoading(true)
    try {
      const { data } = await api.post('/waitlists/matches', payload)
      if (Number(data?.count) > 0 && data?.first) {
        setConfirmDelete(false)
        setReleasedSlotWaitlistPrompt({ action: 'DELETE', scope: 'SINGLE', payload, matches: data })
        return
      }
      setConfirmDelete(true)
    } catch {
      setConfirmDelete(true)
    } finally {
      setReleasedSlotWaitlistLoading(false)
    }
  }

  const prepareReleasedSlotAction = async (action: 'DELETE' | 'CANCEL', scope: 'SINGLE' | 'THIS_AND_FOLLOWING' = 'SINGLE') => {
    if (!selectedBookedSession?.id) return
    if (scope !== 'SINGLE') {
      await deleteBookedSession(scope)
      return
    }
    if (!waitlistModuleEnabled) {
      if (action === 'DELETE') await deleteBookedSession(scope)
      else await transitionBookedStatus('CANCELLED')
      return
    }
    const payload = releasedSlotPayload()
    try {
      const { data } = await api.post('/waitlists/matches', payload)
      if (Number(data?.count) > 0 && data?.first) {
        if (action === 'DELETE') setConfirmDelete(false)
        setReleasedSlotWaitlistPrompt({ action, scope, payload, matches: data })
        return
      }
    } catch {
      // Waitlist lookup must never prevent a normal cancellation or deletion.
    }
    if (action === 'DELETE') await deleteBookedSession(scope)
    else await transitionBookedStatus('CANCELLED')
  }

  const openBookedSessionClientDetail = (clientOrId?: any) => {
    const id = Number(typeof clientOrId === 'object' ? clientOrId?.id : clientOrId)
    if (!Number.isInteger(id) || id <= 0) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    openCalendarClientDetail(id)
  }

  const openBookedSessionGroupDetail = () => {
    const id = Number(bookedSessionResolvedGroup?.id ?? bookedSessionGroupId ?? selectedBookedSession?.groupId ?? 0)
    if (!Number.isInteger(id) || id <= 0) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    if (typeof openBookedSessionGroupGuests === 'function') {
      openBookedSessionGroupGuests()
      return
    }
    if (typeof openCalendarGroupDetail === 'function') openCalendarGroupDetail(id)
  }

  const getBookedPaymentActionClientId = () => {
    const candidate = Number(
      selectedBookedPaymentClient?.id
        ?? paymentManagerSessionClients?.[0]?.id
        ?? bookedSessionSelectedClient?.id
        ?? selectedBookedClientIds?.[0]
        ?? selectedBookedSession?.client?.id
        ?? 0,
    )
    return Number.isInteger(candidate) && candidate > 0 ? candidate : null
  }

  const paymentStatusHasIssuedInvoice = (status: any) => (Array.isArray(status?.allocations) ? status.allocations : []).some((allocation: any) => {
    const source = String(allocation?.source ?? '').trim().toUpperCase()
    const paymentStatus = String(allocation?.paymentStatus ?? '').trim().toUpperCase()
    return source === 'INVOICE' && Number(allocation?.billId ?? 0) > 0 && paymentStatus !== 'CANCELLED'
  })

  const paymentStatusHasEntitlementSettlement = (status: any) => (Array.isArray(status?.allocations) ? status.allocations : []).some((allocation: any) => (
    String(allocation?.source ?? '').trim().toUpperCase() === 'ENTITLEMENT'
  ))

  const paymentStatusIsFinalizedForAutomaticInvoice = (status: any) => (
    status?.status === 'PAID'
    || paymentStatusHasIssuedInvoice(status)
    || paymentStatusHasEntitlementSettlement(status)
  )

  const openBookedAdvanceForm = (statusArg?: any, clientArg?: any) => {
    if (!advanceBillingEnabled) return false
    const clientId = Number(clientArg?.id ?? statusArg?.clientId ?? getBookedPaymentActionClientId() ?? 0)
    if (Number.isInteger(clientId) && clientId > 0) setSelectedBookedPaymentClientId(clientId)
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    if (typeof openBookedPaymentAdvanceEditor !== 'function') return false
    const resolvedStatus = statusArg ?? (Number.isInteger(clientId) && clientId > 0 ? paymentStatusForClient(clientId) : null)
    const resolvedClient = clientArg ?? (Number.isInteger(clientId) && clientId > 0
      ? paymentManagerSessionClients.find((client: any) => Number(client?.id) === clientId)
      : null)
    return openBookedPaymentAdvanceEditor(resolvedStatus, resolvedClient)
  }


  const openBookedInvoiceEditor = async (clientIdArg?: number | null) => {
    if (!canShowOpenBillForBookedStatus) {
      showToast('info', locale === 'sl'
        ? 'Račun lahko uredite, ko je termin v teku, zaključen ali označen kot neprihod.'
        : 'The invoice can be edited when the session is ongoing, checked out, or marked as no-show.')
      return
    }
    const requestedClientId = Number(clientIdArg ?? 0)
    const clientId = Number.isInteger(requestedClientId) && requestedClientId > 0
      ? requestedClientId
      : getBookedPaymentActionClientId()
    if (!clientId) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    setSelectedBookedPaymentClientId(clientId)

    // Always edit the unissued invoice that belongs to the currently selected payer tab.
    // Never fall back to another participant's open bill in a multi-client/group session.
    const selectedStatus = paymentStatusForClient(clientId)
    if (!selectedStatus?.bookingId) return

    const existingOpenBillId = Number(selectedStatus?.openBillId ?? 0)
    if (Number.isInteger(existingOpenBillId) && existingOpenBillId > 0) {
      openPaymentOpenBillEditor(selectedStatus, existingOpenBillId)
      return
    }

    if (paymentStatusIsFinalizedForAutomaticInvoice(selectedStatus)) {
      if (paymentStatusHasIssuedInvoice(selectedStatus)) {
        openBookedBillingView('invoices')
        return
      }
      showToast('info', locale === 'sl'
        ? 'Izbrani plačnik je že poravnan in novega neizdanega računa ni treba ustvariti.'
        : 'The selected payer is already settled and does not need another unissued invoice.')
      return
    }

    const openBillId = await createOpenBillForPaymentStatus(selectedStatus, { selectedOnly: true })
    if (openBillId) openPaymentOpenBillEditor(selectedStatus, openBillId)
  }

  const openBookedPaymentManagerTab = (_tab: 'details' | 'invoice') => {
    if (_tab === 'invoice') {
      void openBookedInvoiceEditor()
      return
    }
    setBookedStatusMenuOpen(false)
    setBookedPaymentManagerTab(_tab)
    setBookedPaymentMenuOpen(true)
  }

  const toggleBookedBillingActionMenu = (kind: 'advance' | 'invoice') => {
    if (kind === 'advance' && !advanceBillingEnabled) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu((current) => (current === kind ? null : kind))
  }

  const openBookedBillingView = (kind: 'advances' | 'invoices') => {
    if (kind === 'advances' && !advanceBillingEnabled) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    setBookedBillingViewSourceSession(selectedBookedSession || null)
    setBookedBillingView(kind)
  }

  const closeBookedBillingView = () => {
    setBookedBillingView(null)
    setBookedBillingActionMenu(null)
    if (!selectedBookedSession && bookedBillingViewSourceSession) {
      setSelectedBookedSession(bookedBillingViewSourceSession)
    }
  }

  const bookedPaymentActionButtonsDisabled = !getBookedPaymentActionClientId()
  const bookedPaymentAddClientSearchLabel = bookedPaymentAddMode === 'group-member'
    ? (locale === 'sl' ? 'Poišči člana skupine' : 'Search group member')
    : (locale === 'sl' ? 'Poišči klienta' : 'Search client')
  const bookedPaymentAddClientSearchPlaceholder = bookedPaymentAddMode === 'group-member'
    ? (locale === 'sl' ? 'Išči po imenu člana' : 'Search by member name')
    : (locale === 'sl' ? 'Išči po imenu klienta' : 'Search by client name')
  const bookedPaymentAddClientEmptyLabel = bookedPaymentAddMode === 'group-member'
    ? (locale === 'sl' ? 'Ni članov za dodajanje.' : 'No group members available to add.')
    : (locale === 'sl' ? 'Ni klientov za dodajanje.' : 'No clients available to add.')
  const bookedPaymentDetailsRemoveLabel = selectedBookedPaymentClientIsGroupMember
    ? (locale === 'sl' ? 'Odstrani iz skupine' : 'Remove from group')
    : (locale === 'sl' ? 'Odstrani iz termina' : 'Remove from session')

  const stopBookedEntitlementCamera = () => {
    if (bookedEntitlementScannerControlsRef.current) {
      bookedEntitlementScannerControlsRef.current.stop()
      bookedEntitlementScannerControlsRef.current = null
    }
    bookedEntitlementQrReaderRef.current = null
    if (bookedEntitlementVideoRef.current) bookedEntitlementVideoRef.current.srcObject = null
    bookedEntitlementScanningLockRef.current = false
    setBookedEntitlementCameraActive(false)
  }

  useEffect(() => stopBookedEntitlementCamera, [])

  const closeCalendarAddClientModal = () => {
    setShowAddClientModal(false)
  }

  const closeCalendarAddGroupModal = () => {
    setShowAddGroupModal(false)
    setGroupModalError('')
    setNewGroupForm({ name: '', email: '' })
    setNewGroupMemberIds([])
    setNewGroupMemberSearch('')
  }

  const calendarCreateGroupLabel = locale === 'sl' ? 'Ustvari skupino' : 'Create group'
  const calendarCreateGroupDisabled = savingNewGroupModal || !String(newGroupForm?.name ?? '').trim()

  const calendarCreateClientLabel = locale === 'sl' ? 'Ustvari stranko' : 'Create client'
  const calendarCreateClientDisabled = savingClient || !String(newClientForm.firstName ?? '').trim() || !String(newClientForm.lastName ?? '').trim()

  const renderCalendarNewClientEditableField = (
    key: 'firstName' | 'lastName' | 'email' | 'phone',
    label: string,
    wide = false,
    inputType: 'text' | 'email' | 'tel' = 'text',
  ) => {
    const required = key === 'firstName' || key === 'lastName'
    const placeholder = `${label}${required ? ' *' : ''}`
    return (
      <label className={`clients-detail-field-card clients-create-field${wide ? ' clients-detail-field-card--wide' : ''}`}>
        <span>{label}{required ? ' *' : ''}</span>
        <input
          autoFocus={key === 'firstName'}
          required={required}
          type={inputType}
          name={`calendra-calendar-new-client-${key}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize={key === 'firstName' || key === 'lastName' ? 'words' : 'none'}
          spellCheck={false}
          inputMode={inputType === 'email' ? 'email' : inputType === 'tel' ? 'tel' : 'text'}
          enterKeyHint={key === 'phone' ? 'done' : 'next'}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          value={String(newClientForm[key] ?? '')}
          placeholder={placeholder}
          onChange={(e) => setNewClientForm({ ...newClientForm, [key]: e.target.value })}
        />
      </label>
    )
  }

  const bookedEntitlementErrorMessage = (result?: string | null, message?: string | null) => {
    if (message) return message
    if (result === 'INVALID_CODE') return locale === 'sl' ? 'Koda ugodnosti ni veljavna.' : 'The entitlement code is invalid.'
    if (result === 'EXPIRED') return locale === 'sl' ? 'Ugodnost je potekla.' : 'The entitlement has expired.'
    if (result === 'NO_VISITS_REMAINING') return locale === 'sl' ? 'Ugodnost nima več preostalih obiskov.' : 'No visits remain on this entitlement.'
    if (result === 'DUPLICATE_SCAN') return locale === 'sl' ? 'Ta ugodnost je bila pravkar uporabljena.' : 'This entitlement was just used.'
    if (result === 'UNSUPPORTED_PAYMENT_ENTITLEMENT') return locale === 'sl' ? 'Za kritje termina lahko uporabite karte, pakete in članstva.' : 'Tickets, packs and memberships can cover a session.'
    if (result === 'SERVICE_TYPE_MISMATCH') return locale === 'sl' ? 'Ugodnost ni vezana na storitev tega termina.' : 'The entitlement is not linked to this session service.'
    if (result === 'PAYMENT_BOOKING_NOT_FOUND') return locale === 'sl' ? 'Termina za plačilo ni bilo mogoče najti.' : 'The payment booking could not be found.'
    if (result === 'PAYMENT_CLIENT_MISMATCH') return locale === 'sl' ? 'Ugodnost pripada drugemu klientu.' : 'The entitlement belongs to a different client.'
    if (result === 'ALREADY_PAID_WITH_ENTITLEMENT') return locale === 'sl' ? 'Ta termin je že plačan z ugodnostjo.' : 'This session was already paid with an entitlement.'
    return locale === 'sl' ? 'Ugodnosti ni bilo mogoče uporabiti.' : 'Unable to apply the entitlement.'
  }

  const bookedEntitlementWalletCountLabel = (count: number) => {
    if (locale === 'sl') return count === 1 ? '1 na voljo' : `${count} na voljo`
    return count === 1 ? '1 available' : `${count} available`
  }

  const bookedEntitlementWalletTypeLabel = (option: any) => {
    if (locale === 'sl') {
      if (option?.entitlementType === 'PACK') return 'Paket'
      if (option?.entitlementType === 'TICKET') return 'Karta'
      if (option?.entitlementType === 'MEMBERSHIP') return 'Članstvo'
      return 'Ugodnost'
    }
    if (option?.entitlementType === 'PACK') return 'Pack'
    if (option?.entitlementType === 'TICKET') return 'Ticket'
    if (option?.entitlementType === 'MEMBERSHIP') return 'Membership'
    return 'Entitlement'
  }

  const bookedEntitlementWalletRemainingLabel = (option: any) => {
    if (option?.entitlementType === 'MEMBERSHIP') {
      const visitCount = Number(option?.visitCount)
      if (Number.isFinite(visitCount)) {
        return locale === 'sl' ? `${visitCount} obiskov` : `${visitCount} visits`
      }
      return locale === 'sl' ? 'Aktivno članstvo' : 'Active membership'
    }
    const remaining = Number(option?.remainingUses)
    const total = Number(option?.totalUses)
    if (Number.isFinite(remaining) && Number.isFinite(total) && total > 0) {
      return locale === 'sl' ? `${remaining}/${total} preostalo` : `${remaining}/${total} remaining`
    }
    if (Number.isFinite(remaining)) {
      return locale === 'sl' ? `${remaining} preostalo` : `${remaining} remaining`
    }
    return locale === 'sl' ? 'Na voljo' : 'Available'
  }

  const refreshBookedSessionAfterEntitlementScan = async () => {
    if (typeof loadCalendarRangeOnly !== 'function') return
    try {
      const refreshed = await loadCalendarRangeOnly(true)
      const bookingId = Number(selectedBookedSession?.id ?? bookedEntitlementTarget?.returnBookingId ?? 0)
      if (!refreshed?.booked || !Number.isInteger(bookingId) || bookingId <= 0) return
      const updated = refreshed.booked.find((booking: any) => Number(booking?.id) === bookingId)
      if (updated) {
        setSelectedBookedSession((current: any) => current && Number(current?.id) === bookingId ? updated : current)
      }
    } catch {
      // The scan itself succeeded; keep the modal result even if calendar refresh fails.
    }
  }

  const loadBookedEntitlementWalletOptions = async (paymentBookingId: number, requestId: number, paymentClientId?: number | null) => {
    setBookedEntitlementWalletLoading(true)
    try {
      const params: any = { paymentBookingId }
      const clientId = Number(paymentClientId)
      if (Number.isInteger(clientId) && clientId > 0) params.paymentClientId = clientId
      const { data } = await api.get('/wallet-scanner/payment-options', { params })
      if (bookedEntitlementWalletRequestRef.current === requestId) {
        setBookedEntitlementWalletOptions(Array.isArray(data) ? data : [])
      }
    } catch {
      if (bookedEntitlementWalletRequestRef.current === requestId) {
        setBookedEntitlementWalletOptions([])
      }
    } finally {
      if (bookedEntitlementWalletRequestRef.current === requestId) {
        setBookedEntitlementWalletLoading(false)
      }
    }
  }

  const openBookedEntitlementPaymentModal = (status?: any, client?: any) => {
    const paymentBookingId = Number(status?.bookingId ?? selectedBookedSession?.id ?? 0)
    if (!Number.isInteger(paymentBookingId) || paymentBookingId <= 0) return
    const paymentClientId = Number(client?.id ?? status?.clientId ?? 0)
    const requestId = bookedEntitlementWalletRequestRef.current + 1
    bookedEntitlementWalletRequestRef.current = requestId
    setBookedEntitlementTarget({
      paymentBookingId,
      paymentClientId: Number.isInteger(paymentClientId) && paymentClientId > 0 ? paymentClientId : null,
      clientLabel: client ? fullName(client) : clientNameForStatus(status),
      amountGross: Number(status?.sessionTotalGross ?? 0) || 0,
      returnBookingId: Number(selectedBookedSession?.id ?? paymentBookingId),
      openBillId: Number.isInteger(Number(status?.openBillId)) && Number(status?.openBillId) > 0 ? Number(status.openBillId) : null,
      paymentStatus: status ?? null,
    })
    setBookedEntitlementStep('choice')
    setBookedEntitlementManualCode('')
    setBookedEntitlementScanResult(null)
    setBookedEntitlementWalletOptions([])
    setBookedEntitlementWalletLoading(false)
    void loadBookedEntitlementWalletOptions(paymentBookingId, requestId, Number.isInteger(paymentClientId) && paymentClientId > 0 ? paymentClientId : null)
  }

  const closeBookedEntitlementPaymentModal = () => {
    bookedEntitlementWalletRequestRef.current += 1
    stopBookedEntitlementCamera()
    setBookedEntitlementTarget(null)
    setBookedEntitlementStep('choice')
    setBookedEntitlementManualCode('')
    setBookedEntitlementScanResult(null)
    setBookedEntitlementWalletOptions([])
    setBookedEntitlementWalletLoading(false)
  }

  const startBookedEntitlementCamera = async () => {
    if (bookedEntitlementCameraActive || bookedEntitlementSubmitting) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setBookedEntitlementScanResult({ tone: 'error', text: locale === 'sl' ? 'Kamera v tem brskalniku ni podprta.' : 'Camera scanning is not supported in this browser.' })
      return
    }
    if (!window.isSecureContext) {
      setBookedEntitlementScanResult({ tone: 'error', text: locale === 'sl' ? 'Za uporabo kamere odprite aplikacijo prek HTTPS.' : 'Open the app over HTTPS to use the camera.' })
      return
    }
    const video = bookedEntitlementVideoRef.current
    if (!video) return
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 })
      bookedEntitlementQrReaderRef.current = reader
      bookedEntitlementScannerControlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (decodeResult: any) => {
        if (!decodeResult || bookedEntitlementScanningLockRef.current) return
        void submitBookedEntitlementPaymentCode(decodeResult.getText(), 'qr')
      })
      bookedEntitlementScanningLockRef.current = false
      setBookedEntitlementCameraActive(true)
      setBookedEntitlementScanResult(null)
    } catch (error: any) {
      const name = String(error?.name ?? '')
      const text = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
        ? (locale === 'sl' ? 'Dovolite dostop do kamere in poskusite znova.' : 'Allow camera access and try again.')
        : (locale === 'sl' ? 'Kamere ni bilo mogoče zagnati.' : 'Unable to start the camera.')
      setBookedEntitlementScanResult({ tone: 'error', text })
      stopBookedEntitlementCamera()
    }
  }

  const submitBookedEntitlementPaymentCode = async (rawCode: string, source: 'qr' | 'manual' | 'wallet') => {
    const code = String(rawCode || '').trim()
    if (!code || bookedEntitlementSubmitting || !bookedEntitlementTarget) return
    const paymentBookingId = Number(bookedEntitlementTarget.paymentBookingId)
    if (!Number.isInteger(paymentBookingId) || paymentBookingId <= 0) {
      setBookedEntitlementScanResult({
        tone: 'error',
        text: locale === 'sl' ? 'Ugodnost lahko uporabite samo za termin, ki ima plačilni zapis.' : 'Entitlements can only be used on sessions with a payment record.',
      })
      return
    }
    bookedEntitlementScanningLockRef.current = true
    setBookedEntitlementSubmitting(true)
    setBookedEntitlementScanResult({ tone: 'info', text: locale === 'sl' ? 'Preverjam ugodnost…' : 'Checking entitlement…' })
    try {
      const paymentClientId = Number(bookedEntitlementTarget.paymentClientId)
      const { data } = await api.post('/wallet-scanner/scan', {
        code,
        source,
        paymentBookingId,
        ...(Number.isInteger(paymentClientId) && paymentClientId > 0 ? { paymentClientId } : {}),
      })
      if (data?.success) {
        const detail = [data.client?.firstName, data.client?.lastName].filter(Boolean).join(' ').trim()
          || data.entitlement?.productName
          || data.entitlement?.code
          || code

        // /wallet-scanner/scan validates the prepaid entitlement. For a booked-session
        // payment we then settle the participant open bill atomically. The service keeps
        // its real value for reporting, but no second invoice is created.
        let openBillId = Number(bookedEntitlementTarget.openBillId)
        if (!Number.isInteger(openBillId) || openBillId <= 0) {
          const currentStatus = bookedEntitlementTarget.paymentStatus
            ?? (Number.isInteger(paymentClientId) && paymentClientId > 0 ? paymentStatusForClient(paymentClientId) : null)
          openBillId = Number(await createOpenBillForPaymentStatus(currentStatus, { selectedOnly: true, suppressToast: true }))
        }
        if (!Number.isInteger(openBillId) || openBillId <= 0) {
          throw new Error(locale === 'sl'
            ? 'Odprtega računa za kritje z ugodnostjo ni bilo mogoče pripraviti.'
            : 'Could not prepare the open bill for entitlement settlement.')
        }

        const settlement = await api.post(`/billing/open-bills/${openBillId}/settle-entitlement`, {
          entitlementCode: data.entitlement?.code || code,
          paymentBookingId,
          ...(Number.isInteger(paymentClientId) && paymentClientId > 0 ? { paymentClientId } : {}),
        })
        const settledName = settlement?.data?.entitlementName || detail || (locale === 'sl' ? 'Ugodnost' : 'Entitlement')
        setBookedEntitlementScanResult({
          tone: 'success',
          text: locale === 'sl' ? 'Termin je pokrit z ugodnostjo.' : 'Session covered by entitlement.',
          detail: settledName,
        })
        if (typeof showToast === 'function') {
          showToast('success', locale === 'sl'
            ? `${settledName} je pokrila termin. Nov račun ni bil izdan.`
            : `${settledName} covered the session. No new invoice was issued.`)
        }
        stopBookedEntitlementCamera()
        await refreshBookedSessionAfterEntitlementScan()
        window.setTimeout(() => closeBookedEntitlementPaymentModal(), 650)
      } else {
        setBookedEntitlementScanResult({ tone: 'error', text: bookedEntitlementErrorMessage(data?.result, data?.message), detail: data?.entitlement?.productName || undefined })
        bookedEntitlementScanningLockRef.current = false
      }
    } catch (error: any) {
      const responseData = error?.response?.data as { result?: string; message?: string; error?: string } | undefined
      setBookedEntitlementScanResult({
        tone: 'error',
        text: bookedEntitlementErrorMessage(responseData?.result, responseData?.message || responseData?.error),
      })
      bookedEntitlementScanningLockRef.current = false
    } finally {
      setBookedEntitlementSubmitting(false)
    }
  }

  const submitBookedEntitlementManualCode = (event: any) => {
    event.preventDefault()
    void submitBookedEntitlementPaymentCode(bookedEntitlementManualCode, 'manual')
  }

  const submitBookedEntitlementWalletOption = (option: any) => {
    const code = String(option?.code || option?.displayCode || '').trim()
    if (!code) {
      setBookedEntitlementScanResult({ tone: 'error', text: locale === 'sl' ? 'Ta ugodnost nima kode za uporabo.' : 'This entitlement has no usable code.' })
      return
    }
    void submitBookedEntitlementPaymentCode(code, 'wallet')
  }

  const currentBookingStatusKey = selectedBookedSession
    ? deriveBookingStatus(
      selectedBookedSession.startTime,
      selectedBookedSession.endTime,
      selectedBookedSession.bookingStatus,
    )
    : 'RESERVED'

  const bookingStatusOptions = [
    {
      key: 'RESERVED',
      targetStatus: 'RESERVED',
      tone: 'reserved',
      label: bookingStatusDisplayLabel('RESERVED', locale),
    },
    {
      key: 'CANCELLED',
      targetStatus: 'CANCELLED',
      tone: 'cancelled',
      label: bookingStatusDisplayLabel('CANCELLED', locale),
    },
    {
      key: 'NO_SHOW',
      targetStatus: 'NO_SHOW',
      tone: 'no-show',
      label: bookingStatusDisplayLabel('NO_SHOW', locale),
    },
    {
      key: 'ONGOING',
      targetStatus: null,
      tone: 'ongoing',
      label: bookingStatusDisplayLabel('ONGOING', locale),
    },
    {
      key: 'CHECKED_OUT',
      targetStatus: 'CHECKED_OUT',
      tone: 'checked-out',
      label: bookingStatusDisplayLabel('CHECKED_OUT', locale),
    },
  ]
  const currentBookingStatusOption = bookingStatusOptions.find((option) => option.key === currentBookingStatusKey) ?? bookingStatusOptions[0]
  const currentBookingStatusLabel = currentBookingStatusOption?.label ?? bookedStatusLabel
  const currentBookingStatusTone = currentBookingStatusOption?.tone ?? 'reserved'
  const isReservedBookingStatus = currentBookingStatusKey === 'RESERVED'
  const canShowOpenBillForBookedStatus = currentBookingStatusKey === 'ONGOING' || currentBookingStatusKey === 'CHECKED_OUT' || currentBookingStatusKey === 'NO_SHOW'
  const bookedPaymentActionClientId = getBookedPaymentActionClientId()
  const bookedPaymentActionStatus = bookedPaymentActionClientId ? paymentStatusForClient(bookedPaymentActionClientId) : null
  const bookedPaymentActionHasInvoice = !!invoiceAllocationForPaymentStatus(bookedPaymentActionStatus)
  const bookedPaymentActionHasAdvance = (bookedPaymentActionStatus?.allocations ?? []).some((allocation: any) => allocation?.source === 'ADVANCE')
  const reservedBookingHasAdvanceAwaitingInvoice = isReservedBookingStatus
    && bookedPaymentActionHasAdvance
    && !bookedPaymentActionHasInvoice
    && !bookedPaymentActionStatus?.openBillId
    && bookedPaymentActionStatus?.status === 'UNPAID'
  const bookingServiceBillingButtonIsAdvance = advanceBillingEnabled && !canShowOpenBillForBookedStatus
  const bookingServiceEntitlementClient = selectedBookedPaymentClient
    || bookedSessionSelectedClient
    || paymentManagerSessionClients?.[0]
    || selectedBookedSession?.client
    || null
  const bookingServiceEntitlementStatus = bookedPaymentActionStatus
    || (bookingServiceEntitlementClient?.id ? paymentStatusForClient(bookingServiceEntitlementClient.id) : null)
  const bookingServiceEntitlementAllocation = (bookingServiceEntitlementStatus?.allocations ?? []).find((allocation: any) => allocation?.source === 'ENTITLEMENT')
  const bookingServiceInvoiceAllocation = invoiceAllocationForPaymentStatus(bookingServiceEntitlementStatus)
  const canScanEntitlementFromService = !!bookingServiceEntitlementStatus?.bookingId
    && !isGroupedSingleInvoiceMode
    && !bookingServiceInvoiceAllocation
    && !bookingServiceEntitlementAllocation
    && !bookingServiceEntitlementStatus?.openBillId
    && bookingServiceEntitlementStatus?.status !== 'PAID'
  const bookingServiceScanDisabled = !canScanEntitlementFromService
  const bookingServiceScanTitle = canScanEntitlementFromService
    ? (locale === 'sl' ? 'Skeniraj vstopnico ali paket za plačilo termina' : 'Scan ticket or pack to pay this session')
    : (locale === 'sl' ? 'Skeniranje ugodnosti ni na voljo za ta termin.' : 'Entitlement scan is not available for this session.')

  const bookingStatusOptionIsActionable = (option: any) => {
    if (!option?.targetStatus || option.key === currentBookingStatusKey) return false
    return Array.isArray(bookedStatusTransitionTargets) && bookedStatusTransitionTargets.includes(option.targetStatus)
  }

  const selectBookingStatusOption = (option: any) => {
    if (option?.key === currentBookingStatusKey) {
      setBookedStatusMenuOpen(false)
      return
    }
    if (!bookingStatusOptionIsActionable(option)) return
    if (option.targetStatus === 'NO_SHOW') {
      openNoShowClientPicker()
      return
    }
    setNoShowClientPickerOpen(false)
    if (option.targetStatus === 'CANCELLED') {
      void prepareReleasedSlotAction('CANCEL')
    } else {
      void transitionBookedStatus(option.targetStatus)
    }
  }

  const visibleBookingStatusOptions = bookingStatusOptions.filter(
    (option) => option.key === currentBookingStatusKey || bookingStatusOptionIsActionable(option),
  )

  useEffect(() => {
    if (!bookedStatusMenuOpen) return
    setMobileBookingStatusDraft(currentBookingStatusKey)
  }, [bookedStatusMenuOpen, currentBookingStatusKey, selectedBookedSession?.id])

  const bookingStatusDescription = (statusKey: string) => {
    const descriptions = locale === 'sl'
      ? {
          RESERVED: 'Termin je rezerviran in ostane v koledarju.',
          CANCELLED: 'Termin bo odpovedan, razpoložljivost pa sproščena.',
          NO_SHOW: 'Stranka se termina ni udeležila.',
          ONGOING: 'Termin trenutno poteka.',
          CHECKED_OUT: 'Termin je zaključen.',
        }
      : locale === 'sr'
        ? {
            RESERVED: 'Termin je rezervisan i ostaje u kalendaru.',
            CANCELLED: 'Termin će biti otkazan, a dostupnost oslobođena.',
            NO_SHOW: 'Klijent nije došao na termin.',
            ONGOING: 'Termin je trenutno u toku.',
            CHECKED_OUT: 'Termin je završen.',
          }
        : {
            RESERVED: 'The appointment is reserved and remains in the calendar.',
            CANCELLED: 'The appointment will be cancelled and the slot released.',
            NO_SHOW: 'The client did not attend the appointment.',
            ONGOING: 'The appointment is currently in progress.',
            CHECKED_OUT: 'The appointment is completed.',
          }
    return descriptions[statusKey as keyof typeof descriptions] || ''
  }

  const mobileBookingStatusDraftOption = bookingStatusOptions.find(
    (option) => option.key === mobileBookingStatusDraft,
  ) ?? currentBookingStatusOption
  const mobileBookingStatusCanSave = !!mobileBookingStatusDraftOption
    && mobileBookingStatusDraftOption.key !== currentBookingStatusKey
    && bookingStatusOptionIsActionable(mobileBookingStatusDraftOption)

  const saveMobileBookingStatus = () => {
    if (!mobileBookingStatusCanSave || !mobileBookingStatusDraftOption) return
    setBookedStatusMenuOpen(false)
    selectBookingStatusOption(mobileBookingStatusDraftOption)
  }

  const noShowClientOptions = (Array.isArray(paymentManagerSessionClients) ? paymentManagerSessionClients : [])
    .filter((client: any) => Number.isInteger(Number(client?.id)) && Number(client?.id) > 0)

  const noShowClientBillClosed = (clientId: number) => {
    if (!Number.isInteger(Number(clientId)) || Number(clientId) <= 0) return false
    const status = typeof paymentStatusForClient === 'function' ? paymentStatusForClient(clientId) : null
    const invoice = typeof invoiceAllocationForPaymentStatus === 'function'
      ? invoiceAllocationForPaymentStatus(status)
      : null
    return !!invoice?.billId && String(invoice?.paymentStatus || '').toUpperCase() !== 'CANCELLED'
  }

  const noShowSelectableClientOptions = noShowClientOptions
    .filter((client: any) => !noShowClientBillClosed(Number(client.id)))

  const openNoShowClientPicker = () => {
    const ids = noShowSelectableClientOptions.map((client: any) => Number(client.id))
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)

    if (noShowClientOptions.length === 0) {
      setNoShowClientPickerOpen(false)
      void transitionBookedStatus('NO_SHOW')
      return
    }

    setNoShowSelectedClientIds(ids)

    if (ids.length === 0) {
      setNoShowClientPickerOpen(true)
      return
    }

    if (ids.length === 1 && noShowClientOptions.length === 1) {
      setNoShowClientPickerOpen(false)
      if (typeof markBookedClientsNoShow === 'function') {
        void markBookedClientsNoShow(ids)
      } else {
        void transitionBookedStatus('NO_SHOW')
      }
      return
    }

    setNoShowClientPickerOpen(true)
  }

  const toggleNoShowClient = (clientId: number) => {
    if (noShowClientBillClosed(clientId)) return
    setNoShowSelectedClientIds((prev) => (
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    ))
  }

  const submitNoShowClients = async () => {
    if (noShowSubmitting) return
    const selectableIds = new Set(noShowSelectableClientOptions.map((client: any) => Number(client.id)))
    const idsToSubmit = noShowSelectedClientIds.filter((clientId) => selectableIds.has(clientId))
    if (idsToSubmit.length === 0) return
    if (typeof markBookedClientsNoShow !== 'function') {
      await transitionBookedStatus('NO_SHOW')
      setNoShowClientPickerOpen(false)
      return
    }
    setNoShowSubmitting(true)
    const handled = await markBookedClientsNoShow(idsToSubmit)
    setNoShowSubmitting(false)
    if (handled !== false) {
      setNoShowClientPickerOpen(false)
    }
  }

  const CalendarBookingStatusIcon = ({ statusKey, className = 'calendar-session-status-tag__icon-svg' }: any) => {
    const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as any
    if (statusKey === 'CANCELLED') {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M9 9l6 6M15 9l-6 6" {...common} />
        </svg>
      )
    }
    if (statusKey === 'NO_SHOW') {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M12 7.8v5.4M12 16.7h.01" {...common} />
        </svg>
      )
    }
    if (statusKey === 'ONGOING') {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M10.3 8.7l5.4 3.3-5.4 3.3V8.7z" fill="currentColor" stroke="none" />
        </svg>
      )
    }
    if (statusKey === 'CHECKED_OUT') {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M8.6 12.2l2.3 2.3 4.8-5" {...common} />
        </svg>
      )
    }
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.5" {...common} />
        <path d="M12 7.7v4.7l3.2 1.9" {...common} />
      </svg>
    )
  }

  const CalendarAdvancePaymentIcon = ({ className = '' }: any) => (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M6.5 6.75h11A1.75 1.75 0 0 1 19.25 8.5v7A1.75 1.75 0 0 1 17.5 17.25h-11A1.75 1.75 0 0 1 4.75 15.5v-7A1.75 1.75 0 0 1 6.5 6.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7.5 10.25h4.25M7.5 13.75h2.75M15.5 10.25v4.5M13.25 12.5h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 5.25 15.75 3.7a1.6 1.6 0 0 1 1.9 1.25l.25 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )

  const BookedEntitlementPaymentIcon = ({ className = '' }: any) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 5.5 19 11l-8 8-5.5-5.5 8-8Z" />
      <path d="M9.5 9.5h.01M12 12h.01" strokeWidth="2.4" />
    </svg>
  )

  const BookedEntitlementScanIcon = ({ className = '' }: any) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
      <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h1.5M16 13v3M14 16h2" />
    </svg>
  )

  const BookedEntitlementKeyboardIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M6.5 10.5h1M9.5 10.5h1M12.5 10.5h1M15.5 10.5h1M6.5 13.5h6M14.5 13.5h3" />
    </svg>
  )

  const BookedEntitlementWalletIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5.5 7.5h12.2A2.3 2.3 0 0 1 20 9.8v7.4a2.3 2.3 0 0 1-2.3 2.3H5.5A2.5 2.5 0 0 1 3 17V7.4A2.9 2.9 0 0 1 5.9 4.5h9.8" />
      <path d="M5.6 7.5h12.9" />
      <path d="M16.2 12.3h4v3.4h-4a1.7 1.7 0 1 1 0-3.4Z" />
      <path d="M16.4 14h.01" strokeWidth="2.4" />
    </svg>
  )

  const BookedEntitlementCameraIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 7.5h7l1 1.5H19A2.5 2.5 0 0 1 21.5 11.5v5A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 9h2.5l1-1.5Z" />
      <circle cx="12" cy="14" r="3" />
    </svg>
  )

  const CalendarPaymentPillIcon = ({ tone, className = 'calendar-session-payment-tag__icon-svg' }: any) => {
    const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as any
    if (tone === 'paid') {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M8.6 12.2l2.3 2.3 4.8-5" {...common} />
        </svg>
      )
    }
    if (tone === 'pending' || tone === 'partial') {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M12 7.7v4.7l3.2 1.9" {...common} />
        </svg>
      )
    }
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.5" {...common} />
        <path d="M9 9l6 6M15 9l-6 6" {...common} />
      </svg>
    )
  }

  const openPaymentOpenBillEditor = (status: any, explicitOpenBillId?: number | null) => {
    const openBillIdRaw = Number(explicitOpenBillId ?? status?.openBillId ?? 0)
    if (!Number.isInteger(openBillIdRaw) || openBillIdRaw <= 0) return false
    if (typeof openBookedPaymentOpenBillEditor !== 'function') return false
    return openBookedPaymentOpenBillEditor(status, openBillIdRaw) !== false
  }

  const formatPaymentDateOnly = (value?: string | null) => {
    if (!value) return ''
    const formatted = typeof formatDateTime === 'function' ? String(formatDateTime(value) || '') : String(value)
    const withoutTime = formatted.replace(/\s*,\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*$/i, '').trim()
    if (withoutTime && withoutTime !== formatted) return withoutTime
    const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`
    return formatted
  }

  const normalizeBillPaymentStatusKey = (value?: any) => String(value ?? '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase()
  const visibleBillStatusKeys = new Set(['PAID', 'PAYMENT_PENDING', 'OPEN'])

  const clientNameForStatus = (status?: any) => {
    const clientId = Number(status?.clientId ?? 0)
    const candidates = [
      ...(Array.isArray(paymentManagerSessionClients) ? paymentManagerSessionClients : []),
      ...(Array.isArray(bookedSessionSelectedClients) ? bookedSessionSelectedClients : []),
      selectedBookedSession?.client,
    ].filter(Boolean)
    const client = candidates.find((entry: any) => Number(entry?.id) === clientId)
    return (client ? fullName(client) : '') || (clientId > 0 ? `#${clientId}` : '—')
  }

  const paymentMethodLabelForAllocation = (allocation?: any) => {
    const method = String(allocation?.paymentMethod || '').trim()
    if (method) return method
    const type = normalizeBillPaymentStatusKey(allocation?.paymentMethodType)
    if (type === 'CARD' || type === 'STRIPE' || type === 'PAYPAL') return locale === 'sl' ? 'Kartica' : 'Card'
    if (type === 'BANK_TRANSFER') return locale === 'sl' ? 'TRR' : 'Bank transfer'
    if (type === 'CASH') return locale === 'sl' ? 'Gotovina' : 'Cash'
    return '—'
  }

  const sessionForBillingView = bookedBillingViewSourceSession || selectedBookedSession

  const collectSessionBillRows = (source: 'ADVANCE' | 'INVOICE') => {
    const statuses = Array.isArray(sessionForBillingView?.paymentStatuses) ? sessionForBillingView.paymentStatuses : []
    const rowsByKey = new Map<string, any>()
    statuses.forEach((status: any) => {
      ;(Array.isArray(status?.allocations) ? status.allocations : []).forEach((allocation: any) => {
        const allocationSource = String(allocation?.source || '').toUpperCase()
        if (allocationSource !== source) return
        const statusKey = normalizeBillPaymentStatusKey(allocation?.paymentStatus || status?.status)
        if (!visibleBillStatusKeys.has(statusKey)) return
        const billId = Number(allocation?.billId ?? 0)
        const key = billId > 0 ? String(billId) : `${source}:${allocation?.billNumber || status?.clientId || rowsByKey.size}`
        const existing = rowsByKey.get(key) || {
          key,
          billId: billId > 0 ? billId : null,
          billNumber: allocation?.billNumber || (source === 'ADVANCE' ? (locale === 'sl' ? 'Predplačilo' : 'Advance') : (locale === 'sl' ? 'Račun' : 'Invoice')),
          payerNames: new Set<string>(),
          amountGross: 0,
          dateValue: allocation?.paidAt || '',
          paymentMethod: paymentMethodLabelForAllocation(allocation),
          statusKey,
        }
        existing.payerNames.add(clientNameForStatus(status))
        existing.amountGross += Number(allocation?.amountGross ?? 0) || 0
        if (!existing.dateValue && allocation?.paidAt) existing.dateValue = allocation.paidAt
        if (existing.paymentMethod === '—') existing.paymentMethod = paymentMethodLabelForAllocation(allocation)
        if (existing.statusKey !== 'PAID' && statusKey === 'PAID') existing.statusKey = 'PAID'
        rowsByKey.set(key, existing)
      })
    })
    return Array.from(rowsByKey.values()).sort((a: any, b: any) => {
      const aDate = a.dateValue ? new Date(a.dateValue).getTime() : 0
      const bDate = b.dateValue ? new Date(b.dateValue).getTime() : 0
      if (aDate !== bDate) return bDate - aDate
      return Number(b.billId ?? 0) - Number(a.billId ?? 0)
    })
  }

  const sessionAdvanceRows = collectSessionBillRows('ADVANCE')
  const sessionInvoiceRows = collectSessionBillRows('INVOICE')
  const sessionAdvanceTotal = sessionAdvanceRows.reduce((sum: number, row: any) => sum + (Number(row.amountGross) || 0), 0)
  const sessionInvoiceTotal = sessionInvoiceRows.reduce((sum: number, row: any) => sum + (Number(row.amountGross) || 0), 0)
  const bookedBillingHasExistingAdvance = sessionAdvanceRows.length > 0
  const bookedBillingPaymentStatuses = Array.isArray(selectedBookedSession?.paymentStatuses) ? selectedBookedSession.paymentStatuses : []
  const bookedBillingHasExistingOpenBill = bookedBillingPaymentStatuses
    .some((status: any) => Number(status?.openBillId ?? 0) > 0)
  const bookedBillingHasUnbilledStatus = bookedBillingPaymentStatuses.some((status: any) => (
    Number(status?.bookingId ?? 0) > 0
    && Number(status?.openBillId ?? 0) <= 0
    && !paymentStatusIsFinalizedForAutomaticInvoice(status)
  ))
  const bookedBillingHasInvoiceViewRows = sessionInvoiceRows.length > 0
  const bookedBillingCanEditInvoice = bookedBillingHasExistingOpenBill || bookedBillingHasUnbilledStatus
  const bookedBillingInvoiceActionCount = (bookedBillingCanEditInvoice ? 1 : 0) + (bookedBillingHasInvoiceViewRows ? 1 : 0)
  const bookedQuickAdvanceServiceIds = new Set(String(settings?.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '')
    .split(',')
    .map((value: string) => Number(value.trim()))
    .filter((value: number) => Number.isInteger(value) && value > 0))
  const bookedQuickServiceRefs = Array.isArray(selectedBookedSession?.services) && selectedBookedSession.services.length > 0
    ? selectedBookedSession.services
    : selectedBookedSession?.type
      ? [{ type: selectedBookedSession.type, typeId: selectedBookedSession.type?.id }]
      : []
  const bookedQuickHasAdvanceService = bookedQuickServiceRefs.some((serviceRef: any) => {
    const typeId = Number(serviceRef?.type?.id ?? serviceRef?.typeId)
    const type = metaTypes.find((entry: any) => Number(entry?.id) === typeId) ?? serviceRef?.type
    return (Array.isArray(type?.linkedServices) ? type.linkedServices : [])
      .some((link: any) => bookedQuickAdvanceServiceIds.has(Number(link?.transactionServiceId)))
  })
  const bookedInvoiceStatusEligible = currentBookingStatusKey === 'ONGOING'
    || currentBookingStatusKey === 'CHECKED_OUT'
    || currentBookingStatusKey === 'NO_SHOW'
  const bookedInvoiceTabVisible = settings?.BILLING_ENABLED !== 'false'
    && bookedInvoiceStatusEligible
    && (bookedBillingHasInvoiceViewRows || (!!canIssueOpenInvoice && bookedBillingCanEditInvoice))
  const bookedAdvanceTabVisible = advanceBillingEnabled
    && (bookedBillingHasExistingAdvance || (!!canIssueAdvanceInvoice && bookedQuickHasAdvanceService))

  useEffect(() => {
    if (bookedEditPanelTab === 'invoice' && !bookedInvoiceTabVisible) setBookedEditPanelTab('basic')
    if (bookedEditPanelTab === 'advance' && !bookedAdvanceTabVisible) setBookedEditPanelTab('basic')
  }, [bookedAdvanceTabVisible, bookedEditPanelTab, bookedInvoiceTabVisible])
  const formatSessionDate = (value?: string | null) => formatPaymentDateOnly(value)
  const formatSessionTime = (value?: string | null) => {
    if (!value) return ''
    if (typeof splitLocalDateTimeParts === 'function') {
      const { time } = splitLocalDateTimeParts(value)
      if (time) return time.slice(0, 5)
    }
    const match = String(value).match(/T(\d{2}:\d{2})/)
    return match?.[1] || ''
  }
  const sessionForBillingSummary = sessionForBillingView
  const buildSessionViewTimeRange = (session: any) => {
    if (!session?.startTime || !session?.endTime) return '—'
    if (typeof isLocalBookingAllDay === 'function' && isLocalBookingAllDay(session.startTime, session.endTime)) {
      return locale === 'sl' ? 'Cel dan' : 'All day'
    }
    const start = formatSessionTime(session.startTime)
    const end = formatSessionTime(session.endTime)
    if (start && end) return `${start} – ${end}`
    if (start) return start
    return '—'
  }
  const orderedSessionViewServices = Array.isArray(sessionForBillingSummary?.services)
    ? [...sessionForBillingSummary.services].sort((a: any, b: any) => Number(a?.position ?? 0) - Number(b?.position ?? 0))
    : []
  const sessionViewServiceNames = orderedSessionViewServices
    .map((entry: any) => {
      const typeId = Number(entry?.type?.id ?? entry?.typeId)
      const catalogType = metaTypes.find((type: any) => Number(type?.id) === typeId)
      return String(entry?.type?.name || entry?.type?.description || catalogType?.name || catalogType?.description || entry?.serviceName || '').trim()
    })
    .filter(Boolean)
  const sessionViewServiceName = sessionViewServiceNames.length > 0
    ? sessionViewServiceNames.join(' · ')
    : sessionForBillingSummary?.type?.name || sessionForBillingSummary?.typeName || (locale === 'sl' ? 'Termin' : 'Session')
  const sessionViewServiceLabel = sessionViewServiceNames.length > 1
    ? (locale === 'sl' ? 'Storitve' : locale === 'sr' ? 'Usluge' : 'Services')
    : (locale === 'sl' ? 'Storitev' : locale === 'sr' ? 'Usluga' : 'Service')
  const sessionViewDate = formatSessionDate(sessionForBillingSummary?.startTime)
  const sessionViewTime = buildSessionViewTimeRange(sessionForBillingSummary)
  const sessionViewSpaceNames = Array.from(new Set(orderedSessionViewServices
    .map((entry: any) => {
      const spaceId = Number(entry?.space?.id ?? entry?.spaceId)
      const catalogSpace = metaSpaces.find((space: any) => Number(space?.id) === spaceId)
      return String(entry?.space?.name || catalogSpace?.name || '').trim()
    })
    .filter(Boolean)))
  const sessionViewLocation = sessionViewSpaceNames.length > 0
    ? sessionViewSpaceNames.join(', ')
    : sessionForBillingSummary?.space?.name || '—'
  const sessionViewConsultant = sessionForBillingSummary?.consultant ? fullName(sessionForBillingSummary.consultant) : '—'

  const SessionBillingViewIcon = ({ kind }: any) => kind === 'advance' ? (
    <CalendarAdvancePaymentIcon />
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3.75h6.9l3.85 3.85v12.65H7a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 7 3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.7 3.9V7.7h3.8M8.75 10.8h5.25M8.75 14h3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <text x="14.7" y="18.4" fontSize="5.7" fontWeight="800" fill="currentColor">€</text>
    </svg>
  )

  const renderBillingActionMenu = (kind: 'advance' | 'invoice') => (kind !== 'advance' || advanceBillingEnabled) && bookedBillingActionMenu === kind ? (
    <div className="calendar-session-billing-action-menu" role="menu" onClick={(event) => event.stopPropagation()}>
      {kind === 'advance' ? (
        <>
          <button type="button" role="menuitem" onClick={() => openBookedAdvanceForm()}>
            <span aria-hidden>＋</span>
            {locale === 'sl' ? 'Novo' : 'New'}
          </button>
          {bookedBillingHasExistingAdvance && (
            <button type="button" role="menuitem" onClick={() => openBookedBillingView('advances')}>
              <span aria-hidden>◉</span>
              {locale === 'sl' ? 'Pregled' : 'View'}
            </button>
          )}
        </>
      ) : (
        <>
          {bookedBillingCanEditInvoice && (
            <button type="button" role="menuitem" onClick={() => void openBookedInvoiceEditor()}>
              <span aria-hidden>✎</span>
              {locale === 'sl' ? 'Uredi' : 'Edit'}
            </button>
          )}
          {bookedBillingHasInvoiceViewRows && (
            <button type="button" role="menuitem" onClick={() => openBookedBillingView('invoices')}>
              <span aria-hidden>◉</span>
              {locale === 'sl' ? 'Pregled' : 'View'}
            </button>
          )}
        </>
      )}
    </div>
  ) : null

  const renderSessionBillingViewModal = (kind: 'advances' | 'invoices') => {
    const isAdvances = kind === 'advances'
    const rows = isAdvances ? sessionAdvanceRows : sessionInvoiceRows
    const total = isAdvances ? sessionAdvanceTotal : sessionInvoiceTotal
    const title = isAdvances
      ? (locale === 'sl' ? 'Pregled predplačil za termin' : 'Session advances')
      : (locale === 'sl' ? 'Pregled računov za termin' : 'Session invoices')
    const mobileAdvanceTitle = locale === 'sl' ? 'Pregled predplačil' : 'Advances overview'
    const emptyText = isAdvances
      ? (locale === 'sl' ? 'Za ta termin ni izdanih predplačil.' : 'No advances have been issued for this session yet.')
      : (locale === 'sl' ? 'Za ta termin ni izdanih računov.' : 'No invoices have been issued for this session.')
    const numberLabel = isAdvances ? (locale === 'sl' ? 'Predplačilo št.' : 'Advance no.') : (locale === 'sl' ? 'Račun št.' : 'Invoice no.')
    const payerTitle = locale === 'sl' ? 'Plačnik' : 'Payer'
    const amountTitle = locale === 'sl' ? 'Znesek' : 'Amount'
    const dateTitle = isAdvances ? (locale === 'sl' ? 'Datum plačila' : 'Paid date') : (locale === 'sl' ? 'Datum' : 'Date')
    const paymentMethodTitle = locale === 'sl' ? 'Način plačila' : 'Payment method'
    const statusTitle = locale === 'sl' ? 'Status' : 'Status'

    const advanceSectionTitle = locale === 'sl' ? 'Predplačila' : 'Advances'
    const advanceSummaryTitle = locale === 'sl' ? 'O predplačilih' : 'About advances'
    const advanceTotalLabel = locale === 'sl' ? 'Skupaj plačano:' : 'Total paid:'
    const advanceEmptyTitle = locale === 'sl' ? 'Ni plačanih predplačil' : 'No paid advances'

    const renderBillingRows = (mobile = false) => rows.map((row: any) => {
      const paid = row.statusKey === 'PAID'
      const open = row.statusKey === 'OPEN'
      const statusLabel = paid
        ? (locale === 'sl' ? 'Plačano' : 'Paid')
        : open
          ? (locale === 'sl' ? 'Neplačano' : 'Unpaid')
          : (locale === 'sl' ? 'Čaka na plačilo' : 'Payment pending')
      const payerLabel = Array.from(row.payerNames || []).join(', ') || '—'
      if (mobile) {
        return (
          <article key={`mobile-${row.key}`} className="calendar-session-billing-view-mobile-card">
            <div className="calendar-session-billing-view-mobile-card-top">
              <div className="calendar-session-billing-view-mobile-number" aria-label={`${numberLabel} ${row.billNumber || '—'}`}>
                {row.billNumber || '—'}
              </div>
              <div className="calendar-session-billing-view-mobile-payer">
                <small>{payerTitle}</small>
                <strong>{payerLabel}</strong>
              </div>
            </div>
            <div className="calendar-session-billing-view-mobile-grid">
              <div>
                <small>{amountTitle}</small>
                <strong>{currency(row.amountGross)}</strong>
              </div>
              <div>
                <small>{dateTitle}</small>
                <strong>{formatPaymentDateOnly(row.dateValue) || '—'}</strong>
              </div>
              <div>
                <small>{paymentMethodTitle}</small>
                <strong>{row.paymentMethod || '—'}</strong>
              </div>
            </div>
            <div className="calendar-session-billing-view-mobile-status-row">
              <small>{statusTitle}</small>
              <em className={`calendar-session-billing-view-status calendar-session-billing-view-status--${paid ? 'paid' : 'pending'}`}>{statusLabel}</em>
            </div>
          </article>
        )
      }
      return (
        <div key={row.key} className="calendar-session-billing-view-table-row">
          <span><strong>{row.billNumber}</strong></span>
          <span>{payerLabel}</span>
          <span>{currency(row.amountGross)}</span>
          <span>{formatPaymentDateOnly(row.dateValue) || '—'}</span>
          <span>{row.paymentMethod || '—'}</span>
          <span><em className={`calendar-session-billing-view-status calendar-session-billing-view-status--${paid ? 'paid' : 'pending'}`}>{statusLabel}</em></span>
        </div>
      )
    })

    if (isAdvances) {
      return (
        <div className="calendar-session-billing-view-backdrop" onClick={closeBookedBillingView}>
          <div className="calendar-session-billing-view-modal calendar-session-billing-view-modal--advances-desktop" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-session-billing-view-header">
              <div>
                <h2>{title}</h2>
              </div>
              <button type="button" className="calendar-payment-manager-close" onClick={closeBookedBillingView} aria-label={t('mobileNavClose')}>×</button>
            </div>
            <div className="calendar-session-billing-view-session-card">
              <span className="calendar-session-billing-view-session-icon" aria-hidden>
                <SessionBillingViewIcon kind="advance" />
              </span>
              <div><small>{sessionViewServiceLabel}</small><strong>{sessionViewServiceName}</strong></div>
              <div><small>{locale === 'sl' ? 'Datum' : 'Date'}</small><strong>{sessionViewDate || '—'}</strong></div>
              <div><small>{locale === 'sl' ? 'Čas' : 'Time'}</small><strong>{sessionViewTime}</strong></div>
              <div><small>{locale === 'sl' ? 'Prostor' : 'Space'}</small><strong>{sessionViewLocation}</strong></div>
              <div><small>{locale === 'sl' ? 'Zaposleni' : 'Employee'}</small><strong>{sessionViewConsultant}</strong></div>
            </div>
            <div className="calendar-session-billing-view-table calendar-session-billing-view-table--advances">
              <div className="calendar-session-billing-view-table-head">
                <span>{numberLabel}</span>
                <span>{payerTitle}</span>
                <span>{amountTitle}</span>
                <span>{dateTitle}</span>
                <span>{paymentMethodTitle}</span>
                <span>{statusTitle}</span>
              </div>
              {rows.length > 0 ? (
                <>
                  {renderBillingRows(false)}
                  <div className="calendar-session-billing-view-mobile-list" aria-hidden>
                    {renderBillingRows(true)}
                  </div>
                </>
              ) : (
                <div className="calendar-session-billing-view-empty">{emptyText}</div>
              )}
            </div>
            <div className="calendar-session-billing-view-footer">
              <span>{locale === 'sl' ? `${rows.length} predplačil` : `${rows.length} advances`}</span>
              <strong>{locale === 'sl' ? 'Skupaj plačano:' : 'Total paid:'} <b>{currency(total)}</b></strong>
            </div>
          </div>

          <div className="calendar-session-billing-view-modal calendar-session-billing-view-modal--advances-mobile" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-session-billing-view-header calendar-session-billing-view-header--blue">
              <button
                type="button"
                className="calendar-session-billing-view-close-btn"
                onClick={closeBookedBillingView}
                aria-label={t('mobileNavClose')}
              >
                ×
              </button>
              <div className="calendar-session-billing-view-header-copy">
                <h2>{mobileAdvanceTitle}</h2>
              </div>
            </div>

            <div className="calendar-session-billing-view-advance-content">
              <section className="calendar-session-billing-view-summary-card" aria-label={advanceSummaryTitle}>
                <div className="calendar-session-billing-view-summary-card__left">
                  <span className="calendar-session-billing-view-summary-icon" aria-hidden>
                    <SessionBillingViewIcon kind="advance" />
                  </span>
                  <strong>{advanceSummaryTitle}</strong>
                </div>
                <div className="calendar-session-billing-view-summary-card__right">
                  <small>{advanceTotalLabel}</small>
                  <b>{currency(total)}</b>
                </div>
              </section>

              <section className="calendar-session-billing-view-advances-panel" aria-label={advanceSectionTitle}>
                <div className="calendar-session-billing-view-advances-panel__head">
                  <div className="calendar-session-billing-view-advances-panel__title-wrap">
                    <span className="calendar-session-billing-view-advances-panel__icon" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M7 4.75h10A2.25 2.25 0 0 1 19.25 7v10A2.25 2.25 0 0 1 17 19.25H7A2.25 2.25 0 0 1 4.75 17V7A2.25 2.25 0 0 1 7 4.75Z" stroke="currentColor" strokeWidth="1.8"/>
                        <path d="M9 3.75v3.1M15 3.75v3.1M8.5 11h7M8.5 14.5h5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <strong>{advanceSectionTitle}</strong>
                  </div>
                </div>

                {rows.length > 0 ? (
                  <div className="calendar-session-billing-view-table calendar-session-billing-view-table--advances-panel">
                    <div className="calendar-session-billing-view-table-head">
                      <span>{numberLabel}</span>
                      <span>{payerTitle}</span>
                      <span>{amountTitle}</span>
                      <span>{dateTitle}</span>
                      <span>{paymentMethodTitle}</span>
                      <span>{statusTitle}</span>
                    </div>
                    {renderBillingRows(false)}
                    <div className="calendar-session-billing-view-mobile-list">
                      {renderBillingRows(true)}
                    </div>
                  </div>
                ) : (
                  <div className="calendar-session-billing-view-empty-state">
                    <span className="calendar-session-billing-view-empty-state__illustration" aria-hidden>
                      <svg viewBox="0 0 120 90" fill="none">
                        <ellipse cx="60" cy="75" rx="36" ry="6" fill="currentColor" opacity="0.12" />
                        <path d="M46 25.5h24a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H46a4 4 0 0 1-4-4v-34a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="3"/>
                        <path d="M52 38h12M52 47h12M52 56h8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M52.5 19.5h11a3.5 3.5 0 0 1 3.5 3.5v2.5h-18V23a3.5 3.5 0 0 1 3.5-3.5Z" stroke="currentColor" strokeWidth="3"/>
                        <path d="M27 65c2-7 5.5-11.5 10.5-13.5M93 65c-2-7-5.5-11.5-10.5-13.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.45"/>
                      </svg>
                    </span>
                    <h3>{advanceEmptyTitle}</h3>
                    <p>{emptyText}</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="calendar-session-billing-view-backdrop" onClick={closeBookedBillingView}>
        <div className="calendar-session-billing-view-modal" onClick={(event) => event.stopPropagation()}>
          <div className="calendar-session-billing-view-header">
            <div>
              <h2>{title}</h2>
            </div>
            <button type="button" className="calendar-payment-manager-close" onClick={closeBookedBillingView} aria-label={t('mobileNavClose')}>×</button>
          </div>
          {!isAdvances && (
            <div className="calendar-session-billing-view-info">
              <span aria-hidden>i</span>
              {locale === 'sl'
                ? 'Prikazani so samo računi za ta termin, ki so plačani ali čakajo na plačilo.'
                : 'Only invoices for this session that are paid or waiting for payment are shown.'}
            </div>
          )}
          <div className="calendar-session-billing-view-session-card">
            <span className="calendar-session-billing-view-session-icon" aria-hidden>
              <SessionBillingViewIcon kind={isAdvances ? 'advance' : 'invoice'} />
            </span>
            <div><small>{sessionViewServiceLabel}</small><strong>{sessionViewServiceName}</strong></div>
            <div><small>{locale === 'sl' ? 'Datum' : 'Date'}</small><strong>{sessionViewDate || '—'}</strong></div>
            <div><small>{locale === 'sl' ? 'Čas' : 'Time'}</small><strong>{sessionViewTime}</strong></div>
            <div><small>{locale === 'sl' ? 'Prostor' : 'Space'}</small><strong>{sessionViewLocation}</strong></div>
            <div><small>{locale === 'sl' ? 'Zaposleni' : 'Employee'}</small><strong>{sessionViewConsultant}</strong></div>
          </div>
          <div className={`calendar-session-billing-view-table${isAdvances ? ' calendar-session-billing-view-table--advances' : ''}`}>
            <div className="calendar-session-billing-view-table-head">
              <span>{numberLabel}</span>
              <span>{payerTitle}</span>
              <span>{amountTitle}</span>
              <span>{dateTitle}</span>
              <span>{paymentMethodTitle}</span>
              <span>{statusTitle}</span>
            </div>
            {rows.length > 0 ? (
              <>
                {renderBillingRows(false)}
                <div className="calendar-session-billing-view-mobile-list" aria-hidden>
                  {renderBillingRows(true)}
                </div>
              </>
            ) : (
              <div className="calendar-session-billing-view-empty">{emptyText}</div>
            )}
          </div>
          <div className="calendar-session-billing-view-footer">
            <span>{isAdvances
              ? (locale === 'sl' ? `${rows.length} predplačil` : `${rows.length} advances`)
              : (locale === 'sl' ? `${rows.length} računov` : `${rows.length} invoices`)}</span>
            <strong>{isAdvances ? (locale === 'sl' ? 'Skupaj plačano:' : 'Total paid:') : (locale === 'sl' ? 'Skupaj izdano:' : 'Total issued:')} <b>{currency(total)}</b></strong>
          </div>
        </div>
      </div>
    )
  }

  const paymentManagerSharedCompanyId = (bookedPaymentPayeesUseSameCompanyForAll
    ? bookedPaymentPayeeDrafts?.find((draft: any) => Number(draft?.companyId) > 0)?.companyId
    : null)
    ?? selectedBookedPaymentPayeeDraft?.companyId
    ?? selectedBookedPaymentLinkedCompany?.id
    ?? bookedSessionResolvedGroup?.billingCompany?.id
    ?? selectedBookedSession?.sessionGroupBillingCompany?.id
    ?? null

  const paymentManagerSharedCompany = (Array.isArray(bookingPayeeCompanies)
    ? bookingPayeeCompanies.find((company: any) => Number(company?.id) === Number(paymentManagerSharedCompanyId))
    : null)
    || selectedBookedPaymentLinkedCompany
    || bookedSessionResolvedGroup?.billingCompany
    || selectedBookedSession?.sessionGroupBillingCompany
    || null

  const paymentManagerSharedCompanyName = (selectedBookedPaymentPayeeDraft?.customData && selectedBookedPaymentPayeeDraft?.companyName)
    || paymentManagerSharedCompany?.name
    || paymentManagerSharedCompany?.companyName
    || ''

  const paymentManagerSharedCompanyMeta = [
    (selectedBookedPaymentPayeeDraft?.customData ? selectedBookedPaymentPayeeDraft?.vatId : null)
      || paymentManagerSharedCompany?.vatId
      || paymentManagerSharedCompany?.taxNumber,
    paymentManagerSharedCompany?.registrationNumber || paymentManagerSharedCompany?.companyNumber,
    [
      (selectedBookedPaymentPayeeDraft?.customData ? selectedBookedPaymentPayeeDraft?.address : null) || paymentManagerSharedCompany?.address,
      (selectedBookedPaymentPayeeDraft?.customData ? selectedBookedPaymentPayeeDraft?.postalCode : null) || paymentManagerSharedCompany?.postalCode,
      (selectedBookedPaymentPayeeDraft?.customData ? selectedBookedPaymentPayeeDraft?.city : null) || paymentManagerSharedCompany?.city,
      paymentManagerSharedCompany?.country,
    ].filter(Boolean).join(' '),
    (selectedBookedPaymentPayeeDraft?.customData ? selectedBookedPaymentPayeeDraft?.companyEmail : null)
      || paymentManagerSharedCompany?.email,
  ].filter(Boolean)


  const newGroupMemberIdList = Array.isArray(newGroupMemberIds) ? newGroupMemberIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0) : []
  const selectedNewGroupMembers = newGroupMemberIdList
    .map((id: number) => (Array.isArray(metaClients) ? metaClients.find((client: any) => Number(client?.id) === id) : null))
    .filter(Boolean)
  const newGroupMemberQuery = (newGroupMemberSearch || '').trim().toLowerCase()
  const newGroupMemberCandidates = (Array.isArray(metaClients) ? metaClients : [])
    .filter((client: any) => client?.active !== false && !newGroupMemberIdList.includes(Number(client?.id)))
    .filter((client: any) => {
      if (!newGroupMemberQuery) return false
      const haystack = `${fullName(client) || ''} ${client?.email || ''} ${client?.phone || ''}`.toLowerCase()
      return haystack.includes(newGroupMemberQuery)
    })
    .slice(0, 6)
  const getCreateEntryInitials = (client: any) => {
    const name = fullName(client) || ''
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase() || '')
      .join('') || 'K'
  }

  const renderBookedEntitlementPaymentModal = () => {
    if (!bookedEntitlementTarget) return null
    const canScanSession = Number.isInteger(Number(bookedEntitlementTarget.paymentBookingId)) && Number(bookedEntitlementTarget.paymentBookingId) > 0
    const walletOptionCount = bookedEntitlementWalletOptions.length
    const modalTitle = bookedEntitlementStep === 'choice'
      ? (locale === 'sl' ? 'Izberite vnos ugodnosti' : 'Choose entitlement input')
      : bookedEntitlementStep === 'scanner'
        ? (locale === 'sl' ? 'Skeniraj ugodnost' : 'Scan entitlement')
        : bookedEntitlementStep === 'wallet'
          ? (locale === 'sl' ? 'Izberite ugodnost iz denarnice' : 'Choose wallet entitlement')
          : (locale === 'sl' ? 'Vnesite kodo ugodnosti' : 'Enter entitlement code')
    const targetAmount = Number(bookedEntitlementTarget.amountGross ?? 0)

    return (
      <div className="billing-entitlement-modal-backdrop" onMouseDown={closeBookedEntitlementPaymentModal} role="presentation">
        <div
          className={`billing-entitlement-modal billing-entitlement-modal--${bookedEntitlementStep}`}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={modalTitle}
        >
          <div className="billing-entitlement-modal-head">
            <div>
              <h3>{modalTitle}</h3>
              <p>
                {bookedEntitlementStep === 'choice'
                  ? (locale === 'sl' ? 'Izberite, kako želite uporabiti ugodnost za ta termin.' : 'Select how you would like to provide the entitlement for this session.')
                  : bookedEntitlementStep === 'scanner'
                    ? (locale === 'sl' ? 'Postavite QR ali črtno kodo znotraj okvirja.' : 'Position the QR or barcode within the frame.')
                    : bookedEntitlementStep === 'wallet'
                      ? (locale === 'sl' ? 'Izberite razpoložljivo ugodnost stranke za izbrani termin.' : 'Choose an available entitlement from the client wallet for this session.')
                      : (locale === 'sl' ? 'Ročno vnesite kodo ugodnosti za ta termin.' : 'Enter the entitlement code manually to apply it to this session.')}
              </p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={closeBookedEntitlementPaymentModal} aria-label={locale === 'sl' ? 'Zapri' : 'Close'}>×</button>
          </div>

          {!canScanSession && (
            <div className="billing-entitlement-result billing-entitlement-result--error" role="status">
              <strong>{locale === 'sl' ? 'Ta termin nima plačilnega zapisa.' : 'This session has no payment record.'}</strong>
              <span>{locale === 'sl' ? 'Ugodnost lahko uporabite kot plačilo samo pri terminih, ki imajo plačilni zapis.' : 'Entitlements can only be applied when the session has a payment record.'}</span>
            </div>
          )}

          {bookedEntitlementStep === 'choice' && (
            <div className="billing-entitlement-choice-list">
              <button
                type="button"
                className="billing-entitlement-choice-card"
                onClick={() => {
                  setBookedEntitlementStep('scanner')
                  setBookedEntitlementScanResult(null)
                }}
                disabled={!canScanSession}
              >
                <span className="billing-entitlement-choice-icon" aria-hidden><BookedEntitlementScanIcon /></span>
                <span className="billing-entitlement-choice-copy">
                  <strong>{locale === 'sl' ? 'Skeniraj ugodnost' : 'Scan entitlement'}</strong>
                  <small>{locale === 'sl' ? 'Odprite skener v popupu in skenirajte QR kodo ugodnosti.' : 'Open the scanner in a popup to scan the entitlement QR code.'}</small>
                </span>
                <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
              </button>
              <button
                type="button"
                className="billing-entitlement-choice-card"
                onClick={() => {
                  stopBookedEntitlementCamera()
                  setBookedEntitlementStep('manual')
                  setBookedEntitlementScanResult(null)
                }}
                disabled={!canScanSession}
              >
                <span className="billing-entitlement-choice-icon" aria-hidden><BookedEntitlementKeyboardIcon /></span>
                <span className="billing-entitlement-choice-copy">
                  <strong>{locale === 'sl' ? 'Vnesi kodo ročno' : 'Enter code manually'}</strong>
                  <small>{locale === 'sl' ? 'Odprite obrazec za ročni vnos kode ugodnosti.' : 'Open a form to manually enter the entitlement code.'}</small>
                </span>
                <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
              </button>
              {canScanSession && walletOptionCount > 0 && (
                <button
                  type="button"
                  className="billing-entitlement-choice-card billing-entitlement-choice-card--with-badge"
                  onClick={() => {
                    stopBookedEntitlementCamera()
                    setBookedEntitlementStep('wallet')
                    setBookedEntitlementScanResult(null)
                  }}
                  disabled={bookedEntitlementWalletLoading}
                >
                  <span className="billing-entitlement-choice-icon" aria-hidden><BookedEntitlementWalletIcon /></span>
                  <span className="billing-entitlement-choice-copy">
                    <strong>{locale === 'sl' ? 'Izberi iz denarnice' : 'Choose from wallet'}</strong>
                    <small>{locale === 'sl' ? 'Uporabite razpoložljivo ugodnost stranke za ta termin.' : 'Use an available entitlement from the client wallet for this session.'}</small>
                  </span>
                  <span className="billing-entitlement-choice-badge">{bookedEntitlementWalletCountLabel(walletOptionCount)}</span>
                  <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
                </button>
              )}
            </div>
          )}

          {bookedEntitlementStep === 'wallet' && (
            <div className="billing-entitlement-wallet">
              <div className="billing-entitlement-target-strip">
                <span>{locale === 'sl' ? 'Stranka' : 'Client'}</span>
                <strong>{bookedEntitlementTarget.clientLabel || '—'}</strong>
                <em>{targetAmount > 0 ? currency(targetAmount) : (locale === 'sl' ? 'Termin' : 'Session')}</em>
              </div>
              <div className="billing-entitlement-wallet-list">
                {bookedEntitlementWalletOptions.map((option: any) => (
                  <button
                    key={option.id}
                    type="button"
                    className="billing-entitlement-wallet-card"
                    onClick={() => submitBookedEntitlementWalletOption(option)}
                    disabled={bookedEntitlementSubmitting || !String(option.code || option.displayCode || '').trim()}
                  >
                    <span className="billing-entitlement-choice-icon" aria-hidden><BookedEntitlementWalletIcon /></span>
                    <span className="billing-entitlement-wallet-copy">
                      <strong>{option.productName || bookedEntitlementWalletTypeLabel(option)}</strong>
                      <small>{bookedEntitlementWalletTypeLabel(option)} · {bookedEntitlementWalletRemainingLabel(option)}</small>
                      {(option.displayCode || option.code) && <em>{option.displayCode || option.code}</em>}
                    </span>
                    <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
                  </button>
                ))}
                {walletOptionCount === 0 && !bookedEntitlementWalletLoading && (
                  <div className="billing-entitlement-wallet-empty">
                    {locale === 'sl' ? 'Stranka nima razpoložljivih kart ali paketov za to storitev.' : 'The client has no available tickets or packs for this service.'}
                  </div>
                )}
                {bookedEntitlementWalletLoading && (
                  <div className="billing-entitlement-wallet-empty">
                    {locale === 'sl' ? 'Preverjam denarnico…' : 'Checking wallet…'}
                  </div>
                )}
              </div>
              <button type="button" className="billing-entitlement-link-btn billing-entitlement-wallet-back" onClick={() => setBookedEntitlementStep('choice')}>
                {locale === 'sl' ? 'Nazaj na izbiro vnosa' : 'Back to input choice'}
              </button>
            </div>
          )}

          {bookedEntitlementStep === 'scanner' && (
            <div className="billing-entitlement-scanner">
              <div className="billing-entitlement-scanner-frame">
                <video ref={bookedEntitlementVideoRef} className="billing-entitlement-scanner-video" playsInline muted />
                {!bookedEntitlementCameraActive && (
                  <div className="billing-entitlement-scanner-empty">
                    <span aria-hidden><BookedEntitlementScanIcon /></span>
                    <strong>{locale === 'sl' ? 'Kamera se pripravlja…' : 'Preparing camera…'}</strong>
                  </div>
                )}
              </div>
              <div className="billing-entitlement-target-strip">
                <span>{locale === 'sl' ? 'Stranka' : 'Client'}</span>
                <strong>{bookedEntitlementTarget.clientLabel || '—'}</strong>
                <em>{targetAmount > 0 ? currency(targetAmount) : (locale === 'sl' ? 'Termin' : 'Session')}</em>
              </div>
              <div className="billing-entitlement-scanner-actions">
                <button type="button" className="billing-entitlement-link-btn" onClick={() => { stopBookedEntitlementCamera(); setBookedEntitlementStep('manual'); setBookedEntitlementScanResult(null) }}>
                  {locale === 'sl' ? 'Vnesi kodo ročno' : 'Enter code manually'}
                </button>
                <button type="button" className="billing-entitlement-camera-btn" onClick={() => void startBookedEntitlementCamera()} disabled={bookedEntitlementSubmitting}>
                  <BookedEntitlementCameraIcon />
                </button>
                <button type="button" className="billing-entitlement-icon-soft" onClick={stopBookedEntitlementCamera} disabled={!bookedEntitlementCameraActive || bookedEntitlementSubmitting} aria-label={locale === 'sl' ? 'Ustavi kamero' : 'Stop camera'}>
                  <BookedEntitlementPaymentIcon />
                </button>
              </div>
            </div>
          )}

          {bookedEntitlementStep === 'manual' && (
            <form className="billing-entitlement-manual-form" onSubmit={submitBookedEntitlementManualCode}>
              <label>
                <span>{locale === 'sl' ? 'Koda ugodnosti' : 'Entitlement code'}</span>
                <input
                  value={bookedEntitlementManualCode}
                  onChange={(event) => setBookedEntitlementManualCode(event.target.value)}
                  placeholder={locale === 'sl' ? 'npr. ENT-2025-0001' : 'e.g. ENT-2025-0001'}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <div className="billing-entitlement-manual-hint">
                <span aria-hidden>i</span>
                {locale === 'sl' ? 'Kodo običajno prejmete na kartici ugodnosti ali v mobilni denarnici.' : 'The code is typically printed on the entitlement or shown in the mobile wallet.'}
              </div>
              <button type="submit" className="billing-entitlement-apply-btn" disabled={bookedEntitlementSubmitting || !bookedEntitlementManualCode.trim()}>
                {bookedEntitlementSubmitting ? (locale === 'sl' ? 'Preverjam…' : 'Applying…') : (locale === 'sl' ? 'Uporabi kodo' : 'Apply code')}
              </button>
              <div className="billing-entitlement-or-row"><span>{locale === 'sl' ? 'ali' : 'or'}</span></div>
              <button type="button" className="billing-entitlement-open-scanner-btn" onClick={() => { setBookedEntitlementStep('scanner'); setBookedEntitlementScanResult(null) }}>
                <BookedEntitlementScanIcon />
                {locale === 'sl' ? 'Odpri skener' : 'Open scanner'}
              </button>
            </form>
          )}

          {bookedEntitlementScanResult && (
            <div className={`billing-entitlement-result billing-entitlement-result--${bookedEntitlementScanResult.tone}`} role="status">
              <strong>{bookedEntitlementScanResult.text}</strong>
              {bookedEntitlementScanResult.detail && <span>{bookedEntitlementScanResult.detail}</span>}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <ConfirmDialog
        open={Boolean(confirmOverlap)}
        onClose={() => setConfirmOverlap(null)}
        tone="warning"
        icon={<CalendarWarningIcon />}
        title={warningCopy.overlappingTitle}
        text={confirmOverlap ? warningCopy.overlappingSubtitle(confirmOverlap.overlapping.length) : undefined}
        confirmLabel={warningCopy.overlappingConfirm}
        cancelLabel={warningCopy.overlappingCancel}
        busy={saveBookingLoading}
        onConfirm={() => saveBooking(true, true, true)}
      />

      <ConfirmDialog
        open={Boolean(confirmBookedPersonalOverlap)}
        onClose={cancelBookedPersonalOverlap}
        tone="warning"
        icon={<CalendarWarningIcon />}
        title={warningCopy.personalTimeTitle}
        text={warningCopy.personalTimeSubtitle}
        confirmLabel={warningCopy.yes}
        cancelLabel={warningCopy.cancel}
        busy={saveBookingLoading}
        onConfirm={() => void confirmBookedPersonalOverlapYes()}
      />

      <ConfirmDialog
        open={Boolean(confirmNonBookableMove)}
        onClose={cancelNonBookableMove}
        tone="warning"
        icon={<CalendarWarningIcon />}
        title={warningCopy.warningTitle}
        text={
          confirmNonBookableMove?.pastTime ? warningCopy.nonBookablePastTime : warningCopy.nonBookableSlot
        }
        confirmLabel={warningCopy.yes}
        cancelLabel={warningCopy.no}
        onConfirm={() => void confirmNonBookableMoveYes()}
      />

      <ConfirmDialog
        open={Boolean(confirmNonBookable)}
        onClose={() => setConfirmNonBookable(null)}
        tone="warning"
        icon={<CalendarWarningIcon />}
        title={warningCopy.warningTitle}
        text={confirmNonBookable?.pastTime ? warningCopy.nonBookablePastTime : warningCopy.nonBookableSlot}
        confirmLabel={warningCopy.yes}
        cancelLabel={warningCopy.no}
        busy={saveBookingLoading}
        onConfirm={() => void confirmNonBookableYes()}
      />

      <ConfirmDialog
        open={Boolean(waitlistModuleEnabled && releasedSlotWaitlistPrompt)}
        onClose={() => { if (!releasedSlotWaitlistLoading) setReleasedSlotWaitlistPrompt(null) }}
        title={locale === 'sl' ? 'Ponudi sproščeni termin' : 'Offer the released slot'}
        text={releasedSlotWaitlistPrompt
          ? (locale === 'sl'
            ? `Ta termin ustreza ${releasedSlotWaitlistPrompt.matches.count} ${Number(releasedSlotWaitlistPrompt.matches.count) === 1 ? 'stranki' : 'strankam'} na čakalni vrsti.`
            : `This slot matches ${releasedSlotWaitlistPrompt.matches.count} waitlisted ${Number(releasedSlotWaitlistPrompt.matches.count) === 1 ? 'client' : 'clients'}.`)
          : undefined}
        icon={<svg viewBox="0 0 24 24" fill="none"><path d="M8 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.5 1.5h4m-2-2v4M2.5 20c.8-2.7 2.7-4 5.5-4s4.7 1.3 5.5 4M15 15h6M15 19h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        stackedActions
        busy={releasedSlotWaitlistLoading}
        onConfirm={() => { if (releasedSlotWaitlistPrompt) void runReleasedSlotAction(releasedSlotWaitlistPrompt, true) }}
        confirmLabel={releasedSlotWaitlistLoading
          ? (locale === 'sl' ? 'Obdelujem …' : 'Processing …')
          : (locale === 'sl' ? 'Ponudi prvi stranki' : 'Offer first client')}
        cancelLabel={t('cancel')}
        extraActions={releasedSlotWaitlistPrompt && (
          <>
            <button
              type="button"
              className="cp-btn cp-btn--subtle"
              onClick={() => window.open('/appointments', '_blank', 'noopener,noreferrer')}
              disabled={releasedSlotWaitlistLoading}
            >
              {locale === 'sl' ? 'Prikaži čakalno vrsto' : 'View waitlist'}
            </button>
            <button
              type="button"
              className="cp-btn cp-btn--danger"
              onClick={() => void runReleasedSlotAction(releasedSlotWaitlistPrompt, false)}
              disabled={releasedSlotWaitlistLoading}
            >
              {releasedSlotWaitlistPrompt.action === 'DELETE'
                ? (locale === 'sl' ? 'Izbriši brez ponudbe' : 'Delete without offer')
                : (locale === 'sl' ? 'Odpovej brez ponudbe' : 'Cancel without offer')}
            </button>
          </>
        )}
      >
        {releasedSlotWaitlistPrompt && (
          <div className="calendar-waitlist-release-candidate">
            <span className="calendar-waitlist-release-candidate__avatar">
              {String(releasedSlotWaitlistPrompt.matches.first.clientName || '?').split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase()}
            </span>
            <div>
              <strong>{releasedSlotWaitlistPrompt.matches.first.clientName}</strong>
              <span>{releasedSlotWaitlistPrompt.matches.first.clientPhone || releasedSlotWaitlistPrompt.matches.first.clientEmail || '—'}</span>
            </div>
            <span className="calendar-waitlist-release-candidate__queue">
              {locale === 'sl' ? 'Prva ustrezna' : 'First eligible'}
            </span>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={showRecurringDeleteDialog}
        onClose={() => setConfirmDelete(false)}
        tone="danger"
        icon={<CalendarFormFooterDeleteIcon />}
        title={t('formDeleteRecurringSessionTitle')}
        text={t('formDeleteRecurringSessionQuestion')}
        stackedActions
        confirmLabel={t('formDeleteOnlyThisSession')}
        cancelLabel={t('formCancel')}
        onConfirm={() => void prepareReleasedSlotAction('DELETE', 'SINGLE')}
        extraActions={
          <PanelButton variant="danger" onClick={() => void prepareReleasedSlotAction('DELETE', 'THIS_AND_FOLLOWING')}>
            {t('formDeleteThisAndFollowing')}
          </PanelButton>
        }
      />

      {selectedBookedSession && !calendarDashboardSelectionOnly && (
        <SidePanel
          open
          onClose={closeBookedModal}
          ariaLabel={t('formBookedSession')}
          closeOnScrimClick={false}
          className="cp-panel--calendar-form cp-panel--calendar-standardized cp-panel--calendar-edit-booking"
        >
            <PanelHeader
              title={t('formBookedSession')}
              subtitle={bookedPanelSubtitle}
              onClose={closeBookedModal}
              closeLabel={t('mobileNavClose')}
            />
            <PanelTabs
              label={t('formBookedSession')}
              activeId={bookedEditPanelTab}
              onSelect={(id) => setBookedEditPanelTab(id as 'basic' | 'notes' | 'invoice' | 'advance')}
              tabs={[
                {
                  id: 'basic',
                  label: locale === 'sl' ? 'Osnovni podatki' : 'Basic details',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M16 3v4M8 3v4M3 10h18" />
                    </svg>
                  ),
                },
                {
                  id: 'invoice',
                  label: locale === 'sl' ? 'Račun' : 'Invoice',
                  hidden: !bookedInvoiceTabVisible,
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 3.75h6.9l3.85 3.85v12.65H7a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 7 3.75Z" />
                      <path d="M13.7 3.9V7.7h3.8M8.75 11h5.25M8.75 14.3h5.25" />
                    </svg>
                  ),
                },
                {
                  id: 'advance',
                  label: locale === 'sl' ? 'Predplačilo' : 'Advance',
                  hidden: !bookedAdvanceTabVisible,
                  icon: <CalendarAdvancePaymentIcon />,
                },
              ]}
            />
            {(bookedEditPanelTab === 'basic' || bookedEditPanelTab === 'notes') && (
            <PanelBody sectioned className={`calendar-standardized-body calendar-standardized-edit-booking-body${bookedEditPanelTab === 'notes' ? ' calendar-booking-notes-tab-active' : ''}`}>
            {selectedBookedSession.billedAt && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <span
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                  }}
                >
                  {t('formPaid')}
                </span>
              </div>
            )}
            {selectedBookedSession.breakConflict && (
              <div className="toast toast-error calendar-booking-inline-toast" role="alert" style={{ marginBottom: 12 }}>
                Break overlaps another booking or a personal block during the configured break time.
              </div>
            )}
            <PanelSection
              title={bookedSessionIsGroup ? sectionLabels.group : sectionLabels.clients}
              className="calendar-standardized__section calendar-standardized__clients"
              icon={<CalendarSectionIcon name="clients" />}
              summary={bookedClientsSummary}
              collapsible={compactAppointmentStructure}
            >
              {bookedSessionIsGroup ? (
                <div className="form-row form-row-infield calendar-booking-client-with-group calendar-booking-field--client">
                  <div className="calendar-booking-service-infield-head">
                    <span className="form-field-inline-label">{t('formGroup')}</span>
                  </div>
                  <div className="form-field-inline-control">
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className="client-search-wrap calendar-client-picker__search-wrap client-search-wrap--compact-client">
                          <button
                            type="button"
                            className="client-selected-display"
                            disabled
                            title={bookedSessionResolvedGroup?.name ?? selectedBookedSession?.groupName ?? ''}
                          >
                            {bookedSessionResolvedGroup?.name ?? selectedBookedSession?.groupName ?? (locale === 'sl' ? `Skupina #${bookedSessionGroupId}` : `Group #${bookedSessionGroupId}`)}
                          </button>
                        </div>
                        <div className="calendar-client-picker__actions">
                          <button
                            type="button"
                            className="secondary calendar-client-picker__details-btn calendar-client-picker__payee-tab-btn"
                            title={locale === 'sl' ? 'Podrobnosti skupine' : 'Group details'}
                            aria-label={locale === 'sl' ? 'Odpri podrobnosti skupine' : 'Open group details'}
                            disabled={!bookedSessionGroupId}
                            onClick={(e) => {
                              e.stopPropagation()
                              openBookedSessionGroupDetail()
                            }}
                          >
                            <CalendarPaymentPersonIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="form-row form-row-infield calendar-booking-field--client">
                <span className="form-field-inline-label">{t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient')}</span>
                <div className="form-field-inline-control">
                <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                  <div className="calendar-client-picker__search-row">
                    <div className={`client-search-wrap calendar-client-picker__search-wrap${bookedSessionClientFieldCompact ? ' client-search-wrap--compact-client' : ''}${bookedClientDropdownOpen && bookedSessionSelectedClients.length > 0 && !bookedSessionClientFieldCompact ? ' calendar-client-picker__search-wrap--confirmable' : ''}`}>
                      {bookedSessionClientFieldCompact ? (
                        <>
                          <button
                            type="button"
                            className="client-selected-display"
                            onClick={() => {
                              setEditingBookedClientSearch(true)
                              setBookedClientSearch('')
                              setBookedClientDropdownOpen(true)
                            }}
                          >
                            {fullName(bookedSessionSelectedClient!)}
                          </button>
                          <button
                            type="button"
                            className="calendar-client-picker__single-clear"
                            title={clearSingleClientTitle}
                            aria-label={clearSingleClientTitle}
                            onClick={(event) => {
                              event.stopPropagation()
                              applyBookedSessionClientIds([])
                              setBookedClientSearch('')
                              setEditingBookedClientSearch(false)
                              setBookedClientDropdownOpen(false)
                            }}
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </>
                      ) : (
                        <input
                          ref={bookedClientSearchInputRef}
                          type="search"
                          name="calendra-booked-session-client-search"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          inputMode="search"
                          enterKeyHint="search"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          placeholder={clientSearchPlaceholder}
                          value={bookedClientSearch}
                          onChange={(e) => {
                            setBookedClientSearch(e.target.value)
                            setEditingBookedClientSearch(true)
                            setBookedClientDropdownOpen(true)
                          }}
                          onFocus={() => {
                            setEditingBookedClientSearch(true)
                            setBookedClientDropdownOpen(true)
                          }}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setBookedClientDropdownOpen(false)
                              if (multipleClientsPerSessionEnabled) {
                                setEditingBookedClientSearch(false)
                                return
                              }
                              const typed = bookedClientSearch.trim()
                              if (typed && bookedSessionSelectedClient) {
                                if (fullName(bookedSessionSelectedClient).toLowerCase() !== typed.toLowerCase()) {
                                  applyBookedSessionClientIds([])
                                } else {
                                  setBookedClientSearch('')
                                }
                              } else if (!typed) {
                                setBookedClientSearch('')
                              }
                              setEditingBookedClientSearch(false)
                            }, 0)
                          }}
                        />
                      )}
                      {bookedClientDropdownOpen && !bookedSessionClientFieldCompact && bookedSessionSelectedClients.length > 0 && (
                        <button
                          type="button"
                          className="calendar-client-picker__confirm"
                          aria-label={locale === 'sl' ? 'Potrdi izbiro strank' : 'Confirm client selection'}
                          title={locale === 'sl' ? 'Potrdi izbiro strank' : 'Confirm client selection'}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setBookedClientDropdownOpen(false)
                            setEditingBookedClientSearch(false)
                            setBookedClientSearch('')
                            bookedClientSearchInputRef.current?.blur()
                          }}
                        >
                          <span aria-hidden>✓</span>
                        </button>
                      )}
                    </div>
                    <div className="calendar-client-picker__actions">
                      <button
                        type="button"
                        className="secondary client-add-btn calendar-client-picker__add-btn"
                        title={addClientInlineTitle}
                        aria-label={addClientInlineTitle}
                        onClick={() => {
                          setBookedClientDropdownOpen(false)
                          const p = parseClientNameInput(bookedClientSearch)
                          setNewClientForm((prev) => ({ ...prev, firstName: p.firstName, lastName: p.lastName }))
                          setShowAddClientModal(true)
                        }}
                      >
                        <CalendarBookingAddIcon />
                        <span className="calendar-client-picker__add-label">{clientSearchPlaceholder}</span>
                      </button>
                      {bookedSessionSelectedClients.length === 1 && bookedSessionSelectedClient?.id && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__details-btn calendar-client-picker__client-detail-btn"
                          title={locale === 'sl' ? 'Podrobnosti stranke' : 'Client details'}
                          aria-label={locale === 'sl' ? 'Odpri podrobnosti stranke' : 'Open client details'}
                          onClick={(e) => {
                            e.stopPropagation()
                            openBookedSessionClientDetail(bookedSessionSelectedClient.id)
                          }}
                        >
                          <CalendarPaymentPersonIcon />
                        </button>
                      )}
                    </div>
                    {bookedClientDropdownOpen && (
                      <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                        {visibleBookedClients.slice(0, 10).map((client: any) => {
                          const selected = selectedBookedClientIds.includes(client.id)
                          return (
                          <button
                            key={client.id}
                            type="button"
                            className={`client-list-item calendar-client-picker__dropdown-item ${selected ? 'selected' : ''}`}
                            onClick={() => {
                              if (multipleClientsPerSessionEnabled) {
                                const nextIds = selected
                                  ? selectedBookedClientIds.filter((id) => id !== client.id)
                                  : [...selectedBookedClientIds, client.id]
                                applyBookedSessionClientIds(nextIds)
                              } else {
                                setSelectedBookedSession({ ...selectedBookedSession, client, clients: [client] })
                                setBookedClientDropdownOpen(false)
                                setEditingBookedClientSearch(false)
                              }
                              setBookedClientSearch('')
                            }}
                          >
                            <span className="calendar-client-picker__dropdown-check" aria-hidden>{selected ? '✓' : ''}</span>
                            <span className="calendar-client-picker__dropdown-label">{fullName(client)}</span>
                          </button>
                        )})}
                        {visibleBookedClients.length === 0 && <span className="muted">{t('formNoClientsFoundAddOne')}</span>}
                      </div>
                    )}
                  </div>
                  {multipleClientsPerSessionEnabled && bookedSessionSelectedClients.length > 0 && (
                    <div className="calendar-multi-client-chips">
                      {visibleBookedSessionClientChips.map((client: any) => (
                        <div key={client.id} className="calendar-multi-client-chip">
                          <button
                            type="button"
                            className="calendar-multi-client-chip__label"
                            title={locale === 'sl' ? 'Odpri kartico stranke' : 'Open client card'}
                            onClick={(e) => {
                              e.stopPropagation()
                              openBookedSessionClientDetail(client.id)
                            }}
                          >
                            {fullName(client)}
                          </button>
                          <button
                            type="button"
                            className="calendar-multi-client-chip__remove"
                            aria-label={`${t('formDelete')} ${fullName(client)}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              applyBookedSessionClientIds(selectedBookedClientIds.filter((id) => id !== client.id))
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {hiddenBookedSessionClientCount > 0 && !bookedSessionClientsExpanded && (
                        <button
                          type="button"
                          className="calendar-multi-client-more"
                          onClick={() => setBookedSessionClientsExpanded(true)}
                        >
                          {getMoreClientsLabel(hiddenBookedSessionClientCount)}
                        </button>
                      )}
                      {bookedSessionClientsExpanded && bookedSessionSelectedClients.length > 3 && (
                        <button
                          type="button"
                          className="calendar-multi-client-more calendar-multi-client-more--secondary"
                          onClick={() => setBookedSessionClientsExpanded(false)}
                        >
                          {showLessClientsLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </div>
              </div>
              )}
            </PanelSection>
              {showBookingTypeRow && (
                  <CalendarServiceChainEditor
                    sectionSummary={bookedServiceSummary}
                    sectionClassName="calendar-standardized__section calendar-standardized__service"
                    sectionCollapsible={compactAppointmentStructure}
                    sectionAction={onlineSessionBookingEnabled ? (
                      <div className="cp-section__controls">
                        {selectedBookedSession.online ? (
                          <div className="meeting-provider-summary meeting-provider-summary--service-inline calendar-booking-service-meeting-inline">
                            <span className="meeting-provider-summary__name">
                              {selectedBookedSession.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}
                            </span>
                            <button
                              type="button"
                              className="secondary meeting-provider-change-btn"
                              onClick={() => {
                                setMeetingPickerCancelUnchecksOnline(false)
                                setMeetingProviderPickerTarget('edit')
                                setMeetingProviderPickerOpen(true)
                              }}
                            >
                              {t('formChange')}
                            </button>
                          </div>
                        ) : null}
                        <div className="calendar-booking-service-online-line" role="group" aria-label={t('formSessionOnlineShort')}>
                          <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formSessionOnlineShort')}>
                            <input
                              type="checkbox"
                              checked={!!selectedBookedSession.online}
                              aria-labelledby={bookedSessionOnlineCaptionId}
                              onChange={(e) => {
                                const on = e.target.checked
                                if (on) {
                                  setSelectedBookedSession({
                                    ...selectedBookedSession,
                                    online: true,
                                    meetingProvider: selectedBookedSession.meetingProvider || 'zoom',
                                  })
                                  setMeetingPickerCancelUnchecksOnline(true)
                                  setMeetingProviderPickerTarget('edit')
                                  setMeetingProviderPickerOpen(true)
                                } else {
                                  setSelectedBookedSession({ ...selectedBookedSession, online: false, meetingLink: null })
                                  setMeetingProviderPickerOpen(false)
                                  setMeetingProviderPickerTarget(null)
                                  setMeetingPickerCancelUnchecksOnline(false)
                                }
                              }}
                            />
                            <span className="repeats-toggle-slider" />
                          </label>
                          <span id={bookedSessionOnlineCaptionId} className="calendar-booking-service-online-caption">
                            {t('formSessionOnlineShort')}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    locale={locale}
                    services={bookedServiceDrafts}
                    segments={bookedServiceChain.segments}
                    sessionTypes={bookedSessionSelectableMetaTypesForLocation}
                    spaces={bookedSpaces}
                    currency={currency}
                    totalSpanMinutes={bookedServiceChain.totalSpanMinutes}
                    totalGross={bookedServiceChain.totalGross}
                    clientCount={selectedBookedClientIds.length}
                    warnings={bookedServiceWarnings}
                    onChange={updateSelectedBookedSessionServices}
                    defaultSpaceId={selectedBookedSession.space?.id ?? null}
                    multipleServicesEnabled={multipleServicesEnabled}
                    allowServiceEdit={!bookedBillingHasExistingOpenBill}
                    showServiceEditButton
                    showSessionMaxParticipants={bookedSessionIsGroup}
                    sessionMaxParticipants={selectedBookedSession.maxParticipantsOverride ?? null}
                    onSessionMaxParticipantsChange={(value) =>
                      setSelectedBookedSession((current: any) => current ? { ...current, maxParticipantsOverride: value } : current)
                    }
                    consumablesEnabled={settings?.CONSUMABLES_ENABLED === 'true' && canViewConsumables}
                    canEditConsumables={canEditConsumables}
                    bookingId={selectedBookedSession.id ?? null}
                    sessionConsumables={selectedBookedSession.sessionConsumables}
                    resetSessionConsumablesToDefaults={selectedBookedSession.resetSessionConsumablesToDefaults === true}
                    sessionConsumablesOverridden={selectedBookedSession.sessionConsumablesOverridden === true}
                    onSessionConsumablesChange={(rows, resetToDefaults) =>
                      setSelectedBookedSession((current: any) => current ? {
                        ...current,
                        sessionConsumables: rows,
                        resetSessionConsumablesToDefaults: resetToDefaults,
                        sessionConsumablesOverridden: !resetToDefaults,
                      } : current)
                    }
                  >
                  </CalendarServiceChainEditor>
              )}
              {showBookingConsultantRow && (
                <PanelSection
                  title={t('formConsultant')}
                  className="calendar-standardized__section calendar-standardized__employee"
                  icon={<CalendarSectionIcon name="clients" />}
                  collapsible={false}
                >
                  <div className="form-row form-row-infield calendar-booking-field--consultant">
                    <div className="form-field-inline-control">
                      <DesktopSelect
                        value={selectedBookedSession?.consultant?.id ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '') {
                            setSelectedBookedSession({ ...selectedBookedSession, consultant: null })
                          } else {
                            setSelectedBookedSession({ ...selectedBookedSession, consultant: metaUsers.find((u: any) => u.id === Number(val)) })
                          }
                        }}
                      >
                        <option value="">{t('formUnassigned')}</option>
                        {bookedConsultants.map((c: any) => (
                          <option key={c.id} value={c.id}>{fullName(c)}</option>
                        ))}
                      </DesktopSelect>
                    </div>
                  </div>
                </PanelSection>
              )}
              {bookedShowSpaceRow && (
                <PanelSection
                  title={t('formCalendarBookingSpace')}
                  className="calendar-standardized__section calendar-standardized__space"
                  icon={<CalendarSectionIcon name="location" />}
                  collapsible={false}
                >
                  <div className="form-row form-row-infield calendar-booking-field--space">
                    <div className="form-field-inline-control">
                      <DesktopSelect
                        value={selectedBookedSession?.space?.id ?? ''}
                        onChange={(e) => {
                          const nextSpaceId = Number(e.target.value) || null
                          updateSelectedBookedSessionServices(bookedServiceDrafts.map((service: any, index: number) => (
                            index === 0 ? { ...service, spaceId: nextSpaceId } : service
                          )))
                        }}
                      >
                        <option value="">{t('formNoSpace')}</option>
                        {bookedSpaces.map((space: any) => <option key={space.id} value={space.id}>{space.name}</option>)}
                      </DesktopSelect>
                    </div>
                  </div>
                </PanelSection>
              )}
              <PanelSection
                title={sectionLabels.schedule}
                className="calendar-standardized__section calendar-standardized__schedule"
                icon={<CalendarSectionIcon name="schedule" />}
                defaultOpen
                collapsible={compactAppointmentStructure}
                summary={bookedScheduleSummary}
                action={!compactAppointmentStructure ? (
                  <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formAllDay')}>
                    <span id={`${editBookedAllDayCaptionId}-header`} className="calendar-standardized__toggle-caption">{t('formAllDay')}</span>
                    <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formAllDay')}>
                      <input
                        type="checkbox"
                        checked={isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime)}
                        aria-labelledby={`${editBookedAllDayCaptionId}-header`}
                        onChange={toggleBookedSessionAllDay}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                  </div>
                ) : undefined}
              >
              <div className="form-row form-row-timespan calendar-booking-timespan-row">
                <CalendarLocalTimespanRow
                  startValue={selectedBookedSession.startTime}
                  endValue={selectedBookedSession.endTime}
                  onCommitStart={(s) => updateSelectedBookedSessionStartTime(s)}
                  onCommitEnd={(s) =>
                    setSelectedBookedSession((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                  }
                  endTimeLocked={!isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime) && bookedServiceDrafts.some((service: any) => service.typeId != null)}
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime),
                    onToggle: () => {
                      if (isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime)) {
                        const d = splitLocalDateTimeParts(normalizeToLocalDateTime(selectedBookedSession.startTime)).date || localTodayYmd()
                        const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                        updateSelectedBookedSessionStartTime(normalizeToLocalDateTime(`${d}T${hm}:00`))
                        return
                      }
                      const d = splitLocalDateTimeParts(normalizeToLocalDateTime(selectedBookedSession.startTime)).date || localTodayYmd()
                      setSelectedBookedSession({
                        ...selectedBookedSession,
                        startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                        endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                      })
                    },
                    label: t('formAllDay'),
                    captionId: editBookedAllDayCaptionId,
                  }}
                  onCommitAllDayDate={(ymd) => {
                    setSelectedBookedSession((prev: any) =>
                      prev
                        ? {
                            ...prev,
                            startTime: allDayRangeStartTime(ymd),
                            endTime: allDayRangeEndTime(ymd),
                          }
                        : prev,
                    )
                  }}
                  allDayDateRange={{
                    ...allDayDateRangeLabels,
                    onCommitRange: (startYmd, endYmd) => {
                      setSelectedBookedSession((prev: any) =>
                        prev
                          ? {
                              ...prev,
                              startTime: allDayRangeStartTime(startYmd),
                              endTime: allDayRangeEndTime(endYmd),
                            }
                          : prev,
                      )
                    },
                  }}
                />
              </div>
              </PanelSection>
              <PanelSection
                title={sectionLabels.repeats}
                className="calendar-standardized__section calendar-standardized__repeat"
                icon={<CalendarSectionIcon name="repeat" />}
                collapsible={false}
                action={
                  <label className="repeats-toggle-switch calendar-standardized__toggle" title={sectionLabels.repeats}>
                    <input
                      type="checkbox"
                      checked={!!selectedBookedSession.repeats}
                      aria-label={sectionLabels.repeats}
                      onChange={(e) => {
                        const startDate = selectedBookedSession.startTime ? new Date(selectedBookedSession.startTime) : null
                        const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
                        setSelectedBookedSession({ ...selectedBookedSession, repeats: e.target.checked, repeatDay: sessionDay })
                      }}
                    />
                    <span className="repeats-toggle-slider" />
                  </label>
                }
              >
                {selectedBookedSession.repeats ? renderBookedRepeats(false) : null}
              </PanelSection>
              <PanelSection
                title={sectionLabels.notes}
                className="calendar-standardized__section calendar-standardized__notes"
                icon={<CalendarSectionIcon name="notes" />}
                defaultOpen
                collapsible={false}
                summary={bookedNotesSummary}
              >
              {(selectedBookedSession.meetingLink || (selectedBookedSession.notes || '').includes('Zoom meeting:')) && (
                <div className="form-row form-row-infield calendar-booking-field--meeting-link">
                  <span className="form-field-inline-label">{t('formMeetingLink')}</span>
                  <div className="form-field-inline-control">
                  <a href={selectedBookedSession.meetingLink || (selectedBookedSession.notes || '').match(/Zoom meeting:\s*(https?:\/\/[^\s\n]+)/)?.[1]} target="_blank" rel="noopener noreferrer" className="linkish calendar-booking-meeting-link">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>
                    <span>{(selectedBookedSession.meetingProvider === 'google' || (selectedBookedSession.meetingLink || '').includes('meet.google.com')) ? t('formOpenGoogleMeet') : t('formOpenZoom')}</span>
                  </a>
                  </div>
                </div>
              )}
              <div className="form-row form-row-infield stretch">
                <div className="form-field-inline-control">
                <SessionNotesTextarea
                  value={(selectedBookedSession.meetingLink ? (selectedBookedSession.notes || '').replace(/\n?Zoom meeting:\s*https?:\/\/[^\s\n]+/g, '').trim() : selectedBookedSession.notes) || ''}
                  onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, notes: e.target.value })}
                />
                </div>
              </div>
              </PanelSection>
            </PanelBody>
            )}
            {(bookedEditPanelTab === 'invoice' || bookedEditPanelTab === 'advance') && (
              <CalendarSessionQuickBilling
                mode={bookedEditPanelTab === 'advance' ? 'advance' : 'invoice'}
                locale={locale}
                session={selectedBookedSession}
                clients={paymentManagerSessionClients}
                paymentStatuses={bookedBillingPaymentStatuses}
                metaTypes={metaTypes}
                settings={settings}
                user={user}
                canIssueOpenInvoice={!!canIssueOpenInvoice}
                canIssueAdvanceInvoice={!!canIssueAdvanceInvoice}
                currency={currency}
                fullName={fullName}
                showToast={showToast}
                onOpenFullInvoice={openBookedInvoiceEditor}
                onOpenFullAdvance={openBookedAdvanceForm}
                createOpenBillForPaymentStatus={createOpenBillForPaymentStatus}
                onRefresh={() => loadCalendarRangeOnly(true)}
              />
            )}
            {showBookedSessionFooter && (
              <PanelActionBar
                info={
                  <span className="calendar-standardized__source-tag" aria-label={`${bookingSourceFieldLabel}: ${bookingSourceMeta.label}`}>
                    <span className="calendar-standardized__source-caption">{locale === 'sl' ? 'Vir' : 'Source'}</span>
                    <strong>{bookingSourceMeta.label}</strong>
                  </span>
                }
              >
                    <div className="calendar-booking-status-menu-wrap">
                      <button
                        type="button"
                        className={`cp-action cp-action--labelled calendar-session-status-tag calendar-session-status-tag--${currentBookingStatusTone}`}
                        aria-haspopup="menu"
                        aria-expanded={bookedStatusMenuOpen}
                        title={`${locale === 'sl' ? 'Status' : 'Status'}: ${currentBookingStatusLabel}`}
                        onClick={() => {
                          setBookedPaymentMenuOpen(false)
                          setNoShowClientPickerOpen(false)
                          setBookedStatusMenuOpen((prev) => !prev)
                        }}
                      >
                        <span className="calendar-session-status-tag__icon" aria-hidden="true"><CalendarBookingStatusIcon statusKey={currentBookingStatusKey} /></span>
                        <span className="calendar-session-status-tag__copy">
                          <span className="calendar-session-status-tag__caption">{locale === 'sl' ? 'Status' : 'Status'}</span>
                          <span className="calendar-session-status-tag__label">{currentBookingStatusLabel}</span>
                        </span>
                      </button>
                      {bookedStatusMenuOpen && (
                        <div className="calendar-booking-status-menu" role="menu">
                          {visibleBookingStatusOptions.map((option) => {
                            const selected = option.key === currentBookingStatusKey
                            const actionable = bookingStatusOptionIsActionable(option)
                            return (
                              <button
                                key={option.key}
                                type="button"
                                role="menuitemradio"
                                aria-checked={selected}
                                aria-disabled={!selected && !actionable}
                                className={`calendar-booking-status-menu__item calendar-booking-status-menu__item--${option.tone}${selected ? ' is-selected' : ''}${actionable ? ' is-actionable' : ''}`}
                                onClick={() => selectBookingStatusOption(option)}
                              >
                                <span className="calendar-booking-status-menu__icon" aria-hidden="true">
                                  <CalendarBookingStatusIcon statusKey={option.key} className="calendar-booking-status-menu__icon-svg" />
                                </span>
                                <span className="calendar-booking-status-menu__copy">
                                  <span className="calendar-booking-status-menu__label">{option.label}</span>
                                </span>
                                {selected && <span className="calendar-booking-status-menu__check" aria-hidden="true">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {noShowClientPickerOpen && (
                        <div className="calendar-no-show-client-picker" role="dialog" aria-label={locale === 'sl' ? 'Izberi stranke NO SHOW' : 'Select no-show clients'}>
                          <div className="calendar-no-show-client-picker__header">
                            <strong>{locale === 'sl' ? 'Kdo ni prišel?' : 'Who did not show?'}</strong>
                            <span>{locale === 'sl' ? 'Izbrane stranke bodo označene kot NO SHOW, za njih pa se pripravi odprti račun.' : 'Selected clients will be marked as NO SHOW and their open invoice tab will be prepared.'}</span>
                          </div>
                          <div className="calendar-no-show-client-picker__quick-actions">
                            <button
                              type="button"
                              onClick={() => setNoShowSelectedClientIds(noShowSelectableClientOptions.map((client: any) => Number(client.id)))}
                            >
                              {locale === 'sl' ? 'Izberi vse' : 'Select all'}
                            </button>
                            <button type="button" onClick={() => setNoShowSelectedClientIds([])}>
                              {locale === 'sl' ? 'Počisti' : 'Clear'}
                            </button>
                          </div>
                          <div className="calendar-no-show-client-picker__list">
                            {noShowClientOptions.map((client: any) => {
                              const clientId = Number(client.id)
                              const closed = noShowClientBillClosed(clientId)
                              const selected = !closed && noShowSelectedClientIds.includes(clientId)
                              const label = fullName(client) || client.email || `#${clientId}`
                              return (
                                <button
                                  key={clientId}
                                  type="button"
                                  className={`calendar-no-show-client-picker__client${selected ? ' is-selected' : ''}${closed ? ' is-disabled' : ''}`}
                                  onClick={() => toggleNoShowClient(clientId)}
                                  aria-pressed={selected}
                                  aria-disabled={closed}
                                  disabled={closed || noShowSubmitting}
                                >
                                  <span className="calendar-no-show-client-picker__avatar">{typeof personInitials === 'function' ? personInitials(client) : String(label || '?').trim().slice(0, 2).toUpperCase()}</span>
                                  <span className="calendar-no-show-client-picker__name">
                                    <span>{label}</span>
                                    {closed && <small>{locale === 'sl' ? 'Račun je že zaključen.' : 'Bill is already closed.'}</small>}
                                  </span>
                                  <span className="calendar-no-show-client-picker__checkbox" aria-hidden="true">{selected ? '✓' : ''}</span>
                                </button>
                              )
                            })}
                          </div>
                          <div className="calendar-no-show-client-picker__footer">
                            <button
                              type="button"
                              className="calendar-no-show-client-picker__secondary"
                              onClick={() => setNoShowClientPickerOpen(false)}
                              disabled={noShowSubmitting}
                            >
                              {locale === 'sl' ? 'Prekliči' : 'Cancel'}
                            </button>
                            <button
                              type="button"
                              className="calendar-no-show-client-picker__primary"
                              onClick={() => void submitNoShowClients()}
                              disabled={noShowSubmitting || noShowSelectedClientIds.filter((clientId) => noShowSelectableClientOptions.some((client: any) => Number(client.id) === clientId)).length === 0}
                            >
                              {noShowSubmitting
                                ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…')
                                : (locale === 'sl' ? 'Potrdi NO SHOW' : 'Confirm NO SHOW')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`calendar-booking-rail-notes-tab${bookedEditPanelTab === 'notes' ? ' is-active' : ''}`}
                      aria-current={bookedEditPanelTab === 'notes' ? 'page' : undefined}
                      onClick={() => {
                        setBookedStatusMenuOpen(false)
                        setNoShowClientPickerOpen(false)
                        setBookedEditPanelTab('notes')
                      }}
                    >
                      <CalendarSectionIcon name="notes" />
                      <span>{sectionLabels.notes}</span>
                    </button>
              </PanelActionBar>
            )}
            {showBookedSessionFooter && (bookedEditPanelTab === 'basic' || bookedEditPanelTab === 'notes') && (
              <PanelFooter>
                <PanelButton
                  variant="danger"
                  icon={<CalendarFormFooterDeleteIcon />}
                  onClick={() => void requestBookedSessionDelete()}
                >
                  {t('formDeleteSession')}
                </PanelButton>
                <PanelButton
                  variant="primary"
                  icon={<CalendarFormFooterSaveIcon />}
                  onClick={() => void updateBookedSession()}
                  disabled={bookedSessionSaveDisabled}
                >
                  {t('formSave')}
                </PanelButton>
              </PanelFooter>
            )}
        </SidePanel>
      )}

      <ConfirmDialog
        open={Boolean(selectedBookedSession && confirmDelete && !showRecurringDeleteDialog)}
        onClose={() => setConfirmDelete(false)}
        tone="danger"
        icon={<CalendarFormFooterDeleteIcon />}
        title={t('formDeleteSessionQuestion')}
        text={bookedPanelSubtitle || undefined}
        confirmLabel={t('formYesDelete')}
        cancelLabel={t('formCancel')}
        onConfirm={() => void prepareReleasedSlotAction('DELETE', 'SINGLE')}
      />

      {compactSessionEditHeader && selectedBookedSession && bookedStatusMenuOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="calendar-mobile-status-editor-backdrop"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) setBookedStatusMenuOpen(false)
          }}
        >
          <section
            className="calendar-mobile-status-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-mobile-status-editor-title"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="calendar-mobile-status-editor__header">
              <button
                type="button"
                className="calendar-mobile-status-editor__close"
                onClick={() => setBookedStatusMenuOpen(false)}
                aria-label={t('mobileNavClose')}
              >
                ×
              </button>
              <h2 id="calendar-mobile-status-editor-title">
                {locale === 'sl' ? 'Spremeni status' : locale === 'sr' ? 'Promeni status' : 'Change status'}
              </h2>
              <span className="calendar-mobile-status-editor__header-spacer" aria-hidden />
            </header>

            <div className="calendar-mobile-status-editor__body">
              <section className="calendar-mobile-status-editor__section">
                <h3>{locale === 'sl' ? 'Trenutni status' : locale === 'sr' ? 'Trenutni status' : 'Current status'}</h3>
                <div className="calendar-mobile-status-editor__current">
                  <span className={`calendar-mobile-status-editor__dot calendar-mobile-status-editor__dot--${currentBookingStatusTone}`} aria-hidden />
                  <span>{currentBookingStatusLabel}</span>
                </div>
              </section>

              <section className="calendar-mobile-status-editor__section">
                <h3>{locale === 'sl' ? 'Izberi novi status' : locale === 'sr' ? 'Izaberi novi status' : 'Choose a new status'}</h3>
                <div className="calendar-mobile-status-editor__options" role="radiogroup">
                  {visibleBookingStatusOptions.map((option) => {
                    const selected = mobileBookingStatusDraft === option.key
                    const canSelect = option.key === currentBookingStatusKey || bookingStatusOptionIsActionable(option)
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-disabled={!canSelect}
                        disabled={!canSelect}
                        className={`calendar-mobile-status-editor__option calendar-mobile-status-editor__option--${option.tone}${selected ? ' is-selected' : ''}`}
                        onClick={() => setMobileBookingStatusDraft(option.key)}
                      >
                        <span className={`calendar-mobile-status-editor__dot calendar-mobile-status-editor__dot--${option.tone}`} aria-hidden />
                        <span className="calendar-mobile-status-editor__option-copy">
                          <strong>{option.label}</strong>
                          <small>{bookingStatusDescription(option.key)}</small>
                        </span>
                        <span className="calendar-mobile-status-editor__radio" aria-hidden>{selected ? '✓' : ''}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <div className="calendar-mobile-status-editor__info">
                <span aria-hidden>i</span>
                <p>{locale === 'sl'
                  ? 'Sprememba statusa se bo shranila pri tem terminu.'
                  : locale === 'sr'
                    ? 'Promena statusa će biti sačuvana uz ovaj termin.'
                    : 'The status change will be saved on this appointment.'}</p>
              </div>
            </div>

            {mobileBookingStatusCanSave && (
              <footer className="calendar-mobile-status-editor__footer">
                <button
                  type="button"
                  className="calendar-mobile-status-editor__save"
                  onClick={saveMobileBookingStatus}
                >
                  {locale === 'sl' ? 'Shrani status' : locale === 'sr' ? 'Sačuvaj status' : 'Save status'}
                </button>
              </footer>
            )}
          </section>
        </div>,
        document.body,
      )}

      {newSlotWaitlistOpen && visibleNewSlotWaitlistMatches?.count > 0 && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-backdrop calendar-waitlist-picker-backdrop"
          onClick={(event) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) closeNewSlotWaitlist(event)
          }}
        >
          <div
            className="modal calendar-waitlist-picker-modal"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="calendar-waitlist-picker-header">
              <button
                type="button"
                className="calendar-waitlist-picker-close"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => closeNewSlotWaitlist(event)}
                aria-label={t('mobileNavClose')}
              >×</button>
              <h2>{locale === 'sl' ? 'Čakalna vrsta' : locale === 'sr' ? 'Lista čekanja' : 'Waitlist'}</h2>
            </div>
            <p className="calendar-waitlist-picker-count">{waitlistMatchCountLabel(visibleNewSlotWaitlistMatches.count)}</p>
            <div className="calendar-waitlist-picker-list">
              {(visibleNewSlotWaitlistMatches.matches || [visibleNewSlotWaitlistMatches.first]).filter(Boolean).map((candidate: any, index: number) => (
                <div key={candidate.requestId || index} className="calendar-waitlist-picker-row">
                  <span className="calendar-waitlist-picker-avatar">{String(candidate.clientName || '?').trim().split(/\s+/).slice(0,2).map((part: string) => part[0]).join('').toUpperCase()}</span>
                  <div className="calendar-waitlist-picker-copy">
                    <strong>{candidate.clientName}</strong>
                    <span>{formatWaitlistJoinedAt(candidate.joinedAt) ? `${locale === 'sl' ? 'Prijavljen' : locale === 'sr' ? 'Prijavljen' : 'Joined'} ${formatWaitlistJoinedAt(candidate.joinedAt)}` : ''}</span>
                  </div>
                  <button type="button" className="calendar-waitlist-picker-add" onClick={() => void pullFirstWaitlistedGuestIntoBooking(candidate)}>
                    {locale === 'sl' ? 'Dodaj' : locale === 'sr' ? 'Dodaj' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {bookedBillingView === 'advances' && renderSessionBillingViewModal('advances')}
      {bookedBillingView === 'invoices' && renderSessionBillingViewModal('invoices')}
      {renderBookedEntitlementPaymentModal()}

      {bookedPaymentMenuOpen && (selectedBookedSession || paymentManagerIsNewBooking) && (
        <div className="calendar-payment-manager-backdrop" onClick={() => setBookedPaymentMenuOpen(false)}>
          <div className="calendar-payment-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-payment-manager-header">
              <div className="calendar-payment-manager-title-row">
                <div>
                  <h2>{locale === 'sl' ? 'Klient & plačnik' : 'Client & payee'}</h2>
                  <p>{locale === 'sl' ? 'Upravljanje podatkov in plačnika za stranko/skupino.' : 'Manage client/group data and payer settings.'}</p>
                </div>
              </div>
              <button type="button" className="calendar-payment-manager-close" onClick={() => setBookedPaymentMenuOpen(false)} aria-label={t('mobileNavClose')}>×</button>
            </div>

            <div className="calendar-payment-manager-body">
              <section className={`calendar-payment-manager-overview calendar-payment-manager-overview--full${paymentManagerSessionClients.length > 1 ? ' calendar-payment-manager-overview--with-switch' : ''}`}>
                {bookedSessionIsGroup ? (
                  <div className="calendar-payment-manager-overview-people calendar-payment-manager-overview-group">
                    <span className="calendar-payment-manager-overview-icon" aria-hidden>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5M11.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div>
                      <strong>{locale === 'sl' ? 'Ime skupine' : 'Group name'}</strong>
                      <input
                        className="calendar-payment-manager-overview-group-input"
                        value={bookedPaymentGroupNameDraft || ''}
                        onChange={(e) => setBookedPaymentGroupNameDraft(e.target.value)}
                        placeholder={locale === 'sl' ? 'Ime skupine' : 'Group name'}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="calendar-payment-manager-overview-people">
                    <span className="calendar-payment-manager-overview-icon" aria-hidden>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5M11.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div>
                      <strong>{locale === 'sl' ? 'Skupaj klientov' : 'Total clients'}</strong>
                      <span>
                        {locale === 'sl'
                          ? `${paymentManagerSessionClients.length} ${paymentManagerSessionClients.length === 1 ? 'klient v terminu' : 'klienti v terminu'}`
                          : `${paymentManagerSessionClients.length} ${paymentManagerSessionClients.length === 1 ? 'client in session' : 'clients in session'}`}
                      </span>
                    </div>
                  </div>
                )}
                <div className="calendar-payment-manager-metrics">
                  <div><span>{locale === 'sl' ? 'Skupaj znesek' : 'Total amount'}</span><strong>{currency(bookedPaymentTotals.total)}</strong></div>
                  <div><span>{locale === 'sl' ? 'Plačano' : 'Paid'}</span><strong className="is-paid">{currency(bookedPaymentTotals.paid)}</strong></div>
                  <div><span>{locale === 'sl' ? 'V teku' : 'Pending'}</span><strong className="is-pending">{currency(bookedPaymentTotals.pending)}</strong></div>
                  <div><span>{locale === 'sl' ? 'Neplačano' : 'Unpaid'}</span><strong className="is-unpaid">{currency(bookedPaymentTotals.unpaid)}</strong></div>
                </div>
                {paymentManagerSessionClients.length > 1 && (
                <button
                  type="button"
                  className="calendar-payment-manager-same-company"
                  onClick={toggleBookedPaymentSameCompanyForAll}
                  aria-pressed={bookedPaymentPayeesUseSameCompanyForAll}
                >
                  <span>{locale === 'sl' ? 'Uporabi isto podjetje za vse' : 'Use same company for all'}</span>
                  <span className="calendar-payment-manager-info-dot" aria-hidden>i</span>
                  <span className={`modern-switch ${bookedPaymentPayeesUseSameCompanyForAll ? 'on' : ''}`} aria-hidden><span /></span>
                </button>
                )}
                {paymentManagerSessionClients.length > 1 && bookedPaymentPayeesUseSameCompanyForAll && isGroupedSingleInvoiceMode && (() => {
                      const status = groupedSingleInvoiceStatus
                      if (!status) return null
                      const meta = bookedPaymentMeta(status?.status)
                      const invoiceAllocation = invoiceAllocationForPaymentStatus(status)
                      const advanceAllocation = (status?.allocations ?? []).find((allocation: any) => allocation.source === 'ADVANCE')
                      const entitlementAllocation = (status?.allocations ?? []).find((allocation: any) => allocation.source === 'ENTITLEMENT')
                      const hasUnbilledParticipant = paymentManagerSessionClients
                        .map((client: any) => paymentStatusForClient(client?.id))
                        .some((item: any) => !!item?.bookingId && !item.openBillId && item.status !== 'PAID')
                      const canCreateOpenBill = canShowOpenBillForBookedStatus
                        && (status?.status === 'UNPAID' || status?.status === 'PARTIALLY_PAID')
                        && hasUnbilledParticipant
                        && !invoiceAllocation
                      const canCreateAdvanceBill = advanceBillingEnabled && isReservedBookingStatus && !advanceAllocation && !invoiceAllocation && status?.status !== 'PAID'
                      const canUseInvoiceActions = !!invoiceAllocation?.billId && (status?.status === 'PARTIALLY_PAID' || status?.status === 'PAYMENT_PENDING' || status?.status === 'PAID')
                      const invoiceLabel = invoiceAllocation
                        ? (invoiceAllocation.billNumber || `#${invoiceAllocation.billId}`)
                        : advanceAllocation
                          ? (advanceAllocation.billNumber || (locale === 'sl' ? 'Predplačilo ustvarjeno' : 'Advance created'))
                          : entitlementAllocation
                            ? (entitlementAllocation.entitlementCode || entitlementAllocation.productName || (locale === 'sl' ? 'Dobroimetje' : 'Entitlement'))
                            : status?.openBillId
                            ? (locale === 'sl' ? 'Odprti račun ustvarjen' : 'Open bill created')
                            : (locale === 'sl' ? 'Račun še ni ustvarjen' : 'Invoice not created yet')
                      const invoiceSub = invoiceAllocation?.paidAt
                        ? formatPaymentDateOnly(invoiceAllocation.paidAt)
                        : advanceAllocation?.paidAt
                          ? formatPaymentDateOnly(advanceAllocation.paidAt)
                          : entitlementAllocation?.usedAt
                            ? formatPaymentDateOnly(entitlementAllocation.usedAt)
                            : ''
                      const sharedInvoiceTitle = paymentManagerSharedCompanyName || (locale === 'sl' ? 'Ni povezanega podjetja' : 'No linked company')
                      const sharedInvoiceClientLabel = paymentManagerSessionClients.length === 1
                        ? (locale === 'sl' ? 'klienta' : 'client')
                        : (locale === 'sl' ? 'klientov' : 'clients')
                      const sharedInvoiceSubtitle = locale === 'sl'
                        ? `Skupni račun za ${paymentManagerSessionClients.length} ${sharedInvoiceClientLabel}`
                        : `Shared invoice for ${paymentManagerSessionClients.length} ${sharedInvoiceClientLabel}`
                      const sharedOpenBillId = Number(status?.openBillId ?? 0)
                      const sharedRowInteractive = canShowOpenBillForBookedStatus && Number.isInteger(sharedOpenBillId) && sharedOpenBillId > 0
                      const openSharedOpenBillEditor = () => {
                        if (sharedRowInteractive) openPaymentOpenBillEditor(status, sharedOpenBillId)
                      }
                      return (
                        <div className="calendar-payment-manager-shared-invoice">
                          <div className="calendar-payment-manager-table calendar-payment-manager-table--single calendar-payment-manager-shared-invoice-table">
                            <div className="calendar-payment-manager-table-head">
                              <span>{locale === 'sl' ? 'Račun' : 'Invoice'}</span>
                              <span>{locale === 'sl' ? 'Plačilni status' : 'Payment status'}</span>
                              <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                              <span>{locale === 'sl' ? 'Št. računa' : 'Invoice no.'}</span>
                              <span>{locale === 'sl' ? 'Akcije' : 'Actions'}</span>
                            </div>
                            <div
                              className={`calendar-payment-manager-table-row is-selected${sharedRowInteractive ? ' is-clickable' : ''}`}
                              role={sharedRowInteractive ? 'button' : undefined}
                              tabIndex={sharedRowInteractive ? 0 : undefined}
                              onClick={sharedRowInteractive ? openSharedOpenBillEditor : undefined}
                              onKeyDown={sharedRowInteractive ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  openSharedOpenBillEditor()
                                }
                              } : undefined}
                            >
                              <div className="calendar-payment-manager-participant-cell">
                                <span>
                                  <strong>{sharedInvoiceTitle}</strong>
                                  <small>{sharedInvoiceSubtitle}</small>
                                </span>
                              </div>
                              <div><span className={`calendar-payment-inline-badge calendar-payment-inline-badge--${meta.tone}`}>{meta.label}</span></div>
                              <div><strong>{currency(status?.sessionTotalGross ?? bookedPaymentTotals.total ?? 0)}</strong></div>
                              <div className="calendar-payment-manager-invoice-cell">
                                <span>{invoiceLabel}</span>
                                {invoiceSub && <small>{invoiceSub}</small>}
                              </div>
                              <div className="calendar-payment-manager-row-actions" onClick={(e) => e.stopPropagation()}>
                                {canCreateAdvanceBill && (
                                  <button
                                    type="button"
                                    className="calendar-payment-manager-row-action calendar-payment-manager-row-action--advance"
                                    onClick={() => openBookedAdvanceForm(status, groupedSingleInvoiceClient)}
                                    title={locale === 'sl' ? 'Ustvari predplačilo' : 'Create advance'}
                                  >
                                    <CalendarAdvancePaymentIcon />
                                    {locale === 'sl' ? 'PREDPLAČILO' : 'ADVANCE'}
                                  </button>
                                )}
                                {canCreateOpenBill && (
                                  <button
                                    type="button"
                                    className="calendar-payment-manager-row-action calendar-payment-manager-row-action--primary"
                                    onClick={async () => {
                                      const openBillId = await createOpenBillForPaymentStatus(status)
                                      if (openBillId) openPaymentOpenBillEditor(status, openBillId)
                                    }}
                                    title={locale === 'sl' ? 'Ustvari skupni odprti račun' : 'Create shared open bill'}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                      <path d="M14 3v5h5M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {locale === 'sl' ? 'ODPRTI RAČUN' : 'OPEN BILL'}
                                  </button>
                                )}
                                {canUseInvoiceActions && (
                                  <>
                                    <button
                                      type="button"
                                      className="calendar-payment-manager-row-action calendar-payment-manager-row-action--resend"
                                      title={locale === 'sl' ? 'Ponovno pošlji račun po e-pošti' : 'Resend invoice email'}
                                      onClick={() => void resendPaymentInvoicePdf(status)}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M4 6.5h16v11H4v-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="m5 7 7 6 7-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      RESEND
                                    </button>
                                    <button
                                      type="button"
                                      className="calendar-payment-manager-row-action calendar-payment-manager-row-action--pdf"
                                      title={locale === 'sl' ? 'Odpri PDF račun' : 'Open invoice PDF'}
                                      onClick={() => void openPaymentInvoicePdf(status)}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="M14 3v5h5M8.5 16.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      PDF
                                    </button>
                                  </>
                                )}
                                {!canCreateAdvanceBill && !canCreateOpenBill && !canUseInvoiceActions && <span className="calendar-payment-manager-no-action">—</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
              </section>

              <div className="calendar-payment-manager-content">
                <aside className="calendar-payment-manager-sidebar">
                <div className="calendar-payment-manager-sidebar-head">
                  <h3>{bookedSessionIsGroup ? (locale === 'sl' ? 'Člani skupine' : 'Group members') : (locale === 'sl' ? 'Seznam klientov' : 'Client list')}</h3>
                  {bookedSessionIsGroup && (
                    <span className="calendar-payment-manager-sidebar-count">
                      {locale === 'sl'
                        ? `${paymentManagerSessionClients.length} ${paymentManagerSessionClients.length === 1 ? 'član' : 'članov'}`
                        : `${paymentManagerSessionClients.length} ${paymentManagerSessionClients.length === 1 ? 'member' : 'members'}`}
                    </span>
                  )}
                </div>
                <div className="calendar-payment-manager-client-list">
                  {paymentManagerSessionClients.map((client: any, idx: number) => {
                    const status = paymentStatusForClient(client?.id)
                    const statusMeta = bookedPaymentSidebarStatusMeta(status?.status)
                    const active = Number(selectedBookedPaymentClient?.id ?? paymentManagerSessionClients[0]?.id) === Number(client?.id)
                    const clientDisplay = bookedPaymentClientDisplay(client)
                    return (
                      <button
                        type="button"
                        key={client?.id ?? idx}
                        className={`calendar-payment-manager-client${active ? ' is-selected' : ''}`}
                        onClick={() => setSelectedBookedPaymentClientId(client?.id ?? null)}
                      >
                        <span
                          className={`calendar-payment-manager-client-status calendar-payment-manager-client-status--${statusMeta.tone}`}
                          aria-label={statusMeta.label}
                          title={statusMeta.label}
                        >
                          <span aria-hidden>{statusMeta.symbol}</span>
                        </span>
                        <span className="calendar-payment-manager-client-name">
                          <strong>{clientDisplay.displayName}</strong>
                          <small>{bookedSessionIsGroup ? (locale === 'sl' ? 'Član skupine' : 'Group member') : clientDisplay.typeLabel}</small>
                        </span>
                        <span className="calendar-payment-manager-chevron">›</span>
                      </button>
                    )
                  })}
                  {bookedSessionIsGroup && (
                    <button
                      type="button"
                      className={`calendar-payment-manager-add-client${paymentManagerAddClientSelectionActive ? ' is-selected' : ''}`}
                      onClick={() => openBookedPaymentAddClient()}
                    >
                      <span className="calendar-payment-manager-add-client-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M8 3.2v9.6" />
                          <path d="M3.2 8h9.6" />
                        </svg>
                      </span>
                      <span className="calendar-payment-manager-add-client-copy">
                        <strong>{locale === 'sl' ? 'Dodaj klienta' : 'Add client'}</strong>
                      </span>
                      <span className="calendar-payment-manager-chevron">›</span>
                    </button>
                  )}
                </div>
              </aside>

              <main className="calendar-payment-manager-main calendar-payment-manager-main--client-workspace">
                {!isGroupedSingleInvoiceMode && (
                <div className="calendar-payment-manager-tabs calendar-payment-manager-tabs--client" role="tablist" aria-label={locale === 'sl' ? 'Podatki in račun' : 'Details and invoice'}>
                  <button type="button" className={`calendar-payment-manager-tab${bookedPaymentManagerTab === 'details' ? ' is-active' : ''}`} onClick={() => setBookedPaymentManagerTab('details')}>
                    {locale === 'sl' ? 'Podatki' : 'Details'}
                  </button>
                  <button
                    type="button"
                    className={`calendar-payment-manager-tab${bookedPaymentManagerTab === 'invoice' ? ' is-active' : ''}${paymentManagerAddClientSelectionActive ? ' is-disabled' : ''}`}
                    onClick={() => {
                      if (paymentManagerAddClientSelectionActive) return
                      setBookedPaymentManagerTab('invoice')
                    }}
                    aria-disabled={paymentManagerAddClientSelectionActive}
                  >
                    {locale === 'sl' ? 'Račun' : 'Invoice'}
                  </button>
                </div>
                )}

                {(bookedPaymentManagerTab === 'details' || isGroupedSingleInvoiceMode) ? (
                  paymentManagerAddClientSelectionActive ? (
                    <div className="calendar-payment-manager-details-pane">
                      <section className="calendar-payment-manager-card calendar-payment-manager-add-client-card">
                        <div className="calendar-payment-manager-add-client-card-head">
                          <div className="calendar-payment-manager-add-client-modes" role="tablist" aria-label={locale === 'sl' ? 'Način dodajanja klienta' : 'Client add mode'}>
                            <button
                              type="button"
                              className={bookedPaymentAddMode === 'group-member' ? 'is-active' : ''}
                              onClick={() => setBookedPaymentAddMode('group-member')}
                            >
                              <span className="calendar-payment-manager-add-client-mode-icon" aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                              </span>
                              <span>{locale === 'sl' ? 'Obstoječi v skupini' : 'Existing in group'}</span>
                            </button>
                            <button
                              type="button"
                              className={bookedPaymentAddMode === 'session-only' ? 'is-active' : ''}
                              onClick={() => setBookedPaymentAddMode('session-only')}
                            >
                              <span className="calendar-payment-manager-add-client-mode-icon" aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                  <path d="M8 3.2v9.6" />
                                  <path d="M3.2 8h9.6" />
                                </svg>
                              </span>
                              <span>{locale === 'sl' ? 'Samo za ta termin' : 'Only for this session'}</span>
                            </button>
                          </div>
                        </div>
                        <div className="calendar-payment-manager-add-client-picker">
                          <label className="calendar-payment-manager-add-client-search">
                            <span>{bookedPaymentAddClientSearchLabel}</span>
                            <div className="calendar-payment-manager-add-client-search-input">
                              <span className="calendar-payment-manager-add-client-search-icon" aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="11" cy="11" r="8" />
                                  <path d="m21 21-4.35-4.35" />
                                </svg>
                              </span>
                              <input
                                type="text"
                                autoComplete="off"
                                value={bookedPaymentAddSearch}
                                onChange={(e) => setBookedPaymentAddSearch(e.target.value)}
                                placeholder={bookedPaymentAddClientSearchPlaceholder}
                              />
                            </div>
                          </label>
                          <div className="calendar-payment-manager-add-client-results" role="list">
                            {bookedPaymentAddCandidates.length === 0 ? (
                              <div className="calendar-payment-manager-add-client-empty">{bookedPaymentAddClientEmptyLabel}</div>
                            ) : (
                              bookedPaymentAddCandidates.map((client: any) => {
                                const label = fullName(client)
                                return (
                                  <button
                                    key={client.id}
                                    type="button"
                                    className="calendar-payment-manager-add-client-row"
                                    role="listitem"
                                    onClick={() => addBookedPaymentClientToSession(client.id)}
                                  >
                                    <span className="calendar-payment-manager-add-client-row-main">
                                      <strong>{label}</strong>
                                      <small>{client.email || client.phone || (locale === 'sl' ? 'Klient' : 'Client')}</small>
                                    </span>
                                    <span className="calendar-payment-manager-chevron">›</span>
                                  </button>
                                )
                              })
                            )}
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : (
                  <div className="calendar-payment-manager-details-pane">
                    <section className="calendar-payment-manager-card calendar-payment-manager-client-details-card">
                      <div className="calendar-payment-manager-card-header-row">
                        <h3>{locale === 'sl' ? 'Osnovni podatki' : 'Basic details'}</h3>
                        {bookedSessionIsGroup && selectedBookedPaymentClient?.id && (
                          <button
                            type="button"
                            className="calendar-payment-manager-remove-member-button"
                            onClick={() => {
                              if (selectedBookedPaymentClientIsGroupMember) {
                                void removeBookedPaymentClientFromGroup(selectedBookedPaymentClient.id)
                              } else {
                                removeBookedPaymentClientFromSession(selectedBookedPaymentClient.id)
                              }
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            <span>{bookedPaymentDetailsRemoveLabel}</span>
                          </button>
                        )}
                      </div>
                      <div className="calendar-payment-manager-client-form-grid">
                        <label>
                          <span>{locale === 'sl' ? 'Ime' : 'First name'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.firstName || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ firstName: e.target.value })}
                            autoComplete="given-name"
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Priimek' : 'Last name'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.lastName || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ lastName: e.target.value })}
                            autoComplete="family-name"
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'E-pošta' : 'Email'}</span>
                          <input
                            type="email"
                            value={selectedBookedPaymentClientDraft?.email || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ email: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Telefonska številka' : 'Phone'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.phone || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ phone: e.target.value })}
                          />
                        </label>
                        <label className="calendar-payment-manager-field-wide">
                          <span>{locale === 'sl' ? 'Naslov' : 'Address'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.address || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ address: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Poštna številka' : 'Post code'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.postalCode || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ postalCode: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Kraj' : 'City'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.city || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ city: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>{locale === 'sl' ? 'Država' : 'Country'}</span>
                          <input
                            value={selectedBookedPaymentClientDraft?.country || ''}
                            onChange={(e) => updateSelectedBookedPaymentClientDraft({ country: e.target.value })}
                          />
                        </label>
                      </div>
                    </section>
                  </div>
                  )
                ) : (
                  <div className="calendar-payment-manager-invoice-pane">
                    <section className="calendar-payment-manager-card calendar-payment-manager-table-card">
                      <div className="calendar-payment-manager-section-heading">
                        <div>
                          <h3>{locale === 'sl' ? 'Plačila po udeležencih' : 'Payments by participant'}</h3>
                          <p>{locale === 'sl' ? 'Upravljajte plačilni status in račune.' : 'Manage payment status and invoices.'}</p>
                        </div>
                      </div>
                      <div className="calendar-payment-manager-table">
                        <div className="calendar-payment-manager-table-head">
                          <span>{locale === 'sl' ? 'Udeleženec' : 'Participant'}</span>
                          <span>{locale === 'sl' ? 'Plačilni status' : 'Payment status'}</span>
                          <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                          <span>{locale === 'sl' ? 'Št. računa' : 'Invoice no.'}</span>
                          <span>{locale === 'sl' ? 'Akcije' : 'Actions'}</span>
                        </div>
                        {(() => {
                          const invoiceClientRows = selectedBookedPaymentClient
                            ? [selectedBookedPaymentClient]
                            : (paymentManagerSessionClients.length ? [paymentManagerSessionClients[0]] : [])
                          const groupedClient = groupedSingleInvoiceClient
                            || invoiceClientRows[0]
                            || paymentManagerSessionClients[0]
                            || null
                          const rows = isGroupedSingleInvoiceMode
                            ? [{ key: 'grouped-single-invoice', client: groupedClient, status: groupedSingleInvoiceStatus, payeeDraft: groupedSingleInvoicePayeeDraft }]
                            : invoiceClientRows.map((client: any, idx: number) => ({
                                key: client?.id ?? idx,
                                client,
                                status: paymentStatusForClient(client?.id),
                                payeeDraft: Array.isArray(bookedPaymentPayeeDrafts)
                                  ? bookedPaymentPayeeDrafts.find((draft: any) => Number(draft?.clientId) === Number(client?.id))
                                  : null,
                              }))
                          return rows.map((row: any) => {
                          const client = row.client
                          if (!client) return null
                          const status = row.status
                          const meta = bookedPaymentMeta(status?.status)
                          const payeeDraft = row.payeeDraft
                            ?? (Array.isArray(bookedPaymentPayeeDrafts)
                              ? bookedPaymentPayeeDrafts.find((draft: any) => Number(draft?.clientId) === Number(client?.id))
                              : null)
                          const payeeDisplay = bookedPaymentPayeeDisplay(client, payeeDraft)
                          const invoiceAllocation = invoiceAllocationForPaymentStatus(status)
                          const advanceAllocation = (status?.allocations ?? []).find((allocation: any) => allocation.source === 'ADVANCE')
                          const entitlementAllocation = (status?.allocations ?? []).find((allocation: any) => allocation.source === 'ENTITLEMENT')
                          const canCreateOpenBill = canShowOpenBillForBookedStatus && status?.status === 'UNPAID' && !status?.openBillId
                          const canCreateAdvanceBill = advanceBillingEnabled && isReservedBookingStatus && !advanceAllocation && !invoiceAllocation && !entitlementAllocation && status?.status !== 'PAID'
                          const canUseInvoiceActions = !!invoiceAllocation?.billId && (status?.status === 'PARTIALLY_PAID' || status?.status === 'PAYMENT_PENDING' || status?.status === 'PAID')
                          const canScanEntitlementPayment = !isReservedBookingStatus && !isGroupedSingleInvoiceMode && !!status?.bookingId && !invoiceAllocation && !entitlementAllocation && !status?.openBillId && status?.status !== 'PAID'
                          const invoiceLabel = invoiceAllocation
                            ? (invoiceAllocation.billNumber || `#${invoiceAllocation.billId}`)
                            : advanceAllocation
                              ? (advanceAllocation.billNumber || (locale === 'sl' ? 'Predplačilo ustvarjeno' : 'Advance created'))
                              : entitlementAllocation
                                ? (entitlementAllocation.entitlementCode || entitlementAllocation.productName || (locale === 'sl' ? 'Dobroimetje' : 'Entitlement'))
                                : status?.openBillId
                                ? (locale === 'sl' ? 'Odprti račun ustvarjen' : 'Open bill created')
                                : (locale === 'sl' ? 'Račun še ni ustvarjen' : 'Invoice not created yet')
                          const invoiceSub = invoiceAllocation?.paidAt
                            ? formatPaymentDateOnly(invoiceAllocation.paidAt)
                            : advanceAllocation?.paidAt
                              ? formatPaymentDateOnly(advanceAllocation.paidAt)
                              : entitlementAllocation?.usedAt
                                ? formatPaymentDateOnly(entitlementAllocation.usedAt)
                                : ''
                          const active = isGroupedSingleInvoiceMode ? true : Number(selectedBookedPaymentClient?.id) === Number(client?.id)
                          const rowOpenBillId = Number(status?.openBillId ?? 0)
                          const rowHasOpenBill = Number.isInteger(rowOpenBillId) && rowOpenBillId > 0
                          const rowInteractive = canShowOpenBillForBookedStatus && (!isGroupedSingleInvoiceMode || rowHasOpenBill)
                          const handlePaymentRowOpen = () => {
                            const shouldSyncPerClientBillTabs = !isGroupedSingleInvoiceMode
                              && selectedBookedSession?.type?.priceCalculationMode !== 'TOTAL'
                              && paymentManagerSessionClients.length > 1
                            if (rowHasOpenBill) {
                              if (shouldSyncPerClientBillTabs) {
                                void createOpenBillForPaymentStatus(status).then((openBillId) => {
                                  openPaymentOpenBillEditor(status, openBillId || rowOpenBillId)
                                })
                                return
                              }
                              if (openPaymentOpenBillEditor(status, rowOpenBillId)) return
                            }
                            if (!isGroupedSingleInvoiceMode) setSelectedBookedPaymentClientId(client?.id ?? null)
                          }
                          return (
                            <div
                              key={row.key}
                              className={`calendar-payment-manager-table-row${active ? ' is-selected' : ''}${rowHasOpenBill ? ' is-clickable' : ''}`}
                              role={rowInteractive ? 'button' : undefined}
                              tabIndex={rowInteractive ? 0 : undefined}
                              onClick={rowInteractive ? handlePaymentRowOpen : undefined}
                              onKeyDown={rowInteractive ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  handlePaymentRowOpen()
                                }
                              } : undefined}
                            >
                              <div className="calendar-payment-manager-participant-cell">
                                <span>
                                  <strong>{payeeDisplay.displayName}</strong>
                                  <small>{payeeDisplay.typeLabel}</small>
                                </span>
                              </div>
                              <div><span className={`calendar-payment-inline-badge calendar-payment-inline-badge--${meta.tone}`}>{meta.label}</span></div>
                              <div><strong>{currency(status?.sessionTotalGross ?? 0)}</strong></div>
                              <div className="calendar-payment-manager-invoice-cell">
                                <span>{invoiceLabel}</span>
                                {invoiceSub && <small>{invoiceSub}</small>}
                              </div>
                              <div className="calendar-payment-manager-row-actions" onClick={(e) => e.stopPropagation()}>
                                {canScanEntitlementPayment && (
                                  <button
                                    type="button"
                                    className="calendar-payment-manager-row-action calendar-payment-manager-row-action--scan"
                                    onClick={() => void openBookedPaymentEntitlementScanner(status, client)}
                                    title={locale === 'sl' ? 'Skeniraj vstopnico ali paket za plačilo' : 'Scan ticket or pack to pay'}
                                  >
                                    <CalendarScannerIcon />
                                    SCAN
                                  </button>
                                )}
                                {canCreateAdvanceBill && (
                                  <button
                                    type="button"
                                    className="calendar-payment-manager-row-action calendar-payment-manager-row-action--advance"
                                    onClick={() => openBookedAdvanceForm(status, client)}
                                    title={locale === 'sl' ? 'Ustvari predplačilo' : 'Create advance'}
                                  >
                                    <CalendarAdvancePaymentIcon />
                                    {locale === 'sl' ? 'PREDPLAČILO' : 'ADVANCE'}
                                  </button>
                                )}
                                {canCreateOpenBill && (
                                  <button
                                    type="button"
                                    className="calendar-payment-manager-row-action calendar-payment-manager-row-action--primary"
                                    onClick={async () => {
                                      const openBillId = await createOpenBillForPaymentStatus(status)
                                      if (openBillId) openPaymentOpenBillEditor(status, openBillId)
                                    }}
                                    title={locale === 'sl' ? 'Ustvari odprti račun' : 'Create open bill'}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                      <path d="M14 3v5h5M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {locale === 'sl' ? 'ODPRTI RAČUN' : 'OPEN BILL'}
                                  </button>
                                )}
                                {canUseInvoiceActions && (
                                  <>
                                    <button
                                      type="button"
                                      className="calendar-payment-manager-row-action calendar-payment-manager-row-action--resend"
                                      title={locale === 'sl' ? 'Ponovno pošlji račun po e-pošti' : 'Resend invoice email'}
                                      onClick={() => void resendPaymentInvoicePdf(status)}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M4 6.5h16v11H4v-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="m5 7 7 6 7-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      RESEND
                                    </button>
                                    <button
                                      type="button"
                                      className="calendar-payment-manager-row-action calendar-payment-manager-row-action--pdf"
                                      title={locale === 'sl' ? 'Odpri PDF račun' : 'Open invoice PDF'}
                                      onClick={() => void openPaymentInvoicePdf(status)}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="M14 3v5h5M8.5 16.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      PDF
                                    </button>
                                  </>
                                )}
                                {!canScanEntitlementPayment && !canCreateAdvanceBill && !canCreateOpenBill && !canUseInvoiceActions && <span className="calendar-payment-manager-no-action">—</span>}
                              </div>
                            </div>
                          )
                        })})()}
                      </div>
                    </section>
                  </div>
                )}
                </main>
              </div>
            </div>
            <div className="calendar-payment-manager-footer">
              <button
                type="button"
                className="gapp-primary-button calendar-payment-manager-save-button"
                onClick={() => {
                  void saveBookedPaymentManager()
                }}
                disabled={bookedSessionSaveDisabled}
              >
                <GuestConfigSaveIcon />
                {locale === 'sl' ? 'Shrani' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPersonalBlock && (
        <SidePanel
          open
          onClose={closePersonalModal}
          ariaLabel={t('formPersonalBlockEditTitle')}
          closeOnScrimClick={false}
          size="sm"
          className="cp-panel--calendar-form cp-panel--calendar-standardized cp-panel--calendar-edit-personal"
        >
            <PanelHeader
              title={t('formPersonalBlockEditTitle')}
              subtitle={personalPanelSubtitle}
              onClose={closePersonalModal}
              closeLabel={t('mobileNavClose')}
              overflow={
                <PanelOverflowMenu label={t('formDelete')}>
                  {(close) => (
                    <PanelMenuItem
                      danger
                      icon={<CalendarFormFooterDeleteIcon />}
                      onClick={() => {
                        close()
                        deletePersonalBlock()
                      }}
                    >
                      {t('formDelete')}
                    </PanelMenuItem>
                  )}
                </PanelOverflowMenu>
              }
            />
            <PanelBody sectioned className="calendar-standardized-body">
            <PanelSection
              title={isCalendarCreateMobile ? t('formTask') : t('formPersonal')}
              className="calendar-standardized__section calendar-standardized__personal"
              icon={<CalendarSectionIcon name="clients" />}
              summary={joinSummary(truncateSummary(selectedPersonalBlock.task, 40))}
              collapsible={isCalendarCreateMobile}
              action={!isCalendarCreateMobile ? (
                <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formVisibleToAdmins')}>
                  <span className="calendar-standardized__toggle-caption">{t('formVisibleToAdmins')}</span>
                  <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formVisibleToAdmins')}>
                    <input
                      type="checkbox"
                      checked={!!selectedPersonalBlock.visibleToAdmins}
                      onChange={(e) => setSelectedPersonalBlock({ ...selectedPersonalBlock, visibleToAdmins: e.target.checked })}
                    />
                    <span className="repeats-toggle-slider" />
                  </label>
                </div>
              ) : undefined}
            >
              <div className="form-row form-row-infield calendar-personal-field-with-visibility">
                <div className="calendar-booking-service-infield-head calendar-personal-visibility-head">
                  <div className="calendar-booking-service-online-line calendar-personal-visibility-line" role="group" aria-label={t('formVisibleToAdmins')}>
                    <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formVisibleToAdmins')}>
                      <input
                        type="checkbox"
                        checked={!!selectedPersonalBlock.visibleToAdmins}
                        onChange={(e) => setSelectedPersonalBlock({ ...selectedPersonalBlock, visibleToAdmins: e.target.checked })}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                    <span className="calendar-booking-service-online-caption">{t('formVisibleToAdmins')}</span>
                  </div>
                </div>
                <div className="form-field-inline-control">
                <PersonalTaskCombo
                  value={selectedPersonalBlock.task || ''}
                  onChange={(task) => setSelectedPersonalBlock({ ...selectedPersonalBlock, task })}
                  placeholder={t('formTaskCalendarNamePlaceholder')}
                  presets={personalTaskPresets}
                  dropdownOpen={personalTaskPresetDropdownOpen}
                  onDropdownOpenChange={setPersonalTaskPresetDropdownOpen}
                  selectPredefinedLabel={t('formSelectPredefinedTask')}
                  noMatchLabel={t('formNoTaskPresetsMatch')}
                />
                </div>
              </div>
            </PanelSection>
            <PanelSection
              title={sectionLabels.schedule}
              className="calendar-standardized__section calendar-standardized__schedule"
              icon={<CalendarSectionIcon name="schedule" />}
              defaultOpen={!isCalendarCreateMobile}
              collapsible={isCalendarCreateMobile}
              summary={scheduleSummary(selectedPersonalBlock.startTime, selectedPersonalBlock.endTime)}
              action={!isCalendarCreateMobile ? (
                <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formAllDay')}>
                  <span id={`${personalEditAllDayCaptionId}-header`} className="calendar-standardized__toggle-caption">{t('formAllDay')}</span>
                  <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formAllDay')}>
                    <input
                      type="checkbox"
                      checked={isLocalBookingAllDay(selectedPersonalBlock.startTime, selectedPersonalBlock.endTime)}
                      aria-labelledby={`${personalEditAllDayCaptionId}-header`}
                      onChange={toggleSelectedPersonalAllDay}
                    />
                    <span className="repeats-toggle-slider" />
                  </label>
                </div>
              ) : undefined}
            >
              <div className="form-row form-row-timespan">
                <CalendarLocalTimespanRow
                  startValue={selectedPersonalBlock.startTime}
                  endValue={selectedPersonalBlock.endTime}
                  onCommitStart={(s) =>
                    setSelectedPersonalBlock((prev: any) => (prev ? { ...prev, startTime: s } : prev))
                  }
                  onCommitEnd={(s) =>
                    setSelectedPersonalBlock((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                  }
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(selectedPersonalBlock.startTime, selectedPersonalBlock.endTime),
                    onToggle: toggleSelectedPersonalAllDay,
                    label: t('formAllDay'),
                    captionId: personalEditAllDayCaptionId,
                  }}
                  onCommitAllDayDate={(ymd) => {
                    setSelectedPersonalBlock((prev: any) =>
                      prev
                        ? {
                            ...prev,
                            startTime: allDayRangeStartTime(ymd),
                            endTime: allDayRangeEndTime(ymd),
                          }
                        : prev,
                    )
                  }}
                  allDayDateRange={{
                    ...allDayDateRangeLabels,
                    onCommitRange: (startYmd, endYmd) => {
                      setSelectedPersonalBlock((prev: any) =>
                        prev
                          ? {
                              ...prev,
                              startTime: allDayRangeStartTime(startYmd),
                              endTime: allDayRangeEndTime(endYmd),
                            }
                          : prev,
                      )
                    },
                  }}
                />
              </div>
            </PanelSection>
            <PanelSection
              title={sectionLabels.notes}
              className="calendar-standardized__section calendar-standardized__notes"
              icon={<CalendarSectionIcon name="notes" />}
              defaultOpen={!isCalendarCreateMobile}
              collapsible={isCalendarCreateMobile}
              summary={joinSummary(truncateSummary(selectedPersonalBlock.notes))}
            >
              <div className="form-row form-row-infield stretch">
                <div className="form-field-inline-control">
                <SessionNotesTextarea value={selectedPersonalBlock.notes || ''} onChange={(e) => setSelectedPersonalBlock({ ...selectedPersonalBlock, notes: e.target.value })} />
                </div>
              </div>
            </PanelSection>
            </PanelBody>
            <PanelFooter>
              <span className="calendar-standardized-desktop-delete">
                <PanelButton variant="danger" icon={<CalendarFormFooterDeleteIcon />} onClick={deletePersonalBlock}>
                  {t('formDelete')}
                </PanelButton>
              </span>
              <PanelButton variant="ghost" onClick={closePersonalModal}>
                {t('formCancel')}
              </PanelButton>
              <PanelButton variant="primary" icon={<CalendarFormFooterSaveIcon />} onClick={updatePersonalBlock}>
                {t('formSave')}
              </PanelButton>
            </PanelFooter>
        </SidePanel>
      )}

      {selectedTodo && (
        <SidePanel
          open
          onClose={closeTodoModal}
          ariaLabel={t('formTodoEditTitle')}
          closeOnScrimClick={false}
          size="sm"
          className="cp-panel--calendar-form cp-panel--calendar-standardized cp-panel--calendar-edit-todo"
        >
            <PanelHeader
              title={t('formTodoEditTitle')}
              subtitle={todoPanelSubtitle}
              onClose={closeTodoModal}
              closeLabel={t('mobileNavClose')}
              overflow={
                <PanelOverflowMenu label={t('formDelete')}>
                  {(close) => (
                    <PanelMenuItem
                      danger
                      icon={<CalendarFormFooterDeleteIcon />}
                      onClick={() => {
                        close()
                        deleteTodo()
                      }}
                    >
                      {t('formDelete')}
                    </PanelMenuItem>
                  )}
                </PanelOverflowMenu>
              }
            />
            <PanelBody sectioned className="calendar-standardized-body">
              <PanelSection
                title={t('formTodo')}
                className="calendar-standardized__section calendar-standardized__task"
                icon={<CalendarSectionIcon name={isCalendarCreateMobile ? 'notes' : 'service'} />}
                summary={joinSummary(truncateSummary(selectedTodo.task, 40))}
                collapsible={isCalendarCreateMobile}
              >
                <div className="form-row form-row-infield">
                  <div className="form-field-inline-control">
                  <input value={selectedTodo.task || ''} onChange={(e) => setSelectedTodo({ ...selectedTodo, task: e.target.value })} />
                  </div>
                </div>
              </PanelSection>
              <PanelSection
                title={sectionLabels.schedule}
                className="calendar-standardized__section calendar-standardized__schedule calendar-standardized__schedule--todo"
                icon={<CalendarSectionIcon name="schedule" />}
                defaultOpen={!isCalendarCreateMobile}
                collapsible={isCalendarCreateMobile}
                summary={joinSummary(
                  formatPanelSlotSubtitle(selectedTodo.startTime, null, locale),
                  isLocalTodoAllDayStart(selectedTodo.startTime) ? sectionLabels.allDay : null,
                )}
                action={!isCalendarCreateMobile ? (
                  <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formAllDay')}>
                    <span id={`${todoEditAllDayCaptionId}-header`} className="calendar-standardized__toggle-caption">{t('formAllDay')}</span>
                    <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formAllDay')}>
                      <input
                        type="checkbox"
                        checked={isLocalTodoAllDayStart(selectedTodo.startTime)}
                        aria-labelledby={`${todoEditAllDayCaptionId}-header`}
                        onChange={toggleSelectedTodoAllDay}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                  </div>
                ) : undefined}
              >
                <div className="form-row form-row-timespan">
                  <CalendarLocalTimeDateRow
                    value={selectedTodo.startTime}
                    onCommit={(s) => setSelectedTodo((prev: any) => (prev ? { ...prev, startTime: s } : prev))}
                    normalize={normalizeToLocalDateTime}
                    labels={{ time: t('formTimeFrom'), date: t('formCalendarDate') }}
                    allDayToggle={{
                      checked: isLocalTodoAllDayStart(selectedTodo.startTime),
                      onToggle: toggleSelectedTodoAllDay,
                      label: t('formAllDay'),
                      captionId: todoEditAllDayCaptionId,
                    }}
                    onCommitAllDayDate={(ymd) => {
                      setSelectedTodo((prev: any) =>
                        prev ? { ...prev, startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`) } : prev,
                      )
                    }}
                  />
                </div>
              </PanelSection>
              <PanelSection
                title={sectionLabels.notes}
                className="calendar-standardized__section calendar-standardized__notes"
                icon={<CalendarSectionIcon name="notes" />}
                defaultOpen={!isCalendarCreateMobile}
                collapsible={isCalendarCreateMobile}
                summary={joinSummary(truncateSummary(selectedTodo.notes))}
              >
                <div className="form-row form-row-infield stretch">
                  <div className="form-field-inline-control">
                  <SessionNotesTextarea value={selectedTodo.notes || ''} onChange={(e) => setSelectedTodo({ ...selectedTodo, notes: e.target.value })} />
                  </div>
                </div>
              </PanelSection>
            </PanelBody>
            <PanelFooter>
              <span className="calendar-standardized-desktop-delete">
                <PanelButton variant="danger" icon={<CalendarFormFooterDeleteIcon />} onClick={deleteTodo}>
                  {t('formDelete')}
                </PanelButton>
              </span>
              <PanelButton variant="success" icon={<CalendarFormFooterSaveIcon />} onClick={completeTodo}>
                {locale === 'sl' ? 'Opravljeno' : 'Done'}
              </PanelButton>
              <PanelButton variant="primary" icon={<CalendarFormFooterSaveIcon />} onClick={updateTodo}>
                {t('formSave')}
              </PanelButton>
            </PanelFooter>
        </SidePanel>
      )}

      {selection && (
        <SidePanel
          open
          onClose={closeBookingSelection}
          ariaLabel={renderBookingModeTitle()}
          closeOnScrimClick={false}
          className={`cp-panel--calendar-form${activeNewFormPanel !== 'booking' ? ' cp-panel--calendar-mobile-create' : ''}${activeNewFormPanel === 'booking' ? ' cp-panel--calendar-new-booking' : ''}${activeNewFormPanel === 'todo' ? ' cp-panel--calendar-standardized cp-panel--calendar-new-todo' : ''}${activeNewFormPanel === 'personal' ? ' cp-panel--calendar-standardized cp-panel--calendar-new-personal' : ''}${activeNewFormPanel === 'availability' ? ' cp-panel--calendar-standardized cp-panel--calendar-new-availability' : ''}`}
        >
          <PanelHeader
            title={renderBookingModeTitle()}
            subtitle={newFormPanelSubtitle}
            onClose={closeBookingSelection}
            closeLabel={t('formBookSessionCloseAria')}
            actions={(
              <button
                type="button"
                className="calendar-booking-mobile-header-save"
                disabled={availabilitySelection != null ? availabilitySaving : saveBookingLoading}
                aria-label={availabilitySelection != null
                  ? (availabilitySaving ? t('formSaving') : t('formSave'))
                  : (saveBookingLoading ? t('formSaving') : t('formSave'))}
                title={availabilitySelection != null
                  ? (availabilitySaving ? t('formSaving') : t('formSave'))
                  : (saveBookingLoading ? t('formSaving') : t('formSave'))}
                onClick={() => {
                  if (availabilitySelection != null) {
                    void confirmAvailabilityFromHeader()
                    return
                  }
                  void saveBooking(false)
                }}
              >
                <CalendarBookingHeaderSaveIcon />
              </button>
            )}
            leading={(
              <button
                type="button"
                className="calendar-booking-mobile-back"
                onClick={closeBookingSelection}
                aria-label={locale === 'sl' ? 'Nazaj' : locale === 'sr' ? 'Nazad' : 'Back'}
                title={locale === 'sl' ? 'Nazaj' : locale === 'sr' ? 'Nazad' : 'Back'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}
          />
          {!isNativeAndroid && (
            <PanelTabs
              label={t('formBookSession')}
              activeId={activeNewFormPanel}
              onSelect={(id) => {
                activateNewFormPanel(id)
              }}
              tabs={[
                {
                  id: 'booking',
                  label: t('formBooking'),
                  icon: <BookingTypeTabIcon name="booking" />,
                  to: urlForNewForm('booking', location.search),
                },
                {
                  id: 'todo',
                  label: t('formTodo'),
                  icon: <BookingTypeTabIcon name="todo" />,
                  to: urlForNewForm('todo', location.search),
                  hidden: !todosModuleEnabled,
                },
                {
                  id: 'personal',
                  label: t('formPersonal'),
                  icon: <BookingTypeTabIcon name="personal" />,
                  to: urlForNewForm('personal', location.search),
                  hidden: !personalModuleEnabled,
                },
                {
                  id: 'availability',
                  label: t('calendarModeAvailability'),
                  icon: <BookingTypeTabIcon name="availability" />,
                  to: urlForNewForm('availability', location.search),
                },
              ]}
            />
          )}
          <PanelBody
            sectioned
            id={activeNewFormPanel === 'booking' ? 'calendar-new-booking-scroll-body' : undefined}
            className={activeNewFormPanel === 'booking'
              ? 'calendar-approved-booking-body'
              : (activeNewFormPanel === 'todo' || activeNewFormPanel === 'personal' || activeNewFormPanel === 'availability')
                ? 'calendar-standardized-body'
                : ''}
            onClick={() => {
              setClientDropdownOpen(false)
              setEditingClientSearch(false)
            }}
            style={!isNativeAndroid ? { touchAction: 'pan-y' as const } : undefined}
            onTouchStart={!isNativeAndroid ? onNewFormPanelTouchStart : undefined}
            onTouchEnd={!isNativeAndroid ? onNewFormPanelTouchEnd : undefined}
          >
            {(availabilitySelection ? availabilityError : saveBookingError) && (
              <PanelBanner tone="error">
                {availabilitySelection ? availabilityError : saveBookingError}
              </PanelBanner>
            )}
              {availabilitySelection ? (
                <>
                <PanelSection
                  title={t('calendarModeAvailability')}
                  className="calendar-standardized__section calendar-standardized__availability"
                  icon={<CalendarSectionIcon name="availability" />}
                  collapsible={false}
                >
                  {locationFilterId == null && metaLocations.filter((item: any) => item?.active !== false).length > 1 && (
                    <div className="form-row form-row-infield calendar-new-create-availability-location">
                      <span className="form-field-inline-label">{locale === 'sl' ? 'Lokacija' : 'Location'}</span>
                      <div className="form-field-inline-control">
                        <DesktopSelect
                          value={availabilitySelection.locationId || ''}
                          onChange={(e) => {
                            const nextLocationId = Number(e.target.value) || null
                            const candidates = metaConsultants.filter((candidate: any) =>
                              nextLocationId == null
                              || candidate.availableAllLocations !== false
                              || (Array.isArray(candidate.locationIds) && candidate.locationIds.some((id: unknown) => Number(id) === Number(nextLocationId)))
                            )
                            const currentStillAllowed = candidates.some((candidate: any) => Number(candidate.id) === Number(availabilitySelection.consultantId))
                            setAvailabilitySelection({
                              ...availabilitySelection,
                              locationId: nextLocationId,
                              consultantId: currentStillAllowed ? availabilitySelection.consultantId : (candidates[0]?.id ?? null),
                            })
                          }}
                        >
                          <option value="">{locale === 'sl' ? 'Izberite lokacijo' : 'Select location'}</option>
                          {metaLocations.filter((item: any) => item?.active !== false).map((item: any) => (
                            <option key={item.id} value={item.id}>{item.name}{item.city ? ` – ${item.city}` : ''}</option>
                          ))}
                        </DesktopSelect>
                      </div>
                    </div>
                  )}
                  {showBookingConsultantRow && (
                    <div className="form-row form-row-infield calendar-new-create-availability-consultant">
                      <span className="form-field-inline-label">{t('formConsultant')}</span>
                      <div className="form-field-inline-control">
                      <DesktopSelect
                        value={availabilitySelection.consultantId || ''}
                        onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, consultantId: Number(e.target.value) || null })}
                      >
                        <option value="">{t('formSelectConsultant')}</option>
                        {metaConsultants
                          .filter((c: any) => availabilitySelection.locationId == null
                            || c.availableAllLocations !== false
                            || (Array.isArray(c.locationIds) && c.locationIds.some((id: unknown) => Number(id) === Number(availabilitySelection.locationId))))
                          .map((c: any) => (
                            <option key={c.id} value={c.id}>{fullName(c)}</option>
                          ))}
                      </DesktopSelect>
                      </div>
                    </div>
                  )}
                  <div className="form-row form-row-infield form-row--bare calendar-new-create-availability-action">
                    <span className="form-field-inline-label">{t('formAvailabilityAction')}</span>
                    <div className="form-field-inline-control">
                      <DesktopSelect
                        aria-label={t('formAvailabilityAction')}
                        value={availabilityIntent}
                        onChange={(e) => setAvailabilityIntent(e.target.value === 'block' ? 'block' : 'add')}
                      >
                        <option value="add">{t('formAvailabilityOpenShort')}</option>
                        <option value="block">{t('formBlockAvailabilityShort')}</option>
                      </DesktopSelect>
                    </div>
                  </div>
                </PanelSection>
                <PanelSection
                  title={sectionLabels.schedule}
                  className="calendar-standardized__section calendar-standardized__schedule"
                  icon={<CalendarSectionIcon name="schedule" />}
                  summary={scheduleSummary(availabilitySelection.startTime, availabilitySelection.endTime)}
                  collapsible={false}
                >
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimespanRow
                      startValue={availabilitySelection.startTime}
                      endValue={availabilitySelection.endTime}
                      onCommitStart={(s) =>
                        setAvailabilitySelection((prev: any) => (prev ? { ...prev, startTime: s } : prev))
                      }
                      onCommitEnd={(s) =>
                        setAvailabilitySelection((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                      }
                      normalize={normalizeToLocalDateTime}
                      labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalBookingAllDay(
                          availabilitySelection.startTime,
                          availabilitySelection.endTime,
                        ),
                        onToggle: () => {
                          setAvailabilitySelection((prev: any) => {
                            if (!prev) return prev
                            if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
                              const d =
                                splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date ||
                                localTodayYmd()
                              const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                              const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                              const end = getBookingEndTimeForStart(start, null)
                              return { ...prev, startTime: start, endTime: end }
                            }
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                            return {
                              ...prev,
                              startTime: allDayRangeStartTime(d),
                              endTime: allDayRangeEndTime(d),
                              rangeStartDate: d,
                              rangeEndDate: d,
                            }
                          })
                        },
                        label: t('formAllDay'),
                        captionId: availabilityAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setAvailabilitySelection((prev: any) =>
                          prev
                            ? {
                                ...prev,
                                startTime: allDayRangeStartTime(ymd),
                                endTime: allDayRangeEndTime(ymd),
                                rangeStartDate: ymd,
                                rangeEndDate: ymd,
                              }
                            : prev,
                        )
                      }}
                      allDayDateRange={{
                        ...allDayDateRangeLabels,
                        onCommitRange: (startYmd, endYmd) => {
                          setAvailabilitySelection((prev: any) =>
                            prev
                              ? {
                                  ...prev,
                                  startTime: allDayRangeStartTime(startYmd),
                                  endTime: allDayRangeEndTime(endYmd),
                                  rangeStartDate: startYmd,
                                  rangeEndDate: endYmd,
                                }
                              : prev,
                          )
                        },
                      }}
                    />
                  </div>
                  <div className="form-row form-row-infield form-row--bare calendar-new-create-availability-repeat">
                    <span className="form-field-inline-label">{t('calendarRepeat')}</span>
                    <div className="form-field-inline-control">
                      <DesktopSelect
                        aria-label={t('calendarRepeat')}
                        value={availabilitySelection.indefinite ? 'indefinite' : 'limited'}
                        onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, indefinite: e.target.value === 'indefinite' })}
                      >
                        <option value="limited">{t('formLimited')}</option>
                        <option value="indefinite">{t('formIndefinite')}</option>
                      </DesktopSelect>
                    </div>
                  </div>
                  {!availabilitySelection.indefinite && !isLocalBookingAllDay(availabilitySelection.startTime, availabilitySelection.endTime) && (
                    <div className="form-row form-row-timespan">
                      <div className="calendar-timespan-row calendar-timespan-row--two calendar-availability-datum-row">
                        <div className="calendar-timespan-field calendar-timespan-field--date">
                          <div className="calendar-timespan-input-inner">
                            <span className="calendar-timespan-label">{t('formStartDate')}</span>
                            <input
                              ref={availabilityRangeStartInputRef}
                              type="date"
                              value={availabilitySelection.rangeStartDate || availabilitySelection.startTime?.slice(0, 10) || ''}
                              onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, rangeStartDate: e.target.value })}
                              aria-label={t('formStartDate')}
                            />
                          </div>
                        </div>
                        <div className="calendar-timespan-field calendar-timespan-field--date">
                          <div className="calendar-timespan-input-inner">
                            <span className="calendar-timespan-label">{t('formEndDate')}</span>
                            <input
                              ref={availabilityRangeEndInputRef}
                              type="date"
                              value={availabilitySelection.rangeEndDate || availabilitySelection.endTime?.slice(0, 10) || ''}
                              onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, rangeEndDate: e.target.value })}
                              aria-label={t('formEndDate')}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </PanelSection>
                </>
              ) : form.todo ? (
                <>
                <PanelSection
                  title={t('formTodo')}
                  className="calendar-standardized__section calendar-standardized__task"
                  icon={<CalendarSectionIcon name={isCalendarCreateMobile ? 'notes' : 'service'} />}
                  summary={joinSummary(truncateSummary(form.task, 40))}
                  collapsible={isCalendarCreateMobile}
                >
                  <div className="form-row form-row-infield calendar-new-create-primary-field calendar-new-create-todo-field">
                    <span className="form-field-inline-label">{t('formTaskNamePlaceholder')}</span>
                    <div className="form-field-inline-control">
                    <input
                      aria-label={t('formTaskNamePlaceholder')}
                      placeholder={locale === 'sl' ? 'Vnesi opravilo' : locale === 'sr' ? 'Unesite zadatak' : 'Enter task'}
                      value={form.task || ''}
                      onChange={(e) => setForm({ ...form, task: e.target.value })}
                    />
                    </div>
                  </div>
                </PanelSection>
                <PanelSection
                  title={sectionLabels.schedule}
                  className="calendar-standardized__section calendar-standardized__schedule calendar-standardized__schedule--todo"
                  icon={<CalendarSectionIcon name="schedule" />}
                  defaultOpen={!isCalendarCreateMobile}
                  collapsible={isCalendarCreateMobile}
                  summary={joinSummary(
                    formatPanelSlotSubtitle(form.startTime, null, locale),
                    isLocalTodoAllDayStart(form.startTime) ? sectionLabels.allDay : null,
                  )}
                  action={!isCalendarCreateMobile ? (
                    <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formAllDay')}>
                      <span id={`${todoFormAllDayCaptionId}-header`} className="calendar-standardized__toggle-caption">{t('formAllDay')}</span>
                      <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formAllDay')}>
                        <input
                          type="checkbox"
                          checked={isLocalTodoAllDayStart(form.startTime)}
                          aria-labelledby={`${todoFormAllDayCaptionId}-header`}
                          onChange={toggleNewTodoAllDay}
                        />
                        <span className="repeats-toggle-slider" />
                      </label>
                    </div>
                  ) : undefined}
                >
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimeDateRow
                      value={form.startTime}
                      onCommit={(s) => setForm((f: any) => ({ ...f, startTime: s }))}
                      normalize={normalizeToLocalDateTime}
                      labels={{ time: t('formTimeFrom'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalTodoAllDayStart(form.startTime),
                        onToggle: toggleNewTodoAllDay,
                        label: t('formAllDay'),
                        captionId: todoFormAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setForm((f: any) => ({ ...f, startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`) }))
                      }}
                    />
                  </div>
                </PanelSection>
                <PanelSection
                  title={sectionLabels.notes}
                  className="calendar-standardized__section calendar-standardized__notes"
                  icon={<CalendarSectionIcon name="notes" />}
                  defaultOpen={!isCalendarCreateMobile}
                  collapsible={isCalendarCreateMobile}
                  summary={newFormNotesSummary}
                >
                  <div className="form-row form-row-infield stretch calendar-new-create-notes-field">
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </PanelSection>
                </>
              ) : form.personal ? (
                <>
                <PanelSection
                  title={isCalendarCreateMobile ? t('formTask') : t('formPersonal')}
                  className="calendar-standardized__section calendar-standardized__personal"
                  icon={<CalendarSectionIcon name="clients" />}
                  summary={joinSummary(truncateSummary(form.task, 40))}
                  collapsible={isCalendarCreateMobile}
                  action={!isCalendarCreateMobile ? (
                    <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formVisibleToAdmins')}>
                      <span className="calendar-standardized__toggle-caption">{t('formVisibleToAdmins')}</span>
                      <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formVisibleToAdmins')}>
                        <input
                          type="checkbox"
                          checked={!!form.visibleToAdmins}
                          onChange={(e) => setForm({ ...form, visibleToAdmins: e.target.checked })}
                        />
                        <span className="repeats-toggle-slider" />
                      </label>
                    </div>
                  ) : undefined}
                >
                  <div className="form-row form-row-infield calendar-personal-field-with-visibility calendar-new-create-primary-field calendar-new-create-personal-field">
                    <div className="calendar-booking-service-infield-head calendar-personal-visibility-head">
                      <div className="calendar-booking-service-online-line calendar-personal-visibility-line" role="group" aria-label={t('formVisibleToAdmins')}>
                        <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formVisibleToAdmins')}>
                          <input
                            type="checkbox"
                            checked={!!form.visibleToAdmins}
                            onChange={(e) => setForm({ ...form, visibleToAdmins: e.target.checked })}
                          />
                          <span className="repeats-toggle-slider" />
                        </label>
                        <span className="calendar-booking-service-online-caption">{t('formVisibleToAdmins')}</span>
                      </div>
                    </div>
                    <span className="form-field-inline-label calendar-new-create-personal-name-label">{t('formPersonal')}</span>
                    <div className="form-field-inline-control">
                    <PersonalTaskCombo
                      value={form.task || ''}
                      onChange={(task) => setForm({ ...form, task })}
                      placeholder={locale === 'sl' ? 'Vnesi osebno' : locale === 'sr' ? 'Unesite lično vreme' : 'Enter personal time'}
                      presets={personalTaskPresets}
                      dropdownOpen={personalTaskPresetDropdownOpen}
                      onDropdownOpenChange={setPersonalTaskPresetDropdownOpen}
                      selectPredefinedLabel={t('formSelectPredefinedTask')}
                      noMatchLabel={t('formNoTaskPresetsMatch')}
                    />
                    </div>
                  </div>
                  {isCalendarCreateMobile && (
                    <div className="form-row form-row-infield calendar-new-create-personal-visibility">
                      <div className="form-field-inline-control">
                        <div className="calendar-mobile-inline-toggle" role="group" aria-label={t('formVisibleToAdmins')}>
                          <span className="calendar-mobile-inline-toggle__label">{t('formVisibleToAdmins')}</span>
                          <label className="repeats-toggle-switch online-live-repeats-switch calendar-mobile-inline-toggle__switch" title={t('formVisibleToAdmins')}>
                            <input
                              type="checkbox"
                              checked={!!form.visibleToAdmins}
                              onChange={(e) => setForm({ ...form, visibleToAdmins: e.target.checked })}
                            />
                            <span className="repeats-toggle-slider" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </PanelSection>
                <PanelSection
                  title={sectionLabels.schedule}
                  className="calendar-standardized__section calendar-standardized__schedule"
                  icon={<CalendarSectionIcon name="schedule" />}
                  defaultOpen={!isCalendarCreateMobile}
                  collapsible={isCalendarCreateMobile}
                  summary={scheduleSummary(form.startTime, form.endTime)}
                  action={!isCalendarCreateMobile ? (
                    <div className="calendar-standardized__header-toggle" role="group" aria-label={t('formAllDay')}>
                      <span id={`${personalFormAllDayCaptionId}-header`} className="calendar-standardized__toggle-caption">{t('formAllDay')}</span>
                      <label className="repeats-toggle-switch calendar-standardized__toggle" title={t('formAllDay')}>
                        <input
                          type="checkbox"
                          checked={isLocalBookingAllDay(form.startTime, form.endTime)}
                          aria-labelledby={`${personalFormAllDayCaptionId}-header`}
                          onChange={toggleNewPersonalAllDay}
                        />
                        <span className="repeats-toggle-slider" />
                      </label>
                    </div>
                  ) : undefined}
                >
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimespanRow
                      startValue={form.startTime}
                      endValue={form.endTime}
                      onCommitStart={(s) => setForm((f: any) => ({ ...f, startTime: s }))}
                      onCommitEnd={(s) => setForm((f: any) => ({ ...f, endTime: s }))}
                      normalize={normalizeToLocalDateTime}
                      labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalBookingAllDay(form.startTime, form.endTime),
                        onToggle: toggleNewPersonalAllDay,
                        label: t('formAllDay'),
                        captionId: personalFormAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setForm((f: any) => ({
                          ...f,
                          startTime: allDayRangeStartTime(ymd),
                          endTime: allDayRangeEndTime(ymd),
                        }))
                      }}
                      allDayDateRange={{
                        ...allDayDateRangeLabels,
                        onCommitRange: (startYmd, endYmd) => {
                          setForm((f: any) => ({
                            ...f,
                            startTime: allDayRangeStartTime(startYmd),
                            endTime: allDayRangeEndTime(endYmd),
                          }))
                        },
                      }}
                    />
                  </div>
                </PanelSection>
                <PanelSection
                  title={sectionLabels.notes}
                  className="calendar-standardized__section calendar-standardized__notes"
                  icon={<CalendarSectionIcon name="notes" />}
                  defaultOpen={!isCalendarCreateMobile}
                  collapsible={isCalendarCreateMobile}
                  summary={newFormNotesSummary}
                >
                  <div className="form-row form-row-infield stretch calendar-new-create-notes-field">
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </PanelSection>
                </>
              ) : (
                <>
              <PanelSection
                title={bookingGroupMode ? sectionLabels.group : (compactAppointmentStructure ? sectionLabels.clients : t('formClients'))}
                className="calendar-approved-booking__section calendar-approved-booking__clients"
                icon={<CalendarSectionIcon name="clients" />}
                summary={newFormClientsSummary}
                collapsible={compactAppointmentStructure}
                action={groupBookingEnabled ? (
                  <div className="calendar-booking-service-online-line calendar-booking-section-head-action" role="group" aria-label={t('formGroupToggle')}>
                    <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formGroupToggle')}>
                      <input
                        type="checkbox"
                        checked={bookingGroupMode}
                        aria-labelledby={addBookingGroupCaptionId}
                        onChange={(e) => toggleNewBookingGroupMode(e.target.checked)}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                    <span id={addBookingGroupCaptionId} className="calendar-booking-service-online-caption">
                      {t('formGroupToggle')}
                    </span>
                  </div>
                ) : undefined}
              >
              <div className={`form-row form-row-infield calendar-booking-field--client${groupBookingEnabled ? ' calendar-booking-client-with-group' : ''}`}>
                <div className="form-field-inline-control">
                  {groupBookingEnabled && bookingGroupMode ? (
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className={`client-search-wrap calendar-client-picker__search-wrap${bookSessionGroupFieldCompact ? ' client-search-wrap--compact-client' : ''}${selectedGroup ? ' calendar-client-picker__search-wrap--clearable' : ''}`}>
                          <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          </span>
                          {bookSessionGroupFieldCompact ? (
                            <button
                              type="button"
                              className="client-selected-display"
                              onClick={() => {
                                setEditingGroupSearch(true)
                                setGroupSearch('')
                                setGroupDropdownOpen(true)
                              }}
                            >
                              {selectedGroup!.name}
                            </button>
                          ) : (
                            <input
                              ref={groupSearchInputRef}
                              placeholder={groupSearchPlaceholder}
                              value={groupSearch}
                              onChange={(e) => {
                                setGroupSearch(e.target.value)
                                setEditingGroupSearch(true)
                                setGroupDropdownOpen(true)
                              }}
                              onFocus={() => {
                                setEditingGroupSearch(true)
                                setGroupDropdownOpen(true)
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setGroupDropdownOpen(false)
                                  const typed = groupSearch.trim()
                                  if (typed && selectedGroup) {
                                    if ((selectedGroup.name || '').toLowerCase() !== typed.toLowerCase()) {
                                      setForm((prev: any) => ({ ...prev, groupId: null }))
                                    } else {
                                      setGroupSearch('')
                                    }
                                  } else if (!typed) {
                                    setGroupSearch('')
                                  }
                                  setEditingGroupSearch(false)
                                }, 0)
                              }}
                            />
                          )}
                          {!!selectedGroup && (
                            <button
                              type="button"
                              className="calendar-client-picker__single-clear"
                              title={clearSingleGroupTitle}
                              aria-label={clearSingleGroupTitle}
                              onClick={(e) => {
                                e.stopPropagation()
                                setForm((prev: any) => ({ ...prev, groupId: null }))
                                setGroupSearch('')
                                setEditingGroupSearch(false)
                                setGroupDropdownOpen(false)
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          )}
                        </div>
                        <div className="calendar-client-picker__actions">
                          <button
                            type="button"
                            className="secondary client-add-btn calendar-client-picker__add-btn"
                            title={addGroupInlineTitle}
                            aria-label={addGroupInlineTitle}
                            onClick={(event) => {
                              event.stopPropagation()
                              setGroupDropdownOpen(false)
                              setShowAddGroupModal(true)
                            }}
                          >
                            <CalendarBookingAddIcon />
                          </button>
                        </div>
                      </div>
                      {groupDropdownOpen && (
                        <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                          {visibleGroups.slice(0, 10).map((g: any) => (
                            <button
                              key={g.id}
                              type="button"
                              className={`client-list-item${form.groupId === g.id ? ' selected' : ''}`}
                              onClick={() => {
                                const seedIds = (g.members ?? []).map((m: any) => m.id).filter((id: number) => Number.isFinite(id) && id > 0)
                                setForm((prev: any) => ({
                                  ...prev,
                                  groupId: g.id,
                                  ...(seedIds.length > 0
                                    ? { clientIds: seedIds, clientId: seedIds[0] ?? null }
                                    : { clientIds: [], clientId: null }),
                                }))

                                // A group's mapped service is a default, not a lock. Apply it
                                // once when the group is selected; any later manual service
                                // change remains untouched for this booking.
                                const defaultTypeId = Number(g?.defaultSessionType?.id ?? 0)
                                const defaultType = defaultTypeId > 0
                                  ? metaTypes.find((type: any) => Number(type?.id) === defaultTypeId)
                                  : null
                                if (defaultType?.active !== false && defaultType?.groupBookingEnabled === true) {
                                  const existingPrimaryIndex = formServiceDrafts.findIndex((service: any) => Number(service?.typeId ?? 0) > 0)
                                  const primaryIndex = existingPrimaryIndex >= 0 ? existingPrimaryIndex : 0
                                  const nextServices = formServiceDrafts.length > 0
                                    ? formServiceDrafts.map((service: any, index: number) =>
                                        index === primaryIndex ? { ...service, typeId: defaultTypeId } : service)
                                    : [{ typeId: defaultTypeId, spaceId: form?.spaceId ?? null }]
                                  updateBookingFormServices(nextServices)
                                }

                                setGroupDropdownOpen(false)
                                setEditingGroupSearch(false)
                                setGroupSearch('')
                              }}
                            >
                              {g.name}
                              <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                                ({(g.members ?? []).length})
                              </span>
                            </button>
                          ))}
                          {visibleGroups.length === 0 && <span className="muted">{t('formNoGroupsFoundAddOne')}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                  <div className="calendar-client-picker__search-row">
                    <div className={`client-search-wrap calendar-client-picker__search-wrap${bookSessionClientFieldCompact ? ' client-search-wrap--compact-client' : ''}${clientDropdownOpen && bookSessionSelectedClients.length > 0 && !bookSessionClientFieldCompact ? ' calendar-client-picker__search-wrap--confirmable' : ''}`}>
                      <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      </span>
                      {bookSessionClientFieldCompact ? (
                        <>
                          <button
                            type="button"
                            className="client-selected-display"
                            onClick={() => {
                              setEditingClientSearch(true)
                              setClientSearch('')
                              setClientDropdownOpen(true)
                            }}
                          >
                            {fullName(bookSessionSelectedClient!)}
                          </button>
                          <button
                            type="button"
                            className="calendar-client-picker__single-clear"
                            title={clearSingleClientTitle}
                            aria-label={clearSingleClientTitle}
                            onClick={(event) => {
                              event.stopPropagation()
                              applyFormClientIds([])
                              setClientSearch('')
                              setEditingClientSearch(false)
                              setClientDropdownOpen(false)
                            }}
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </>
                      ) : (
                        <input
                          ref={clientSearchInputRef}
                          type="search"
                          name="calendra-new-session-client-search"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          inputMode="search"
                          enterKeyHint="search"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          placeholder={clientSearchPlaceholder}
                          value={clientSearch}
                          onChange={(e) => {
                            setClientSearch(e.target.value)
                            setEditingClientSearch(true)
                            setClientDropdownOpen(true)
                          }}
                          onFocus={() => {
                            setEditingClientSearch(true)
                            setClientDropdownOpen(true)
                          }}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setClientDropdownOpen(false)
                              if (multipleClientsPerSessionEnabled) {
                                setEditingClientSearch(false)
                                return
                              }
                              const typed = clientSearch.trim()
                              if (typed && bookSessionSelectedClient) {
                                if (fullName(bookSessionSelectedClient).toLowerCase() !== typed.toLowerCase()) {
                                  applyFormClientIds([])
                                } else {
                                  setClientSearch('')
                                }
                              } else if (!typed) {
                                setClientSearch('')
                              }
                              setEditingClientSearch(false)
                            }, 0)
                          }}
                        />
                      )}
                      {clientDropdownOpen && !bookSessionClientFieldCompact && bookSessionSelectedClients.length > 0 && (
                        <button
                          type="button"
                          className="calendar-client-picker__confirm"
                          aria-label={locale === 'sl' ? 'Potrdi izbiro strank' : 'Confirm client selection'}
                          title={locale === 'sl' ? 'Potrdi izbiro strank' : 'Confirm client selection'}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setClientDropdownOpen(false)
                            setEditingClientSearch(false)
                            setClientSearch('')
                            clientSearchInputRef.current?.blur()
                          }}
                        >
                          <span aria-hidden>✓</span>
                        </button>
                      )}
                    </div>
                    <div className="calendar-client-picker__actions">
                      <button
                        type="button"
                        className="secondary client-add-btn calendar-client-picker__add-btn"
                        title={addClientInlineTitle}
                        aria-label={addClientInlineTitle}
                        onClick={() => {
                          setClientDropdownOpen(false)
                          const p = parseClientNameInput(clientSearch)
                          setNewClientForm((prev) => ({ ...prev, firstName: p.firstName, lastName: p.lastName }))
                          setShowAddClientModal(true)
                        }}
                      >
                        <CalendarBookingAddIcon />
                      </button>
                      {waitlistModuleEnabled && Number(visibleNewSlotWaitlistMatches?.count) > 0 && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__waitlist-btn"
                          title={locale === 'sl' ? 'Čakalna vrsta' : locale === 'sr' ? 'Lista čekanja' : 'Waitlist'}
                          aria-label={locale === 'sl' ? 'Odpri čakalno vrsto' : locale === 'sr' ? 'Otvori listu čekanja' : 'Open waitlist'}
                          onClick={(event) => {
                            event.stopPropagation()
                            setClientDropdownOpen(false)
                            setNewSlotWaitlistOpen(true)
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M8.25 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM15.75 10a2.6 2.6 0 1 0 0-5.2M2.75 19.25c.55-3.35 2.38-5.05 5.5-5.05s4.95 1.7 5.5 5.05M14.4 13.8c3.9-.25 6.15 1.55 6.85 5.45" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span className="calendar-client-picker__waitlist-count">{visibleNewSlotWaitlistMatches.count}</span>
                        </button>
                      )}
                    </div>
                    {clientDropdownOpen && (
                      <div className="client-dropdown-panel calendar-client-picker__dropdown" onMouseDown={(e) => e.preventDefault()}>
                        {visibleClients.slice(0, 10).map((client: any) => {
                          const selected = selectedFormClientIds.includes(client.id)
                          return (
                          <button
                            key={client.id}
                            type="button"
                            className={`client-list-item calendar-client-picker__dropdown-item ${selected ? 'selected' : ''}`}
                            onClick={() => {
                              if (multipleClientsPerSessionEnabled) {
                                const nextIds = selected
                                  ? selectedFormClientIds.filter((id) => id !== client.id)
                                  : [...selectedFormClientIds, client.id]
                                applyFormClientIds(nextIds)
                              } else {
                                setForm({ ...form, clientId: client.id, clientIds: [client.id] })
                                setClientDropdownOpen(false)
                                setEditingClientSearch(false)
                              }
                              setClientSearch('')
                            }}
                          >
                            <span className="calendar-client-picker__dropdown-check" aria-hidden>{selected ? '✓' : ''}</span>
                            <span className="calendar-client-picker__dropdown-label">{fullName(client)}</span>
                          </button>
                        )})}
                        {visibleClients.length === 0 && <span className="muted">{t('formNoClientsFoundAddOne')}</span>}
                      </div>
                    )}
                  </div>
                  {multipleClientsPerSessionEnabled && bookSessionSelectedClients.length > 0 && (
                    <div className="calendar-multi-client-chips">
                      {visibleBookSessionClientChips.map((client: any) => (
                        <div key={client.id} className="calendar-multi-client-chip">
                          <span className="calendar-multi-client-chip__label">
                            {fullName(client)}
                          </span>
                          <button
                            type="button"
                            className="calendar-multi-client-chip__remove"
                            aria-label={`${t('formDelete')} ${fullName(client)}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              applyFormClientIds(selectedFormClientIds.filter((id) => id !== client.id))
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {hiddenBookSessionClientCount > 0 && !bookSessionClientsExpanded && (
                        <button
                          type="button"
                          className="calendar-multi-client-more"
                          onClick={() => setBookSessionClientsExpanded(true)}
                        >
                          {getMoreClientsLabel(hiddenBookSessionClientCount)}
                        </button>
                      )}
                      {bookSessionClientsExpanded && bookSessionSelectedClients.length > 3 && (
                        <button
                          type="button"
                          className="calendar-multi-client-more calendar-multi-client-more--secondary"
                          onClick={() => setBookSessionClientsExpanded(false)}
                        >
                          {showLessClientsLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                  )}
                </div>
              </div>
              </PanelSection>
              {showBookingTypeRow && (
                  <CalendarServiceChainEditor
                    sectionSummary={newFormServiceSummary}
                    sectionClassName="calendar-approved-booking__section calendar-approved-booking__service"
                    sectionCollapsible={compactAppointmentStructure}
                    sectionDefaultOpen
                    sectionAction={onlineSessionBookingEnabled ? (
                      <div className="cp-section__controls">
                        {form.online ? (
                          <div className="meeting-provider-summary meeting-provider-summary--service-inline calendar-booking-service-meeting-inline">
                            <span className="meeting-provider-summary__name">
                              {form.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}
                            </span>
                            <button
                              type="button"
                              className="secondary meeting-provider-change-btn"
                              onClick={() => {
                                setMeetingPickerCancelUnchecksOnline(false)
                                setMeetingProviderPickerTarget('create')
                                setMeetingProviderPickerOpen(true)
                              }}
                            >
                              {t('formChange')}
                            </button>
                          </div>
                        ) : null}
                        <div className="calendar-booking-service-online-line" role="group" aria-label={t('formSessionOnlineShort')}>
                          <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formSessionOnlineShort')}>
                            <input
                              type="checkbox"
                              checked={!!form.online}
                              aria-labelledby={addBookingOnlineCaptionId}
                              onChange={(e) => toggleNewBookingOnline(e.target.checked)}
                            />
                            <span className="repeats-toggle-slider" />
                          </label>
                          <span id={addBookingOnlineCaptionId} className="calendar-booking-service-online-caption">
                            {t('formSessionOnlineShort')}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    locale={locale}
                    services={formServiceDrafts}
                    segments={formServiceChain.segments}
                    sessionTypes={formSelectableMetaTypes}
                    spaces={formSpaces}
                    currency={currency}
                    totalSpanMinutes={formServiceChain.totalSpanMinutes}
                    totalGross={formServiceChain.totalGross}
                    clientCount={selectedFormClientIds.length}
                    warnings={formServiceWarnings}
                    onChange={updateBookingFormServices}
                    defaultSpaceId={form.spaceId ?? null}
                    multipleServicesEnabled={multipleServicesEnabled}
                    allowServiceEdit
                    consumablesEnabled={settings?.CONSUMABLES_ENABLED === 'true' && canViewConsumables}
                    canEditConsumables={canEditConsumables}
                    bookingId={null}
                    sessionConsumables={form.sessionConsumables}
                    resetSessionConsumablesToDefaults={form.resetSessionConsumablesToDefaults === true}
                    sessionConsumablesOverridden={Array.isArray(form.sessionConsumables)}
                    onSessionConsumablesChange={(rows, resetToDefaults) =>
                      setForm((current: any) => ({
                        ...current,
                        sessionConsumables: rows,
                        resetSessionConsumablesToDefaults: resetToDefaults,
                      }))
                    }
                  >
                    {compactAppointmentStructure ? newFormServiceExtraRows : null}
                  </CalendarServiceChainEditor>
              )}
              {showBookingTypeRow && form.online && !isNativeAndroid && (
                <div className="calendar-booking-mobile-meeting-row" role="group" aria-label={t('formMeeting')}>
                  <span className="calendar-booking-mobile-meeting-row__icon" aria-hidden>
                    <CalendarBookingMeetingIcon />
                  </span>
                  <div className="calendar-booking-mobile-meeting-row__value">
                    {form.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}
                  </div>
                  <button
                    type="button"
                    className="calendar-booking-mobile-meeting-row__edit"
                    aria-label={locale === 'sl' ? 'Spremeni spletni sestanek' : t('formChange')}
                    title={locale === 'sl' ? 'Spremeni spletni sestanek' : t('formChange')}
                    onClick={() => {
                      setMeetingPickerCancelUnchecksOnline(false)
                      setMeetingProviderPickerTarget('create')
                      setMeetingProviderPickerOpen(true)
                    }}
                  >
                    <CalendarBookingEditIcon />
                  </button>
                </div>
              )}
              {!showBookingTypeRow && compactAppointmentStructure && newFormServiceExtraRows && (
                <PanelSection
                  title={sectionLabels.service}
                  icon={<CalendarSectionIcon name="service" />}
                >
                  {newFormServiceExtraRows}
                </PanelSection>
              )}
              {!compactAppointmentStructure && showBookingConsultantRow && (
                <PanelSection
                  title={t('formConsultant')}
                  className="calendar-approved-booking__section calendar-approved-booking__employee"
                  icon={<CalendarSectionIcon name="clients" />}
                  collapsible={false}
                >
                  <div className="form-row form-row-infield calendar-booking-field--consultant">
                    <div className="form-field-inline-control">
                      <DesktopSelect
                        disabled={form.todo || form.personal}
                        value={form.consultantId ?? ''}
                        onChange={(e) => setForm({ ...form, consultantId: e.target.value === '' ? null : Number(e.target.value) })}
                      >
                        <option value="">{t('formUnassigned')}</option>
                        {formConsultants.map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                      </DesktopSelect>
                    </div>
                  </div>
                </PanelSection>
              )}
              {!compactAppointmentStructure && newFormShowSpaceRow && (
                <PanelSection
                  title={t('formCalendarBookingSpace')}
                  className="calendar-approved-booking__section calendar-approved-booking__space"
                  icon={<CalendarSectionIcon name="location" />}
                  collapsible={false}
                >
                  <div className="form-row form-row-infield calendar-booking-field--space">
                    <div className="form-field-inline-control">
                      <DesktopSelect
                        value={form.spaceId || ''}
                        onChange={(e) => {
                          const nextSpaceId = Number(e.target.value) || null
                          updateBookingFormServices(formServiceDrafts.map((service: any, index: number) => (
                            index === 0 ? { ...service, spaceId: nextSpaceId } : service
                          )))
                        }}
                      >
                        <option value="">{t('formNoSpace')}</option>
                        {formSpaces.map((space: any) => <option key={space.id} value={space.id}>{space.name}</option>)}
                      </DesktopSelect>
                    </div>
                  </div>
                </PanelSection>
              )}
              <PanelSection
                title={sectionLabels.schedule}
                className="calendar-approved-booking__section calendar-approved-booking__schedule"
                icon={<CalendarSectionIcon name="schedule" />}
                defaultOpen={!compactAppointmentStructure}
                collapsible={compactAppointmentStructure}
                summary={newFormScheduleSummary}
                action={!compactAppointmentStructure ? (
                  <div className="calendar-approved-booking__header-toggle" role="group" aria-label={t('formAllDay')}>
                    <span id={newBookingAllDayCaptionId} className="calendar-approved-booking__toggle-caption">{t('formAllDay')}</span>
                    <label className="repeats-toggle-switch calendar-approved-booking__toggle" title={t('formAllDay')}>
                      <input
                        type="checkbox"
                        checked={isLocalBookingAllDay(form.startTime, form.endTime)}
                        aria-labelledby={newBookingAllDayCaptionId}
                        onChange={toggleNewBookingAllDay}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                  </div>
                ) : undefined}
              >
              <div className="form-row form-row-timespan calendar-booking-timespan-row">
                <CalendarLocalTimespanRow
                  startValue={form.startTime}
                  endValue={form.endTime}
                  onCommitStart={(s) => updateBookingFormStartTime(s)}
                  onCommitEnd={(s) => updateBookingFormEndTime(s)}
                  endTimeLocked={!isLocalBookingAllDay(form.startTime, form.endTime) && formServiceDrafts.some((service: any) => service.typeId != null)}
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(form.startTime, form.endTime),
                    onToggle: toggleNewBookingAllDay,
                    label: t('formAllDay'),
                    captionId: compactAppointmentStructure ? newBookingAllDayCaptionId : `${newBookingAllDayCaptionId}-field`,
                  }}
                  onCommitAllDayDate={(ymd) => {
                    bookingEndEditedManuallyRef.current = true
                    setForm((f: any) => ({
                      ...f,
                      startTime: allDayRangeStartTime(ymd),
                      endTime: allDayRangeEndTime(ymd),
                    }))
                  }}
                  allDayDateRange={{
                    ...allDayDateRangeLabels,
                    onCommitRange: (startYmd, endYmd) => {
                      bookingEndEditedManuallyRef.current = true
                      setForm((f: any) => ({
                        ...f,
                        startTime: allDayRangeStartTime(startYmd),
                        endTime: allDayRangeEndTime(endYmd),
                      }))
                    },
                  }}
                />
              </div>
              {compactAppointmentStructure ? renderNewBookingRepeats(true) : null}
              </PanelSection>
              {!compactAppointmentStructure && (
                <PanelSection
                  title={sectionLabels.repeats}
                  className={`calendar-approved-booking__section calendar-approved-booking__repeat${form.repeats ? ' calendar-approved-booking__repeat--active' : ''}`}
                  icon={<CalendarSectionIcon name="repeat" />}
                  collapsible={false}
                  action={
                    <label className="repeats-toggle-switch calendar-approved-booking__toggle" title={sectionLabels.repeats}>
                      <input
                        type="checkbox"
                        checked={!!form.repeats}
                        aria-label={sectionLabels.repeats}
                        onChange={(e) => toggleNewBookingRepeats(e.target.checked)}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                  }
                >
                  {form.repeats ? renderNewBookingRepeats(false) : null}
                </PanelSection>
              )}
              {isNativeAndroid ? (
                <>
                <PanelSection
                  title={t('formOptions')}
                  icon={<CalendarSectionIcon name="location" />}
                  defaultOpen={false}
                  summary={joinSummary(
                    form.todo ? t('formTodo') : null,
                    form.personal ? t('formPersonal') : null,
                    form.online ? t('formOnline') : null,
                  )}
                >
                  <div className="form-row form-row-infield book-session-flags-row">
                    <span className="form-field-inline-label">{t('formOptions')}</span>
                    <div className="form-field-inline-control">
                    <div className="checkbox-row book-session-checkbox-row">
                      {todosModuleEnabled && <label><input type="checkbox" checked={!!form.todo} onChange={(e) => setForm({ ...form, todo: e.target.checked, personal: false, online: false, consultantId: e.target.checked ? user.id : form.consultantId })} /> {t('formTodo')}</label>}
                      {personalModuleEnabled && <label><input type="checkbox" checked={!!form.personal} onChange={(e) => setForm({ ...form, personal: e.target.checked, todo: false, consultantId: e.target.checked ? user.id : form.consultantId })} disabled={!!form.todo} /> {t('formPersonal')}</label>}
                      {onlineSessionBookingEnabled && <label><input type="checkbox" checked={!!form.online} onChange={(e) => { const on = e.target.checked; if (on) { setForm({ ...form, online: true }); setMeetingPickerCancelUnchecksOnline(true); setMeetingProviderPickerTarget('create'); setMeetingProviderPickerOpen(true) } else { setForm({ ...form, online: false }); setMeetingProviderPickerOpen(false); setMeetingProviderPickerTarget(null); setMeetingPickerCancelUnchecksOnline(false) } }} disabled={!!form.personal || !!form.todo} /> {t('formOnline')}</label>}
                    </div>
                    </div>
                  </div>
                  {form.online && (
                    <div className="form-row form-row-infield">
                      <span className="form-field-inline-label">{t('formMeeting')}</span>
                      <div className="form-field-inline-control">
                      <div className="meeting-provider-summary">
                        <span>{form.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}</span>
                        <button
                          type="button"
                          className="secondary meeting-provider-change-btn"
                          onClick={() => {
                            setMeetingPickerCancelUnchecksOnline(false)
                            setMeetingProviderPickerTarget('create')
                            setMeetingProviderPickerOpen(true)
                          }}
                        >
                          {t('formChange')}
                        </button>
                      </div>
                      </div>
                    </div>
                  )}
                </PanelSection>
                <PanelSection
                  title={sectionLabels.notes}
                  icon={<CalendarSectionIcon name="notes" />}
                  defaultOpen={false}
                  summary={newFormNotesSummary}
                >
                  <div className="form-row form-row-infield stretch book-session-notes-android">
                    <div className="form-field-inline-control">
                    <div className="book-session-notes-android-wrap">
                      <button
                        type="button"
                        className="secondary book-session-notes-toggle"
                        aria-expanded={bookSessionNotesExpanded}
                        aria-label={bookSessionNotesExpanded ? t('formHideNotes') : t('formAddNotes')}
                        onClick={() => setBookSessionNotesExpanded((v) => !v)}
                      >
                        {bookSessionNotesExpanded ? '−' : '+'}
                      </button>
                      {bookSessionNotesExpanded && (
                        <SessionNotesTextarea
                          className="book-session-notes-textarea"
                          value={form.notes || ''}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />
                      )}
                    </div>
                    </div>
                  </div>
                </PanelSection>
                </>
              ) : (
                <PanelSection
                  title={sectionLabels.notes}
                  className={`calendar-approved-booking__section calendar-approved-booking__notes${newBookingMobileNotesOpen ? ' is-mobile-open' : ''}`}
                  icon={<CalendarSectionIcon name="notes" />}
                  defaultOpen
                  collapsible={false}
                  summary={newFormNotesSummary}
                >
                  <div className="form-row form-row-infield stretch">
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </PanelSection>
              )}
                </>
              )}
          </PanelBody>
          {activeNewFormPanel === 'booking' && availabilitySelection == null && !isNativeAndroid && !calendarFormKeyboardOpen && (
            <div className="calendar-booking-mobile-actionbar">
              <div className="calendar-booking-mobile-quick-options" aria-label={locale === 'sl' ? 'Možnosti termina' : 'Appointment options'}>
                <button
                  type="button"
                  className={`calendar-booking-mobile-quick-option${isLocalBookingAllDay(form.startTime, form.endTime) ? ' is-active' : ''}`}
                  aria-pressed={isLocalBookingAllDay(form.startTime, form.endTime)}
                  aria-label={locale === 'sl' ? 'Cel dan' : t('formAllDay')}
                  onClick={() => {
                    toggleNewBookingAllDay()
                    scrollNewBookingMobileSectionIntoView('.calendar-approved-booking__schedule')
                  }}
                >
                  <span className="calendar-booking-mobile-quick-option__icon"><CalendarBookingQuickOptionIcon name="allDay" /></span>
                  <span className="calendar-booking-mobile-quick-option__label">{locale === 'sl' ? 'Cel dan' : t('formAllDay')}</span>
                </button>
                <button
                  type="button"
                  className={`calendar-booking-mobile-quick-option${form.repeats ? ' is-active' : ''}`}
                  aria-pressed={!!form.repeats}
                  aria-label={locale === 'sl' ? 'Ponavljanje' : t('formRepeats')}
                  onClick={() => {
                    const next = !form.repeats
                    toggleNewBookingRepeats(next)
                    scrollNewBookingMobileSectionIntoView(
                      next ? '.calendar-approved-booking__repeat' : '.calendar-approved-booking__schedule',
                      '.calendar-approved-booking__schedule',
                    )
                  }}
                >
                  <span className="calendar-booking-mobile-quick-option__icon"><CalendarBookingQuickOptionIcon name="repeat" /></span>
                  <span className="calendar-booking-mobile-quick-option__label">{locale === 'sl' ? 'Ponavljanje' : t('formRepeats')}</span>
                </button>
                {onlineSessionBookingEnabled && (
                  <button
                    type="button"
                    className={`calendar-booking-mobile-quick-option${form.online ? ' is-active' : ''}`}
                    aria-pressed={!!form.online}
                    aria-label={locale === 'sl' ? 'Spletni' : 'Online'}
                    onClick={() => {
                      toggleNewBookingOnline()
                      scrollNewBookingMobileSectionIntoView('.calendar-booking-mobile-meeting-row', '.calendar-approved-booking__service')
                    }}
                  >
                    <span className="calendar-booking-mobile-quick-option__icon"><CalendarBookingQuickOptionIcon name="online" /></span>
                    <span className="calendar-booking-mobile-quick-option__label">{locale === 'sl' ? 'Spletni' : 'Online'}</span>
                  </button>
                )}
                {groupBookingEnabled && (
                  <button
                    type="button"
                    className={`calendar-booking-mobile-quick-option${bookingGroupMode ? ' is-active' : ''}`}
                    aria-pressed={bookingGroupMode}
                    aria-label={locale === 'sl' ? 'Skupinski' : 'Group'}
                    onClick={() => {
                      toggleNewBookingGroupMode()
                      scrollNewBookingMobileSectionIntoView('.calendar-approved-booking__clients')
                    }}
                  >
                    <span className="calendar-booking-mobile-quick-option__icon"><CalendarBookingQuickOptionIcon name="group" /></span>
                    <span className="calendar-booking-mobile-quick-option__label">{locale === 'sl' ? 'Skupinski' : locale === 'sr' ? 'Grupno' : 'Group'}</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`calendar-booking-mobile-quick-option${newBookingMobileNotesOpen ? ' is-active' : ''}`}
                  aria-pressed={newBookingMobileNotesOpen}
                  aria-label={locale === 'sl' ? 'Opombe' : t('formNotes')}
                  onClick={() => {
                    const next = !newBookingMobileNotesOpen
                    setNewBookingMobileNotesOpen(next)
                    if (next) scrollNewBookingMobileSectionIntoView('.calendar-approved-booking__notes')
                  }}
                >
                  <span className="calendar-booking-mobile-quick-option__icon"><CalendarBookingQuickOptionIcon name="notes" /></span>
                  <span className="calendar-booking-mobile-quick-option__label">{locale === 'sl' ? 'Opombe' : t('formNotes')}</span>
                </button>
              </div>
            </div>
          )}
          <PanelFooter>
            <PanelButton variant="ghost" onClick={closeBookingSelection}>
              {t('formCancel')}
            </PanelButton>
            {availabilitySelection != null ? (
              <PanelButton
                variant="primary"
                busy={availabilitySaving}
                onClick={() => void confirmAvailabilityFromHeader()}
                icon={<CalendarFormFooterSaveIcon />}
              >
                {availabilitySaving
                  ? t('formSaving')
                  : availabilityIntent === 'block'
                    ? t('formBlockAvailabilityShort')
                    : availabilitySelection.slotId
                      ? t('formSaveChanges')
                      : t('formAvailabilityOpenShort')}
              </PanelButton>
            ) : (
              <PanelButton
                variant="primary"
                busy={saveBookingLoading}
                onClick={() => void saveBooking(false)}
                icon={<CalendarFormFooterSaveIcon />}
              >
                {saveBookingLoading ? t('formSaving') : form.todo ? t('formAddTodo') : form.personal ? t('formAddBlock') : t('formBookSession')}
              </PanelButton>
            )}
          </PanelFooter>
        </SidePanel>
      )}
      <ConfirmDialog
        open={Boolean(meetingProviderPickerOpen && (selection || selectedBookedSession))}
        onClose={dismissMeetingProviderPicker}
        title={locale === 'sl' ? 'Izberi sestanek' : 'Choose meeting'}
        text="Google Meet / Zoom"
        confirmLabel="Zoom"
        showCloseButton
        closeLabel={t('mobileNavClose')}
        onConfirm={() => pickMeetingProvider('zoom')}
        extraActions={
          <PanelButton variant="subtle" onClick={() => pickMeetingProvider('google')}>
            Google Meet
          </PanelButton>
        }
      />

      {androidLanguageModal && <LanguageModal onClose={() => setAndroidLanguageModal(false)} />}

      <SidePanel
        open={showAddGroupModal}
        onClose={closeCalendarAddGroupModal}
        ariaLabel={locale === 'sl' ? 'Nova skupina' : 'New group'}
        size="lg"
        className="clients-standard-entity-panel clients-standard-group-panel clients-standard-entity-panel--create"
      >
        {!useResponsiveDesktopCreatePanels ? (
          <form
            className="clients-create-modal-form clients-simple-create-form"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault()
              if (!calendarCreateGroupDisabled) void createGroupFromBooking()
            }}
          >
            <div className="clients-simple-create-header">
              <button
                type="button"
                className="clients-simple-create-close"
                onClick={closeCalendarAddGroupModal}
                aria-label={t('mobileNavClose')}
              >
                ×
              </button>
              <h2>{locale === 'sl' ? 'Nova skupina' : 'New group'}</h2>
            </div>
            <div className="clients-simple-create-body">
              <div className="clients-detail-shell clients-create-shell clients-simple-create-shell">
                <div className="clients-detail-fields clients-create-fields clients-simple-create-fields">
                  <label className="clients-detail-field-card clients-create-field clients-detail-field-card--wide">
                    <span>{locale === 'sl' ? 'Ime skupine' : 'Group name'} *</span>
                    <input
                      required
                      autoFocus
                      placeholder={locale === 'sl' ? 'Ime skupine *' : 'Group name *'}
                      value={newGroupForm.name}
                      onChange={(e) => setNewGroupForm((current: any) => ({ ...current, name: e.target.value }))}
                    />
                  </label>
                  <label className="clients-detail-field-card clients-create-field clients-detail-field-card--wide">
                    <span>{locale === 'sl' ? 'E-pošta skupine' : 'Group email'}</span>
                    <input
                      type="email"
                      inputMode="email"
                      placeholder={locale === 'sl' ? 'E-pošta skupine' : 'Group email'}
                      value={newGroupForm.email}
                      onChange={(e) => setNewGroupForm((current: any) => ({ ...current, email: e.target.value }))}
                    />
                  </label>
                </div>
                {groupModalError && <div className="error">{groupModalError}</div>}
                <button
                  type="submit"
                  className="clients-gapp-save-button clients-simple-create-submit"
                  disabled={calendarCreateGroupDisabled}
                >
                  {savingNewGroupModal ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : calendarCreateGroupLabel}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <>
            <PanelHeader
              title={locale === 'sl' ? 'Nova skupina' : 'New group'}
              onClose={closeCalendarAddGroupModal}
              closeLabel={t('mobileNavClose')}
            />
            <PanelBody
              as="form"
              id="calendar-new-group-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!calendarCreateGroupDisabled) void createGroupFromBooking()
              }}
            >
              <section className="clients-standard-entity-profile clients-standard-group-profile">
                <h3><CalendarGroupFormIcon /><span>{locale === 'sl' ? 'Podatki o skupini' : 'Group details'}</span></h3>
                <div className="clients-standard-entity-grid clients-standard-group-grid">
                  <label className="clients-standard-entity-field clients-standard-entity-field--wide">
                    <span>{locale === 'sl' ? 'Ime skupine' : 'Group name'} *</span>
                    <input
                      required
                      autoFocus
                      placeholder={locale === 'sl' ? 'Ime skupine' : 'Group name'}
                      value={newGroupForm.name}
                      onChange={(e) => setNewGroupForm((current: any) => ({ ...current, name: e.target.value }))}
                    />
                  </label>
                  <label className="clients-standard-entity-field clients-standard-entity-field--wide">
                    <span>{locale === 'sl' ? 'E-pošta skupine' : 'Group email'}</span>
                    <input
                      type="email"
                      placeholder={locale === 'sl' ? 'E-pošta skupine' : 'Group email'}
                      value={newGroupForm.email}
                      onChange={(e) => setNewGroupForm((current: any) => ({ ...current, email: e.target.value }))}
                    />
                  </label>
                </div>
              </section>
              {groupModalError && <div className="error">{groupModalError}</div>}
            </PanelBody>
            {!calendarCreateKeyboardOpen ? (
              <PanelFooter>
                <PanelButton
                  type="submit"
                  form="calendar-new-group-form"
                  variant="primary"
                  icon={<GuestConfigSaveIcon />}
                  disabled={calendarCreateGroupDisabled}
                >
                  {savingNewGroupModal ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : calendarCreateGroupLabel}
                </PanelButton>
              </PanelFooter>
            ) : null}
          </>
        )}
      </SidePanel>

      <SidePanel
        open={showAddClientModal}
        onClose={closeCalendarAddClientModal}
        ariaLabel={locale === 'sl' ? 'Nova stranka' : 'New client'}
        size="lg"
        className="clients-standard-customer-panel clients-standard-customer-panel--create"
      >
        {!useResponsiveDesktopCreatePanels ? (
          <SimpleClientCreatePage
            title={locale === 'sl' ? 'Nova stranka' : 'New client'}
            closeLabel={t('mobileNavClose')}
            submitLabel={calendarCreateClientLabel}
            savingLabel={locale === 'sl' ? 'Shranjujem…' : 'Saving…'}
            draft={newClientForm}
            labels={{
              firstName: locale === 'sl' ? 'Ime' : 'First name',
              lastName: locale === 'sl' ? 'Priimek' : 'Last name',
              email: locale === 'sl' ? 'E-pošta' : 'Email',
              phone: locale === 'sl' ? 'Telefon' : 'Phone',
            }}
            saving={savingClient}
            submitDisabled={calendarCreateClientDisabled}
            keyboardOpen={calendarCreateKeyboardOpen}
            error={clientError}
            inputNamePrefix="calendra-calendar-new-client"
            onClose={closeCalendarAddClientModal}
            onChange={(field, value) => setNewClientForm((current: any) => ({ ...current, [field]: value }))}
            onSubmit={(event) => {
              event.preventDefault()
              if (!calendarCreateClientDisabled) void createClientFromBooking()
            }}
          />
        ) : (
          <>
            <PanelHeader
              title={locale === 'sl' ? 'Nova stranka' : 'New client'}
              subtitle={locale === 'sl' ? 'Dodaj novega uporabnika (stranko)' : 'Add a new customer'}
              onClose={closeCalendarAddClientModal}
              closeLabel={t('mobileNavClose')}
            />
            <PanelBody
              as="form"
              id="calendar-new-client-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!calendarCreateClientDisabled) void createClientFromBooking()
              }}
            >
              <div className="clients-standard-customer-profile">
                <section className="clients-standard-customer-section clients-standard-customer-section--person">
                  <h3>
                    <CalendarClientProfileSectionIcon name="person" />
                    <span>{locale === 'sl' ? 'Osebni podatki' : 'Personal details'}</span>
                  </h3>
                  <div className="clients-standard-profile-grid">
                    {renderCalendarNewClientEditableField('firstName', locale === 'sl' ? 'Ime' : 'First name')}
                    {renderCalendarNewClientEditableField('lastName', locale === 'sl' ? 'Priimek' : 'Last name')}
                  </div>
                </section>
                <section className="clients-standard-customer-section">
                  <h3>
                    <CalendarClientProfileSectionIcon name="email" />
                    <span>{locale === 'sl' ? 'E-pošta' : 'Email'}</span>
                  </h3>
                  {renderCalendarNewClientEditableField('email', locale === 'sl' ? 'E-pošta' : 'Email', true, 'email')}
                </section>
                <section className="clients-standard-customer-section">
                  <h3>
                    <CalendarClientProfileSectionIcon name="phone" />
                    <span>{locale === 'sl' ? 'Telefon' : 'Phone'}</span>
                  </h3>
                  {renderCalendarNewClientEditableField('phone', locale === 'sl' ? 'Telefon' : 'Phone', true, 'tel')}
                </section>
              </div>
              {clientError && <div className="error">{clientError}</div>}
            </PanelBody>
            {!calendarCreateKeyboardOpen ? (
              <PanelFooter>
                <PanelButton
                  type="submit"
                  form="calendar-new-client-form"
                  variant="primary"
                  icon={<GuestConfigSaveIcon />}
                  disabled={calendarCreateClientDisabled}
                >
                  {savingClient ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : calendarCreateClientLabel}
                </PanelButton>
              </PanelFooter>
            ) : null}
          </>
        )}
      </SidePanel>


    </>
  )
}
