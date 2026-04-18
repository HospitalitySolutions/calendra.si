package com.example.app.analytics;

import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.mail.internet.MimeMessage;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AnalyticsReportService {
    private final AnalyticsService analyticsService;
    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final String mailFrom;
    private final ZoneId zone;

    public AnalyticsReportService(
            AnalyticsService analyticsService,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${app.mail.from:}") String configuredMailFrom,
            @Value("${spring.mail.username:}") String springMailUsername,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.analyticsService = analyticsService;
        this.mailSender = mailSender;
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.mailFrom = configuredMailFrom != null && !configuredMailFrom.isBlank()
                ? configuredMailFrom.trim()
                : (springMailUsername != null && !springMailUsername.isBlank() ? springMailUsername.trim() : "no-reply@calendra.local");
        this.zone = ZoneId.of(timezoneId == null || timezoneId.isBlank() ? "Europe/Ljubljana" : timezoneId);
    }

    public boolean isMailConfigured() {
        return mailConfigured;
    }

    public String sendManualReport(User me, AnalyticsController.ReportRequest request) {
        if (!mailConfigured || mailSender == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email reports are not configured on the server.");
        }
        String email = resolveTargetEmail(me, request);
        String period = request != null && request.period() != null && !request.period().isBlank() ? request.period() : "month";
        LocalDate from = request != null ? request.from() : null;
        LocalDate to = request != null ? request.to() : null;
        Long consultantId = request != null ? request.consultantId() : null;
        Long spaceId = request != null ? request.spaceId() : null;
        Long typeId = request != null ? request.typeId() : null;

        AnalyticsService.AnalyticsOverviewResponse overview = analyticsService.overview(
                me,
                period,
                from,
                to,
                consultantId,
                spaceId,
                typeId
        );
        sendReportEmail(me.getCompany(), email, overview, buildPeriodLabel(overview.rangeStart(), overview.rangeEnd()));
        return email;
    }

    public void sendScheduledReport(Company company, String email, String frequency) {
        if (!mailConfigured || mailSender == null) return;
        LocalDate today = LocalDate.now(zone);
        boolean daily = "DAILY".equalsIgnoreCase(frequency);
        LocalDate to = today.minusDays(1);
        LocalDate from = daily ? to : today.minusDays(7);
        AnalyticsService.AnalyticsOverviewResponse overview = analyticsService.overviewForCompany(
                company.getId(),
                "custom",
                from,
                to,
                null,
                null,
                null
        );
        sendReportEmail(company, email, overview, buildPeriodLabel(from.toString(), to.toString()));
    }

    private String resolveTargetEmail(User me, AnalyticsController.ReportRequest request) {
        String requested = request != null ? request.email() : null;
        if (requested != null && !requested.isBlank()) return requested.trim();
        if (me.getEmail() != null && !me.getEmail().isBlank()) return me.getEmail().trim();
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No target email address was provided for the report.");
    }

    private void sendReportEmail(Company company, String to, AnalyticsService.AnalyticsOverviewResponse overview, String periodLabel) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(to);
            helper.setSubject(company.getName() + " · Analytics report · " + periodLabel);
            helper.setText(renderHtml(company, overview, periodLabel), true);
            mailSender.send(message);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not send analytics report email: " + ex.getMessage(), ex);
        }
    }

    private String renderHtml(Company company, AnalyticsService.AnalyticsOverviewResponse overview, String periodLabel) {
        AnalyticsService.Summary summary = overview.summary();
        NumberFormat currency = NumberFormat.getCurrencyInstance(Locale.GERMANY);
        currency.setCurrency(java.util.Currency.getInstance("EUR"));
        StringBuilder html = new StringBuilder();
        html.append("<div style='font-family:Arial,sans-serif;color:#0f172a;line-height:1.5'>");
        html.append("<h2 style='margin:0 0 8px'>").append(escape(company.getName())).append(" analytics report</h2>");
        html.append("<p style='margin:0 0 20px;color:#475569'>Period: ").append(escape(periodLabel)).append("</p>");

        html.append("<table style='width:100%;border-collapse:collapse;margin-bottom:20px'>");
        appendMetricRow(html, "Sessions", String.valueOf(summary.sessionsTotal()));
        appendMetricRow(html, "Active clients", String.valueOf(summary.clientsTotal()));
        appendMetricRow(html, "New clients", String.valueOf(summary.newClients()));
        appendMetricRow(html, "Online sessions", String.valueOf(summary.sessionsOnline()));
        appendMetricRow(html, "Revenue gross", currency.format(nullSafe(summary.revenueGross())));
        appendMetricRow(html, "Revenue net", currency.format(nullSafe(summary.revenueNet())));
        html.append("</table>");

        appendRankingSection(html, "Top services", overview.topServices(), currency);
        appendRankingSection(html, "Top consultants", overview.topConsultants(), currency);
        appendRankingSection(html, "Top clients", overview.topClients(), currency);
        appendSpaceSection(html, overview.topSpaces());

        if (!overview.weeks().isEmpty()) {
            html.append("<h3 style='margin:24px 0 8px'>Weekly trend</h3>");
            html.append("<table style='width:100%;border-collapse:collapse'>");
            html.append("<tr><th align='left' style='padding:8px;border-bottom:1px solid #e2e8f0'>Week</th>")
                    .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>Sessions</th>")
                    .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>New clients</th>")
                    .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>Revenue</th></tr>");
            for (AnalyticsService.WeekPoint point : overview.weeks()) {
                html.append("<tr>")
                        .append("<td style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(escape(point.label())).append("</td>")
                        .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(point.sessionsTotal()).append("</td>")
                        .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(point.newClients()).append("</td>")
                        .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(currency.format(nullSafe(point.revenueGross()))).append("</td>")
                        .append("</tr>");
            }
            html.append("</table>");
        }

        html.append("</div>");
        return html.toString();
    }

    private void appendMetricRow(StringBuilder html, String label, String value) {
        html.append("<tr>")
                .append("<td style='padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600'>").append(escape(label)).append("</td>")
                .append("<td style='padding:10px 12px;border:1px solid #e2e8f0'>").append(escape(value)).append("</td>")
                .append("</tr>");
    }

    private void appendRankingSection(StringBuilder html, String title, List<AnalyticsService.RankedAmount> items, NumberFormat currency) {
        html.append("<h3 style='margin:24px 0 8px'>").append(escape(title)).append("</h3>");
        if (items.isEmpty()) {
            html.append("<p style='margin:0;color:#64748b'>No data yet.</p>");
            return;
        }
        html.append("<table style='width:100%;border-collapse:collapse'>")
                .append("<tr><th align='left' style='padding:8px;border-bottom:1px solid #e2e8f0'>Name</th>")
                .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>Amount</th>")
                .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>Count</th></tr>");
        for (AnalyticsService.RankedAmount item : items) {
            html.append("<tr>")
                    .append("<td style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(escape(item.label())).append("</td>")
                    .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(currency.format(nullSafe(item.amount()))).append("</td>")
                    .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(item.count()).append("</td>")
                    .append("</tr>");
        }
        html.append("</table>");
    }

    private void appendSpaceSection(StringBuilder html, List<AnalyticsService.UsageRanking> items) {
        html.append("<h3 style='margin:24px 0 8px'>Top spaces</h3>");
        if (items.isEmpty()) {
            html.append("<p style='margin:0;color:#64748b'>No space usage yet.</p>");
            return;
        }
        html.append("<table style='width:100%;border-collapse:collapse'>")
                .append("<tr><th align='left' style='padding:8px;border-bottom:1px solid #e2e8f0'>Space</th>")
                .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>Booked time</th>")
                .append("<th align='right' style='padding:8px;border-bottom:1px solid #e2e8f0'>Sessions</th></tr>");
        for (AnalyticsService.UsageRanking item : items) {
            html.append("<tr>")
                    .append("<td style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(escape(item.label())).append("</td>")
                    .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(escape(formatMinutes(item.minutes()))).append("</td>")
                    .append("<td align='right' style='padding:8px;border-bottom:1px solid #f1f5f9'>").append(item.sessionsTotal()).append("</td>")
                    .append("</tr>");
        }
        html.append("</table>");
    }

    private String buildPeriodLabel(String from, String to) {
        LocalDate start = LocalDate.parse(from);
        LocalDate end = LocalDate.parse(to);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("d MMM yyyy");
        if (start.equals(end)) return start.format(fmt);
        return start.format(fmt) + " – " + end.format(fmt);
    }

    private BigDecimal nullSafe(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String formatMinutes(long minutes) {
        long hours = minutes / 60;
        long rem = minutes % 60;
        if (rem == 0) return hours + " h";
        return hours + " h " + rem + " min";
    }

    private String escape(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
