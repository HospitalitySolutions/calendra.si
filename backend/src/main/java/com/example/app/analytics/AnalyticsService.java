package com.example.app.analytics;

import com.example.app.billing.Bill;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
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

    @Value("${app.reminders.timezone:Europe/Ljubljana}")
    private String remindersTimezone;

    public AnalyticsService(
            SessionBookingRepository bookingRepository,
            ClientRepository clientRepository,
            BillRepository billRepository) {
        this.bookingRepository = bookingRepository;
        this.clientRepository = clientRepository;
        this.billRepository = billRepository;
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
            List<UsageRanking> topSpaces
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

    @Transactional(readOnly = true)
    public AnalyticsOverviewResponse overview(
            User me,
            String periodRaw,
            LocalDate fromParam,
            LocalDate toParam,
            Long consultantIdParam,
            Long spaceId,
            Long typeId
    ) {
        return overviewForCompany(
                me.getCompany().getId(),
                periodRaw,
                fromParam,
                toParam,
                resolveConsultantFilter(me, consultantIdParam),
                spaceId,
                typeId
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
            Long typeId
    ) {
        ZoneId zone = ZoneId.of(remindersTimezone);
        String period = normalizePeriod(periodRaw);
        DateRange range = resolveRange(period, fromParam, toParam, zone);

        List<SessionBooking> bookings = bookingRepository.findAllByCompanyId(companyId);
        List<Client> clients = clientRepository.findAllByCompanyId(companyId);
        List<Bill> bills = billRepository.findAllByCompanyId(companyId);

        bookings = bookings.stream()
                .filter(b -> b.getStartTime() != null)
                .filter(b -> isInDateRange(b.getStartTime().toLocalDate(), range))
                .filter(b -> consultantFilter == null || (b.getConsultant() != null && consultantFilter.equals(b.getConsultant().getId())))
                .filter(b -> spaceId == null || (b.getSpace() != null && spaceId.equals(b.getSpace().getId())))
                .filter(b -> typeId == null || (b.getType() != null && typeId.equals(b.getType().getId())))
                .toList();

        clients = clients.stream()
                .filter(c -> c.getCreatedAt() != null)
                .filter(c -> isInDateRange(c.getCreatedAt().atZone(zone).toLocalDate(), range))
                .filter(c -> consultantFilter == null || (c.getAssignedTo() != null && consultantFilter.equals(c.getAssignedTo().getId())))
                .toList();

        bills = bills.stream()
                .filter(b -> b.getIssueDate() != null)
                .filter(b -> isInDateRange(b.getIssueDate(), range))
                .filter(b -> consultantFilter == null || (b.getConsultant() != null && consultantFilter.equals(b.getConsultant().getId())))
                .toList();

        Map<YearMonth, Bucket> monthBuckets = new HashMap<>();
        Map<Integer, Bucket> yearBuckets = new HashMap<>();
        Map<DayOfWeek, Bucket> weekdayBuckets = new EnumMap<>(DayOfWeek.class);
        Map<LocalDate, Bucket> weekBuckets = new HashMap<>();
        Map<String, RankedBucket> serviceRanking = new HashMap<>();
        Map<String, RankedBucket> consultantRevenueRanking = new HashMap<>();
        Map<String, RankedBucket> clientRevenueRanking = new HashMap<>();
        Map<String, RankedBucket> spaceUsageRanking = new HashMap<>();
        Bucket summaryBucket = new Bucket();

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

            if (b.getSpace() != null && !b.getSpace().getName().isBlank()) {
                RankedBucket spaceBucket = spaceUsageRanking.computeIfAbsent(b.getSpace().getName().trim(), key -> new RankedBucket());
                spaceBucket.minutes += durationMinutes;
                spaceBucket.sessionsTotal++;
            }
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

        for (Bill b : bills) {
            YearMonth ym = YearMonth.from(b.getIssueDate());
            int y = b.getIssueDate().getYear();
            LocalDate weekStart = startOfIsoWeek(b.getIssueDate());
            Bucket m = monthBuckets.computeIfAbsent(ym, k -> new Bucket());
            Bucket yy = yearBuckets.computeIfAbsent(y, k -> new Bucket());
            Bucket ww = weekBuckets.computeIfAbsent(weekStart, k -> new Bucket());

            BigDecimal net = b.getTotalNet() == null ? BigDecimal.ZERO : b.getTotalNet();
            BigDecimal gross = b.getTotalGross() == null ? BigDecimal.ZERO : b.getTotalGross();
            m.revenueNet = m.revenueNet.add(net);
            m.revenueGross = m.revenueGross.add(gross);
            yy.revenueNet = yy.revenueNet.add(net);
            yy.revenueGross = yy.revenueGross.add(gross);
            ww.revenueGross = ww.revenueGross.add(gross);
            summaryBucket.revenueNet = summaryBucket.revenueNet.add(net);
            summaryBucket.revenueGross = summaryBucket.revenueGross.add(gross);

            accumulateAmount(consultantRevenueRanking, safeConsultantLabel(b.getConsultant()), gross, 1);
            accumulateAmount(clientRevenueRanking, safeBillClientLabel(b), gross, 1);

            for (BillItem item : b.getItems()) {
                if (item == null) continue;
                String label = safeServiceLabel(item);
                long quantity = item.getQuantity() == null ? 0 : item.getQuantity();
                BigDecimal lineGross = item.getGrossPrice() == null
                        ? BigDecimal.ZERO
                        : item.getGrossPrice().multiply(BigDecimal.valueOf(Math.max(quantity, 0)));
                accumulateAmount(serviceRanking, label, lineGross, quantity);
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
                toUsageRankings(spaceUsageRanking, 5)
        );
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
        LocalDate today = LocalDate.now(zone);
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
