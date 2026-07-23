// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import { createPortal } from 'react-dom'
import { api } from '../../../api'
import { bookingStatusDisplayLabel, deriveBookingStatus } from '../calendarStatus'
export function CalendarSessionModals({ ctx }: { ctx: any }) {
  const {BookingTypeTabIcon,CalendarFormFooterDeleteIcon,CalendarFormFooterSaveIcon,CalendarLocalTimeDateRow,CalendarLocalTimespanRow,CalendarPaymentCompanyIcon,CalendarPaymentPersonIcon,CalendarScannerIcon,GuestConfigSaveIcon,LanguageModal,PageHeader,PersonalTaskCombo,REPEAT_WEEKDAY_EN,ROUTE_NEW_BOOKING,SessionNotesTextarea,activateNewFormPanel,addBookingGroupCaptionId,addBookingOnlineCaptionId,addClientInlineTitle,addGroupInlineTitle,androidLanguageModal,applyBookedSessionClientIds,applyFormClientIds,availabilityAllDayCaptionId,availabilityError,availabilityIntent,availabilityRangeEndInputRef,availabilityRangeStartInputRef,availabilitySaving,availabilitySelection,bookSessionClientFieldCompact,bookSessionClientsExpanded,bookSessionGroupFieldCompact,bookSessionNotesExpanded,bookSessionSelectedClient,bookSessionSelectedClients,bookedClientDropdownOpen,bookedClientSearch,bookedClientSearchInputRef,bookedPaymentClientDisplay,bookedPaymentManagerTab,bookedPaymentMenuOpen,bookedPaymentMeta,bookedPaymentPayeeDisplay,bookedPaymentPayeeDrafts,bookedPaymentPayeesUseSameCompanyForAll,bookedPaymentSidebarStatusMeta,bookedPaymentTotals,bookedPrimaryPaymentStatus,bookedSessionClientFieldCompact,bookedSessionClientsExpanded,bookedSessionGroupId,bookedSessionIsGroup,bookedSessionOnlineCaptionId,bookedSessionResolvedGroup,bookedSessionSelectedClient,bookedSessionSelectedClients,bookedStatusLabel,bookedStatusMenuOpen,bookedStatusTagColors,bookedStatusTransitionTargets,bookingEndEditedManuallyRef,bookingGroupMode,bookingPayeeCompanies,bookingStatusTagColors,calendarClientDetailId,calendarFiltersBottomBar,cancelBookedPersonalOverlap,cancelNonBookableMove,clearSingleGroupTitle,clientDropdownOpen,clientError,clientSearch,clientSearchInputRef,clientSearchPlaceholder,closeBookedModal,closeBookingSelection,closePersonalModal,closeTodoModal,compactSelectionCheckAria,compactSelectionHeader,compactSessionEditHeader,confirmAvailabilityFromHeader,confirmBookedPersonalOverlap,confirmBookedPersonalOverlapYes,confirmDelete,confirmNonBookable,confirmNonBookableMove,confirmNonBookableMoveYes,confirmNonBookableYes,confirmOverlap,createClientFromBooking,createGroupFromBooking,createOpenBillForPaymentStatus,currency,deleteBookedSession,deletePersonalBlock,deleteTodo,editBookedAllDayCaptionId,form,formatDateTime,formatRepeatWeekdayLabel,fullName,getBookingEndTimeForStart,getMoreClientsLabel,getSessionPopupDragHandleProps,getSessionPopupInlineStyle,groupBookingEnabled,groupDropdownOpen,groupModalError,groupSearch,groupSearchInputRef,groupSearchPlaceholder,groupedSingleInvoiceClient,groupedSingleInvoicePayeeDraft,groupedSingleInvoiceStatus,hiddenBookSessionClientCount,hiddenBookedSessionClientCount,invoiceAllocationForPaymentStatus,isGroupedSingleInvoiceMode,isLocalBookingAllDay,isLocalTodoAllDayStart,isNativeAndroid,localTodayYmd,locale,meetingPickerCancelUnchecksOnline,meetingProviderPickerOpen,meetingProviderPickerTarget,metaClients,metaConsultants,metaSpaces,metaTypes,metaUsers,multipleClientsPerSessionEnabled,newBookingAllDayCaptionId,newClientForm,newClientInitials,newGroupForm,newGroupMemberIds,newGroupMemberSearch,normalizeToLocalDateTime,onNewFormPanelTouchEnd,onNewFormPanelTouchStart,openAvailabilityModalFromSelection,openBookedPaymentAddClient,openBookedPaymentDetailsForClient,openBookedSessionGroupScanner,openBookedPaymentEntitlementScanner,openPaymentInvoicePdf,openBookedPaymentOpenBillEditor,openBookedPaymentAdvanceEditor,openCalendarClientDetail,openCalendarGroupDetail,parseClientNameInput,paymentManagerIsNewBooking,paymentManagerSessionClients,paymentStatusForClient,personInitials,personalEditAllDayCaptionId,personalFormAllDayCaptionId,personalModuleEnabled,personalTaskPresetDropdownOpen,personalTaskPresets,renderBookingModeTitle,resendPaymentInvoicePdf,saveBookedPaymentManager,saveBooking,saveBookingError,saveBookingLoading,savingClient,savingNewGroupModal,selectableMetaTypes,selectedBookedClientIds,selectedBookedPaymentClient,selectedBookedPaymentClientDraft,selectedBookedPaymentLinkedCompany,selectedBookedPaymentPayeeDraft,selectedBookedPaymentPayeeLocked,selectedBookedPaymentClientIsGroupMember,selectedBookedPaymentStatus,selectedBookedSession,selectedFormClientIds,selectedGroup,selectedPersonalBlock,selectedTodo,selection,sessionPopupRef,setAndroidLanguageModal,setAvailabilityError,setAvailabilityIntent,setAvailabilitySelection,setBookSessionClientsExpanded,setBookSessionNotesExpanded,setBookedClientDropdownOpen,setBookedClientSearch,setBookedPaymentAddMode,setBookedPaymentAddSearch,setBookedPaymentGroupNameDraft,setBookedPaymentManagerTab,setBookedPaymentMenuOpen,setBookedSessionClientsExpanded,setBookedStatusMenuOpen,setBookedPaymentSharedCompanyForAll,setBookingGroupMode,setClientDropdownOpen,setClientSearch,setConfirmDelete,setConfirmNonBookable,setConfirmOverlap,setEditingBookedClientSearch,setEditingClientSearch,setEditingGroupSearch,setForm,setGroupDropdownOpen,setGroupModalError,setGroupSearch,setMeetingPickerCancelUnchecksOnline,setMeetingProviderPickerOpen,setMeetingProviderPickerTarget,setNewClientForm,setNewGroupForm,setNewGroupMemberIds,setNewGroupMemberSearch,setPersonalTaskPresetDropdownOpen,setSaveBookingError,setSelectedBookedPaymentClientId,setSelectedBookedSession,setSelectedPersonalBlock,setSelectedTodo,setShowAddClientModal,setShowAddGroupModal,settings,showAddClientModal,showAddGroupModal,showBookingConsultantRow,showBookingSpaceRow,showBookingTypeRow,showLessClientsLabel,showSelectionFormFooter,splitLocalDateTimeParts,t,toCalendarTimeValue,todoEditAllDayCaptionId,todoFormAllDayCaptionId,todosModuleEnabled,toggleBookedPaymentSameCompanyForAll,markBookedClientsNoShow,transitionBookedStatus,updateBookedSession,updateBookingFormEndTime,updateBookingFormStartTime,updateBookingFormType,updatePersonalBlock,updateSelectedBookedPaymentClientDraft,updateSelectedBookedPaymentPayee,updateTodo,useBookingSidePanel,user,showToast,loadCalendarRangeOnly,visibleBookSessionClientChips,visibleBookedClients,visibleBookedSessionClientChips,visibleClients,visibleGroups,bookedPaymentAddCandidates,bookedPaymentAddMode,bookedPaymentAddSearch,paymentManagerAddClientSelectionActive,PAYMENT_MANAGER_ADD_CLIENT_ID,addBookedPaymentClientToSession,removeBookedPaymentClientFromGroup,removeBookedPaymentClientFromSession,bookedPaymentGroupNameDraft} = ctx

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
  const [calendarNewClientEditField, setCalendarNewClientEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | null>('firstName')
  const [newSlotWaitlistMatches, setNewSlotWaitlistMatches] = useState<any>(null)
  const [newSlotWaitlistLoading, setNewSlotWaitlistLoading] = useState(false)
  const [newSlotWaitlistOpen, setNewSlotWaitlistOpen] = useState(false)
  const [mobileBookingDetailsOpen, setMobileBookingDetailsOpen] = useState(false)
  const [releasedSlotWaitlistPrompt, setReleasedSlotWaitlistPrompt] = useState<any>(null)
  const [releasedSlotWaitlistLoading, setReleasedSlotWaitlistLoading] = useState(false)
  const bookedEntitlementVideoRef = useRef<HTMLVideoElement | null>(null)
  const bookedEntitlementScannerControlsRef = useRef<any>(null)
  const bookedEntitlementQrReaderRef = useRef<any>(null)
  const bookedEntitlementScanningLockRef = useRef(false)
  const bookedEntitlementWalletRequestRef = useRef(0)
  const onlineSessionBookingEnabled = settings?.ONLINE_SESSION_BOOKING_ENABLED !== 'false'
  const waitlistModuleEnabled = settings?.WAITLIST_ENABLED !== 'false'
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
  const bookedSessionSelectableMetaTypes = bookedSessionIsGroup
    ? metaTypes.filter((type: any) => type?.active !== false && type?.groupBookingEnabled === true)
    : metaTypes
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

  useEffect(() => {
    setMobileBookingDetailsOpen(false)
  }, [selectedBookedSession?.id, compactSessionEditHeader])

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

  const pullFirstWaitlistedGuestIntoBooking = (candidate?: any) => {
    if (!waitlistModuleEnabled) return
    const first = candidate || visibleNewSlotWaitlistMatches?.first
    const clientId = Number(first?.clientId)
    const requestId = Number(first?.requestId)
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(requestId) || requestId <= 0) return
    const confirmed = window.confirm(locale === 'sl'
      ? `Dodam stranko ${first.clientName} neposredno v ta termin? Rezervacija bo ustvarjena brez čakanja na potrditev ponudbe.`
      : `Add ${first.clientName} directly to this session? The booking will be created without waiting for offer acceptance.`)
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


  const openBookedInvoiceEditor = async () => {
    if (!canShowOpenBillForBookedStatus) {
      openBookedAdvanceForm()
      return
    }
    const clientId = getBookedPaymentActionClientId()
    if (!clientId) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    setSelectedBookedPaymentClientId(clientId)
    const status = paymentStatusForClient(clientId)
    const openBillIdRaw = Number(status?.openBillId ?? 0)
    const shouldSyncPerClientBillTabs = !isGroupedSingleInvoiceMode
      && selectedBookedSession?.type?.priceCalculationMode !== 'TOTAL'
      && paymentManagerSessionClients.length > 1
    if (Number.isInteger(openBillIdRaw) && openBillIdRaw > 0 && !shouldSyncPerClientBillTabs) {
      openPaymentOpenBillEditor(status, openBillIdRaw)
      return
    }
    if (status?.status === 'UNPAID' || shouldSyncPerClientBillTabs) {
      const openBillId = await createOpenBillForPaymentStatus(status)
      if (openBillId || openBillIdRaw) openPaymentOpenBillEditor(status, openBillId || openBillIdRaw)
      return
    }
    showToast('info', locale === 'sl' ? 'Odprti račun lahko ustvarite le pri neplačanem terminu.' : 'Open invoice can only be created for unpaid sessions.')
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

  useEffect(() => {
    if (showAddClientModal) {
      setCalendarNewClientEditField('firstName')
    }
  }, [showAddClientModal])

  const closeCalendarAddClientModal = () => {
    setShowAddClientModal(false)
    setCalendarNewClientEditField('firstName')
  }

  const calendarNewClientDisplayName = [newClientForm.firstName, newClientForm.lastName]
    .filter((value: string) => String(value ?? '').trim())
    .join(' ')
    .trim() || (locale === 'sl' ? 'Nova stranka' : 'New client')
  const calendarNewClientActiveLabel = locale === 'sl' ? 'Aktivna' : 'Active'
  const calendarCreateClientLabel = locale === 'sl' ? 'Ustvari stranko' : 'Create client'
  const calendarCreateClientDisabled = savingClient || !String(newClientForm.firstName ?? '').trim() || !String(newClientForm.lastName ?? '').trim()

  const renderCalendarNewClientEditableField = (
    key: 'firstName' | 'lastName' | 'email' | 'phone',
    label: string,
    wide = false,
    inputType: 'text' | 'email' | 'tel' = 'text',
  ) => {
    const isEditing = calendarNewClientEditField === key
    return (
      <div
        className={`clients-detail-field-card${wide ? ' clients-detail-field-card--wide' : ''}${isEditing ? ' clients-detail-field-card--editing' : ''}`}
        onClick={() => {
          if (calendarNewClientEditField !== key) setCalendarNewClientEditField(key)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (calendarNewClientEditField === key) return
          e.preventDefault()
          setCalendarNewClientEditField(key)
        }}
      >
        <span>{label}</span>
        {!isEditing ? (
          <strong>{(newClientForm[key] ?? '').trim() || '—'}</strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
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
              onChange={(e) => setNewClientForm({ ...newClientForm, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (key === 'firstName') setCalendarNewClientEditField('lastName')
                  else if (key === 'lastName') setCalendarNewClientEditField('email')
                  else if (key === 'email') setCalendarNewClientEditField('phone')
                  else setCalendarNewClientEditField(null)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setCalendarNewClientEditField(null)
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const bookedEntitlementErrorMessage = (result?: string | null, message?: string | null) => {
    if (message) return message
    if (result === 'INVALID_CODE') return locale === 'sl' ? 'Koda ugodnosti ni veljavna.' : 'The entitlement code is invalid.'
    if (result === 'EXPIRED') return locale === 'sl' ? 'Ugodnost je potekla.' : 'The entitlement has expired.'
    if (result === 'NO_VISITS_REMAINING') return locale === 'sl' ? 'Ugodnost nima več preostalih obiskov.' : 'No visits remain on this entitlement.'
    if (result === 'DUPLICATE_SCAN') return locale === 'sl' ? 'Ta ugodnost je bila pravkar uporabljena.' : 'This entitlement was just used.'
    if (result === 'UNSUPPORTED_PAYMENT_ENTITLEMENT') return locale === 'sl' ? 'Za plačilo lahko uporabite samo vstopnice in pakete.' : 'Only tickets and packs can be used for payment.'
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
      return 'Ugodnost'
    }
    if (option?.entitlementType === 'PACK') return 'Pack'
    if (option?.entitlementType === 'TICKET') return 'Ticket'
    return 'Entitlement'
  }

  const bookedEntitlementWalletRemainingLabel = (option: any) => {
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
        setBookedEntitlementScanResult({
          tone: 'success',
          text: locale === 'sl' ? 'Ugodnost je uporabljena kot plačilo.' : 'Entitlement applied as payment.',
          detail,
        })
        if (typeof showToast === 'function') showToast('success', locale === 'sl' ? 'Ugodnost je uporabljena kot plačilo.' : 'Entitlement applied as payment.')
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
  const canShowOpenBillForBookedStatus = currentBookingStatusKey === 'ONGOING' || currentBookingStatusKey === 'CHECKED_OUT'
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
  const visibleBillStatusKeys = new Set(['PAID', 'PAYMENT_PENDING'])

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
  const bookedBillingHasExistingOpenBill = (Array.isArray(selectedBookedSession?.paymentStatuses) ? selectedBookedSession.paymentStatuses : [])
    .some((status: any) => Number(status?.openBillId ?? 0) > 0)
  const bookedBillingHasInvoiceViewRows = sessionInvoiceRows.length > 0

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
  const sessionViewServiceName = sessionForBillingSummary?.type?.name || sessionForBillingSummary?.typeName || (locale === 'sl' ? 'Termin' : 'Session')
  const sessionViewDate = formatSessionDate(sessionForBillingSummary?.startTime)
  const sessionViewTime = buildSessionViewTimeRange(sessionForBillingSummary)
  const sessionViewLocation = sessionForBillingSummary?.space?.name || '—'
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
          <button type="button" role="menuitem" onClick={() => void openBookedInvoiceEditor()}>
            <span aria-hidden>✎</span>
            {locale === 'sl' ? 'Uredi' : 'Edit'}
          </button>
          {(bookedBillingHasExistingOpenBill || bookedBillingHasInvoiceViewRows) && (
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
    const emptyText = isAdvances
      ? (locale === 'sl' ? 'Za ta termin ni plačanih predplačil ali predplačil, ki čakajo na plačilo.' : 'No paid or payment-pending advances for this session yet.')
      : (locale === 'sl' ? 'Za ta termin ni plačanih računov ali računov, ki čakajo na plačilo.' : 'No paid or payment-pending invoices for this session.')
    const numberLabel = isAdvances ? (locale === 'sl' ? 'Predplačilo št.' : 'Advance no.') : (locale === 'sl' ? 'Račun št.' : 'Invoice no.')
    const payerTitle = locale === 'sl' ? 'Plačnik' : 'Payer'
    const amountTitle = locale === 'sl' ? 'Znesek' : 'Amount'
    const dateTitle = isAdvances ? (locale === 'sl' ? 'Datum plačila' : 'Paid date') : (locale === 'sl' ? 'Datum' : 'Date')
    const paymentMethodTitle = locale === 'sl' ? 'Način plačila' : 'Payment method'
    const statusTitle = locale === 'sl' ? 'Status' : 'Status'
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
            <div><small>{locale === 'sl' ? 'Storitev' : 'Service'}</small><strong>{sessionViewServiceName}</strong></div>
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
                {rows.map((row: any) => {
                  const paid = row.statusKey === 'PAID'
                  const statusLabel = paid
                    ? (locale === 'sl' ? 'Plačano' : 'Paid')
                    : (locale === 'sl' ? 'Čaka na plačilo' : 'Payment pending')
                  const payerLabel = Array.from(row.payerNames || []).join(', ') || '—'
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
                })}
                <div className="calendar-session-billing-view-mobile-list" aria-hidden>
                  {rows.map((row: any) => {
                    const paid = row.statusKey === 'PAID'
                    const statusLabel = paid
                      ? (locale === 'sl' ? 'Plačano' : 'Paid')
                      : (locale === 'sl' ? 'Čaka na plačilo' : 'Payment pending')
                    const payerLabel = Array.from(row.payerNames || []).join(', ') || '—'
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
                  })}
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
      {confirmOverlap && (
        <div className="modal-backdrop calendar-booking-supplement" onClick={() => { setConfirmOverlap(null) }}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title={warningCopy.overlappingTitle}
              subtitle={warningCopy.overlappingSubtitle(confirmOverlap.overlapping.length)}
            />
            <div className="row gap">
              <button onClick={() => saveBooking(true, false, true)} disabled={saveBookingLoading}>{warningCopy.overlappingConfirm}</button>
              <button className="secondary" onClick={() => { setConfirmOverlap(null) }}>{warningCopy.overlappingCancel}</button>
            </div>
          </div>
        </div>
      )}

      {confirmBookedPersonalOverlap && (
        <div className="modal-backdrop calendar-booking-supplement" onClick={cancelBookedPersonalOverlap}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title={warningCopy.personalTimeTitle}
              subtitle={warningCopy.personalTimeSubtitle}
            />
            <div className="row gap">
              <button type="button" onClick={() => void confirmBookedPersonalOverlapYes()} disabled={saveBookingLoading}>
                {warningCopy.yes}
              </button>
              <button type="button" className="secondary" onClick={cancelBookedPersonalOverlap}>
                {warningCopy.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNonBookableMove && (
        <div
          className={`modal-backdrop calendar-booking-supplement${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onClick={cancelNonBookableMove}
        >
          <div
            className={`modal confirm-modal${isNativeAndroid ? ' confirm-modal-non-bookable-android' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {isNativeAndroid ? (
              <p className="confirm-modal-non-bookable-text">
                {confirmNonBookableMove.pastTime
                  ? warningCopy.nonBookablePastTime
                  : warningCopy.nonBookableSlot}
              </p>
            ) : (
              <PageHeader
                title={warningCopy.warningTitle}
                subtitle={confirmNonBookableMove.pastTime
                  ? warningCopy.nonBookablePastTime
                  : warningCopy.nonBookableSlot}
              />
            )}
            <div className="row gap">
              <button type="button" onClick={() => void confirmNonBookableMoveYes()}>
                {warningCopy.yes}
              </button>
              <button type="button" className="secondary" onClick={cancelNonBookableMove}>
                {warningCopy.no}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNonBookable && (
        <div
          className={`modal-backdrop calendar-booking-supplement${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onClick={() => setConfirmNonBookable(null)}
        >
          <div
            className={`modal confirm-modal${isNativeAndroid ? ' confirm-modal-non-bookable-android' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {isNativeAndroid ? (
              <p className="confirm-modal-non-bookable-text">
                {confirmNonBookable.pastTime
                  ? warningCopy.nonBookablePastTime
                  : warningCopy.nonBookableSlot}
              </p>
            ) : (
              <PageHeader
                title={warningCopy.warningTitle}
                subtitle={confirmNonBookable.pastTime
                  ? warningCopy.nonBookablePastTime
                  : warningCopy.nonBookableSlot}
              />
            )}
            <div className="row gap">
              <button
                type="button"
                onClick={() => void confirmNonBookableYes()}
                disabled={saveBookingLoading}
              >
                {warningCopy.yes}
              </button>
              <button className="secondary" onClick={() => setConfirmNonBookable(null)}>{warningCopy.no}</button>
            </div>
          </div>
        </div>
      )}

      {waitlistModuleEnabled && releasedSlotWaitlistPrompt && (
        <div
          className="modal-backdrop calendar-booking-supplement"
          onClick={() => !releasedSlotWaitlistLoading && setReleasedSlotWaitlistPrompt(null)}
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'sl' ? 'Ponudi sproščeni termin' : 'Offer released slot'}
        >
          <div className="modal confirm-modal calendar-waitlist-release-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="calendar-recurring-delete-modal__close"
              onClick={() => setReleasedSlotWaitlistPrompt(null)}
              disabled={releasedSlotWaitlistLoading}
              aria-label={t('mobileNavClose')}
            >
              ×
            </button>
            <div className="calendar-waitlist-release-modal__head">
              <span className="calendar-waitlist-release-modal__icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none"><path d="M8 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.5 1.5h4m-2-2v4M2.5 20c.8-2.7 2.7-4 5.5-4s4.7 1.3 5.5 4M15 15h6M15 19h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <div>
                <h3>{locale === 'sl' ? 'Ponudi sproščeni termin' : 'Offer the released slot'}</h3>
                <p>
                  {locale === 'sl'
                    ? `Ta termin ustreza ${releasedSlotWaitlistPrompt.matches.count} ${Number(releasedSlotWaitlistPrompt.matches.count) === 1 ? 'stranki' : 'strankam'} na čakalni vrsti.`
                    : `This slot matches ${releasedSlotWaitlistPrompt.matches.count} waitlisted ${Number(releasedSlotWaitlistPrompt.matches.count) === 1 ? 'client' : 'clients'}.`}
                </p>
              </div>
            </div>
            <div className="calendar-waitlist-release-modal__candidate">
              <span className="calendar-waitlist-release-modal__avatar">
                {String(releasedSlotWaitlistPrompt.matches.first.clientName || '?').split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase()}
              </span>
              <div>
                <strong>{releasedSlotWaitlistPrompt.matches.first.clientName}</strong>
                <span>{releasedSlotWaitlistPrompt.matches.first.clientPhone || releasedSlotWaitlistPrompt.matches.first.clientEmail || '—'}</span>
              </div>
              <span className="calendar-waitlist-release-modal__queue">
                {locale === 'sl' ? 'Prva ustrezna' : 'First eligible'}
              </span>
            </div>
            <div className="calendar-waitlist-release-modal__actions">
              <button
                type="button"
                className="calendar-waitlist-release-modal__primary"
                onClick={() => void runReleasedSlotAction(releasedSlotWaitlistPrompt, true)}
                disabled={releasedSlotWaitlistLoading}
              >
                {releasedSlotWaitlistLoading
                  ? (locale === 'sl' ? 'Obdelujem …' : 'Processing …')
                  : (locale === 'sl' ? 'Ponudi prvi stranki' : 'Offer first client')}
              </button>
              <button
                type="button"
                className="calendar-waitlist-release-modal__secondary"
                onClick={() => window.open('/appointments', '_blank', 'noopener,noreferrer')}
                disabled={releasedSlotWaitlistLoading}
              >
                {locale === 'sl' ? 'Prikaži čakalno vrsto' : 'View waitlist'}
              </button>
              <button
                type="button"
                className="calendar-waitlist-release-modal__ghost"
                onClick={() => void runReleasedSlotAction(releasedSlotWaitlistPrompt, false)}
                disabled={releasedSlotWaitlistLoading}
              >
                {releasedSlotWaitlistPrompt.action === 'DELETE'
                  ? (locale === 'sl' ? 'Izbriši brez ponudbe' : 'Delete without offer')
                  : (locale === 'sl' ? 'Odpovej brez ponudbe' : 'Cancel without offer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecurringDeleteDialog && (
        <div
          className="modal-backdrop calendar-booking-supplement"
          onClick={() => setConfirmDelete(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('formDeleteRecurringSessionTitle')}
        >
          <div className="modal confirm-modal calendar-recurring-delete-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="calendar-recurring-delete-modal__close"
              onClick={() => setConfirmDelete(false)}
              aria-label={t('mobileNavClose')}
            >
              ×
            </button>
            <div className="calendar-recurring-delete-modal__content">
              <h3>{t('formDeleteRecurringSessionTitle')}</h3>
              <p>{t('formDeleteRecurringSessionQuestion')}</p>
            </div>
            <div className="calendar-recurring-delete-modal__actions">
              <button
                type="button"
                className="calendar-recurring-delete-modal__primary"
                onClick={() => void prepareReleasedSlotAction('DELETE', 'SINGLE')}
              >
                <span className="calendar-recurring-delete-modal__button-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 3v3M17 3v3M4.75 9.25h14.5M7.2 21h9.6c1.54 0 2.2-.66 2.2-2.2V7.2C19 5.66 18.34 5 16.8 5H7.2C5.66 5 5 5.66 5 7.2v11.6C5 20.34 5.66 21 7.2 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span>{t('formDeleteOnlyThisSession')}</span>
              </button>
              <button
                type="button"
                className="calendar-recurring-delete-modal__secondary"
                onClick={() => void prepareReleasedSlotAction('DELETE', 'THIS_AND_FOLLOWING')}
              >
                <span className="calendar-recurring-delete-modal__button-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 3v3M17 3v3M4.75 9.25h14.5M8 21h4.5M7.2 21h4.1M7.2 21C5.66 21 5 20.34 5 18.8V7.2C5 5.66 5.66 5 7.2 5h9.6C18.34 5 19 5.66 19 7.2v4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19.35 17.3a3.85 3.85 0 0 1-6.65 2.65M12.65 16.7a3.85 3.85 0 0 1 6.65-2.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19.35 14.05V16.7h-2.65M12.65 19.95V17.3h2.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span>{t('formDeleteThisAndFollowing')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBookedSession && (
        <div
          className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'}
          onClick={useBookingSidePanel && !calendarClientDetailId ? closeBookedModal : undefined}
        >
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', 'calendar-edit-session-panel--design-match', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
            style={getSessionPopupInlineStyle(true)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`} {...getSessionPopupDragHandleProps()}>
              {compactSessionEditHeader ? (
                !confirmDelete ? (
                  <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit booking-side-panel-header-toolbar--session-edit-booked">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                    <div className="calendar-edit-session-panel__compact-title-wrap">
                      <span className="calendar-edit-session-panel__compact-title">{t('formBookedSession')}</span>
                    </div>
                    <div className="booking-side-panel-header-ico-group">
                      <div className="calendar-mobile-session-more-wrap">
                        <button
                          type="button"
                          className="calendar-mobile-session-more-btn"
                          aria-label={locale === 'sl' ? 'Več dejanj in informacij' : 'More actions and information'}
                          aria-haspopup="menu"
                          aria-expanded={mobileBookingDetailsOpen}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            setMobileBookingDetailsOpen((open) => !open)
                          }}
                        >
                          <span aria-hidden>⋮</span>
                        </button>
                        {mobileBookingDetailsOpen && (
                          <div
                            className="calendar-mobile-session-more-menu"
                            role="menu"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {(canShowOpenBillForBookedStatus || advanceBillingEnabled) && (
                              <button
                                type="button"
                                role="menuitem"
                                className="calendar-mobile-session-more-menu__item calendar-mobile-session-more-menu__action"
                                disabled={bookedPaymentActionButtonsDisabled}
                                onClick={() => {
                                  setMobileBookingDetailsOpen(false)
                                  if (bookingServiceBillingButtonIsAdvance) {
                                    if (bookedBillingHasExistingAdvance) openBookedBillingView('advances')
                                    else openBookedAdvanceForm()
                                    return
                                  }
                                  void openBookedInvoiceEditor()
                                }}
                              >
                                <span className="calendar-mobile-session-more-menu__icon" aria-hidden>
                                  {bookingServiceBillingButtonIsAdvance ? (
                                    <CalendarAdvancePaymentIcon />
                                  ) : (
                                    <svg viewBox="0 0 24 24" fill="none">
                                      <path d="M7 3.75h6.9l3.85 3.85v12.65H7a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 7 3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                      <path d="M13.7 3.9V7.7h3.8M8.75 10.8h5.25M8.75 14h3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      <text x="14.7" y="18.4" fontSize="5.7" fontWeight="800" fill="currentColor">€</text>
                                    </svg>
                                  )}
                                </span>
                                <span className="calendar-mobile-session-more-menu__copy">
                                  <strong>{bookingServiceBillingButtonIsAdvance ? (locale === 'sl' ? 'Predračun' : 'Proforma invoice') : (locale === 'sl' ? 'Račun' : 'Invoice')}</strong>
                                  <small>{bookingServiceBillingButtonIsAdvance
                                    ? (locale === 'sl' ? 'Ustvari ali odpri predračun' : 'Create or open a proforma invoice')
                                    : (locale === 'sl' ? 'Ustvari ali uredi račun' : 'Create or edit an invoice')}</small>
                                </span>
                              </button>
                            )}
                            {advanceBillingEnabled && canShowOpenBillForBookedStatus && (
                              <button
                                type="button"
                                role="menuitem"
                                className="calendar-mobile-session-more-menu__item calendar-mobile-session-more-menu__action"
                                disabled={bookedPaymentActionButtonsDisabled}
                                onClick={() => {
                                  setMobileBookingDetailsOpen(false)
                                  openBookedBillingView('advances')
                                }}
                              >
                                <span className="calendar-mobile-session-more-menu__icon" aria-hidden><CalendarAdvancePaymentIcon /></span>
                                <span className="calendar-mobile-session-more-menu__copy">
                                  <strong>{locale === 'sl' ? 'Predračun' : 'Proforma invoice'}</strong>
                                  <small>{locale === 'sl' ? 'Odpri pregled predračunov' : 'Open proforma invoice overview'}</small>
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className="calendar-mobile-session-more-menu__item calendar-mobile-session-more-menu__action"
                              disabled={bookingServiceScanDisabled}
                              onClick={() => {
                                if (bookingServiceScanDisabled) return
                                setMobileBookingDetailsOpen(false)
                                openBookedEntitlementPaymentModal(bookingServiceEntitlementStatus, bookingServiceEntitlementClient)
                              }}
                            >
                              <span className="calendar-mobile-session-more-menu__icon" aria-hidden><BookedEntitlementScanIcon /></span>
                              <span className="calendar-mobile-session-more-menu__copy">
                                <strong>{locale === 'sl' ? 'Skener' : 'Scanner'}</strong>
                                <small>{bookingServiceScanTitle}</small>
                              </span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="calendar-mobile-session-more-menu__item calendar-mobile-session-more-menu__action calendar-mobile-session-more-menu__action--danger"
                              onClick={() => {
                                setMobileBookingDetailsOpen(false)
                                void requestBookedSessionDelete()
                              }}
                            >
                              <span className="calendar-mobile-session-more-menu__icon" aria-hidden><CalendarFormFooterDeleteIcon /></span>
                              <span className="calendar-mobile-session-more-menu__copy">
                                <strong>{t('formDeleteSession')}</strong>
                                <small>{locale === 'sl' ? 'Izbriši ta termin' : 'Delete this session'}</small>
                              </span>
                            </button>
                            <div className="calendar-mobile-session-more-menu__item">
                              <span className={`calendar-mobile-session-more-menu__icon calendar-mobile-session-more-menu__status-icon calendar-mobile-session-more-menu__status-icon--${currentBookingStatusTone}`} aria-hidden>●</span>
                              <span className="calendar-mobile-session-more-menu__copy">
                                <strong>{locale === 'sl' ? 'Status' : 'Status'}</strong>
                                <small>{currentBookingStatusLabel}</small>
                              </span>
                            </div>
                            <div className="calendar-mobile-session-more-menu__item">
                              <span className="calendar-mobile-session-more-menu__icon" aria-hidden>↗</span>
                              <span className="calendar-mobile-session-more-menu__copy">
                                <strong>{bookingSourceFieldLabel}</strong>
                                <small>{bookingSourceMeta.label}</small>
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                  </div>
                )
              ) : (
                <PageHeader
                  title={t('formBookedSession')}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
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
            <div className="form-row-layout form-row-layout--booking">
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
                            title={bookedSessionResolvedGroup?.name ?? ''}
                          >
                            {bookedSessionResolvedGroup?.name ?? (locale === 'sl' ? `Skupina #${bookedSessionGroupId}` : `Group #${bookedSessionGroupId}`)}
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
                    <div className={`client-search-wrap calendar-client-picker__search-wrap${bookedSessionClientFieldCompact ? ' client-search-wrap--compact-client' : ''}`}>
                      {bookedSessionClientFieldCompact ? (
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
                        <span aria-hidden>+</span>
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
                        {visibleBookedClients.slice(0, 10).map((client: any) => (
                          <button
                            key={client.id}
                            type="button"
                            className={`client-list-item ${selectedBookedClientIds.includes(client.id) ? 'selected' : ''}`}
                            onClick={() => {
                              if (multipleClientsPerSessionEnabled) {
                                const nextIds = selectedBookedClientIds.includes(client.id)
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
                            {fullName(client)}
                          </button>
                        ))}
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
              {showBookingConsultantRow && (
                <div className="form-row form-row-infield calendar-booking-field--consultant">
                  <span className="form-field-inline-label">{t('formConsultant')}</span>
                  <div className="form-field-inline-control">
                  <select
                    value={selectedBookedSession.consultant?.id ?? ''}
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
                    {metaConsultants.map((c: any) => (
                      <option key={c.id} value={c.id}>{fullName(c)}</option>
                    ))}
                  </select>
                  </div>
                </div>
              )}
              <div className="calendar-booking-row-divider calendar-booking-row-divider--service" aria-hidden />
              {showBookingTypeRow && (
                <div className="form-row form-row-infield calendar-booking-service-with-online calendar-booking-field--service">
                  <div className="calendar-booking-service-infield-head">
                    <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
                    {onlineSessionBookingEnabled && selectedBookedSession.online ? (
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
                    {onlineSessionBookingEnabled ? (
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
                    ) : null}
                  </div>
                  <div className="form-field-inline-control calendar-booking-service-select-only" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="calendar-booking-service-select-shell">
                      <select
                        value={selectedBookedSession.type?.id ?? ''}
                        onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, type: bookedSessionSelectableMetaTypes.find((ty: any) => Number(ty.id) === Number(e.target.value)) ?? null })}
                      >
                        <option value="">{t('formNoType')}</option>
                        {bookedSessionIsGroup && !bookedSessionSelectedTypeAllowed && selectedBookedSession.type?.id ? (
                          <option value={selectedBookedSession.type.id} disabled>
                            {selectedBookedSession.type.name} ({locale === 'sl' ? 'Skupina ni omogočena' : 'Group is off'})
                          </option>
                        ) : null}
                        {bookedSessionSelectableMetaTypes.map((ty: any) => (
                          <option key={ty.id} value={ty.id}>{formatSessionTypeOptionLabel(ty)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="calendar-session-billing-actions">
                      {(canShowOpenBillForBookedStatus || advanceBillingEnabled) && (
                      <div className="calendar-session-billing-action-wrap">
                        <button
                          type="button"
                          className={`secondary calendar-client-picker__invoice-btn calendar-client-picker__payee-tab-btn calendar-booking-service-invoice-btn${bookingServiceBillingButtonIsAdvance ? ' calendar-client-picker__advance-btn' : ''}${bookedBillingActionMenu === (bookingServiceBillingButtonIsAdvance ? 'advance' : 'invoice') ? ' is-menu-open' : ''}`}
                          title={bookingServiceBillingButtonIsAdvance ? (locale === 'sl' ? 'Predplačila' : 'Advances') : (locale === 'sl' ? 'Računi' : 'Invoices')}
                          aria-label={bookingServiceBillingButtonIsAdvance ? (locale === 'sl' ? 'Odpri meni predplačil' : 'Open advances menu') : (locale === 'sl' ? 'Odpri meni računov' : 'Open invoices menu')}
                          disabled={bookedPaymentActionButtonsDisabled}
                          onClick={(event) => {
                            event.stopPropagation()
                            const actionKind = bookingServiceBillingButtonIsAdvance ? 'advance' : 'invoice'
                            if (actionKind === 'advance' && !bookedBillingHasExistingAdvance) {
                              openBookedAdvanceForm()
                              return
                            }
                            if (actionKind === 'invoice' && !bookedBillingHasExistingOpenBill && !bookedBillingHasInvoiceViewRows) {
                              void openBookedInvoiceEditor()
                              return
                            }
                            toggleBookedBillingActionMenu(actionKind)
                          }}
                        >
                          {bookingServiceBillingButtonIsAdvance ? (
                            <CalendarAdvancePaymentIcon />
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path d="M7 3.75h6.9l3.85 3.85v12.65H7a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 7 3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                              <path d="M13.7 3.9V7.7h3.8M8.75 10.8h5.25M8.75 14h3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              <text x="14.7" y="18.4" fontSize="5.7" fontWeight="800" fill="currentColor">€</text>
                            </svg>
                          )}
                        </button>
                        {renderBillingActionMenu(bookingServiceBillingButtonIsAdvance ? 'advance' : 'invoice')}
                      </div>
                      )}
                      {advanceBillingEnabled && canShowOpenBillForBookedStatus && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__invoice-btn calendar-client-picker__payee-tab-btn calendar-booking-service-invoice-btn calendar-client-picker__advance-btn"
                          title={locale === 'sl' ? 'Pregled predplačil' : 'View advances'}
                          aria-label={locale === 'sl' ? 'Odpri pregled predplačil za termin' : 'Open session advances view'}
                          disabled={bookedPaymentActionButtonsDisabled}
                          onClick={(event) => {
                            event.stopPropagation()
                            openBookedBillingView('advances')
                          }}
                        >
                          <CalendarAdvancePaymentIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary calendar-client-picker__invoice-btn calendar-client-picker__payee-tab-btn calendar-booking-service-invoice-btn calendar-booking-service-scan-btn"
                        title={bookingServiceScanTitle}
                        aria-label={bookingServiceScanTitle}
                        disabled={bookingServiceScanDisabled}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (bookingServiceScanDisabled) return
                          openBookedEntitlementPaymentModal(bookingServiceEntitlementStatus, bookingServiceEntitlementClient)
                        }}
                      >
                        <BookedEntitlementScanIcon />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {showBookingSpaceRow && (
                <div className="form-row form-row-infield calendar-booking-field--space">
                  <span className="form-field-inline-label">{t('formCalendarBookingSpace')}</span>
                  <div className="form-field-inline-control">
                  <select value={selectedBookedSession.space?.id ?? ''} onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, space: metaSpaces.find((s: any) => s.id === Number(e.target.value)) })}>
                    <option value="">{t('formNoSpace')}</option>
                    {metaSpaces.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  </div>
                </div>
              )}
              <div className="calendar-booking-row-divider calendar-booking-row-divider--timespan" aria-hidden />
              <div className="form-row form-row-timespan calendar-booking-timespan-row">
                <CalendarLocalTimespanRow
                  startValue={selectedBookedSession.startTime}
                  endValue={selectedBookedSession.endTime}
                  onCommitStart={(s) =>
                    setSelectedBookedSession((prev: any) => (prev ? { ...prev, startTime: s } : prev))
                  }
                  onCommitEnd={(s) =>
                    setSelectedBookedSession((prev: any) => (prev ? { ...prev, endTime: s } : prev))
                  }
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(selectedBookedSession.startTime, selectedBookedSession.endTime),
                    onToggle: () => {
                      setSelectedBookedSession((prev: any) => {
                        if (!prev) return prev
                        if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                          const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                          const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                          const end = getBookingEndTimeForStart(start, prev.type?.id ?? null)
                          return { ...prev, startTime: start, endTime: end }
                        }
                        const d =
                          splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                        return {
                          ...prev,
                          startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                        }
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
              {(() => {
                const dateLoc = locale === 'sl' ? 'sl-SI' : 'en-GB'
                const startDate = selectedBookedSession.startTime ? new Date(selectedBookedSession.startTime) : null
                const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
                const sessionDateStr = startDate
                  ? startDate.toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                  : ''
                const repeatInterval = selectedBookedSession.repeatInterval ?? 1
                const repeatUnit = selectedBookedSession.repeatUnit ?? 'weeks'
                const repeatEndType = selectedBookedSession.repeatEndType ?? 'after'
                const repeatEndCount = selectedBookedSession.repeatEndCount ?? 5
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
                    {selectedBookedSession.repeats && (
                      <div className="form-repeats-config">
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEvery')}</span>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            className="form-repeats-number"
                            value={repeatInterval}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatInterval: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <select
                            className="form-repeats-select"
                            value={repeatUnit}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatUnit: e.target.value })}
                          >
                            <option value="days">{t('formRepeatUnitDays')}</option>
                            <option value="weeks">{t('formRepeatUnitWeeks')}</option>
                            <option value="months">{t('formRepeatUnitMonths')}</option>
                          </select>
                        </div>
                        {repeatUnit === 'weeks' && (
                          <div className="form-repeats-row">
                            <span className="form-repeats-label">{t('formRepeatsOnDay')}</span>
                            <select
                              className="form-repeats-select"
                              value={selectedBookedSession.repeatDay ?? sessionDay}
                              onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatDay: e.target.value })}
                            >
                              {REPEAT_WEEKDAY_EN.map((d) => (
                                <option key={d} value={d}>{formatRepeatWeekdayLabel(locale, d)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEnds')}</span>
                          <select
                            className="form-repeats-select"
                            value={repeatEndType}
                            onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndType: e.target.value })}
                          >
                            <option value="after">{t('formRepeatEndAfter')}</option>
                            <option value="on">{t('formRepeatEndOnDate')}</option>
                          </select>
                          {repeatEndType === 'after' && (
                            <input
                              type="number"
                              min={2}
                              max={100}
                              className="form-repeats-number"
                              value={repeatEndCount}
                              onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndCount: Math.max(2, Number(e.target.value) || 2) })}
                            />
                          )}
                          {repeatEndType === 'on' && (
                            <input
                              type="date"
                              className="form-repeats-date"
                              value={repeatEndDate}
                              onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, repeatEndDate: e.target.value })}
                            />
                          )}
                        </div>
                        <p className="form-repeats-summary muted">
                          {summaryLine}
                        </p>
                        <p className="form-repeats-note muted">
                          {t('formRepeatsSameDurationNote')}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}
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
                <span className="form-field-inline-label">{t('formNotes')}</span>
                <div className="form-field-inline-control">
                <SessionNotesTextarea
                  value={(selectedBookedSession.meetingLink ? (selectedBookedSession.notes || '').replace(/\n?Zoom meeting:\s*https?:\/\/[^\s\n]+/g, '').trim() : selectedBookedSession.notes) || ''}
                  onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, notes: e.target.value })}
                />
                </div>
              </div>
            </div>
            </div>
            <div
              className={`row gap booking-side-panel-footer${compactSessionEditHeader ? ' booking-side-panel-footer--mobile-save' : ''}${showRecurringDeleteDialog ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              {confirmDelete ? (
                showRecurringDeleteDialog ? null : (
                  <>
                    <span className="muted">{t('formDeleteSessionQuestion')}</span>
                    <button className="danger" onClick={() => void prepareReleasedSlotAction('DELETE', 'SINGLE')}>{t('formYesDelete')}</button>
                    <button className="secondary" onClick={() => setConfirmDelete(false)}>{t('formCancel')}</button>
                  </>
                )
              ) : (
                <>
                  <div className="calendar-session-footer-tags">
                    <div className="calendar-booking-status-menu-wrap">
                      <button
                        type="button"
                        className={`secondary calendar-session-status-tag calendar-session-status-tag--${currentBookingStatusTone}`}
                        aria-haspopup="menu"
                        aria-expanded={bookedStatusMenuOpen}
                        onClick={() => {
                          setBookedPaymentMenuOpen(false)
                          setNoShowClientPickerOpen(false)
                          setBookedStatusMenuOpen((prev) => !prev)
                        }}
                      >
                        <span className="calendar-session-status-tag__icon" aria-hidden="true"><CalendarBookingStatusIcon statusKey={currentBookingStatusKey} /></span>
                        <span className="calendar-session-status-tag__label">{currentBookingStatusLabel}</span>
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
                    {!compactSessionEditHeader && (
                      <div className="calendar-session-source-tag" aria-label={`${bookingSourceFieldLabel}: ${bookingSourceMeta.label}`}>
                        <span className="calendar-session-source-tag__label">{locale === 'sl' ? 'Vir:' : 'Source:'} {bookingSourceMeta.label}</span>
                      </div>
                    )}
                  </div>
                  <div className="calendar-session-footer-actions" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="calendar-form-footer-btn calendar-form-footer-btn--delete calendar-form-footer-btn--footer-delete"
                    onClick={() => void requestBookedSessionDelete()}
                  >
                    <CalendarFormFooterDeleteIcon />
                    <span className="calendar-form-footer-btn__label">{t('formDeleteSession')}</span>
                  </button>
                  <button
                    type="button"
                    className="calendar-form-footer-btn calendar-form-footer-btn--save calendar-form-footer-btn--save-mobile-bottom"
                    onClick={() => void updateBookedSession()}
                    disabled={bookedSessionSaveDisabled}
                  >
                    <CalendarFormFooterSaveIcon />
                    <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                  </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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
              <div>
                <h2>{locale === 'sl' ? 'Čakalna vrsta' : locale === 'sr' ? 'Lista čekanja' : 'Waitlist'}</h2>
                <p>{waitlistMatchCountLabel(visibleNewSlotWaitlistMatches.count)}</p>
              </div>
              <button
                type="button"
                className="secondary calendar-waitlist-picker-close"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => closeNewSlotWaitlist(event)}
                aria-label={t('mobileNavClose')}
              >×</button>
            </div>
            <div className="calendar-waitlist-picker-list">
              {(visibleNewSlotWaitlistMatches.matches || [visibleNewSlotWaitlistMatches.first]).filter(Boolean).map((candidate: any, index: number) => (
                <div key={candidate.requestId || index} className="calendar-waitlist-picker-row">
                  <span className="calendar-waitlist-picker-avatar">{String(candidate.clientName || '?').trim().split(/\s+/).slice(0,2).map((part: string) => part[0]).join('').toUpperCase()}</span>
                  <div className="calendar-waitlist-picker-copy">
                    <strong>{candidate.clientName}</strong>
                    <span>{formatWaitlistJoinedAt(candidate.joinedAt) ? `${locale === 'sl' ? 'Prijavljen' : locale === 'sr' ? 'Prijavljen' : 'Joined'} ${formatWaitlistJoinedAt(candidate.joinedAt)}` : ''}</span>
                  </div>
                  <button type="button" className="calendar-waitlist-picker-add" onClick={() => pullFirstWaitlistedGuestIntoBooking(candidate)}>
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
        <div className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'} onClick={useBookingSidePanel ? closePersonalModal : undefined}>
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', 'calendar-edit-session-panel--design-match', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
            style={getSessionPopupInlineStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`} {...getSessionPopupDragHandleProps()}>
              {compactSessionEditHeader ? (
                <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                  <button type="button" className="secondary booking-side-panel-close" onClick={closePersonalModal} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  <div className="booking-side-panel-header-ico-group">
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                      onClick={deletePersonalBlock}
                      aria-label={t('formDelete')}
                      title={t('formDelete')}
                    >
                      <CalendarFormFooterDeleteIcon />
                      <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
                    </button>
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--save"
                      onClick={updatePersonalBlock}
                      aria-label={t('formSave')}
                      title={t('formSave')}
                    >
                      <CalendarFormFooterSaveIcon />
                      <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <PageHeader
                  title={t('formPersonalBlockEditTitle')}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closePersonalModal} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
            <div className="form-row-layout">
              <div className="form-row form-row-infield calendar-personal-field-with-visibility">
                <div className="calendar-booking-service-infield-head calendar-personal-visibility-head">
                  <span className="form-field-inline-label">{t('formTask')}</span>
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
                    onToggle: () => {
                      setSelectedPersonalBlock((prev: any) => {
                        if (!prev) return prev
                        if (isLocalBookingAllDay(prev.startTime, prev.endTime)) {
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                          const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                          const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                          const end = getBookingEndTimeForStart(start, null)
                          return { ...prev, startTime: start, endTime: end }
                        }
                        const d =
                          splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                        return {
                          ...prev,
                          startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                        }
                      })
                    },
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
              <div className="form-row form-row-infield stretch">
                <span className="form-field-inline-label">{t('formNotes')}</span>
                <div className="form-field-inline-control">
                <SessionNotesTextarea value={selectedPersonalBlock.notes || ''} onChange={(e) => setSelectedPersonalBlock({ ...selectedPersonalBlock, notes: e.target.value })} />
                </div>
              </div>
            </div>
            </div>
            <div
              className={`row gap booking-side-panel-footer${compactSessionEditHeader ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--delete" onClick={deletePersonalBlock}>
                <CalendarFormFooterDeleteIcon />
                <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
              </button>
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--save" onClick={updatePersonalBlock}>
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTodo && (
        <div
          className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'}
          onClick={useBookingSidePanel ? closeTodoModal : undefined}
        >
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', 'calendar-edit-session-panel--design-match', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
            style={getSessionPopupInlineStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`} {...getSessionPopupDragHandleProps()}>
              {compactSessionEditHeader ? (
                <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                  <button type="button" className="secondary booking-side-panel-close" onClick={closeTodoModal} aria-label={t('mobileNavClose')}>
                    ×
                  </button>
                  <div className="booking-side-panel-header-ico-group">
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                      onClick={deleteTodo}
                      aria-label={t('formDelete')}
                      title={t('formDelete')}
                    >
                      <CalendarFormFooterDeleteIcon />
                      <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
                    </button>
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--complete"
                      onClick={deleteTodo}
                      aria-label={locale === 'sl' ? 'Opravljeno' : 'Done'}
                      title={locale === 'sl' ? 'Opravljeno' : 'Done'}
                    >
                      <CalendarFormFooterSaveIcon />
                      <span className="calendar-form-footer-btn__label">{locale === 'sl' ? 'Opravljeno' : 'Done'}</span>
                    </button>
                    <button
                      type="button"
                      className="calendar-form-footer-btn calendar-form-footer-btn--save"
                      onClick={updateTodo}
                      aria-label={t('formSave')}
                      title={t('formSave')}
                    >
                      <CalendarFormFooterSaveIcon />
                      <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <PageHeader
                  title={t('formTodoEditTitle')}
                  actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeTodoModal} aria-label={t('mobileNavClose')}>×</button>}
                />
              )}
            </div>
            <div className="booking-side-panel-body">
              <div className="form-row-layout">
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formTodo')}</span>
                  <div className="form-field-inline-control">
                  <input value={selectedTodo.task || ''} onChange={(e) => setSelectedTodo({ ...selectedTodo, task: e.target.value })} />
                  </div>
                </div>
                <div className="form-row form-row-timespan">
                  <CalendarLocalTimeDateRow
                    value={selectedTodo.startTime}
                    onCommit={(s) => setSelectedTodo((prev: any) => (prev ? { ...prev, startTime: s } : prev))}
                    normalize={normalizeToLocalDateTime}
                    labels={{ time: t('formTimeFrom'), date: t('formCalendarDate') }}
                    allDayToggle={{
                      checked: isLocalTodoAllDayStart(selectedTodo.startTime),
                      onToggle: () => {
                        setSelectedTodo((prev: any) => {
                          if (!prev) return prev
                          if (isLocalTodoAllDayStart(prev.startTime)) {
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                            const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                            return { ...prev, startTime: normalizeToLocalDateTime(`${d}T${hm}:00`) }
                          }
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(prev.startTime)).date || localTodayYmd()
                          return { ...prev, startTime: normalizeToLocalDateTime(`${d}T00:00:00`) }
                        })
                      },
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
                <div className="form-row form-row-infield stretch">
                  <span className="form-field-inline-label">{t('formNotes')}</span>
                  <div className="form-field-inline-control">
                  <SessionNotesTextarea value={selectedTodo.notes || ''} onChange={(e) => setSelectedTodo({ ...selectedTodo, notes: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`row gap booking-side-panel-footer${compactSessionEditHeader ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--delete" onClick={deleteTodo}>
                <CalendarFormFooterDeleteIcon />
                <span className="calendar-form-footer-btn__label">{t('formDelete')}</span>
              </button>
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--complete" onClick={deleteTodo}>
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">{locale === 'sl' ? 'Opravljeno' : 'Done'}</span>
              </button>
              <button type="button" className="calendar-form-footer-btn calendar-form-footer-btn--save" onClick={updateTodo}>
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selection && (
        <div
          className={useBookingSidePanel ? 'modal-backdrop booking-side-panel-backdrop' : 'calendar-session-popup-layer'}
          onClick={useBookingSidePanel ? closeBookingSelection : undefined}
        >
          <div
            ref={!useBookingSidePanel ? sessionPopupRef : undefined}
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', 'calendar-edit-session-panel--design-match', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
            style={getSessionPopupInlineStyle(true)}
            onClick={(e) => {
              e.stopPropagation()
              setClientDropdownOpen(false)
              setEditingClientSearch(false)
            }}
          >
            <div
              className={`booking-side-panel-header${
                compactSelectionHeader ? ' booking-side-panel-header--compact-booking' : ''
              }`}
              {...getSessionPopupDragHandleProps()}
            >
              {compactSelectionHeader ? (
                <div className="booking-side-panel-header-toolbar">
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
                    onClick={closeBookingSelection}
                    aria-label={t('formBookSessionCloseAria')}
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    className={`booking-side-panel-submit-check${
                      availabilitySelection != null && availabilityIntent === 'block' ? ' booking-side-panel-submit-check--block' : ''
                    }`}
                    onClick={() =>
                      void (availabilitySelection != null ? confirmAvailabilityFromHeader() : saveBooking(false))
                    }
                    disabled={availabilitySelection != null ? availabilitySaving : saveBookingLoading}
                    aria-label={compactSelectionCheckAria}
                    title={compactSelectionCheckAria}
                  >
                    {availabilitySelection != null ? (
                      availabilitySaving ? (
                        <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )
                    ) : saveBookingLoading ? (
                      <span className="booking-side-panel-submit-check-spinner" aria-hidden />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : (
                <PageHeader
                  title={renderBookingModeTitle()}
                  actions={
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookingSelection} aria-label={t('formBookSessionCloseAria')}>
                      ×
                    </button>
                  }
                />
              )}
            </div>
            <div
              className="booking-side-panel-body"
              style={
                useBookingSidePanel && !isNativeAndroid ? { touchAction: 'pan-y' as const } : undefined
              }
              onTouchStart={useBookingSidePanel && !isNativeAndroid ? onNewFormPanelTouchStart : undefined}
              onTouchEnd={useBookingSidePanel && !isNativeAndroid ? onNewFormPanelTouchEnd : undefined}
            >
            {!isNativeAndroid && (
              <div className="booking-type-switcher">
                <button
                  type="button"
                  className={!availabilitySelection && !form.todo && !form.personal ? 'booking-type-btn booking-type-btn--booking active' : 'booking-type-btn booking-type-btn--booking'}
                  onClick={() => activateNewFormPanel('booking')}
                >
                  <span className="booking-type-btn-label"><BookingTypeTabIcon name="booking" />{t('formBooking')}</span>
                </button>
                {todosModuleEnabled && (
                <button
                  type="button"
                  className={!availabilitySelection && form.todo ? 'booking-type-btn booking-type-btn--todo active' : 'booking-type-btn booking-type-btn--todo'}
                  onClick={() => activateNewFormPanel('todo')}
                >
                  <span className="booking-type-btn-label"><BookingTypeTabIcon name="todo" />{t('formTodo')}</span>
                </button>
                )}
                {personalModuleEnabled && (
                <button
                  type="button"
                  className={!availabilitySelection && form.personal ? 'booking-type-btn booking-type-btn--personal active' : 'booking-type-btn booking-type-btn--personal'}
                  onClick={() => activateNewFormPanel('personal')}
                >
                  <span className="booking-type-btn-label"><BookingTypeTabIcon name="personal" />{t('formPersonal')}</span>
                </button>
                )}
                <button
                  type="button"
                  className={availabilitySelection ? 'booking-type-btn booking-type-btn--availability active' : 'booking-type-btn booking-type-btn--availability'}
                  onClick={() => {
                    const start = form.startTime || selection?.start
                    const end = form.endTime || selection?.end
                    if (!start || !end) return
                    openAvailabilityModalFromSelection(start, end, form.consultantId ?? null, {
                      skipCompactNavigate: useBookingSidePanel && location.pathname === ROUTE_NEW_BOOKING,
                    })
                  }}
                >
                  <span className="booking-type-btn-label"><BookingTypeTabIcon name="availability" />{t('calendarModeAvailability')}</span>
                </button>
              </div>
            )}
            <div className={`form-row-layout${!availabilitySelection && !form.todo && !form.personal ? ' form-row-layout--booking' : ''}`}>
              {availabilitySelection ? (
                <>
                  {showBookingConsultantRow && (
                    <div className="form-row form-row-infield">
                      <span className="form-field-inline-label">{t('formConsultant')}</span>
                      <div className="form-field-inline-control">
                      <select
                        value={availabilitySelection.consultantId || ''}
                        onChange={(e) => setAvailabilitySelection({ ...availabilitySelection, consultantId: Number(e.target.value) || null })}
                      >
                        <option value="">{t('formSelectConsultant')}</option>
                        {metaConsultants.map((c: any) => (
                          <option key={c.id} value={c.id}>{fullName(c)}</option>
                        ))}
                      </select>
                      </div>
                    </div>
                  )}
                  <div className="form-row form-row-infield form-row--bare">
                    <span className="form-field-inline-label">{t('formAvailabilityAction')}</span>
                    <div className="form-field-inline-control">
                      <div className="online-live-switch-row online-live-switch-row--inline online-live-switch-row--binary" role="group" aria-label={`${t('formAvailabilityOpenShort')} / ${t('formBlockAvailabilityShort')}`}>
                        <button
                          type="button"
                          className={`online-live-switch-choice${availabilityIntent === 'add' ? ' online-live-switch-choice--active' : ''}`}
                          aria-pressed={availabilityIntent === 'add'}
                          onClick={() => setAvailabilityIntent('add')}
                        >
                          {t('formAvailabilityOpenShort')}
                        </button>
                        <button
                          type="button"
                          className={`online-live-switch-choice online-live-switch-choice--block${availabilityIntent === 'block' ? ' online-live-switch-choice--active' : ''}`}
                          aria-pressed={availabilityIntent === 'block'}
                          onClick={() => setAvailabilityIntent('block')}
                        >
                          {t('formBlockAvailabilityShort')}
                        </button>
                      </div>
                    </div>
                  </div>
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
                  <div className="form-row form-row-infield form-row--bare">
                    <span className="form-field-inline-label">{t('calendarRepeat')}</span>
                    <div className="form-field-inline-control">
                      <div className="online-live-switch-row online-live-switch-row--inline online-live-switch-row--binary" role="group" aria-label={`${t('formLimited')} / ${t('formIndefinite')}`}>
                        <button
                          type="button"
                          className={`online-live-switch-choice${!availabilitySelection.indefinite ? ' online-live-switch-choice--active' : ''}`}
                          aria-pressed={!availabilitySelection.indefinite}
                          onClick={() => setAvailabilitySelection({ ...availabilitySelection, indefinite: false })}
                        >
                          {t('formLimited')}
                        </button>
                        <button
                          type="button"
                          className={`online-live-switch-choice${availabilitySelection.indefinite ? ' online-live-switch-choice--active' : ''}`}
                          aria-pressed={!!availabilitySelection.indefinite}
                          onClick={() => setAvailabilitySelection({ ...availabilitySelection, indefinite: true })}
                        >
                          {t('formIndefinite')}
                        </button>
                      </div>
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
                </>
              ) : form.todo ? (
                <>
                  <div className="form-row form-row-infield">
                    <span className="form-field-inline-label">{t('formTodo')}</span>
                    <div className="form-field-inline-control">
                    <input placeholder={t('formTaskNamePlaceholder')} value={form.task || ''} onChange={(e) => setForm({ ...form, task: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row form-row-timespan">
                    <CalendarLocalTimeDateRow
                      value={form.startTime}
                      onCommit={(s) => setForm((f: any) => ({ ...f, startTime: s }))}
                      normalize={normalizeToLocalDateTime}
                      labels={{ time: t('formTimeFrom'), date: t('formCalendarDate') }}
                      allDayToggle={{
                        checked: isLocalTodoAllDayStart(form.startTime),
                        onToggle: () => {
                          setForm((f: any) => {
                            if (isLocalTodoAllDayStart(f.startTime)) {
                              const d =
                                splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                              const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                              return { ...f, startTime: normalizeToLocalDateTime(`${d}T${hm}:00`) }
                            }
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                            return { ...f, startTime: normalizeToLocalDateTime(`${d}T00:00:00`) }
                          })
                        },
                        label: t('formAllDay'),
                        captionId: todoFormAllDayCaptionId,
                      }}
                      onCommitAllDayDate={(ymd) => {
                        setForm((f: any) => ({ ...f, startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`) }))
                      }}
                    />
                  </div>
                  <div className="form-row form-row-infield stretch">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : form.personal ? (
                <>
                  <div className="form-row form-row-infield calendar-personal-field-with-visibility">
                    <div className="calendar-booking-service-infield-head calendar-personal-visibility-head">
                      <span className="form-field-inline-label">{t('formTask')}</span>
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
                    <div className="form-field-inline-control">
                    <PersonalTaskCombo
                      value={form.task || ''}
                      onChange={(task) => setForm({ ...form, task })}
                      placeholder={t('formTaskCalendarNamePlaceholder')}
                      presets={personalTaskPresets}
                      dropdownOpen={personalTaskPresetDropdownOpen}
                      onDropdownOpenChange={setPersonalTaskPresetDropdownOpen}
                      selectPredefinedLabel={t('formSelectPredefinedTask')}
                      noMatchLabel={t('formNoTaskPresetsMatch')}
                    />
                    </div>
                  </div>
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
                        onToggle: () => {
                          setForm((f: any) => {
                            if (isLocalBookingAllDay(f.startTime, f.endTime)) {
                              const d =
                                splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                              const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                              const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                              const end = getBookingEndTimeForStart(start, null)
                              return { ...f, startTime: start, endTime: end }
                            }
                            const d =
                              splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                            return {
                              ...f,
                              startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                              endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                            }
                          })
                        },
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
                  <div className="form-row form-row-infield stretch">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
              <div className={`form-row form-row-infield calendar-booking-field--client${groupBookingEnabled ? ' calendar-booking-client-with-group' : ''}`}>
                {groupBookingEnabled ? (
                  <div className="calendar-booking-service-infield-head">
                    <span className="form-field-inline-label">
                      {bookingGroupMode ? t('formGroup') : t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient')}
                    </span>
                    <div className="calendar-booking-service-online-line" role="group" aria-label={t('formGroupToggle')}>
                      <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formGroupToggle')}>
                        <input
                          type="checkbox"
                          checked={bookingGroupMode}
                          aria-labelledby={addBookingGroupCaptionId}
                          onChange={(e) => {
                            const on = e.target.checked
                            setBookingGroupMode(on)
                            if (on) {
                              const firstGroupType = metaTypes.find((type: any) => type?.active !== false && type?.groupBookingEnabled === true)
                              setForm((prev: any) => {
                                const currentType = metaTypes.find((type: any) => type?.id === prev.typeId)
                                return {
                                  ...prev,
                                  clientId: null,
                                  clientIds: [],
                                  typeId: currentType?.groupBookingEnabled === true ? prev.typeId : firstGroupType?.id ?? null,
                                }
                              })
                            } else {
                              const firstActiveType = metaTypes.find((type: any) => type?.active !== false)
                              setForm((prev: any) => ({ ...prev, groupId: null, typeId: prev.typeId == null ? firstActiveType?.id ?? null : prev.typeId }))
                              setGroupSearch('')
                              setGroupDropdownOpen(false)
                              setEditingGroupSearch(false)
                            }
                          }}
                        />
                        <span className="repeats-toggle-slider" />
                      </label>
                      <span id={addBookingGroupCaptionId} className="calendar-booking-service-online-caption">
                        {t('formGroupToggle')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="form-field-inline-label">{t(multipleClientsPerSessionEnabled ? 'formClients' : 'formClient')}</span>
                )}
                <div className="form-field-inline-control">
                  {groupBookingEnabled && bookingGroupMode ? (
                    <div className="client-picker calendar-client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className="calendar-client-picker__search-row">
                        <div className={`client-search-wrap calendar-client-picker__search-wrap${bookSessionGroupFieldCompact ? ' client-search-wrap--compact-client' : ''}`}>
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
                        </div>
                        {!!selectedGroup && (
                          <div className="calendar-client-picker__actions">
                            <button
                              type="button"
                              className="secondary calendar-client-picker__clear-btn"
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
                          </div>
                        )}
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
                    <div className={`client-search-wrap calendar-client-picker__search-wrap${bookSessionClientFieldCompact ? ' client-search-wrap--compact-client' : ''}`}>
                      <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      </span>
                      {bookSessionClientFieldCompact ? (
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
                        <span aria-hidden>+</span>
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
                        {visibleClients.slice(0, 10).map((client: any) => (
                          <button
                            key={client.id}
                            type="button"
                            className={`client-list-item ${selectedFormClientIds.includes(client.id) ? 'selected' : ''}`}
                            onClick={() => {
                              if (multipleClientsPerSessionEnabled) {
                                const nextIds = selectedFormClientIds.includes(client.id)
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
                            {fullName(client)}
                          </button>
                        ))}
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
              {showBookingConsultantRow && (
                <div className="form-row form-row-infield calendar-booking-field--consultant">
                  <span className="form-field-inline-label">{t('formConsultant')}</span>
                  <div className="form-field-inline-control">
                  <select disabled={form.todo || form.personal} value={form.consultantId ?? ''} onChange={(e) => setForm({ ...form, consultantId: e.target.value === '' ? null : Number(e.target.value) })}><option value="">{t('formUnassigned')}</option>{metaConsultants.map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}                  </select>
                  </div>
                </div>
              )}
              {!form.todo && !form.personal && !availabilitySelection && (
                <div className="calendar-booking-row-divider calendar-booking-row-divider--service" aria-hidden />
              )}
              {!form.todo && !form.personal && !availabilitySelection && showBookingTypeRow && (
                <div className={`form-row form-row-infield calendar-booking-field--service${!isNativeAndroid && onlineSessionBookingEnabled ? ' calendar-booking-service-with-online' : ''}`}>
                  {!isNativeAndroid ? (
                    <>
                      <div className="calendar-booking-service-infield-head">
                        <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
                        {onlineSessionBookingEnabled && form.online ? (
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
                        {onlineSessionBookingEnabled ? (
                          <div className="calendar-booking-service-online-line" role="group" aria-label={t('formSessionOnlineShort')}>
                            <label className="repeats-toggle-switch online-live-repeats-switch calendar-booking-service-online-toggle" title={t('formSessionOnlineShort')}>
                              <input
                                type="checkbox"
                                checked={!!form.online}
                                aria-labelledby={addBookingOnlineCaptionId}
                                onChange={(e) => {
                                  const on = e.target.checked
                                  if (on) {
                                    setForm({ ...form, online: true })
                                    setMeetingPickerCancelUnchecksOnline(true)
                                    setMeetingProviderPickerTarget('create')
                                    setMeetingProviderPickerOpen(true)
                                  } else {
                                    setForm({ ...form, online: false })
                                    setMeetingProviderPickerOpen(false)
                                    setMeetingProviderPickerTarget(null)
                                    setMeetingPickerCancelUnchecksOnline(false)
                                  }
                                }}
                              />
                              <span className="repeats-toggle-slider" />
                            </label>
                            <span id={addBookingOnlineCaptionId} className="calendar-booking-service-online-caption">
                              {t('formSessionOnlineShort')}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="form-field-inline-control calendar-booking-service-select-only">
                        <select
                          value={form.typeId || ''}
                          onChange={(e) => updateBookingFormType(Number(e.target.value) || null)}
                        >
                          <option value="">{t('formNoType')}</option>
                          {selectableMetaTypes.map((ty: any) => (
                            <option key={ty.id} value={ty.id}>
                              {formatSessionTypeOptionLabel(ty)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
                      <div className="form-field-inline-control">
                        <select
                          value={form.typeId || ''}
                          onChange={(e) => updateBookingFormType(Number(e.target.value) || null)}
                        >
                          <option value="">{t('formNoType')}</option>
                          {selectableMetaTypes.map((ty: any) => (
                            <option key={ty.id} value={ty.id}>
                              {formatSessionTypeOptionLabel(ty)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!form.todo && !form.personal && !availabilitySelection && showBookingSpaceRow && (
                <div className="form-row form-row-infield calendar-booking-field--space">
                  <span className="form-field-inline-label">{t('formCalendarBookingSpace')}</span>
                  <div className="form-field-inline-control">
                  <select value={form.spaceId || ''} onChange={(e) => setForm({ ...form, spaceId: Number(e.target.value) || null })}><option value="">{t('formNoSpace')}</option>{metaSpaces.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </div>
                </div>
              )}
              {!form.todo && !form.personal && !availabilitySelection && (
                <div className="calendar-booking-row-divider calendar-booking-row-divider--timespan" aria-hidden />
              )}
              <div className="form-row form-row-timespan calendar-booking-timespan-row">
                <CalendarLocalTimespanRow
                  startValue={form.startTime}
                  endValue={form.endTime}
                  onCommitStart={(s) => updateBookingFormStartTime(s)}
                  onCommitEnd={(s) => updateBookingFormEndTime(s)}
                  normalize={normalizeToLocalDateTime}
                  labels={{ timeFrom: t('formTimeFrom'), timeTo: t('formTimeTo'), date: t('formCalendarDate') }}
                  allDayToggle={{
                    checked: isLocalBookingAllDay(form.startTime, form.endTime),
                    onToggle: () => {
                      setForm((f: any) => {
                        if (isLocalBookingAllDay(f.startTime, f.endTime)) {
                          const d =
                            splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                          const hm = toCalendarTimeValue(settings.WORKING_HOURS_START, '09:00').slice(0, 5)
                          const start = normalizeToLocalDateTime(`${d}T${hm}:00`)
                          bookingEndEditedManuallyRef.current = false
                          return {
                            ...f,
                            startTime: start,
                            endTime: getBookingEndTimeForStart(start, f.typeId),
                          }
                        }
                        const d =
                          splitLocalDateTimeParts(normalizeToLocalDateTime(f.startTime)).date || localTodayYmd()
                        bookingEndEditedManuallyRef.current = true
                        return {
                          ...f,
                          startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
                        }
                      })
                    },
                    label: t('formAllDay'),
                    captionId: newBookingAllDayCaptionId,
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
              {!form.todo && !form.personal && !availabilitySelection && (() => {
                const dateLoc = locale === 'sl' ? 'sl-SI' : 'en-GB'
                const startDate = form.startTime ? new Date(form.startTime) : null
                const sessionDay = startDate ? REPEAT_WEEKDAY_EN[startDate.getDay()] : 'Monday'
                const sessionDateStr = startDate
                  ? startDate.toLocaleDateString(dateLoc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                  : ''
                const repeatInterval = form.repeatInterval ?? 1
                const repeatUnit = form.repeatUnit ?? 'weeks'
                const repeatEndType = form.repeatEndType ?? 'after'
                const repeatEndCount = form.repeatEndCount ?? 5
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
                    {form.repeats && (
                      <div className="form-repeats-config">
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEvery')}</span>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            className="form-repeats-number"
                            value={repeatInterval}
                            onChange={(e) => setForm({ ...form, repeatInterval: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <select
                            className="form-repeats-select"
                            value={repeatUnit}
                            onChange={(e) => setForm({ ...form, repeatUnit: e.target.value })}
                          >
                            <option value="days">{t('formRepeatUnitDays')}</option>
                            <option value="weeks">{t('formRepeatUnitWeeks')}</option>
                            <option value="months">{t('formRepeatUnitMonths')}</option>
                          </select>
                        </div>
                        {repeatUnit === 'weeks' && (
                          <div className="form-repeats-row">
                            <span className="form-repeats-label">{t('formRepeatsOnDay')}</span>
                            <select
                              className="form-repeats-select"
                              value={form.repeatDay ?? sessionDay}
                              onChange={(e) => setForm({ ...form, repeatDay: e.target.value })}
                            >
                              {REPEAT_WEEKDAY_EN.map((d) => (
                                <option key={d} value={d}>{formatRepeatWeekdayLabel(locale, d)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="form-repeats-row">
                          <span className="form-repeats-label">{t('formRepeatsEnds')}</span>
                          <select
                            className="form-repeats-select"
                            value={repeatEndType}
                            onChange={(e) => setForm({ ...form, repeatEndType: e.target.value })}
                          >
                            <option value="after">{t('formRepeatEndAfter')}</option>
                            <option value="on">{t('formRepeatEndOnDate')}</option>
                          </select>
                          {repeatEndType === 'after' && (
                            <input
                              type="number"
                              min={2}
                              max={100}
                              className="form-repeats-number"
                              value={repeatEndCount}
                              onChange={(e) => setForm({ ...form, repeatEndCount: Math.max(2, Number(e.target.value) || 2) })}
                            />
                          )}
                          {repeatEndType === 'on' && (
                            <input
                              type="date"
                              className="form-repeats-date"
                              value={repeatEndDate}
                              onChange={(e) => setForm({ ...form, repeatEndDate: e.target.value })}
                            />
                          )}
                        </div>
                        <p className="form-repeats-summary muted">
                          {summaryLine}
                        </p>
                        <p className="form-repeats-note muted">
                          {t('formRepeatsSameDurationNote')}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}
              {isNativeAndroid ? (
                <>
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
                  <div className="form-row form-row-infield stretch book-session-notes-android">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
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
                </>
              ) : (
                <>
                  <div className="form-row form-row-infield stretch">
                    <span className="form-field-inline-label">{t('formNotes')}</span>
                    <div className="form-field-inline-control">
                    <SessionNotesTextarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
                </>
              )}
            </div>
            </div>
            {(availabilitySelection ? availabilityError : saveBookingError) && (
              <div className="calendar-booking-inline-toast-wrap">
                <div className="toast toast-error calendar-booking-inline-toast" role="alert">
                  <span className="toast-message">{availabilitySelection ? availabilityError : saveBookingError}</span>
                  <button
                    type="button"
                    className="toast-dismiss"
                    onClick={() => {
                      if (availabilitySelection) setAvailabilityError(null)
                      else setSaveBookingError(null)
                    }}
                    aria-label="Dismiss booking error"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
            {showSelectionFormFooter && (
            <div className="row gap booking-side-panel-footer" style={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                className="calendar-form-footer-btn calendar-form-footer-btn--save"
                onClick={() => void saveBooking(false)}
                disabled={saveBookingLoading}
              >
                <CalendarFormFooterSaveIcon />
                <span className="calendar-form-footer-btn__label">
                  {saveBookingLoading ? t('formSaving') : form.todo ? t('formAddTodo') : form.personal ? t('formAddBlock') : t('formBookSession')}
                </span>
              </button>
            </div>
            )}
            {!calendarFiltersBottomBar && availabilitySelection != null && (
              <div className="row gap booking-side-panel-footer" style={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  className="calendar-form-footer-btn calendar-form-footer-btn--save"
                  onClick={() => void confirmAvailabilityFromHeader()}
                  disabled={availabilitySaving}
                >
                  <CalendarFormFooterSaveIcon />
                  <span className="calendar-form-footer-btn__label">
                    {availabilitySaving
                      ? t('formSaving')
                      : availabilityIntent === 'block'
                        ? t('formBlockAvailabilityShort')
                        : availabilitySelection.slotId
                          ? t('formSaveChanges')
                          : t('formAvailabilityOpenShort')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {meetingProviderPickerOpen && (selection || selectedBookedSession) && (
        <div
          className="modal-backdrop meeting-provider-picker-backdrop"
          onClick={() => {
            setMeetingProviderPickerOpen(false)
            if (meetingPickerCancelUnchecksOnline) {
              if (meetingProviderPickerTarget === 'edit') {
                setSelectedBookedSession((s: any) => (s ? { ...s, online: false } : s))
              } else {
                setForm((f: any) => ({ ...f, online: false }))
              }
            }
            setMeetingProviderPickerTarget(null)
            setMeetingPickerCancelUnchecksOnline(false)
          }}
        >
          <div className="modal meeting-provider-picker-modal" onClick={(e) => e.stopPropagation()}>
            <p className="meeting-provider-picker-title">Choose meeting</p>
            <p className="muted meeting-provider-picker-hint">Google Meet or Zoom</p>
            <div className="meeting-provider-picker-actions">
              <button
                type="button"
                onClick={() => {
                  if (meetingProviderPickerTarget === 'edit') {
                    setSelectedBookedSession((s: any) => (s ? { ...s, meetingProvider: 'zoom', online: true } : s))
                  } else {
                    setForm((f: any) => ({ ...f, meetingProvider: 'zoom', online: true }))
                  }
                  setMeetingProviderPickerOpen(false)
                  setMeetingProviderPickerTarget(null)
                  setMeetingPickerCancelUnchecksOnline(false)
                }}
              >
                Zoom
              </button>
              <button
                type="button"
                onClick={() => {
                  if (meetingProviderPickerTarget === 'edit') {
                    setSelectedBookedSession((s: any) => (s ? { ...s, meetingProvider: 'google', online: true } : s))
                  } else {
                    setForm((f: any) => ({ ...f, meetingProvider: 'google', online: true }))
                  }
                  setMeetingProviderPickerOpen(false)
                  setMeetingProviderPickerTarget(null)
                  setMeetingPickerCancelUnchecksOnline(false)
                }}
              >
                Google Meet
              </button>
            </div>
            <button
              type="button"
              className="secondary meeting-provider-picker-cancel"
              onClick={() => {
                setMeetingProviderPickerOpen(false)
                if (meetingPickerCancelUnchecksOnline) {
                  if (meetingProviderPickerTarget === 'edit') {
                    setSelectedBookedSession((s: any) => (s ? { ...s, online: false } : s))
                  } else {
                    setForm((f: any) => ({ ...f, online: false }))
                  }
                }
                setMeetingProviderPickerTarget(null)
                setMeetingPickerCancelUnchecksOnline(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {androidLanguageModal && <LanguageModal onClose={() => setAndroidLanguageModal(false)} />}

      {showAddClientModal && (
        <div
          className={`modal-backdrop calendar-client-create-popup-backdrop calendar-booking-supplement clients-action-workspace-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ''}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCalendarAddClientModal()
          }}
          role="presentation"
        >
          <div
            className="modal large-modal calendar-client-create-popup clients-tab-client-detail-modal clients-action-workspace-modal clients-client-create-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="clients-create-modal-form"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault()
                if (!calendarCreateClientDisabled) void createClientFromBooking()
              }}
            >
              <div className="clients-action-workspace-header">
                <div className="clients-action-workspace-client">
                  <span className="clients-name-avatar clients-detail-avatar clients-action-workspace-avatar" aria-hidden>
                    {newClientInitials(String(newClientForm.firstName ?? ''), String(newClientForm.lastName ?? ''))}
                  </span>
                  <div className="clients-name-stack clients-action-workspace-title-stack">
                    <span className="clients-name">{calendarNewClientDisplayName}</span>
                    <span className="clients-id">ID #— <span className="clients-action-workspace-status-dot" /> {calendarNewClientActiveLabel}</span>
                  </div>
                </div>
                <button type="button" className="secondary clients-action-workspace-close" onClick={closeCalendarAddClientModal} aria-label={t('mobileNavClose')}>
                  ×
                </button>
              </div>

              <div className="clients-action-workspace-body">
                <div className="clients-detail-shell clients-action-workspace-shell">
                  <div className="clients-detail-fields clients-create-fields clients-action-workspace-settings-grid">
                    {renderCalendarNewClientEditableField('firstName', locale === 'sl' ? 'Ime' : 'First name')}
                    {renderCalendarNewClientEditableField('lastName', locale === 'sl' ? 'Priimek' : 'Last name')}
                    {renderCalendarNewClientEditableField('email', locale === 'sl' ? 'E-pošta' : 'Email', true, 'email')}
                    {renderCalendarNewClientEditableField('phone', locale === 'sl' ? 'Telefon' : 'Phone', true, 'tel')}
                  </div>
                  {clientError && <div className="error">{clientError}</div>}
                </div>
              </div>

              <div className="form-actions clients-action-workspace-footer clients-create-footer clients-create-footer--single">
                <button type="submit" className="clients-gapp-save-button" disabled={calendarCreateClientDisabled}>
                  {savingClient ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : calendarCreateClientLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </>
  )
}
