package com.example.app.billing;

import com.example.app.client.Client;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionPriceCalculationMode;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OpenBillSyncService {
    private final SessionBookingRepository sessionBookings;
    private final UserRepository users;
    private final OpenBillRepository openBillRepo;
    private final BillRepository billRepo;
    private final PaymentMethodRepository paymentMethodRepo;
    private final AdvanceAllocationRepository advanceAllocationRepo;
    private final ClientCompanyRepository clientCompanies;
    private final AppSettingRepository settings;
    private final TransactionServiceRepository txRepo;

    @PersistenceContext
    private EntityManager entityManager;

    public OpenBillSyncService(
            SessionBookingRepository sessionBookings,
            UserRepository users,
            OpenBillRepository openBillRepo,
            BillRepository billRepo,
            PaymentMethodRepository paymentMethodRepo,
            AdvanceAllocationRepository advanceAllocationRepo,
            ClientCompanyRepository clientCompanies,
            AppSettingRepository settings,
            TransactionServiceRepository txRepo
    ) {
        this.sessionBookings = sessionBookings;
        this.users = users;
        this.openBillRepo = openBillRepo;
        this.billRepo = billRepo;
        this.paymentMethodRepo = paymentMethodRepo;
        this.advanceAllocationRepo = advanceAllocationRepo;
        this.clientCompanies = clientCompanies;
        this.settings = settings;
        this.txRepo = txRepo;
    }

    @Transactional
    public void syncCompany(Long companyId) {
        var past = sessionBookings.findPastSessionsWithTypeAndCompanyId(LocalDateTime.now(), companyId);
        for (SessionBooking sb : past) {
            syncSessionRow(companyId, sb);
        }
        syncOpenBillsByBatchSettings(companyId);
    }

    /**
     * Keeps already-created session open bills aligned when clients are added to or removed from
     * a multi-client booking after the open bill was created. It intentionally does not create
     * open bills for a booking group that has no existing open bill yet.
     */
    @Transactional
    public void syncSessionGroup(Long companyId, String bookingGroupKey) {
        if (companyId == null || bookingGroupKey == null || bookingGroupKey.isBlank()) {
            return;
        }
        var groupRows = sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(bookingGroupKey, companyId);
        if (groupRows == null || groupRows.isEmpty()) {
            return;
        }

        var billableRows = billableRowsForGroup(groupRows, companyId);
        Set<Long> activeSessionIds = billableRows.stream()
                .map(SessionBooking::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (activeSessionIds.isEmpty()) {
            return;
        }

        var relatedOpenBills = findOpenBillsContainingAnySession(companyId, activeSessionIds);
        if (relatedOpenBills.isEmpty()) {
            return;
        }

        var sharedOpenBill = relatedOpenBills.stream()
                .filter(this::isSharedSessionGroupOpenBill)
                .min(Comparator.comparing(OpenBill::getId))
                .orElse(null);
        if (sharedOpenBill != null) {
            syncRowsIntoSharedOpenBill(companyId, sharedOpenBill, relatedOpenBills, billableRows);
            syncOpenBillsByBatchSettings(companyId);
            return;
        }

        for (SessionBooking row : billableRows) {
            syncSessionRow(companyId, row);
        }
        syncOpenBillsByBatchSettings(companyId);
    }

    /**
     * Removes open-bill lines for rows that are about to be deleted from a booking group.
     * Empty open bills are deleted so Billing > Open bills stays grouped by the current session members.
     */
    @Transactional
    public void removeSessionRowsFromOpenBills(Long companyId, Collection<Long> removedSessionIds) {
        if (companyId == null || removedSessionIds == null || removedSessionIds.isEmpty()) {
            return;
        }
        Set<Long> removedIds = removedSessionIds.stream()
                .filter(Objects::nonNull)
                .filter(id -> id > 0)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (removedIds.isEmpty()) {
            return;
        }

        var candidates = findOpenBillsContainingAnySession(companyId, removedIds);
        for (OpenBill candidate : candidates) {
            if (candidate == null || candidate.getId() == null) {
                continue;
            }
            OpenBill open = openBillRepo.findByIdWithItemsForBatchSync(candidate.getId(), companyId).orElse(null);
            if (open == null) {
                continue;
            }

            boolean removedLinkedSession = open.getSessionBooking() != null
                    && open.getSessionBooking().getId() != null
                    && removedIds.contains(open.getSessionBooking().getId());
            boolean changed = false;
            if (removedLinkedSession) {
                open.setSessionBooking(null);
                changed = true;
            }

            int before = open.getItems() == null ? 0 : open.getItems().size();
            if (open.getItems() != null) {
                open.getItems().removeIf(item -> {
                    Long sourceSessionId = item.getSourceSessionBookingId();
                    if (sourceSessionId != null) {
                        return removedIds.contains(sourceSessionId);
                    }
                    return removedLinkedSession;
                });
            }
            if ((open.getItems() == null ? 0 : open.getItems().size()) != before) {
                changed = true;
            }

            for (Long removedId : removedIds) {
                advanceAllocationRepo.deleteByCompanyIdAndOpenBillIdAndSessionBookingId(companyId, open.getId(), removedId);
            }

            if (open.getItems() == null || open.getItems().isEmpty()) {
                deleteAdvanceAllocationsForOpenBill(companyId, open.getId());
                openBillRepo.delete(open);
            } else if (changed) {
                openBillRepo.save(open);
            }
        }
        openBillRepo.flush();
        advanceAllocationRepo.flush();
        entityManager.clear();
    }

    private void syncSessionRow(Long companyId, SessionBooking sb) {
        if (sb == null || sb.getId() == null) {
            return;
        }
        if (SessionBookingStatus.CANCELLED.equals(SessionBookingStatus.normalizeStored(sb.getBookingStatus()))) {
            removeSessionRowsFromOpenBills(companyId, List.of(sb.getId()));
            return;
        }
        var type = sb.getType();
        if (!isNoShowSession(sb) && (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty())) {
            return;
        }
        if (isTotalPriceCalculation(sb) && !Objects.equals(billingSourceSessionForPriceMode(sb, companyId).getId(), sb.getId())) {
            return;
        }

        var client = sb.getClient();
        if (client == null) {
            return;
        }

        var consultant = resolveOpenBillConsultant(sb, companyId);
        if (consultant == null) {
            return;
        }

        PayeeResolution payee = resolveSessionPayee(sb, client);
        var linkedCompany = payee.linkedCompany();
        final boolean companyBatchEnabled = payee.companyTarget();
        final boolean clientBatchEnabled = payee.clientTarget();

        var legacyOpen = openBillRepo.findBySessionBookingIdAndCompanyId(sb.getId(), companyId).orElse(null);
        if (legacyOpen != null && legacyOpen.isManualSplitLocked()) {
            return;
        }
        var containingOpen = legacyOpen != null
                ? legacyOpen
                : openBillRepo.findContainingSession(companyId, sb.getId()).orElse(null);
        if (containingOpen != null && isSharedSessionGroupOpenBill(containingOpen)) {
            boolean changed = false;
            changed |= ensureSessionServiceLines(containingOpen, sb, companyId);
            changed |= ensureAdvanceOffsetLines(containingOpen, sb, companyId);
            if (changed) {
                openBillRepo.save(containingOpen);
            }
            return;
        }

        OpenBill open = resolveSyncTargetOpenBill(sb, client, consultant, linkedCompany, companyBatchEnabled, clientBatchEnabled, containingOpen, companyId);
        boolean changed = false;

        if (legacyOpen != null && !sameOpenBill(legacyOpen, open)) {
            open = moveOpenBillRowsIntoTarget(companyId, legacyOpen, open, sb.getId());
        } else if (legacyOpen == null && containingOpen != null && !sameOpenBill(containingOpen, open)) {
            // Existing batch bills can contain multiple sessions; do not move the whole batch when a single
            // session payer changes. New payer selection is applied when the open bill is first created.
            return;
        }

        changed |= ensureSessionServiceLines(open, sb, companyId);
        changed |= ensureAdvanceOffsetLines(open, sb, companyId);

        if (changed || open.getId() == null) {
            openBillRepo.save(open);
        }
    }

    private List<SessionBooking> billableRowsForGroup(List<SessionBooking> groupRows, Long companyId) {
        LinkedHashMap<Long, SessionBooking> billableById = new LinkedHashMap<>();
        for (SessionBooking row : groupRows) {
            if (row == null || row.getClient() == null) {
                continue;
            }
            if (SessionBookingStatus.CANCELLED.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus()))) {
                continue;
            }
            if (!isNoShowSession(row) && (row.getType() == null || row.getType().getLinkedServices() == null || row.getType().getLinkedServices().isEmpty())) {
                continue;
            }
            SessionBooking billable = billingSourceSessionForPriceMode(row, companyId);
            if (billable == null || billable.getId() == null || billable.getClient() == null) {
                continue;
            }
            if (SessionBookingStatus.CANCELLED.equals(SessionBookingStatus.normalizeStored(billable.getBookingStatus()))) {
                continue;
            }
            if (!isNoShowSession(billable) && (billable.getType() == null || billable.getType().getLinkedServices() == null || billable.getType().getLinkedServices().isEmpty())) {
                continue;
            }
            billableById.putIfAbsent(billable.getId(), billable);
        }
        return new ArrayList<>(billableById.values());
    }

    private List<OpenBill> findOpenBillsContainingAnySession(Long companyId, Set<Long> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) {
            return List.of();
        }
        return openBillRepo.findAllWithItemsByCompanyId(companyId).stream()
                .filter(open -> openBillContainsAnySession(open, sessionIds))
                .sorted(Comparator.comparing(OpenBill::getId))
                .toList();
    }

    private boolean openBillContainsAnySession(OpenBill open, Set<Long> sessionIds) {
        if (open == null || sessionIds == null || sessionIds.isEmpty()) {
            return false;
        }
        if (open.getSessionBooking() != null
                && open.getSessionBooking().getId() != null
                && sessionIds.contains(open.getSessionBooking().getId())) {
            return true;
        }
        if (open.getItems() == null) {
            return false;
        }
        return open.getItems().stream()
                .map(OpenBillItem::getSourceSessionBookingId)
                .filter(Objects::nonNull)
                .anyMatch(sessionIds::contains);
    }

    private void syncOpenBillsByBatchSettings(Long companyId) {
        var sourceIds = openBillRepo.findBatchMergeCandidateIds(companyId);
        for (Long sourceId : sourceIds) {
            mergeOpenBillIntoConfiguredBatch(companyId, sourceId);
            openBillRepo.flush();
            advanceAllocationRepo.flush();
            entityManager.clear();
        }
    }

    private void mergeOpenBillIntoConfiguredBatch(Long companyId, Long sourceId) {
        var sourceOpt = openBillRepo.findByIdWithItemsForBatchSync(sourceId, companyId);
        if (sourceOpt.isEmpty()) {
            return;
        }
        OpenBill source = sourceOpt.get();
        if (source.getId() == null) return;
        if (!OpenBill.BATCH_SCOPE_NONE.equals(source.getBatchScope())) return;
        if (source.getClient() == null || source.getItems() == null || source.getItems().isEmpty()) return;
        if (openBillHasExplicitSessionPayee(source, companyId)) return;

        BatchTarget batchTarget = resolveBatchTargetForOpenBillSource(source, companyId);
        if (batchTarget == null) return;

        OpenBill target;
        if (OpenBill.BATCH_SCOPE_COMPANY.equals(batchTarget.scope())) {
            target = openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, batchTarget.companyId())
                    .orElseGet(() -> newBatchOpenBillFromSource(source, OpenBill.BATCH_SCOPE_COMPANY, null, batchTarget.companyId()));
        } else {
            target = openBillRepo.findBatchByClientTarget(companyId, OpenBill.BATCH_SCOPE_CLIENT, batchTarget.clientId())
                    .orElseGet(() -> newBatchOpenBillFromSource(source, OpenBill.BATCH_SCOPE_CLIENT, batchTarget.clientId(), null));
        }
        if (sameOpenBill(source, target)) return;

        moveOpenBillRowsIntoTarget(
                companyId,
                source,
                target,
                source.getSessionBooking() != null ? source.getSessionBooking().getId() : null
        );
    }

    private record BatchTarget(String scope, Long clientId, Long companyId) {}

    private BatchTarget resolveBatchTargetForOpenBillSource(OpenBill source, Long companyId) {
        Set<Long> sessionIds = sourceSessionIds(source);
        if (!sessionIds.isEmpty()) {
            List<SessionBooking> sourceSessions = sourceSessionsForOpenBill(companyId, sessionIds);
            if (sourceSessions.size() != sessionIds.size()) {
                return null;
            }
            List<BatchTarget> resolvedTargets = sourceSessions.stream()
                    .map(this::resolveBatchTargetForSession)
                    .toList();
            if (resolvedTargets.stream().anyMatch(Objects::isNull)) {
                return null;
            }
            Set<BatchTarget> targets = resolvedTargets.stream()
                    .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
            if (targets.size() == 1) {
                return targets.iterator().next();
            }
            return null;
        }
        return resolveBatchTargetForClient(source.getClient());
    }

    private List<SessionBooking> sourceSessionsForOpenBill(Long companyId, Set<Long> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) {
            return List.of();
        }
        return sessionBookings.findAllByCompanyIdAndIds(companyId, sessionIds).stream()
                .filter(session -> session != null && session.getClient() != null)
                .toList();
    }

    private BatchTarget resolveBatchTargetForSession(SessionBooking session) {
        if (session == null || session.getClient() == null) return null;
        String explicitType = session.getPayeeType() == null ? null : session.getPayeeType().trim().toUpperCase(java.util.Locale.ROOT);
        if (session.isPayeeCustomData()) return null;
        if ("COMPANY".equals(explicitType)) {
            ClientCompany payeeCompany = session.getPayeeCompany();
            if (payeeCompany != null && payeeCompany.isBatchPaymentEnabled() && payeeCompany.getId() != null) {
                return new BatchTarget(OpenBill.BATCH_SCOPE_COMPANY, null, payeeCompany.getId());
            }
            return null;
        }
        return resolveBatchTargetForClient(session.getClient());
    }

    private BatchTarget resolveBatchTargetForClient(Client client) {
        if (client == null || client.getId() == null) return null;
        ClientCompany linkedCompany = client.getBillingCompany();
        if (linkedCompany != null && linkedCompany.isBatchPaymentEnabled() && linkedCompany.getId() != null) {
            return new BatchTarget(OpenBill.BATCH_SCOPE_COMPANY, null, linkedCompany.getId());
        }
        if (client.isBatchPaymentEnabled()) {
            return new BatchTarget(OpenBill.BATCH_SCOPE_CLIENT, client.getId(), null);
        }
        return null;
    }

    private Set<Long> sourceSessionIds(OpenBill source) {
        Set<Long> sessionIds = new LinkedHashSet<>();
        if (source.getSessionBooking() != null && source.getSessionBooking().getId() != null) {
            sessionIds.add(source.getSessionBooking().getId());
        }
        if (source.getItems() != null) {
            source.getItems().stream()
                    .map(OpenBillItem::getSourceSessionBookingId)
                    .filter(Objects::nonNull)
                    .forEach(sessionIds::add);
        }
        return sessionIds;
    }

    private boolean openBillHasExplicitSessionPayee(OpenBill source, Long companyId) {
        if (source == null) return false;
        Set<Long> sessionIds = sourceSessionIds(source);
        if (sessionIds.isEmpty()) return false;
        return sessionBookings.findAllByCompanyIdAndIds(companyId, sessionIds).stream()
                .anyMatch(session -> {
                    if (session == null) return false;
                    if (session.isPayeeCustomData()) return true;
                    String explicitType = session.getPayeeType() == null ? null : session.getPayeeType().trim().toUpperCase(java.util.Locale.ROOT);
                    if (!"COMPANY".equals(explicitType)) return false;
                    ClientCompany payeeCompany = session.getPayeeCompany();
                    return payeeCompany == null || !payeeCompany.isBatchPaymentEnabled();
                });
    }

    private OpenBill newBatchOpenBillFromSource(OpenBill source, String batchScope, Long batchTargetClientId, Long batchTargetCompanyId) {
        var target = new OpenBill();
        target.setCompany(source.getCompany());
        target.setClient(source.getClient());
        target.setConsultant(source.getConsultant());
        target.setPaymentMethod(source.getPaymentMethod() != null ? source.getPaymentMethod() : resolveDefaultPaymentMethod(source.getCompany().getId()));
        target.setReference(source.getReference());
        target.setSessionBooking(null);
        target.setBatchScope(batchScope);
        target.setBatchTargetClientId(batchTargetClientId);
        target.setBatchTargetCompanyId(batchTargetCompanyId);
        target.setManualSplitLocked(false);
        target.setBillType(source.getBillType());
        target.setBookingGroupKey(source.getBookingGroupKey());
        return target;
    }

    private boolean isSharedSessionGroupOpenBill(OpenBill open) {
        return open != null
                && open.isManualSplitLocked()
                && open.getSessionBooking() == null
                && OpenBill.BATCH_SCOPE_NONE.equals(open.getBatchScope())
                && (open.getManualSessionNumbersCsv() == null || open.getManualSessionNumbersCsv().isBlank());
    }

    private void syncRowsIntoSharedOpenBill(Long companyId, OpenBill sharedOpenBill, List<OpenBill> relatedOpenBills, List<SessionBooking> billableRows) {
        if (sharedOpenBill == null || sharedOpenBill.getId() == null) {
            return;
        }
        OpenBill target = openBillRepo.findByIdWithItemsForBatchSync(sharedOpenBill.getId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Long targetOpenBillId = target.getId();
        String groupKey = billableRows == null || billableRows.isEmpty() ? null : bookingGroupKey(billableRows.getFirst());

        for (OpenBill related : relatedOpenBills) {
            if (related == null || related.getId() == null || Objects.equals(related.getId(), targetOpenBillId)) {
                continue;
            }
            OpenBill source = openBillRepo.findByIdWithItemsForBatchSync(related.getId(), companyId).orElse(null);
            if (source == null || sameOpenBill(source, target)) {
                continue;
            }
            if (source.isManualSplitLocked() && source.getManualSessionNumbersCsv() != null && !source.getManualSessionNumbersCsv().isBlank()) {
                continue;
            }
            Long fallbackSessionId = source.getSessionBooking() != null ? source.getSessionBooking().getId() : null;
            target = moveOpenBillRowsIntoTarget(companyId, source, target, fallbackSessionId);
            targetOpenBillId = target.getId();
        }

        if (groupKey != null && !groupKey.isBlank()) {
            billableRows = billableRowsForGroup(
                    sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId),
                    companyId
            );
        }

        target.setSessionBooking(null);
        target.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        target.setBatchTargetClientId(null);
        target.setBatchTargetCompanyId(null);
        target.setManualSplitLocked(true);

        boolean changed = false;
        for (SessionBooking row : billableRows) {
            changed |= ensureSessionServiceLines(target, row, companyId);
            changed |= ensureAdvanceOffsetLines(target, row, companyId);
        }
        if (changed || target.getId() == null) {
            openBillRepo.saveAndFlush(target);
        } else {
            openBillRepo.save(target);
        }
    }

    private record PayeeResolution(ClientCompany linkedCompany, boolean companyTarget, boolean clientTarget) {}

    private PayeeResolution resolveSessionPayee(SessionBooking session, com.example.app.client.Client client) {
        String explicitType = session.getPayeeType() == null ? null : session.getPayeeType().trim().toUpperCase(java.util.Locale.ROOT);
        if ("COMPANY".equals(explicitType)) {
            ClientCompany payeeCompany = session.getPayeeCompany();
            if (session.isPayeeCustomData()) {
                return new PayeeResolution(payeeCompany, false, false);
            }
            boolean companyBatchEnabled = payeeCompany != null && payeeCompany.isBatchPaymentEnabled();
            return new PayeeResolution(payeeCompany, companyBatchEnabled, false);
        }
        if (session.isPayeeCustomData()) {
            return new PayeeResolution(null, false, false);
        }
        var linkedCompany = client.getBillingCompany();
        boolean companyBatchEnabled = linkedCompany != null && linkedCompany.isBatchPaymentEnabled();
        boolean clientBatchEnabled = !companyBatchEnabled && client.isBatchPaymentEnabled();
        return new PayeeResolution(linkedCompany, companyBatchEnabled, clientBatchEnabled);
    }

    private User resolveOpenBillConsultant(SessionBooking session, Long companyId) {
        if (session.getConsultant() != null) {
            return session.getConsultant();
        }
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
                .orElse(null);
    }

    private OpenBill resolveSyncTargetOpenBill(
            SessionBooking session,
            com.example.app.client.Client client,
            User consultant,
            ClientCompany linkedCompany,
            boolean companyBatchEnabled,
            boolean clientBatchEnabled,
            OpenBill containingOpen,
            Long companyId
    ) {
        if (companyBatchEnabled) {
            return openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, linkedCompany.getId())
                    .orElseGet(() -> {
                        if (containingOpen != null
                                && OpenBill.BATCH_SCOPE_COMPANY.equals(containingOpen.getBatchScope())
                                && Objects.equals(containingOpen.getBatchTargetCompanyId(), linkedCompany.getId())) {
                            return containingOpen;
                        }
                        return newOpenBillSkeleton(session, client, consultant, null, OpenBill.BATCH_SCOPE_COMPANY, null, linkedCompany.getId());
                    });
        }
        if (clientBatchEnabled) {
            return openBillRepo.findBatchByClientTarget(companyId, OpenBill.BATCH_SCOPE_CLIENT, client.getId())
                    .orElseGet(() -> {
                        if (containingOpen != null
                                && OpenBill.BATCH_SCOPE_CLIENT.equals(containingOpen.getBatchScope())
                                && Objects.equals(containingOpen.getBatchTargetClientId(), client.getId())) {
                            return containingOpen;
                        }
                        return newOpenBillSkeleton(session, client, consultant, null, OpenBill.BATCH_SCOPE_CLIENT, client.getId(), null);
                    });
        }
        if (containingOpen != null) {
            return containingOpen;
        }
        return newOpenBillSkeleton(session, client, consultant, session, OpenBill.BATCH_SCOPE_NONE, null, null);
    }

    private OpenBill newOpenBillSkeleton(
            SessionBooking session,
            com.example.app.client.Client client,
            User consultant,
            SessionBooking singleSession,
            String batchScope,
            Long batchTargetClientId,
            Long batchTargetCompanyId
    ) {
        OpenBill open = new OpenBill();
        open.setCompany(session.getCompany());
        open.setClient(client);
        open.setConsultant(consultant);
        open.setPaymentMethod(resolveDefaultPaymentMethod(session.getCompany().getId()));
        open.setSessionBooking(singleSession);
        open.setBatchScope(batchScope);
        open.setBatchTargetClientId(batchTargetClientId);
        open.setBatchTargetCompanyId(batchTargetCompanyId);
        if (session != null && session.getBookingGroupKey() != null && !session.getBookingGroupKey().isBlank()) {
            open.setBookingGroupKey(session.getBookingGroupKey());
        }
        return open;
    }

    private boolean sameOpenBill(OpenBill a, OpenBill b) {
        return a != null && b != null && a.getId() != null && a.getId().equals(b.getId());
    }

    private OpenBill moveOpenBillRowsIntoTarget(Long companyId, OpenBill source, OpenBill target, Long fallbackSessionId) {
        if (source == null || target == null || sameOpenBill(source, target)) {
            return target;
        }
        if (source.getId() == null) {
            return target;
        }

        var movedSessionIds = source.getItems() == null
                ? java.util.Set.<Long>of()
                : source.getItems().stream()
                .map(item -> item.getSourceSessionBookingId() != null ? item.getSourceSessionBookingId() : fallbackSessionId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());

        if ((target.getReference() == null || target.getReference().isBlank())
                && source.getReference() != null && !source.getReference().isBlank()) {
            target.setReference(source.getReference());
        }

        OpenBill savedTarget = openBillRepo.saveAndFlush(target);
        Long sourceOpenBillId = source.getId();
        Long targetOpenBillId = savedTarget.getId();

        // Move open-bill rows with bulk SQL after clearing Hibernate's
        // persistence context. This avoids mutating orphanRemoval collections
        // that Hibernate may already be tracking in the same session.
        entityManager.flush();
        entityManager.clear();

        openBillRepo.moveItemsToOpenBill(sourceOpenBillId, targetOpenBillId, fallbackSessionId, companyId);
        for (Long sessionId : movedSessionIds) {
            advanceAllocationRepo.reassignOpenBillForSession(companyId, sourceOpenBillId, targetOpenBillId, sessionId);
        }
        deleteAdvanceAllocationsForOpenBill(companyId, sourceOpenBillId);
        openBillRepo.deletePaymentSplitsByOpenBillIdAndCompanyId(sourceOpenBillId, companyId);
        openBillRepo.deleteByIdAndCompanyId(sourceOpenBillId, companyId);
        openBillRepo.flush();
        advanceAllocationRepo.flush();
        entityManager.clear();

        return openBillRepo.findByIdWithItemsForBatchSync(targetOpenBillId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /**
     * Verifies that the tenant has selected a dedicated NO SHOW transaction service.
     * Called before changing booking status so a missing configuration rolls back the action.
     */
    public void requireNoShowTransactionServiceConfigured(Long companyId) {
        resolveNoShowTransactionService(companyId);
    }

    private boolean ensureSessionServiceLines(OpenBill open, SessionBooking session, Long companyId) {
        if (open == null || session == null) {
            return false;
        }

        boolean changed = false;
        SessionBooking billingSession = billingSourceSessionForPriceMode(session, companyId);
        Long sourceSessionId = billingSession == null ? null : billingSession.getId();
        if (sourceSessionId == null) {
            return false;
        }

        var expectedLinks = distinctLinkedServicesForBilling(billingSession);
        var expectedServiceIds = linkedServiceIds(expectedLinks);

        // TOTAL-priced group sessions must be charged once only: on the first billable
        // session row. If this sync is invoked for another participant row, remove any
        // old generated service lines for that row instead of adding another copy.
        if (isTotalPriceCalculation(session) && !Objects.equals(sourceSessionId, session.getId())) {
            return removeGeneratedSessionServiceLines(open, session.getId(), linkedServiceIds(distinctLinkedServicesForBilling(session)));
        }
        if (isTotalPriceCalculation(session)) {
            changed |= removeTotalPriceNonPrimaryLines(open, billingSession, companyId, expectedServiceIds);
        }

        if (isNoShowSession(billingSession)) {
            TransactionService noShowService = resolveNoShowTransactionService(companyId);
            BigDecimal price = noShowService.getNetPrice() == null ? BigDecimal.ZERO : noShowService.getNetPrice();
            OpenBillItem keptNoShowLine = null;
            var iterator = open.getItems().iterator();
            while (iterator.hasNext()) {
                var item = iterator.next();
                if (!Objects.equals(item.getSourceSessionBookingId(), sourceSessionId) || item.getSourceAdvanceBillId() != null) {
                    continue;
                }
                boolean isNoShowLine = item.getTransactionService() != null
                        && Objects.equals(item.getTransactionService().getId(), noShowService.getId());
                if (isNoShowLine && keptNoShowLine == null) {
                    keptNoShowLine = item;
                    if (!Objects.equals(item.getQuantity(), 1)) {
                        item.setQuantity(1);
                        changed = true;
                    }
                    if (!sameMoney(item.getNetPrice(), price)) {
                        item.setNetPrice(price);
                        changed = true;
                    }
                    continue;
                }
                iterator.remove();
                changed = true;
            }
            if (keptNoShowLine == null) {
                var obi = new OpenBillItem();
                obi.setOpenBill(open);
                obi.setTransactionService(entityManager.getReference(TransactionService.class, noShowService.getId()));
                obi.setQuantity(1);
                obi.setNetPrice(price);
                obi.setSourceSessionBookingId(sourceSessionId);
                obi.setSourceAdvanceBillId(null);
                open.getItems().add(obi);
                changed = true;
            }
            return changed;
        }

        Long configuredNoShowServiceId = resolveNoShowTransactionServiceId(companyId);
        if (configuredNoShowServiceId != null) {
            int before = open.getItems().size();
            open.getItems().removeIf(item -> Objects.equals(item.getSourceSessionBookingId(), sourceSessionId)
                    && item.getSourceAdvanceBillId() == null
                    && item.getTransactionService() != null
                    && Objects.equals(item.getTransactionService().getId(), configuredNoShowServiceId));
            changed |= open.getItems().size() != before;
        }

        changed |= ensureExpectedLinkedServiceLines(open, sourceSessionId, expectedLinks);
        return changed;
    }

    private boolean ensureExpectedLinkedServiceLines(OpenBill open, Long sourceSessionId, List<TypeTransactionService> expectedLinks) {
        boolean changed = false;
        for (TypeTransactionService link : expectedLinks) {
            var tx = link.getTransactionService();
            if (tx == null || tx.getId() == null) continue;
            var price = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
            if (price == null) {
                price = BigDecimal.ZERO;
            }

            OpenBillItem keptLine = null;
            var iterator = open.getItems().iterator();
            while (iterator.hasNext()) {
                var item = iterator.next();
                if (!Objects.equals(item.getSourceSessionBookingId(), sourceSessionId)
                        || item.getSourceAdvanceBillId() != null
                        || item.getTransactionService() == null
                        || !Objects.equals(item.getTransactionService().getId(), tx.getId())) {
                    continue;
                }
                if (keptLine == null) {
                    keptLine = item;
                    if (!Objects.equals(item.getQuantity(), 1)) {
                        item.setQuantity(1);
                        changed = true;
                    }
                    if (!sameMoney(item.getNetPrice(), price)) {
                        item.setNetPrice(price);
                        changed = true;
                    }
                    continue;
                }
                iterator.remove();
                changed = true;
            }

            if (keptLine == null) {
                var obi = new OpenBillItem();
                obi.setOpenBill(open);
                obi.setTransactionService(entityManager.getReference(TransactionService.class, tx.getId()));
                obi.setQuantity(1);
                obi.setNetPrice(price);
                obi.setSourceSessionBookingId(sourceSessionId);
                obi.setSourceAdvanceBillId(null);
                open.getItems().add(obi);
                changed = true;
            }
        }
        return changed;
    }

    private List<TypeTransactionService> distinctLinkedServicesForBilling(SessionBooking session) {
        if (session == null || session.getType() == null || session.getType().getLinkedServices() == null) {
            return List.of();
        }
        var byServiceId = new LinkedHashMap<Long, TypeTransactionService>();
        for (TypeTransactionService link : session.getType().getLinkedServices()) {
            if (link == null || link.getTransactionService() == null || link.getTransactionService().getId() == null) {
                continue;
            }
            byServiceId.putIfAbsent(link.getTransactionService().getId(), link);
        }
        return new ArrayList<>(byServiceId.values());
    }

    private Set<Long> linkedServiceIds(List<TypeTransactionService> links) {
        if (links == null || links.isEmpty()) {
            return Set.of();
        }
        return links.stream()
                .map(TypeTransactionService::getTransactionService)
                .filter(Objects::nonNull)
                .map(TransactionService::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    private boolean removeGeneratedSessionServiceLines(OpenBill open, Long sourceSessionId, Set<Long> transactionServiceIds) {
        if (open == null || open.getItems() == null || sourceSessionId == null || transactionServiceIds == null || transactionServiceIds.isEmpty()) {
            return false;
        }
        int before = open.getItems().size();
        open.getItems().removeIf(item -> Objects.equals(item.getSourceSessionBookingId(), sourceSessionId)
                && item.getSourceAdvanceBillId() == null
                && item.getTransactionService() != null
                && transactionServiceIds.contains(item.getTransactionService().getId()));
        return open.getItems().size() != before;
    }

    private boolean removeTotalPriceNonPrimaryLines(OpenBill open, SessionBooking billingSession, Long companyId, Set<Long> transactionServiceIds) {
        if (open == null || open.getItems() == null || billingSession == null || billingSession.getId() == null
                || transactionServiceIds == null || transactionServiceIds.isEmpty()) {
            return false;
        }
        String groupKey = bookingGroupKey(billingSession);
        if (groupKey == null || groupKey.isBlank()) {
            return false;
        }
        Set<Long> nonPrimarySessionIds = sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId).stream()
                .map(SessionBooking::getId)
                .filter(Objects::nonNull)
                .filter(id -> !Objects.equals(id, billingSession.getId()))
                .collect(Collectors.toSet());
        if (nonPrimarySessionIds.isEmpty()) {
            return false;
        }
        int before = open.getItems().size();
        open.getItems().removeIf(item -> item.getSourceSessionBookingId() != null
                && nonPrimarySessionIds.contains(item.getSourceSessionBookingId())
                && item.getSourceAdvanceBillId() == null
                && item.getTransactionService() != null
                && transactionServiceIds.contains(item.getTransactionService().getId()));
        return open.getItems().size() != before;
    }

    private boolean isNoShowSession(SessionBooking session) {
        return session != null && SessionBookingStatus.NO_SHOW.equals(SessionBookingStatus.normalizeStored(session.getBookingStatus()));
    }

    private Long resolveNoShowTransactionServiceId(Long companyId) {
        if (companyId == null) return null;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.NO_SHOW_TRANSACTION_SERVICE_ID)
                .map(setting -> parsePositiveLong(setting.getValue()))
                .orElse(null);
    }

    private Long parsePositiveLong(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            Long value = Long.parseLong(raw.trim());
            return value != null && value > 0 ? value : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private TransactionService resolveNoShowTransactionService(Long companyId) {
        Long serviceId = resolveNoShowTransactionServiceId(companyId);
        if (serviceId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configure a NO SHOW transaction service in Service type > Transaction services first.");
        }
        return txRepo.findByIdAndCompanyId(serviceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configured NO SHOW transaction service was not found."));
    }

    private SessionBooking billingSourceSessionForPriceMode(SessionBooking session, Long companyId) {
        if (!isTotalPriceCalculation(session)) return session;
        String groupKey = bookingGroupKey(session);
        return sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId).stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> !SessionBookingStatus.CANCELLED.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus())))
                .findFirst()
                .orElse(session);
    }

    private Long billingSourceSessionIdForPriceMode(SessionBooking session) {
        return session == null ? null : session.getId();
    }

    private boolean isTotalPriceCalculation(SessionBooking session) {
        return session != null
                && session.getType() != null
                && session.getType().getPriceCalculationMode() == SessionPriceCalculationMode.TOTAL;
    }

    private static String bookingGroupKey(SessionBooking session) {
        if (session != null && session.getBookingGroupKey() != null && !session.getBookingGroupKey().isBlank()) {
            return session.getBookingGroupKey();
        }
        return session == null || session.getId() == null ? "" : "legacy-" + session.getId();
    }

    private boolean ensureAdvanceOffsetLines(OpenBill open, SessionBooking session, Long companyId) {
        boolean changed = false;
        var advances = billRepo.findAllByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdAsc(companyId, session.getId(), BillType.ADVANCE);
        for (Bill advance : advances) {
            if (!BillPaymentStatus.PAID.equals(advance.getPaymentStatus())) continue;
            for (var billItem : advance.getItems()) {
                if (billItem.getTransactionService() == null) continue;
                var negativeNet = (billItem.getNetPrice() == null ? BigDecimal.ZERO : billItem.getNetPrice()).negate();
                boolean exists = open.getItems().stream().anyMatch(item -> Objects.equals(item.getSourceAdvanceBillId(), advance.getId())
                        && Objects.equals(item.getSourceSessionBookingId(), session.getId())
                        && item.getTransactionService() != null
                        && Objects.equals(item.getTransactionService().getId(), billItem.getTransactionService().getId())
                        && sameMoney(item.getNetPrice(), negativeNet)
                        && Objects.equals(item.getQuantity(), billItem.getQuantity()));
                if (!exists) {
                    var obi = new OpenBillItem();
                    obi.setOpenBill(open);
                    obi.setTransactionService(entityManager.getReference(TransactionService.class, billItem.getTransactionService().getId()));
                    obi.setQuantity(billItem.getQuantity());
                    obi.setNetPrice(negativeNet);
                    obi.setSourceSessionBookingId(session.getId());
                    obi.setSourceAdvanceBillId(advance.getId());
                    open.getItems().add(obi);
                    changed = true;
                }
            }
        }
        return changed;
    }

    private static boolean sameMoney(BigDecimal a, BigDecimal b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.compareTo(b) == 0;
    }

    private void deleteAdvanceAllocationsForOpenBill(Long companyId, Long openBillId) {
        if (openBillId == null) {
            return;
        }
        advanceAllocationRepo.deleteByCompanyIdAndOpenBillId(companyId, openBillId);
    }

    private PaymentMethod resolveDefaultPaymentMethod(Long companyId) {
        var all = paymentMethodRepo.findAllByCompanyIdOrderByNameAsc(companyId);
        if (all.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No payment methods configured. Add one in Configuration > Billing.");
        }
        return all.getFirst();
    }
}
