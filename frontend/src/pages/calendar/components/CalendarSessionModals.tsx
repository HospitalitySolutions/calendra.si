// @ts-nocheck
import { useState } from 'react'
import { bookingStatusDisplayLabel, deriveBookingStatus } from '../calendarStatus'
export function CalendarSessionModals({ ctx }: { ctx: any }) {
  const {BookingTypeTabIcon,CalendarFormFooterDeleteIcon,CalendarFormFooterSaveIcon,CalendarLocalTimeDateRow,CalendarLocalTimespanRow,CalendarPaymentCompanyIcon,CalendarPaymentPersonIcon,CalendarScannerIcon,GuestConfigSaveIcon,LanguageModal,PageHeader,PersonalTaskCombo,REPEAT_WEEKDAY_EN,ROUTE_NEW_BOOKING,SessionNotesTextarea,activateNewFormPanel,addBookingGroupCaptionId,addBookingOnlineCaptionId,addClientInlineTitle,addGroupInlineTitle,androidLanguageModal,applyBookedSessionClientIds,applyFormClientIds,availabilityAllDayCaptionId,availabilityError,availabilityIntent,availabilityRangeEndInputRef,availabilityRangeStartInputRef,availabilitySaving,availabilitySelection,bookSessionClientFieldCompact,bookSessionClientsExpanded,bookSessionGroupFieldCompact,bookSessionNotesExpanded,bookSessionSelectedClient,bookSessionSelectedClients,bookedClientDropdownOpen,bookedClientSearch,bookedClientSearchInputRef,bookedPaymentClientDisplay,bookedPaymentManagerTab,bookedPaymentMenuOpen,bookedPaymentMeta,bookedPaymentPayeeDisplay,bookedPaymentPayeeDrafts,bookedPaymentPayeesUseSameCompanyForAll,bookedPaymentSidebarStatusMeta,bookedPaymentTotals,bookedPrimaryPaymentStatus,bookedSessionClientFieldCompact,bookedSessionClientsExpanded,bookedSessionGroupId,bookedSessionIsGroup,bookedSessionOnlineCaptionId,bookedSessionResolvedGroup,bookedSessionSelectedClient,bookedSessionSelectedClients,bookedStatusLabel,bookedStatusMenuOpen,bookedStatusTagColors,bookedStatusTransitionTargets,bookingEndEditedManuallyRef,bookingGroupMode,bookingPayeeCompanies,bookingStatusTagColors,calendarClientDetailId,calendarFiltersBottomBar,cancelBookedPersonalOverlap,cancelNonBookableMove,clearSingleClientTitle,clearSingleGroupTitle,clientDropdownOpen,clientError,clientSearch,clientSearchInputRef,clientSearchPlaceholder,closeBookedModal,closeBookingSelection,closePersonalModal,closeTodoModal,compactSelectionCheckAria,compactSelectionHeader,compactSessionEditHeader,confirmAvailabilityFromHeader,confirmBookedPersonalOverlap,confirmBookedPersonalOverlapYes,confirmDelete,confirmNonBookable,confirmNonBookableMove,confirmNonBookableMoveYes,confirmNonBookableYes,confirmOverlap,createClientFromBooking,createGroupFromBooking,createOpenBillForPaymentStatus,currency,deleteBookedSession,deletePersonalBlock,deleteTodo,editBookedAllDayCaptionId,form,formatDateTime,formatRepeatWeekdayLabel,fullName,getBookingEndTimeForStart,getMoreClientsLabel,getSessionPopupDragHandleProps,getSessionPopupInlineStyle,groupBookingEnabled,groupDropdownOpen,groupModalError,groupSearch,groupSearchInputRef,groupSearchPlaceholder,groupedSingleInvoiceClient,groupedSingleInvoicePayeeDraft,groupedSingleInvoiceStatus,hiddenBookSessionClientCount,hiddenBookedSessionClientCount,invoiceAllocationForPaymentStatus,isGroupedSingleInvoiceMode,isLocalBookingAllDay,isLocalTodoAllDayStart,isNativeAndroid,localTodayYmd,locale,meetingPickerCancelUnchecksOnline,meetingProviderPickerOpen,meetingProviderPickerTarget,metaClients,metaConsultants,metaSpaces,metaTypes,metaUsers,multipleClientsPerSessionEnabled,newBookingAllDayCaptionId,newClientForm,newClientInitials,newGroupForm,newGroupMemberIds,newGroupMemberSearch,normalizeToLocalDateTime,onNewFormPanelTouchEnd,onNewFormPanelTouchStart,openAvailabilityModalFromSelection,openBookedPaymentAddClient,openBookedPaymentDetailsForClient,openBookedSessionGroupScanner,openBookedPaymentEntitlementScanner,openPaymentInvoicePdf,openBookedPaymentOpenBillEditor,openBookedPaymentAdvanceEditor,openCalendarClientDetail,parseClientNameInput,paymentManagerIsNewBooking,paymentManagerSessionClients,paymentStatusForClient,personInitials,personalEditAllDayCaptionId,personalFormAllDayCaptionId,personalModuleEnabled,personalTaskPresetDropdownOpen,personalTaskPresets,renderBookingModeTitle,resendPaymentInvoicePdf,saveBookedPaymentManager,saveBooking,saveBookingError,saveBookingLoading,savingClient,savingNewGroupModal,selectableMetaTypes,selectedBookedClientIds,selectedBookedPaymentClient,selectedBookedPaymentClientDraft,selectedBookedPaymentLinkedCompany,selectedBookedPaymentPayeeDraft,selectedBookedPaymentPayeeLocked,selectedBookedPaymentClientIsGroupMember,selectedBookedPaymentStatus,selectedBookedSession,selectedFormClientIds,selectedGroup,selectedPersonalBlock,selectedTodo,selection,sessionPopupRef,setAndroidLanguageModal,setAvailabilityError,setAvailabilityIntent,setAvailabilitySelection,setBookSessionClientsExpanded,setBookSessionNotesExpanded,setBookedClientDropdownOpen,setBookedClientSearch,setBookedPaymentAddMode,setBookedPaymentAddSearch,setBookedPaymentGroupNameDraft,setBookedPaymentManagerTab,setBookedPaymentMenuOpen,setBookedSessionClientsExpanded,setBookedStatusMenuOpen,setBookedPaymentSharedCompanyForAll,setBookingGroupMode,setClientDropdownOpen,setClientSearch,setConfirmDelete,setConfirmNonBookable,setConfirmOverlap,setEditingBookedClientSearch,setEditingClientSearch,setEditingGroupSearch,setForm,setGroupDropdownOpen,setGroupModalError,setGroupSearch,setMeetingPickerCancelUnchecksOnline,setMeetingProviderPickerOpen,setMeetingProviderPickerTarget,setNewClientForm,setNewGroupForm,setNewGroupMemberIds,setNewGroupMemberSearch,setPersonalTaskPresetDropdownOpen,setSaveBookingError,setSelectedBookedPaymentClientId,setSelectedBookedSession,setSelectedPersonalBlock,setSelectedTodo,setShowAddClientModal,setShowAddGroupModal,settings,showAddClientModal,showAddGroupModal,showBookingConsultantRow,showBookingSpaceRow,showBookingTypeRow,showLessClientsLabel,showSelectionFormFooter,splitLocalDateTimeParts,t,toCalendarTimeValue,todoEditAllDayCaptionId,todoFormAllDayCaptionId,todosModuleEnabled,toggleBookedPaymentSameCompanyForAll,markBookedClientsNoShow,transitionBookedStatus,updateBookedSession,updateBookingFormEndTime,updateBookingFormStartTime,updateBookingFormType,updatePersonalBlock,updateSelectedBookedPaymentClientDraft,updateSelectedBookedPaymentPayee,updateTodo,useBookingSidePanel,user,visibleBookSessionClientChips,visibleBookedClients,visibleBookedSessionClientChips,visibleClients,visibleGroups,bookedPaymentAddCandidates,bookedPaymentAddMode,bookedPaymentAddSearch,paymentManagerAddClientSelectionActive,PAYMENT_MANAGER_ADD_CLIENT_ID,addBookedPaymentClientToSession,removeBookedPaymentClientFromGroup,removeBookedPaymentClientFromSession,bookedPaymentGroupNameDraft} = ctx

  const [bookedBillingActionMenu, setBookedBillingActionMenu] = useState<null | 'advance' | 'invoice'>(null)
  const [bookedBillingView, setBookedBillingView] = useState<null | 'advances' | 'invoices'>(null)
  const [bookedBillingViewSourceSession, setBookedBillingViewSourceSession] = useState<any>(null)
  const [noShowClientPickerOpen, setNoShowClientPickerOpen] = useState(false)
  const [noShowSelectedClientIds, setNoShowSelectedClientIds] = useState<number[]>([])
  const [noShowSubmitting, setNoShowSubmitting] = useState(false)

  const openBookedSessionClientDetail = (clientOrId?: any) => {
    const id = Number(typeof clientOrId === 'object' ? clientOrId?.id : clientOrId)
    if (!Number.isInteger(id) || id <= 0) return
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu(null)
    openCalendarClientDetail(id)
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
    }
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
    setBookedClientDropdownOpen(false)
    setBookedStatusMenuOpen(false)
    setBookedPaymentMenuOpen(false)
    setBookedBillingActionMenu((current) => (current === kind ? null : kind))
  }

  const openBookedBillingView = (kind: 'advances' | 'invoices') => {
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
  const bookingServiceBillingButtonIsAdvance = !canShowOpenBillForBookedStatus

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
    void transitionBookedStatus(option.targetStatus)
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

  const renderBillingActionMenu = (kind: 'advance' | 'invoice') => bookedBillingActionMenu === kind ? (
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
              <span>{isAdvances ? (locale === 'sl' ? 'Predplačilo št.' : 'Advance no.') : (locale === 'sl' ? 'Račun št.' : 'Invoice no.')}</span>
              <span>{locale === 'sl' ? 'Plačnik' : 'Payer'}</span>
              <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
              <span>{isAdvances ? (locale === 'sl' ? 'Datum plačila' : 'Paid date') : (locale === 'sl' ? 'Datum' : 'Date')}</span>
              <span>{locale === 'sl' ? 'Način plačila' : 'Payment method'}</span>
              <span>{locale === 'sl' ? 'Status' : 'Status'}</span>
            </div>
            {rows.length > 0 ? rows.map((row: any) => {
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
            }) : (
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

  return (
    <>
      {confirmOverlap && (
        <div className="modal-backdrop calendar-booking-supplement" onClick={() => { setConfirmOverlap(null) }}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title="Overlapping sessions"
              subtitle={`There are ${confirmOverlap.overlapping.length} existing session(s) at this time. Do you want to delete them and create the new one?`}
            />
            <div className="row gap">
              <button onClick={() => saveBooking(true, false, true)} disabled={saveBookingLoading}>Yes, delete and create</button>
              <button className="secondary" onClick={() => { setConfirmOverlap(null) }}>No, keep booking form</button>
            </div>
          </div>
        </div>
      )}

      {confirmBookedPersonalOverlap && (
        <div className="modal-backdrop calendar-booking-supplement" onClick={cancelBookedPersonalOverlap}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title="Personal time"
              subtitle="You already have a session planned at this time. Are you sure?"
            />
            <div className="row gap">
              <button type="button" onClick={() => void confirmBookedPersonalOverlapYes()} disabled={saveBookingLoading}>
                Yes
              </button>
              <button type="button" className="secondary" onClick={cancelBookedPersonalOverlap}>
                Cancel
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
                Do you really want to book a client on non bookable time slot?
              </p>
            ) : (
              <PageHeader title="Warning" subtitle="Do you really want to book a client on non bookable time slot?" />
            )}
            <div className="row gap">
              <button type="button" onClick={() => void confirmNonBookableMoveYes()}>
                Yes
              </button>
              <button type="button" className="secondary" onClick={cancelNonBookableMove}>
                No
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
                Do you really want to book a client on non bookable time slot?
              </p>
            ) : (
              <PageHeader title="Warning" subtitle="Do you really want to book a client on non bookable time slot?" />
            )}
            <div className="row gap">
              <button
                type="button"
                onClick={() => void confirmNonBookableYes()}
                disabled={saveBookingLoading}
              >
                Yes
              </button>
              <button className="secondary" onClick={() => setConfirmNonBookable(null)}>No</button>
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
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
            style={getSessionPopupInlineStyle(true)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`booking-side-panel-header${compactSessionEditHeader ? ' booking-side-panel-header--compact-booking' : ''}`} {...getSessionPopupDragHandleProps()}>
              {compactSessionEditHeader ? (
                !confirmDelete ? (
                  <div className="booking-side-panel-header-toolbar booking-side-panel-header-toolbar--session-edit">
                    <button type="button" className="secondary booking-side-panel-close" onClick={closeBookedModal} aria-label={t('mobileNavClose')}>
                      ×
                    </button>
                    <div className="booking-side-panel-header-ico-group">
                      <button
                        type="button"
                        className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                        onClick={() => setConfirmDelete(true)}
                        aria-label={t('formDeleteSession')}
                        title={t('formDeleteSession')}
                      >
                        <CalendarFormFooterDeleteIcon />
                        <span className="calendar-form-footer-btn__label">{t('formDeleteSession')}</span>
                      </button>
                      <button
                        type="button"
                        className="calendar-form-footer-btn calendar-form-footer-btn--save"
                        onClick={() => void updateBookedSession()}
                        disabled={selectedBookedClientIds.length === 0 && !bookedClientSearch.trim()}
                        aria-label={t('formSave')}
                        title={t('formSave')}
                      >
                        <CalendarFormFooterSaveIcon />
                        <span className="calendar-form-footer-btn__label">{t('formSave')}</span>
                      </button>
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
                          <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          </span>
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
                            title={locale === 'sl' ? 'Klient & plačnik · Podatki' : 'Client & payee · Details'}
                            aria-label={locale === 'sl' ? 'Odpri Klient & plačnik · Podatki' : 'Open Client & payee · Details'}
                            disabled={bookedPaymentActionButtonsDisabled}
                            onClick={() => openBookedPaymentManagerTab('details')}
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
                      <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      </span>
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
                      {!multipleClientsPerSessionEnabled && bookedSessionSelectedClient?.id && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__clear-btn"
                          title={clearSingleClientTitle}
                          aria-label={clearSingleClientTitle}
                          onClick={(e) => {
                            e.stopPropagation()
                            applyBookedSessionClientIds([])
                            setBookedClientSearch('')
                            setEditingBookedClientSearch(false)
                            setBookedClientDropdownOpen(false)
                          }}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      )}
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
                  <div className="form-field-inline-control calendar-booking-service-select-only" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                      style={{ flex: 1, minWidth: 0 }}
                      value={selectedBookedSession.type?.id ?? ''}
                      onChange={(e) => setSelectedBookedSession({ ...selectedBookedSession, type: metaTypes.find((ty: any) => ty.id === Number(e.target.value)) })}
                    >
                      <option value="">{t('formNoType')}</option>
                      {metaTypes.map((ty: any) => (
                        <option key={ty.id} value={ty.id}>{ty.name}</option>
                      ))}
                    </select>
                    <div className="calendar-session-billing-actions">
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
                      {canShowOpenBillForBookedStatus && (
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
                            startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                            endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                          }
                        : prev,
                    )
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
              {selectedBookedSession.online && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formMeeting')}</span>
                  <div className="form-field-inline-control">
                  <div className="meeting-provider-summary">
                    <span>{selectedBookedSession.meetingProvider === 'google' ? 'Google Meet' : 'Zoom'}</span>
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
                  </div>
                </div>
              )}
              {(selectedBookedSession.meetingLink || (selectedBookedSession.notes || '').includes('Zoom meeting:')) && (
                <div className="form-row form-row-infield">
                  <span className="form-field-inline-label">{t('formMeetingLink')}</span>
                  <div className="form-field-inline-control">
                  <a href={selectedBookedSession.meetingLink || (selectedBookedSession.notes || '').match(/Zoom meeting:\s*(https?:\/\/[^\s\n]+)/)?.[1]} target="_blank" rel="noopener noreferrer" className="linkish">
                    {(selectedBookedSession.meetingProvider === 'google' || (selectedBookedSession.meetingLink || '').includes('meet.google.com')) ? t('formOpenGoogleMeet') : t('formOpenZoom')}
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
              className={`row gap booking-side-panel-footer${compactSessionEditHeader && !confirmDelete ? ' booking-side-panel-footer--hidden' : ''}`}
              style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              {confirmDelete ? (
                <>
                  <span className="muted">{t('formDeleteSessionQuestion')}</span>
                  <button className="danger" onClick={deleteBookedSession}>{t('formYesDelete')}</button>
                  <button className="secondary" onClick={() => setConfirmDelete(false)}>{t('formCancel')}</button>
                </>
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
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="calendar-form-footer-btn calendar-form-footer-btn--delete"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <CalendarFormFooterDeleteIcon />
                    <span className="calendar-form-footer-btn__label">{t('formDeleteSession')}</span>
                  </button>
                  <button
                    type="button"
                    className="calendar-form-footer-btn calendar-form-footer-btn--save"
                    onClick={() => void updateBookedSession()}
                    disabled={selectedBookedClientIds.length === 0 && !bookedClientSearch.trim()}
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

      {bookedBillingView === 'advances' && renderSessionBillingViewModal('advances')}
      {bookedBillingView === 'invoices' && renderSessionBillingViewModal('invoices')}

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
                      const canCreateAdvanceBill = isReservedBookingStatus && !advanceAllocation && !invoiceAllocation && status?.status !== 'PAID'
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
                          const canCreateAdvanceBill = isReservedBookingStatus && !advanceAllocation && !invoiceAllocation && !entitlementAllocation && status?.status !== 'PAID'
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
                disabled={selectedBookedClientIds.length === 0 && !bookedClientSearch.trim()}
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
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
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
              <div className="form-row form-row-infield">
                <span className="form-field-inline-label">{t('formTask')}</span>
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
                            startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                            endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                          }
                        : prev,
                    )
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
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
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
                  <span className="form-field-inline-label">{t('formTask')}</span>
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
            className={[useBookingSidePanel ? 'modal large-modal booking-side-panel calendar-edit-session-panel' : 'modal large-modal calendar-session-popup calendar-edit-session-panel', availabilitySelection ? 'calendar-edit-session-panel--availability' : ''].filter(Boolean).join(' ')}
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
                {personalModuleEnabled && (
                <button
                  type="button"
                  className={!availabilitySelection && form.personal ? 'booking-type-btn booking-type-btn--personal active' : 'booking-type-btn booking-type-btn--personal'}
                  onClick={() => activateNewFormPanel('personal')}
                >
                  <span className="booking-type-btn-label"><BookingTypeTabIcon name="personal" />{t('formPersonal')}</span>
                </button>
                )}
                {todosModuleEnabled && (
                <button
                  type="button"
                  className={!availabilitySelection && form.todo ? 'booking-type-btn booking-type-btn--todo active' : 'booking-type-btn booking-type-btn--todo'}
                  onClick={() => activateNewFormPanel('todo')}
                >
                  <span className="booking-type-btn-label"><BookingTypeTabIcon name="todo" />{t('formTodo')}</span>
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
                          className={`online-live-switch-choice${availabilityIntent === 'block' ? ' online-live-switch-choice--active' : ''}`}
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
                              startTime: normalizeToLocalDateTime(`${d}T00:00:00`),
                              endTime: normalizeToLocalDateTime(`${d}T23:59:59`),
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
                                startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                                endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                              }
                            : prev,
                        )
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
                  {!availabilitySelection.indefinite && (
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
                    <span className="form-field-inline-label">{t('formTask')}</span>
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
                  <div className="form-row form-row-infield">
                    <span className="form-field-inline-label">{t('formTask')}</span>
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
                          startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                          endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                        }))
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
                      {!multipleClientsPerSessionEnabled && bookSessionSelectedClient?.id && (
                        <button
                          type="button"
                          className="secondary calendar-client-picker__clear-btn"
                          title={clearSingleClientTitle}
                          aria-label={clearSingleClientTitle}
                          onClick={(e) => {
                            e.stopPropagation()
                            applyFormClientIds([])
                            setClientSearch('')
                            setEditingClientSearch(false)
                            setClientDropdownOpen(false)
                          }}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      )}
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
                <div className={`form-row form-row-infield calendar-booking-field--service${!isNativeAndroid ? ' calendar-booking-service-with-online' : ''}`}>
                  {!isNativeAndroid ? (
                    <>
                      <div className="calendar-booking-service-infield-head">
                        <span className="form-field-inline-label">{t('formCalendarBookingService')}</span>
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
                      </div>
                      <div className="form-field-inline-control calendar-booking-service-select-only">
                        <select
                          value={form.typeId || ''}
                          onChange={(e) => updateBookingFormType(Number(e.target.value) || null)}
                        >
                          <option value="">{t('formNoType')}</option>
                          {selectableMetaTypes.map((ty: any) => (
                            <option key={ty.id} value={ty.id}>
                              {ty.name}
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
                              {ty.name}
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
                      startTime: normalizeToLocalDateTime(`${ymd}T00:00:00`),
                      endTime: normalizeToLocalDateTime(`${ymd}T23:59:59`),
                    }))
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
                      <label><input type="checkbox" checked={!!form.online} onChange={(e) => { const on = e.target.checked; if (on) { setForm({ ...form, online: true }); setMeetingPickerCancelUnchecksOnline(true); setMeetingProviderPickerTarget('create'); setMeetingProviderPickerOpen(true) } else { setForm({ ...form, online: false }); setMeetingProviderPickerOpen(false); setMeetingProviderPickerTarget(null); setMeetingPickerCancelUnchecksOnline(false) } }} disabled={!!form.personal || !!form.todo} /> {t('formOnline')}</label>
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
                          : t('formAvailabilityFooterAdd')}
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
          className="modal-backdrop calendar-client-create-popup-backdrop calendar-booking-supplement"
          onClick={() => setShowAddClientModal(false)}
        >
          <div className="modal large-modal clients-create-popup calendar-client-create-popup clients-detail-panel-modern clients-create-modal calendar-create-entry-modal calendar-create-entry-modal--client-only" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-create-entry-header" {...getSessionPopupDragHandleProps()}>
              <div>
                <h2>{locale === 'sl' ? 'Dodaj novo stranko' : 'Add new client'}</h2>
                <p>{locale === 'sl' ? 'Ustvari novo stranko in jo poveži s terminom.' : 'Create a new client and attach it to this session.'}</p>
              </div>
              <button type="button" className="calendar-create-entry-close" onClick={() => setShowAddClientModal(false)} aria-label={t('mobileNavClose')}>×</button>
            </div>

            <div className="calendar-create-entry-body">
              <div className="calendar-create-entry-grid calendar-create-entry-grid--client">
                <label className="calendar-create-entry-field">
                  <span>{locale === 'sl' ? 'Ime' : 'First name'} <i aria-hidden /></span>
                  <input
                    value={newClientForm.firstName}
                    onChange={(e) => setNewClientForm({ ...newClientForm, firstName: e.target.value })}
                    placeholder={locale === 'sl' ? 'Vnesite ime' : 'Enter first name'}
                    required
                  />
                </label>
                <label className="calendar-create-entry-field">
                  <span>{locale === 'sl' ? 'Priimek' : 'Last name'} <i aria-hidden /></span>
                  <input
                    value={newClientForm.lastName}
                    onChange={(e) => setNewClientForm({ ...newClientForm, lastName: e.target.value })}
                    placeholder={locale === 'sl' ? 'Vnesite priimek' : 'Enter last name'}
                    required
                  />
                </label>
                <label className="calendar-create-entry-field calendar-create-entry-field--wide">
                  <span>{locale === 'sl' ? 'E-pošta' : 'Email'} <i aria-hidden /></span>
                  <input
                    type="email"
                    value={newClientForm.email}
                    onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                    placeholder={locale === 'sl' ? 'Vnesite e-pošto' : 'Enter email'}
                  />
                </label>
                <label className="calendar-create-entry-field calendar-create-entry-field--wide">
                  <span>{locale === 'sl' ? 'Telefon' : 'Phone'}</span>
                  <input
                    value={newClientForm.phone}
                    onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                    placeholder={locale === 'sl' ? 'Vnesite telefonsko številko' : 'Enter phone number'}
                  />
                </label>
              </div>

              {clientError && <div className="error calendar-create-entry-error">{clientError}</div>}
            </div>

            <div className="calendar-create-entry-footer">
              <button type="button" className="secondary calendar-create-entry-secondary" onClick={() => setShowAddClientModal(false)}>{t('cancel')}</button>
              <button type="button" className="calendar-create-entry-primary" onClick={() => void createClientFromBooking()} disabled={savingClient}>{savingClient ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : (locale === 'sl' ? 'Ustvari' : 'Create')}</button>
            </div>
          </div>
        </div>
      )}


    </>
  )
}
