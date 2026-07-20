package com.example.app.analytics;

import com.example.app.billing.Bill;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillType;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.common.TimeService;
import com.example.app.security.SecurityUtils;
import com.example.app.session.ServiceGroup;
import com.example.app.session.ServiceGroupRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import com.example.app.user.User;
import com.example.app.waitlist.WaitlistOffer;
import com.example.app.waitlist.WaitlistOfferRepository;
import com.example.app.waitlist.WaitlistOfferStatus;
import com.example.app.waitlist.WaitlistRequest;
import com.example.app.waitlist.WaitlistRequestRepository;
import com.example.app.waitlist.WaitlistRequestService;
import com.example.app.waitlist.WaitlistRequestServiceRepository;
import com.example.app.waitlist.WaitlistServiceScope;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalyticsService {
    private final SessionBookingRepository bookingRepository;
    private final ClientRepository clientRepository;
    private final BillRepository billRepository;
    private final ServiceGroupRepository serviceGroupRepository;
    private final WaitlistRequestRepository waitlistRequestRepository;
    private final WaitlistRequestServiceRepository waitlistRequestServiceRepository;
    private final WaitlistOfferRepository waitlistOfferRepository;
    private final TimeService timeService;

    @Value("${app.reminders.timezone:Europe/Ljubljana}")
    private String remindersTimezone;

    public AnalyticsService(
            SessionBookingRepository bookingRepository,
            ClientRepository clientRepository,
            BillRepository billRepository,
            ServiceGroupRepository serviceGroupRepository,
            WaitlistRequestRepository waitlistRequestRepository,
            WaitlistRequestServiceRepository waitlistRequestServiceRepository,
            WaitlistOfferRepository waitlistOfferRepository,
            TimeService timeService) {
        this.bookingRepository = bookingRepository;
        this.clientRepository = clientRepository;
        this.billRepository = billRepository;
        this.serviceGroupRepository = serviceGroupRepository;
        this.waitlistRequestRepository = waitlistRequestRepository;
        this.waitlistRequestServiceRepository = waitlistRequestServiceRepository;
        this.waitlistOfferRepository = waitlistOfferRepository;
        this.timeService = timeService;
    }

    public record PeriodPoint(
            String label,
            Integer year,
            Integer month,
            long sessionsTotal,
            long clientsTotal,
            long sessionsStandard,
            long sessionsOnline,
            long newClients,
            BigDecimal revenueNet,
            BigDecimal revenueGross
    ) {}

    public record Summary(
            long sessionsTotal,
            long clientsTotal,
            long sessionsStandard,
            long sessionsOnline,
            long newClients,
            BigDecimal revenueNet,
            BigDecimal revenueGross
    ) {}

    public record WeekdayLoadPoint(
            String dayKey,
            String label,
            long sessionsTotal,
            long consultantMinutes,
            long spaceMinutes,
            long onlineSessions,
            long onsiteSessions
    ) {}

    public record WeekPoint(
            String label,
            String weekStart,
            long sessionsTotal,
            long newClients,
            BigDecimal revenueGross,
            long consultantMinutes,
            long spaceMinutes
    ) {}

    public record RankedAmount(
            String label,
            BigDecimal amount,
            long count
    ) {}

    public record UsageRanking(
            String label,
            long minutes,
            long sessionsTotal
    ) {}

    public record ServiceMetric(
            Long serviceId,
            String serviceName,
            long bookings,
            long completed,
            long cancelled,
            long noShows,
            long bookedMinutes,
            BigDecimal revenueGross,
            long waitlistRequests,
            long waitlistOffers,
            long acceptedOffers,
            double waitlistConversionRate
    ) {}

    public record ServiceGroupMetric(
            Long serviceGroupId,
            String serviceGroupName,
            boolean active,
            long bookings,
            long completed,
            long cancelled,
            long noShows,
            long bookedMinutes,
            BigDecimal revenueGross,
            long waitlistRequests,
            long waitlistOffers,
            long acceptedOffers,
            double waitlistConversionRate,
            List<ServiceMetric> services
    ) {}

    public record AnalyticsOverviewResponse(
            String period,
            String rangeStart,
            String rangeEnd,
            Summary summary,
            List<PeriodPoint> months,
            List<PeriodPoint> years,
            List<WeekdayLoadPoint> weekdays,
            List<WeekPoint> weeks,
            List<RankedAmount> topServices,
            List<RankedAmount> topConsultants,
            List<RankedAmount> topClients,
            List<UsageRanking> topSpaces,
            List<ServiceGroupMetric> serviceGroups
    ) {}

    public record InvoiceReportSummary(
            long issuedInvoices,
            BigDecimal grossTotal,
            BigDecimal netTotal,
            BigDecimal vatTotal,
            BigDecimal paidTotal,
            BigDecimal openTotal,
            BigDecimal refundedTotal
    ) {}

    public record InvoiceReportRow(
            String invoiceNumber,
            String client,
            String date,
            String status,
            String type,
            String paymentMethod,
            String consultant,
            BigDecimal netTotal,
            BigDecimal grossTotal,
            BigDecimal vatTotal
    ) {}

    public record RevenueInvoicesReportResponse(
            String rangeStart,
            String rangeEnd,
            InvoiceReportSummary summary,
            List<RankedAmount> revenueByPaymentMethod,
            List<RankedAmount> revenueByConsultant,
            List<RankedAmount> revenueByService,
            List<InvoiceReportRow> invoices
    ) {}

    public record BookingReportSummary(
            long reservedBookings,
            long completedSessions,
            long cancelledSessions,
            long noShows,
            long onlineSessions,
            long onsiteSessions
    ) {}

    public record CountRanking(
            String label,
            long count,
            long minutes
    ) {}

    public record BookingsAttendanceReportResponse(
            String rangeStart,
            String rangeEnd,
            BookingReportSummary summary,
            List<CountRanking> sourceBreakdown,
            List<CountRanking> busiestDaysTimes,
            List<UsageRanking> consultantHours,
            List<UsageRanking> roomHours
    ) {}

    private static final class Bucket {
        long sessionsTotal = 0;
        final Set<Long> clientIds = new HashSet<>();
        long sessionsStandard = 0;
        long sessionsOnline = 0;
        long newClients = 0;
        BigDecimal revenueNet = BigDecimal.ZERO;
        BigDecimal revenueGross = BigDecimal.ZERO;
        long consultantMinutes = 0;
        long spaceMinutes = 0;
        long onlineSessions = 0;
        long onsiteSessions = 0;
    }

    private static final class RankedBucket {
        BigDecimal amount = BigDecimal.ZERO;
        long count = 0;
        long minutes = 0;
        long sessionsTotal = 0;
    }

    private static final class CountBucket {
        long count = 0;
        long minutes = 0;
    }

    private record GroupKey(Long id, String name) {}
    private record ServiceKey(Long id, String name) {}

    private static final class ServiceAnalyticsBucket {
        final Long serviceId;
        final String serviceName;
        long bookings;
        long completed;
        long cancelled;
        long noShows;
        long bookedMinutes;
        BigDecimal revenueGross = BigDecimal.ZERO;
        long waitlistRequests;
        long waitlistOffers;
        long acceptedOffers;

        ServiceAnalyticsBucket(Long serviceId, String serviceName) {
            this.serviceId = serviceId;
            this.serviceName = serviceName;
        }
    }

    private static final class GroupAnalyticsBucket {
        final Long groupId;
        final String groupName;
        boolean active;
        long bookings;
        long completed;
        long cancelled;
        long noShows;
        long bookedMinutes;
        BigDecimal revenueGross = BigDecimal.ZERO;
        long waitlistRequests;
        long waitlistOffers;
        long acceptedOffers;
        final Map<ServiceKey, ServiceAnalyticsBucket> services = new LinkedHashMap<>();

        GroupAnalyticsBucket(Long groupId, String groupName, boolean active) {
            this.groupId = groupId;
            this.groupName = groupName;
            this.active = active;
        }

        ServiceAnalyticsBucket service(Long serviceId, String serviceName) {
            ServiceKey key = new ServiceKey(serviceId, safeAnalyticsName(serviceName, "Service"));
            return services.computeIfAbsent(key, ignored -> new ServiceAnalyticsBucket(key.id(), key.name()));
        }
    }

    @Transactional(readOnly = true)
    public AnalyticsOverviewResponse overview(
            User me,
            String periodRaw,
            LocalDate fromParam,
            LocalDate toParam,
            Long consultantIdParam,
            Long spaceId,
            Long typeId,
            Long serviceGroupId
    ) {
        return overviewForCompany(
                me.getCompany().getId(),
                periodRaw,
                fromParam,
                toParam,
                resolveConsultantFilter(me, consultantIdParam),
                spaceId,
                typeId,
                serviceGroupId
        );
    }

    @Transactional(readOnly = true)
    public AnalyticsOverviewResponse overviewForCompany(
            Long companyId,
            String periodRaw,
            LocalDate fromParam,
            LocalDate toParam,
            Long consultantFilter,
            Long spaceId,
            Long typeId,
            Long serviceGroupId
    ) {
        ZoneId zone = ZoneId.of(remindersTimezone);
        String period = normalizePeriod(periodRaw);
        DateRange range = resolveRange(period, fromParam, toParam, zone);

        LocalDateTime bookingRangeStart = range.from().atStartOfDay();
        LocalDateTime bookingRangeEndExclusive = range.to().plusDays(1).atStartOfDay();
        Instant clientCreatedFrom = range.from().atStartOfDay(zone).toInstant();
        Instant clientCreatedToExclusive = range.to().plusDays(1).atStartOfDay(zone).toInstant();

        List<SessionBooking> bookings = bookingRepository.findAnalyticsByCompanyIdAndRange(
                companyId,
                bookingRangeStart,
                bookingRangeEndExclusive,
                consultantFilter,
                spaceId,
                typeId,
                serviceGroupId
        );
        List<Client> clients = clientRepository.findAnalyticsByCompanyIdAndCreatedAtRange(
                companyId,
                clientCreatedFrom,
                clientCreatedToExclusive,
                consultantFilter
        );
        List<Bill> bills = billRepository.findAnalyticsByCompanyIdAndIssueDateRange(
                companyId,
                range.from(),
                range.to(),
                consultantFilter
        );

        Map<YearMonth, Bucket> monthBuckets = new HashMap<>();
        Map<Integer, Bucket> yearBuckets = new HashMap<>();
        Map<DayOfWeek, Bucket> weekdayBuckets = new EnumMap<>(DayOfWeek.class);
        Map<LocalDate, Bucket> weekBuckets = new HashMap<>();
        Map<String, RankedBucket> serviceRanking = new HashMap<>();
        Map<String, RankedBucket> consultantRevenueRanking = new HashMap<>();
        Map<String, RankedBucket> clientRevenueRanking = new HashMap<>();
        Map<String, RankedBucket> spaceUsageRanking = new HashMap<>();
        Map<GroupKey, GroupAnalyticsBucket> groupAnalytics = new LinkedHashMap<>();
        Map<Long, Boolean> currentGroupActive = new HashMap<>();
        Bucket summaryBucket = new Bucket();

        for (ServiceGroup group : serviceGroupRepository.findAllByCompanyIdOrderBySortOrderAscNameAsc(companyId)) {
            currentGroupActive.put(group.getId(), group.isActive());
            if (matchesServiceGroupFilter(serviceGroupId, group.getId())) {
                groupAnalytics.put(
                        new GroupKey(group.getId(), safeAnalyticsName(group.getName(), "Service group")),
                        new GroupAnalyticsBucket(group.getId(), safeAnalyticsName(group.getName(), "Service group"), group.isActive())
                );
            }
        }
        if (Long.valueOf(-1L).equals(serviceGroupId)) {
            groupAnalytics.putIfAbsent(
                    new GroupKey(null, "Ungrouped"),
                    new GroupAnalyticsBucket(null, "Ungrouped", true)
            );
        }

        for (SessionBooking b : bookings) {
            YearMonth ym = YearMonth.from(b.getStartTime());
            int y = b.getStartTime().getYear();
            LocalDate bookingDate = b.getStartTime().toLocalDate();
            LocalDate weekStart = startOfIsoWeek(bookingDate);
            DayOfWeek dayOfWeek = bookingDate.getDayOfWeek();
            Bucket m = monthBuckets.computeIfAbsent(ym, k -> new Bucket());
            Bucket yy = yearBuckets.computeIfAbsent(y, k -> new Bucket());
            Bucket ww = weekBuckets.computeIfAbsent(weekStart, k -> new Bucket());
            Bucket dd = weekdayBuckets.computeIfAbsent(dayOfWeek, k -> new Bucket());
            boolean online = b.getMeetingLink() != null && !b.getMeetingLink().isBlank();
            Long clientId = b.getClient() != null ? b.getClient().getId() : null;
            long durationMinutes = durationMinutes(b);

            applyBookingToBucket(m, clientId, online, durationMinutes, b.getConsultant() != null, b.getSpace() != null);
            applyBookingToBucket(yy, clientId, online, durationMinutes, b.getConsultant() != null, b.getSpace() != null);
            applyBookingToBucket(ww, clientId, online, durationMinutes, b.getConsultant() != null, b.getSpace() != null);
            applyBookingToBucket(dd, clientId, online, durationMinutes, b.getConsultant() != null, b.getSpace() != null);
            applyBookingToBucket(summaryBucket, clientId, online, durationMinutes, b.getConsultant() != null, b.getSpace() != null);

            if (b.getSpace() != null && b.getSpace().getName() != null && !b.getSpace().getName().isBlank()) {
                RankedBucket spaceBucket = spaceUsageRanking.computeIfAbsent(b.getSpace().getName().trim(), key -> new RankedBucket());
                spaceBucket.minutes += durationMinutes;
                spaceBucket.sessionsTotal++;
            }

            GroupAnalyticsBucket groupBucket = groupBucketForBooking(groupAnalytics, currentGroupActive, b);
            ServiceAnalyticsBucket serviceBucket = groupBucket.service(
                    b.getType() == null ? null : b.getType().getId(),
                    b.getType() == null ? "Service" : b.getType().getName()
            );
            accumulateBookingMetric(groupBucket, serviceBucket, b.getBookingStatus(), durationMinutes);
        }

        for (Client c : clients) {
            LocalDate d = c.getCreatedAt().atZone(zone).toLocalDate();
            YearMonth ym = YearMonth.from(d);
            int y = d.getYear();
            LocalDate weekStart = startOfIsoWeek(d);
            monthBuckets.computeIfAbsent(ym, k -> new Bucket()).newClients++;
            yearBuckets.computeIfAbsent(y, k -> new Bucket()).newClients++;
            weekBuckets.computeIfAbsent(weekStart, k -> new Bucket()).newClients++;
            summaryBucket.newClients++;
        }

        Set<Long> sourceBookingIds = new HashSet<>();
        for (Bill bill : bills) {
            for (BillItem item : bill.getItems()) {
                if (item != null && item.getSourceSessionBookingId() != null) {
                    sourceBookingIds.add(item.getSourceSessionBookingId());
                }
            }
        }
        Map<Long, SessionBooking> sourceBookings = new HashMap<>();
        if (!sourceBookingIds.isEmpty()) {
            for (SessionBooking source : bookingRepository.findAnalyticsSnapshotsByCompanyIdAndIds(companyId, new ArrayList<>(sourceBookingIds))) {
                sourceBookings.put(source.getId(), source);
            }
        }

        for (Bill b : bills) {
            YearMonth ym = YearMonth.from(b.getIssueDate());
            int y = b.getIssueDate().getYear();
            LocalDate weekStart = startOfIsoWeek(b.getIssueDate());
            Bucket m = monthBuckets.computeIfAbsent(ym, k -> new Bucket());
            Bucket yy = yearBuckets.computeIfAbsent(y, k -> new Bucket());
            Bucket ww = weekBuckets.computeIfAbsent(weekStart, k -> new Bucket());

            BigDecimal matchedNet = BigDecimal.ZERO;
            BigDecimal matchedGross = BigDecimal.ZERO;
            long matchedUnits = 0;
            for (BillItem item : b.getItems()) {
                if (item == null) continue;
                SessionBooking sourceBooking = item.getSourceSessionBookingId() == null
                        ? null
                        : sourceBookings.get(item.getSourceSessionBookingId());
                boolean serviceLinkedLine = sourceBooking != null || item.isServiceGroupSnapshotCaptured();
                Long itemGroupId = itemGroupId(item, sourceBooking);
                String itemGroupName = itemGroupName(item, sourceBooking);
                if (serviceGroupId != null
                        && (!serviceLinkedLine || !matchesServiceGroupFilter(serviceGroupId, itemGroupId))) {
                    continue;
                }
                if (typeId != null
                        && (sourceBooking == null
                        || sourceBooking.getType() == null
                        || !typeId.equals(sourceBooking.getType().getId()))) {
                    continue;
                }

                long quantity = item.getQuantity() == null ? 1 : Math.max(item.getQuantity(), 0);
                BigDecimal lineNet = money(item.getNetPrice()).multiply(BigDecimal.valueOf(quantity));
                BigDecimal lineGross = money(item.getGrossPrice()).multiply(BigDecimal.valueOf(quantity));
                matchedNet = matchedNet.add(lineNet);
                matchedGross = matchedGross.add(lineGross);
                matchedUnits += quantity;
                String label = sourceBooking != null && sourceBooking.getType() != null
                        ? safeAnalyticsName(sourceBooking.getType().getName(), safeServiceLabel(item))
                        : safeServiceLabel(item);
                accumulateAmount(serviceRanking, label, lineGross, quantity);

                if (serviceLinkedLine) {
                    GroupAnalyticsBucket groupBucket = groupBucket(
                            groupAnalytics,
                            currentGroupActive,
                            itemGroupId,
                            itemGroupName
                    );
                    ServiceAnalyticsBucket serviceBucket = groupBucket.service(
                            sourceBooking == null || sourceBooking.getType() == null ? null : sourceBooking.getType().getId(),
                            label
                    );
                    groupBucket.revenueGross = groupBucket.revenueGross.add(lineGross);
                    serviceBucket.revenueGross = serviceBucket.revenueGross.add(lineGross);
                }
            }

            boolean scopedRevenue = serviceGroupId != null || typeId != null;
            BigDecimal net = scopedRevenue ? matchedNet : money(b.getTotalNet());
            BigDecimal gross = scopedRevenue ? matchedGross : money(b.getTotalGross());
            if (!scopedRevenue || gross.signum() != 0 || net.signum() != 0 || matchedUnits > 0) {
                m.revenueNet = m.revenueNet.add(net);
                m.revenueGross = m.revenueGross.add(gross);
                yy.revenueNet = yy.revenueNet.add(net);
                yy.revenueGross = yy.revenueGross.add(gross);
                ww.revenueGross = ww.revenueGross.add(gross);
                summaryBucket.revenueNet = summaryBucket.revenueNet.add(net);
                summaryBucket.revenueGross = summaryBucket.revenueGross.add(gross);
                accumulateAmount(consultantRevenueRanking, safeConsultantLabel(b.getConsultant()), gross, 1);
                accumulateAmount(clientRevenueRanking, safeBillClientLabel(b), gross, 1);
            }
        }

        List<WaitlistRequest> waitlistRequests = waitlistRequestRepository.findAnalyticsByCompanyIdAndJoinedAtRange(
                companyId,
                clientCreatedFrom,
                clientCreatedToExclusive
        );
        Map<Long, List<WaitlistRequestService>> eligibleByRequest = new HashMap<>();
        if (!waitlistRequests.isEmpty()) {
            List<Long> requestIds = waitlistRequests.stream().map(WaitlistRequest::getId).toList();
            for (WaitlistRequestService eligible : waitlistRequestServiceRepository.findAllByRequestIdIn(requestIds)) {
                eligibleByRequest.computeIfAbsent(eligible.getRequest().getId(), ignored -> new ArrayList<>()).add(eligible);
            }
        }
        for (WaitlistRequest request : waitlistRequests) {
            List<WaitlistRequestService> eligible = eligibleByRequest.getOrDefault(request.getId(), List.of());
            if (typeId != null) {
                boolean eligibleType = eligible.stream()
                        .anyMatch(row -> row.getService() != null && typeId.equals(row.getService().getId()));
                boolean exactType = request.getService() != null && typeId.equals(request.getService().getId());
                if (!eligibleType && !exactType) {
                    continue;
                }
            }
            Long requestGroupId = requestGroupId(request, eligible);
            String requestGroupName = requestGroupName(request, eligible);
            if (!matchesServiceGroupFilter(serviceGroupId, requestGroupId)) continue;
            GroupAnalyticsBucket groupBucket = groupBucket(groupAnalytics, currentGroupActive, requestGroupId, requestGroupName);
            groupBucket.waitlistRequests++;
            if (eligible.isEmpty() && request.getService() != null) {
                groupBucket.service(request.getService().getId(), request.getService().getName()).waitlistRequests++;
            } else {
                for (WaitlistRequestService row : eligible) {
                    if (typeId != null && (row.getService() == null || !typeId.equals(row.getService().getId()))) continue;
                    groupBucket.service(
                            row.getService() == null ? null : row.getService().getId(),
                            row.getServiceNameSnapshot()
                    ).waitlistRequests++;
                }
            }
        }

        for (WaitlistOffer offer : waitlistOfferRepository.findAnalyticsByCompanyIdAndOfferedAtRange(
                companyId,
                clientCreatedFrom,
                clientCreatedToExclusive
        )) {
            if (typeId != null && (offer.getService() == null || !typeId.equals(offer.getService().getId()))) continue;
            Long offerGroupId = offer.getServiceGroupIdSnapshot();
            String offerGroupName = offer.getServiceGroupNameSnapshot();
            if (!matchesServiceGroupFilter(serviceGroupId, offerGroupId)) continue;
            GroupAnalyticsBucket groupBucket = groupBucket(groupAnalytics, currentGroupActive, offerGroupId, offerGroupName);
            ServiceAnalyticsBucket serviceBucket = groupBucket.service(
                    offer.getService() == null ? null : offer.getService().getId(),
                    offer.getServiceNameSnapshot()
            );
            groupBucket.waitlistOffers++;
            serviceBucket.waitlistOffers++;
            if (offer.getStatus() == WaitlistOfferStatus.ACCEPTED) {
                groupBucket.acceptedOffers++;
                serviceBucket.acceptedOffers++;
            }
        }

        List<PeriodPoint> months = "month".equals(period) ? toMonthPoints(monthBuckets) : List.of();
        List<PeriodPoint> years = "year".equals(period) ? toYearPoints(yearBuckets) : List.of();
        List<WeekdayLoadPoint> weekdays = toWeekdayPoints(weekdayBuckets);
        List<WeekPoint> weeks = toWeekPoints(weekBuckets);
        Summary summary = new Summary(
                summaryBucket.sessionsTotal,
                summaryBucket.clientIds.size(),
                summaryBucket.sessionsStandard,
                summaryBucket.sessionsOnline,
                summaryBucket.newClients,
                summaryBucket.revenueNet,
                summaryBucket.revenueGross
        );
        return new AnalyticsOverviewResponse(
                period,
                range.from().toString(),
                range.to().toString(),
                summary,
                months,
                years,
                weekdays,
                weeks,
                toRankedAmounts(serviceRanking, 5),
                toRankedAmounts(consultantRevenueRanking, 5),
                toRankedAmounts(clientRevenueRanking, 5),
                toUsageRankings(spaceUsageRanking, 5),
                toServiceGroupMetrics(groupAnalytics)
        );
    }

    @Transactional(readOnly = true)
    public RevenueInvoicesReportResponse revenueInvoicesReport(
            User me,
            String periodRaw,
            LocalDate fromParam,
            LocalDate toParam,
            Long consultantIdParam,
            String paymentStatusRaw,
            Long paymentMethodId,
            String clientQueryRaw,
            String billTypeRaw
    ) {
        Long consultantFilter = resolveConsultantFilter(me, consultantIdParam);
        Long companyId = me.getCompany().getId();
        ZoneId zone = ZoneId.of(remindersTimezone);
        DateRange range = resolveRange(normalizePeriod(periodRaw), fromParam, toParam, zone);
        List<Bill> bills = billRepository.findAnalyticsByCompanyIdAndIssueDateRange(
                companyId,
                range.from(),
                range.to(),
                consultantFilter
        );

        String normalizedPaymentStatus = normalizeInvoicePaymentStatusFilter(paymentStatusRaw);
        String normalizedBillType = normalizeInvoiceTypeFilter(billTypeRaw);
        String clientQuery = clientQueryRaw == null ? "" : clientQueryRaw.trim().toLowerCase(Locale.ROOT);

        List<Bill> filtered = bills.stream()
                .filter(bill -> paymentMethodId == null
                        || (bill.getPaymentMethod() != null && paymentMethodId.equals(bill.getPaymentMethod().getId())))
                .filter(bill -> matchesInvoicePaymentStatusFilter(bill, normalizedPaymentStatus))
                .filter(bill -> matchesInvoiceTypeFilter(bill, normalizedBillType))
                .filter(bill -> clientQuery.isBlank() || invoiceClientSearchText(bill).contains(clientQuery))
                .toList();

        BigDecimal grossTotal = BigDecimal.ZERO;
        BigDecimal netTotal = BigDecimal.ZERO;
        BigDecimal paidTotal = BigDecimal.ZERO;
        BigDecimal openTotal = BigDecimal.ZERO;
        BigDecimal refundedTotal = BigDecimal.ZERO;
        Map<String, RankedBucket> paymentRanking = new HashMap<>();
        Map<String, RankedBucket> consultantRanking = new HashMap<>();
        Map<String, RankedBucket> serviceRanking = new HashMap<>();
        List<InvoiceReportRow> invoiceRows = new ArrayList<>();

        for (Bill bill : filtered) {
            BigDecimal net = money(bill.getTotalNet());
            BigDecimal gross = money(bill.getTotalGross());
            BigDecimal vat = gross.subtract(net);
            boolean refund = isRefundBill(bill);
            grossTotal = grossTotal.add(gross);
            netTotal = netTotal.add(net);
            if (refund) {
                refundedTotal = refundedTotal.add(gross.abs());
            } else if (BillPaymentStatus.PAID.equalsIgnoreCase(safeString(bill.getPaymentStatus()))) {
                paidTotal = paidTotal.add(gross);
            } else if (BillPaymentStatus.OPEN.equalsIgnoreCase(safeString(bill.getPaymentStatus()))
                    || BillPaymentStatus.PAYMENT_PENDING.equalsIgnoreCase(safeString(bill.getPaymentStatus()))) {
                openTotal = openTotal.add(gross);
            }

            accumulateAmount(paymentRanking, safePaymentMethodLabel(bill), gross, 1);
            accumulateAmount(consultantRanking, safeConsultantLabel(bill.getConsultant()), gross, 1);
            for (BillItem item : bill.getItems()) {
                if (item == null) continue;
                long quantity = item.getQuantity() == null ? 1 : item.getQuantity();
                BigDecimal lineGross = item.getGrossPrice() == null
                        ? BigDecimal.ZERO
                        : item.getGrossPrice().multiply(BigDecimal.valueOf(quantity));
                accumulateAmount(serviceRanking, safeServiceLabel(item), lineGross, Math.max(quantity, 0));
            }

            invoiceRows.add(new InvoiceReportRow(
                    bill.getBillNumber(),
                    safeBillClientLabel(bill),
                    bill.getIssueDate() == null ? null : bill.getIssueDate().toString(),
                    refund ? "REFUNDED" : normalizeInvoicePaymentStatusValue(bill.getPaymentStatus()),
                    invoiceTypeForBill(bill),
                    safePaymentMethodLabel(bill),
                    safeConsultantLabel(bill.getConsultant()),
                    net,
                    gross,
                    vat
            ));
        }

        InvoiceReportSummary summary = new InvoiceReportSummary(
                filtered.size(),
                grossTotal,
                netTotal,
                grossTotal.subtract(netTotal),
                paidTotal,
                openTotal,
                refundedTotal
        );
        return new RevenueInvoicesReportResponse(
                range.from().toString(),
                range.to().toString(),
                summary,
                toRankedAmounts(paymentRanking, 20),
                toRankedAmounts(consultantRanking, 20),
                toRankedAmounts(serviceRanking, 20),
                invoiceRows
        );
    }

    @Transactional(readOnly = true)
    public BookingsAttendanceReportResponse bookingsAttendanceReport(
            User me,
            String periodRaw,
            LocalDate fromParam,
            LocalDate toParam,
            Long consultantIdParam,
            Long spaceId,
            Long typeId,
            Long serviceGroupId,
            String bookingStatusRaw,
            String sourceChannelRaw,
            String deliveryModeRaw
    ) {
        Long consultantFilter = resolveConsultantFilter(me, consultantIdParam);
        Long companyId = me.getCompany().getId();
        ZoneId zone = ZoneId.of(remindersTimezone);
        DateRange range = resolveRange(normalizePeriod(periodRaw), fromParam, toParam, zone);
        LocalDateTime rangeStart = range.from().atStartOfDay();
        LocalDateTime rangeEndExclusive = range.to().plusDays(1).atStartOfDay();
        List<SessionBooking> bookings = bookingRepository.findAnalyticsByCompanyIdAndRange(
                companyId,
                rangeStart,
                rangeEndExclusive,
                consultantFilter,
                spaceId,
                typeId,
                serviceGroupId
        );

        String requestedStatus = normalizeBookingStatusFilter(bookingStatusRaw);
        String requestedSource = sourceChannelRaw == null ? "ALL" : sourceChannelRaw.trim().toUpperCase(Locale.ROOT);
        String deliveryMode = deliveryModeRaw == null ? "ALL" : deliveryModeRaw.trim().toUpperCase(Locale.ROOT);
        LocalDateTime now = timeService.localDateTime(zone, companyId);

        Map<String, CountBucket> sourceBuckets = new HashMap<>();
        Map<String, CountBucket> dayTimeBuckets = new HashMap<>();
        Map<String, RankedBucket> consultantHours = new HashMap<>();
        Map<String, RankedBucket> roomHours = new HashMap<>();
        long reserved = 0;
        long completed = 0;
        long cancelled = 0;
        long noShows = 0;
        long online = 0;
        long onsite = 0;

        for (SessionBooking booking : bookings) {
            boolean isOnline = booking.getMeetingLink() != null && !booking.getMeetingLink().isBlank();
            String source = normalizeSourceChannelValue(booking.getSourceChannel());
            String effectiveStatus = SessionBookingStatus.deriveLifecycleStatus(
                    booking.getStartTime(),
                    booking.getEndTime(),
                    booking.getBookingStatus(),
                    now
            );
            if (!"ALL".equals(requestedStatus) && !requestedStatus.equals(effectiveStatus)) continue;
            if (!"ALL".equals(requestedSource) && !requestedSource.equals(source)) continue;
            if ("ONLINE".equals(deliveryMode) && !isOnline) continue;
            if ("ONSITE".equals(deliveryMode) && isOnline) continue;

            long minutes = durationMinutes(booking);
            switch (effectiveStatus) {
                case SessionBookingStatus.CHECKED_OUT -> completed++;
                case SessionBookingStatus.CANCELLED -> cancelled++;
                case SessionBookingStatus.NO_SHOW -> noShows++;
                default -> reserved++;
            }
            if (isOnline) online++; else onsite++;
            addCount(sourceBuckets, source, minutes);
            addCount(dayTimeBuckets, dayTimeLabel(booking.getStartTime()), minutes);
            if (booking.getConsultant() != null) {
                RankedBucket bucket = consultantHours.computeIfAbsent(safeConsultantLabel(booking.getConsultant()), key -> new RankedBucket());
                bucket.minutes += minutes;
                bucket.sessionsTotal++;
            }
            if (booking.getSpace() != null && booking.getSpace().getName() != null && !booking.getSpace().getName().isBlank()) {
                RankedBucket bucket = roomHours.computeIfAbsent(booking.getSpace().getName().trim(), key -> new RankedBucket());
                bucket.minutes += minutes;
                bucket.sessionsTotal++;
            }
        }

        return new BookingsAttendanceReportResponse(
                range.from().toString(),
                range.to().toString(),
                new BookingReportSummary(reserved, completed, cancelled, noShows, online, onsite),
                toCountRankings(sourceBuckets, 20),
                toCountRankings(dayTimeBuckets, 10),
                toUsageRankings(consultantHours, 20),
                toUsageRankings(roomHours, 20)
        );
    }

    private GroupAnalyticsBucket groupBucketForBooking(
            Map<GroupKey, GroupAnalyticsBucket> buckets,
            Map<Long, Boolean> currentGroupActive,
            SessionBooking booking
    ) {
        Long groupId;
        String groupName;
        if (booking.isServiceGroupSnapshotCaptured()) {
            groupId = booking.getServiceGroupIdSnapshot();
            groupName = booking.getServiceGroupNameSnapshot();
        } else {
            ServiceGroup current = booking.getType() == null ? null : booking.getType().getServiceGroup();
            groupId = current == null ? null : current.getId();
            groupName = current == null ? null : current.getName();
        }
        return groupBucket(buckets, currentGroupActive, groupId, groupName);
    }

    private GroupAnalyticsBucket groupBucket(
            Map<GroupKey, GroupAnalyticsBucket> buckets,
            Map<Long, Boolean> currentGroupActive,
            Long groupId,
            String groupName
    ) {
        String resolvedName = groupId == null
                ? "Ungrouped"
                : safeAnalyticsName(groupName, "Service group");
        GroupKey key = new GroupKey(groupId, resolvedName);
        return buckets.computeIfAbsent(
                key,
                ignored -> new GroupAnalyticsBucket(
                        groupId,
                        resolvedName,
                        groupId == null || currentGroupActive.getOrDefault(groupId, false)
                )
        );
    }

    private void accumulateBookingMetric(
            GroupAnalyticsBucket group,
            ServiceAnalyticsBucket service,
            String rawStatus,
            long durationMinutes
    ) {
        String status = SessionBookingStatus.normalizeStored(rawStatus);
        group.bookings++;
        service.bookings++;
        if (SessionBookingStatus.CHECKED_OUT.equals(status)) {
            group.completed++;
            service.completed++;
        } else if (SessionBookingStatus.CANCELLED.equals(status)) {
            group.cancelled++;
            service.cancelled++;
        } else if (SessionBookingStatus.NO_SHOW.equals(status)) {
            group.noShows++;
            service.noShows++;
        }
        if (!SessionBookingStatus.CANCELLED.equals(status) && !SessionBookingStatus.NO_SHOW.equals(status)) {
            group.bookedMinutes += durationMinutes;
            service.bookedMinutes += durationMinutes;
        }
    }

    private Long itemGroupId(BillItem item, SessionBooking sourceBooking) {
        if (item.isServiceGroupSnapshotCaptured()) return item.getServiceGroupIdSnapshot();
        if (sourceBooking == null) return item.getServiceGroupIdSnapshot();
        if (sourceBooking.isServiceGroupSnapshotCaptured()) return sourceBooking.getServiceGroupIdSnapshot();
        ServiceGroup current = sourceBooking.getType() == null ? null : sourceBooking.getType().getServiceGroup();
        return current == null ? null : current.getId();
    }

    private String itemGroupName(BillItem item, SessionBooking sourceBooking) {
        if (item.isServiceGroupSnapshotCaptured()) return item.getServiceGroupNameSnapshot();
        if (sourceBooking == null) return item.getServiceGroupNameSnapshot();
        if (sourceBooking.isServiceGroupSnapshotCaptured()) return sourceBooking.getServiceGroupNameSnapshot();
        ServiceGroup current = sourceBooking.getType() == null ? null : sourceBooking.getType().getServiceGroup();
        return current == null ? null : current.getName();
    }

    private Long requestGroupId(WaitlistRequest request, List<WaitlistRequestService> eligible) {
        if (request.getServiceScope() == WaitlistServiceScope.SERVICE_GROUP) {
            return request.getServiceGroupIdSnapshot();
        }
        if (request.getServiceGroupIdSnapshot() != null) return request.getServiceGroupIdSnapshot();
        return eligible.isEmpty() ? null : eligible.getFirst().getServiceGroupIdSnapshot();
    }

    private String requestGroupName(WaitlistRequest request, List<WaitlistRequestService> eligible) {
        if (request.getServiceGroupNameSnapshot() != null && !request.getServiceGroupNameSnapshot().isBlank()) {
            return request.getServiceGroupNameSnapshot();
        }
        return eligible.isEmpty() ? null : eligible.getFirst().getServiceGroupNameSnapshot();
    }

    private boolean matchesServiceGroupFilter(Long filter, Long groupId) {
        if (filter == null) return true;
        if (filter == -1L) return groupId == null;
        return filter.equals(groupId);
    }

    private List<ServiceGroupMetric> toServiceGroupMetrics(Map<GroupKey, GroupAnalyticsBucket> source) {
        return source.values().stream()
                .map(group -> {
                    List<ServiceMetric> services = group.services.values().stream()
                            .map(service -> new ServiceMetric(
                                    service.serviceId,
                                    service.serviceName,
                                    service.bookings,
                                    service.completed,
                                    service.cancelled,
                                    service.noShows,
                                    service.bookedMinutes,
                                    service.revenueGross,
                                    service.waitlistRequests,
                                    service.waitlistOffers,
                                    service.acceptedOffers,
                                    conversionRate(service.acceptedOffers, service.waitlistOffers)
                            ))
                            .sorted(Comparator
                                    .comparing(ServiceMetric::revenueGross, Comparator.reverseOrder())
                                    .thenComparing(ServiceMetric::bookings, Comparator.reverseOrder())
                                    .thenComparing(ServiceMetric::serviceName))
                            .toList();
                    return new ServiceGroupMetric(
                            group.groupId,
                            group.groupName,
                            group.active,
                            group.bookings,
                            group.completed,
                            group.cancelled,
                            group.noShows,
                            group.bookedMinutes,
                            group.revenueGross,
                            group.waitlistRequests,
                            group.waitlistOffers,
                            group.acceptedOffers,
                            conversionRate(group.acceptedOffers, group.waitlistOffers),
                            services
                    );
                })
                .sorted(Comparator
                        .comparing((ServiceGroupMetric row) -> row.serviceGroupId() == null)
                        .thenComparing(ServiceGroupMetric::revenueGross, Comparator.reverseOrder())
                        .thenComparing(ServiceGroupMetric::bookings, Comparator.reverseOrder())
                        .thenComparing(ServiceGroupMetric::serviceGroupName))
                .toList();
    }

    private double conversionRate(long accepted, long offered) {
        if (offered <= 0) return 0.0;
        return Math.round((accepted * 10000.0) / offered) / 100.0;
    }

    private static String safeAnalyticsName(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private void applyBookingToBucket(
            Bucket bucket,
            Long clientId,
            boolean online,
            long durationMinutes,
            boolean hasConsultant,
            boolean hasSpace
    ) {
        bucket.sessionsTotal++;
        if (clientId != null) bucket.clientIds.add(clientId);
        if (online) {
            bucket.sessionsOnline++;
            bucket.onlineSessions++;
        } else {
            bucket.sessionsStandard++;
            bucket.onsiteSessions++;
        }
        if (hasConsultant) bucket.consultantMinutes += durationMinutes;
        if (hasSpace) bucket.spaceMinutes += durationMinutes;
    }

    private List<PeriodPoint> toMonthPoints(Map<YearMonth, Bucket> monthBuckets) {
        if (monthBuckets.isEmpty()) return List.of();
        List<YearMonth> keys = new ArrayList<>(monthBuckets.keySet());
        keys.sort(Comparator.naturalOrder());
        YearMonth min = keys.getFirst();
        YearMonth max = keys.getLast();

        List<PeriodPoint> out = new ArrayList<>();
        YearMonth cursor = min;
        while (!cursor.isAfter(max)) {
            Bucket b = monthBuckets.getOrDefault(cursor, new Bucket());
            out.add(new PeriodPoint(
                    cursor.getYear() + "-" + String.format(Locale.ROOT, "%02d", cursor.getMonthValue()),
                    cursor.getYear(),
                    cursor.getMonthValue(),
                    b.sessionsTotal,
                    b.clientIds.size(),
                    b.sessionsStandard,
                    b.sessionsOnline,
                    b.newClients,
                    b.revenueNet,
                    b.revenueGross
            ));
            cursor = cursor.plusMonths(1);
        }
        return out;
    }

    private List<PeriodPoint> toYearPoints(Map<Integer, Bucket> yearBuckets) {
        if (yearBuckets.isEmpty()) return List.of();
        List<Integer> years = new ArrayList<>(yearBuckets.keySet());
        years.sort(Comparator.naturalOrder());
        int min = years.getFirst();
        int max = years.getLast();

        List<PeriodPoint> out = new ArrayList<>();
        for (int y = min; y <= max; y++) {
            Bucket b = yearBuckets.getOrDefault(y, new Bucket());
            out.add(new PeriodPoint(
                    String.valueOf(y),
                    y,
                    null,
                    b.sessionsTotal,
                    b.clientIds.size(),
                    b.sessionsStandard,
                    b.sessionsOnline,
                    b.newClients,
                    b.revenueNet,
                    b.revenueGross
            ));
        }
        return out;
    }

    private List<WeekdayLoadPoint> toWeekdayPoints(Map<DayOfWeek, Bucket> weekdayBuckets) {
        List<WeekdayLoadPoint> out = new ArrayList<>();
        for (DayOfWeek day : DayOfWeek.values()) {
            Bucket b = weekdayBuckets.getOrDefault(day, new Bucket());
            out.add(new WeekdayLoadPoint(
                    day.name(),
                    day.getDisplayName(TextStyle.SHORT, Locale.ENGLISH),
                    b.sessionsTotal,
                    b.consultantMinutes,
                    b.spaceMinutes,
                    b.onlineSessions,
                    b.onsiteSessions
            ));
        }
        return out;
    }

    private List<WeekPoint> toWeekPoints(Map<LocalDate, Bucket> weekBuckets) {
        if (weekBuckets.isEmpty()) return List.of();
        List<LocalDate> keys = new ArrayList<>(weekBuckets.keySet());
        keys.sort(Comparator.naturalOrder());
        List<WeekPoint> out = new ArrayList<>();
        for (LocalDate weekStart : keys) {
            Bucket b = weekBuckets.getOrDefault(weekStart, new Bucket());
            out.add(new WeekPoint(
                    weekStart.toString(),
                    weekStart.toString(),
                    b.sessionsTotal,
                    b.newClients,
                    b.revenueGross,
                    b.consultantMinutes,
                    b.spaceMinutes
            ));
        }
        return out;
    }

    private List<RankedAmount> toRankedAmounts(Map<String, RankedBucket> source, int limit) {
        return source.entrySet().stream()
                .filter(entry -> entry.getKey() != null && !entry.getKey().isBlank())
                .map(entry -> new RankedAmount(entry.getKey(), entry.getValue().amount, entry.getValue().count))
                .sorted(Comparator
                        .comparing(RankedAmount::amount, Comparator.reverseOrder())
                        .thenComparing(RankedAmount::count, Comparator.reverseOrder())
                        .thenComparing(RankedAmount::label))
                .limit(limit)
                .toList();
    }

    private List<UsageRanking> toUsageRankings(Map<String, RankedBucket> source, int limit) {
        return source.entrySet().stream()
                .filter(entry -> entry.getKey() != null && !entry.getKey().isBlank())
                .map(entry -> new UsageRanking(entry.getKey(), entry.getValue().minutes, entry.getValue().sessionsTotal))
                .sorted(Comparator
                        .comparing(UsageRanking::minutes, Comparator.reverseOrder())
                        .thenComparing(UsageRanking::sessionsTotal, Comparator.reverseOrder())
                        .thenComparing(UsageRanking::label))
                .limit(limit)
                .toList();
    }

    private void accumulateAmount(Map<String, RankedBucket> ranking, String label, BigDecimal amount, long count) {
        if (label == null || label.isBlank()) return;
        RankedBucket bucket = ranking.computeIfAbsent(label, key -> new RankedBucket());
        bucket.amount = bucket.amount.add(amount == null ? BigDecimal.ZERO : amount);
        bucket.count += Math.max(count, 0);
    }

    private long durationMinutes(SessionBooking booking) {
        if (booking.getStartTime() == null || booking.getEndTime() == null) return 0;
        return Math.max(0, Duration.between(booking.getStartTime(), booking.getEndTime()).toMinutes());
    }

    private LocalDate startOfIsoWeek(LocalDate date) {
        return date.minusDays(date.getDayOfWeek().getValue() - DayOfWeek.MONDAY.getValue());
    }

    private String safeConsultantLabel(User consultant) {
        if (consultant == null) return "Unassigned";
        String name = ((consultant.getFirstName() == null ? "" : consultant.getFirstName().trim()) + " "
                + (consultant.getLastName() == null ? "" : consultant.getLastName().trim())).trim();
        return name.isBlank() ? "Consultant" : name;
    }

    private String safeBillClientLabel(Bill bill) {
        if (bill.getClient() != null) {
            String full = ((bill.getClient().getFirstName() == null ? "" : bill.getClient().getFirstName().trim()) + " "
                    + (bill.getClient().getLastName() == null ? "" : bill.getClient().getLastName().trim())).trim();
            if (!full.isBlank()) return full;
        }
        String snapshot = ((bill.getClientFirstNameSnapshot() == null ? "" : bill.getClientFirstNameSnapshot().trim()) + " "
                + (bill.getClientLastNameSnapshot() == null ? "" : bill.getClientLastNameSnapshot().trim())).trim();
        if (!snapshot.isBlank()) return snapshot;
        if (bill.getRecipientCompanyNameSnapshot() != null && !bill.getRecipientCompanyNameSnapshot().isBlank()) {
            return bill.getRecipientCompanyNameSnapshot().trim();
        }
        return "Client";
    }

    private String safeServiceLabel(BillItem item) {
        if (item.getTransactionService() != null) {
            if (item.getTransactionService().getDescription() != null && !item.getTransactionService().getDescription().isBlank()) {
                return item.getTransactionService().getDescription().trim();
            }
            if (item.getTransactionService().getCode() != null && !item.getTransactionService().getCode().isBlank()) {
                return item.getTransactionService().getCode().trim();
            }
        }
        return "Service";
    }

    private BigDecimal money(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String safeString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isRefundBill(Bill bill) {
        return bill != null && (bill.getRefundOfBillId() != null
                || (bill.getRefundReference() != null && !bill.getRefundReference().isBlank())
                || money(bill.getTotalGross()).signum() < 0);
    }

    private String normalizeInvoicePaymentStatusFilter(String raw) {
        if (raw == null || raw.isBlank()) return "all";
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "paid", "open", "refunded", "all" -> normalized;
            default -> "all";
        };
    }

    private boolean matchesInvoicePaymentStatusFilter(Bill bill, String statusFilter) {
        if ("all".equals(statusFilter)) return true;
        boolean refund = isRefundBill(bill);
        if ("refunded".equals(statusFilter)) return refund;
        if (refund) return false;
        String paymentStatus = safeString(bill.getPaymentStatus()).toLowerCase(Locale.ROOT);
        if ("paid".equals(statusFilter)) return BillPaymentStatus.PAID.equals(paymentStatus);
        if ("open".equals(statusFilter)) {
            return BillPaymentStatus.OPEN.equals(paymentStatus) || BillPaymentStatus.PAYMENT_PENDING.equals(paymentStatus);
        }
        return true;
    }

    private String normalizeInvoiceTypeFilter(String raw) {
        if (raw == null || raw.isBlank()) return "ALL";
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "INVOICE", "ADVANCE", "REFUND", "ALL" -> normalized;
            default -> "ALL";
        };
    }

    private boolean matchesInvoiceTypeFilter(Bill bill, String typeFilter) {
        if ("ALL".equals(typeFilter)) return true;
        String billType = invoiceTypeForBill(bill);
        return typeFilter.equals(billType);
    }

    private String invoiceTypeForBill(Bill bill) {
        if (isRefundBill(bill)) return "REFUND";
        BillType billType = bill.getBillType() == null ? BillType.INVOICE : bill.getBillType();
        return billType.name();
    }

    private String normalizeInvoicePaymentStatusValue(String raw) {
        String value = safeString(raw).toLowerCase(Locale.ROOT);
        if (value.isBlank()) return BillPaymentStatus.OPEN;
        return value;
    }

    private String invoiceClientSearchText(Bill bill) {
        return String.join(" ",
                safeString(safeBillClientLabel(bill)),
                safeString(bill.getRecipientCompanyNameSnapshot()),
                safeString(bill.getRecipientPersonEmailSnapshot()),
                safeString(bill.getRecipientCompanyEmailSnapshot()),
                safeString(bill.getBillNumber())
        ).toLowerCase(Locale.ROOT);
    }

    private String safePaymentMethodLabel(Bill bill) {
        if (bill != null && bill.getPaymentMethod() != null && bill.getPaymentMethod().getName() != null && !bill.getPaymentMethod().getName().isBlank()) {
            return bill.getPaymentMethod().getName().trim();
        }
        return "Payment method";
    }

    private String normalizeBookingStatusFilter(String raw) {
        if (raw == null || raw.isBlank()) return "ALL";
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "RESERVED", "CANCELLED", "NO_SHOW", "CHECKED_OUT", "ALL" -> normalized;
            default -> "ALL";
        };
    }

    private String normalizeSourceChannelValue(String raw) {
        if (raw == null || raw.isBlank()) return "STAFF";
        return raw.trim().toUpperCase(Locale.ROOT);
    }

    private String dayTimeLabel(LocalDateTime startTime) {
        if (startTime == null) return "Unknown";
        String day = startTime.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
        return day + " " + String.format(Locale.ROOT, "%02d:00", startTime.getHour());
    }

    private void addCount(Map<String, CountBucket> buckets, String label, long minutes) {
        if (label == null || label.isBlank()) return;
        CountBucket bucket = buckets.computeIfAbsent(label, key -> new CountBucket());
        bucket.count++;
        bucket.minutes += Math.max(minutes, 0);
    }

    private List<CountRanking> toCountRankings(Map<String, CountBucket> source, int limit) {
        return source.entrySet().stream()
                .filter(entry -> entry.getKey() != null && !entry.getKey().isBlank())
                .map(entry -> new CountRanking(entry.getKey(), entry.getValue().count, entry.getValue().minutes))
                .sorted(Comparator
                        .comparing(CountRanking::count, Comparator.reverseOrder())
                        .thenComparing(CountRanking::minutes, Comparator.reverseOrder())
                        .thenComparing(CountRanking::label))
                .limit(limit)
                .toList();
    }

    private String normalizePeriod(String raw) {
        if (raw == null || raw.isBlank()) return "month";
        String v = raw.trim().toLowerCase(Locale.ROOT);
        return switch (v) {
            case "day", "7d", "month", "year", "custom" -> v;
            default -> "month";
        };
    }

    private record DateRange(LocalDate from, LocalDate to) {}

    private DateRange resolveRange(String period, LocalDate fromParam, LocalDate toParam, ZoneId zone) {
        LocalDate today = timeService.localDate(zone);
        if ("custom".equals(period)) {
            if (fromParam == null || toParam == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "For custom period, both from and to are required.");
            }
            if (toParam.isBefore(fromParam)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid custom range.");
            }
            return new DateRange(fromParam, toParam);
        }
        if (fromParam != null && toParam != null && !toParam.isBefore(fromParam)) {
            return new DateRange(fromParam, toParam);
        }
        return switch (period) {
            case "day" -> new DateRange(today, today);
            case "7d" -> new DateRange(today.minusDays(6), today);
            case "year" -> new DateRange(LocalDate.of(today.getYear() - 4, 1, 1), LocalDate.of(today.getYear(), 12, 31));
            case "month" -> {
                YearMonth start = YearMonth.from(today).minusMonths(11);
                YearMonth end = YearMonth.from(today);
                yield new DateRange(start.atDay(1), end.atEndOfMonth());
            }
            default -> new DateRange(today.minusDays(29), today);
        };
    }

    private boolean isInDateRange(LocalDate d, DateRange range) {
        return !(d.isBefore(range.from()) || d.isAfter(range.to()));
    }

    private Long resolveConsultantFilter(User me, Long consultantIdParam) {
        if (!SecurityUtils.isAdmin(me)) {
            return me.getId();
        }
        return consultantIdParam;
    }
}
