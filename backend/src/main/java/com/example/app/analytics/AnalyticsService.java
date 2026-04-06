package com.example.app.analytics;

import com.example.app.billing.Bill;
import com.example.app.billing.BillRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

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

    public record AnalyticsOverviewResponse(
            String period,
            String rangeStart,
            String rangeEnd,
            Summary summary,
            List<PeriodPoint> months,
            List<PeriodPoint> years
    ) {}

    private static final class Bucket {
        long sessionsTotal = 0;
        final Set<Long> clientIds = new HashSet<>();
        long sessionsStandard = 0;
        long sessionsOnline = 0;
        long newClients = 0;
        BigDecimal revenueNet = BigDecimal.ZERO;
        BigDecimal revenueGross = BigDecimal.ZERO;
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
        Long companyId = me.getCompany().getId();
        ZoneId zone = ZoneId.of(remindersTimezone);
        String period = normalizePeriod(periodRaw);
        DateRange range = resolveRange(period, fromParam, toParam, zone);
        Long consultantFilter = resolveConsultantFilter(me, consultantIdParam);

        List<SessionBooking> bookings = SecurityUtils.isAdmin(me)
                ? bookingRepository.findAllByCompanyId(companyId)
                : bookingRepository.findByConsultantIdAndCompanyId(me.getId(), companyId);
        List<Client> clients = SecurityUtils.isAdmin(me)
                ? clientRepository.findAllByCompanyId(companyId)
                : clientRepository.findByAssignedToIdAndCompanyId(me.getId(), companyId);
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
        Bucket summaryBucket = new Bucket();

        for (SessionBooking b : bookings) {
            YearMonth ym = YearMonth.from(b.getStartTime());
            int y = b.getStartTime().getYear();
            Bucket m = monthBuckets.computeIfAbsent(ym, k -> new Bucket());
            Bucket yy = yearBuckets.computeIfAbsent(y, k -> new Bucket());
            boolean online = b.getMeetingLink() != null && !b.getMeetingLink().isBlank();
            Long clientId = b.getClient() != null ? b.getClient().getId() : null;

            m.sessionsTotal++;
            yy.sessionsTotal++;
            summaryBucket.sessionsTotal++;
            if (clientId != null) {
                m.clientIds.add(clientId);
                yy.clientIds.add(clientId);
                summaryBucket.clientIds.add(clientId);
            }
            if (online) {
                m.sessionsOnline++;
                yy.sessionsOnline++;
                summaryBucket.sessionsOnline++;
            } else {
                m.sessionsStandard++;
                yy.sessionsStandard++;
                summaryBucket.sessionsStandard++;
            }
        }

        for (Client c : clients) {
            LocalDate d = c.getCreatedAt().atZone(zone).toLocalDate();
            YearMonth ym = YearMonth.from(d);
            int y = d.getYear();
            monthBuckets.computeIfAbsent(ym, k -> new Bucket()).newClients++;
            yearBuckets.computeIfAbsent(y, k -> new Bucket()).newClients++;
            summaryBucket.newClients++;
        }

        for (Bill b : bills) {
            YearMonth ym = YearMonth.from(b.getIssueDate());
            int y = b.getIssueDate().getYear();
            Bucket m = monthBuckets.computeIfAbsent(ym, k -> new Bucket());
            Bucket yy = yearBuckets.computeIfAbsent(y, k -> new Bucket());

            BigDecimal net = b.getTotalNet() == null ? BigDecimal.ZERO : b.getTotalNet();
            BigDecimal gross = b.getTotalGross() == null ? BigDecimal.ZERO : b.getTotalGross();
            m.revenueNet = m.revenueNet.add(net);
            m.revenueGross = m.revenueGross.add(gross);
            yy.revenueNet = yy.revenueNet.add(net);
            yy.revenueGross = yy.revenueGross.add(gross);
            summaryBucket.revenueNet = summaryBucket.revenueNet.add(net);
            summaryBucket.revenueGross = summaryBucket.revenueGross.add(gross);
        }

        List<PeriodPoint> months = "month".equals(period) ? toMonthPoints(monthBuckets) : List.of();
        List<PeriodPoint> years = "year".equals(period) ? toYearPoints(yearBuckets) : List.of();
        Summary summary = new Summary(
                summaryBucket.sessionsTotal,
                summaryBucket.clientIds.size(),
                summaryBucket.sessionsStandard,
                summaryBucket.sessionsOnline,
                summaryBucket.newClients,
                summaryBucket.revenueNet,
                summaryBucket.revenueGross
        );
        return new AnalyticsOverviewResponse(period, range.from().toString(), range.to().toString(), summary, months, years);
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
