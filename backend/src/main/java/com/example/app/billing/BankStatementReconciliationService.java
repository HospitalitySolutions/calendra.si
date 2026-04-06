package com.example.app.billing;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class BankStatementReconciliationService {
    private final BillRepository billRepo;

    public BankStatementReconciliationService(BillRepository billRepo) {
        this.billRepo = billRepo;
    }

    @Transactional
    public ReconciliationResult importStatement(Long companyId, MultipartFile file) throws IOException {
        String text = new String(file.getBytes(), StandardCharsets.UTF_8);
        List<String> lines = new BufferedReader(new StringReader(text)).lines().toList();
        if (lines.isEmpty()) {
            return new ReconciliationResult(0, 0, 0, List.of());
        }

        List<Bill> candidates = billRepo.findAllByCompanyId(companyId).stream()
                .filter(b -> b.getPaymentMethod() != null && b.getPaymentMethod().getPaymentType() == PaymentType.BANK_TRANSFER)
                .filter(b -> !BillPaymentStatus.PAID.equals(b.getPaymentStatus()))
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .toList();

        Map<Long, Bill> matchedBills = new LinkedHashMap<>();
        Set<Integer> matchedRows = new HashSet<>();
        List<MatchedBill> matched = new ArrayList<>();
        int processedRows = 0;

        for (int idx = 0; idx < lines.size(); idx++) {
            String line = lines.get(idx);
            if (line == null || line.isBlank()) continue;
            processedRows++;
            List<String> cells = splitRow(line, guessDelimiter(line));
            String normalized = normalize(String.join(" | ", cells));
            LocalDate paidDate = firstDate(cells);
            BigDecimal rowAmount = firstAmount(cells);
            if (rowAmount == null || rowAmount.compareTo(BigDecimal.ZERO) <= 0) continue;

            for (Bill bill : candidates) {
                if (matchedBills.containsKey(bill.getId())) continue;
                String expectedReference = bankReferenceForBill(bill);
                boolean amountMatch = bill.getTotalGross() != null
                        && bill.getTotalGross().setScale(2, RoundingMode.HALF_UP).compareTo(rowAmount) == 0;
                if (!amountMatch) continue;
                String normRef = normalize(expectedReference);
                String normBill = normalize(bill.getBillNumber());
                if ((!normRef.isBlank() && normalized.contains(normRef)) || (!normBill.isBlank() && normalized.contains(normBill))) {
                    bill.setPaymentStatus(BillPaymentStatus.PAID);
                    bill.setPaidAt((paidDate == null ? OffsetDateTime.now() : paidDate.atStartOfDay().plusHours(12).atOffset(ZoneOffset.UTC)));
                    if (bill.getBankTransferReference() == null || bill.getBankTransferReference().isBlank()) {
                        bill.setBankTransferReference(expectedReference);
                    }
                    matchedBills.put(bill.getId(), bill);
                    matchedRows.add(idx);
                    matched.add(new MatchedBill(bill.getId(), bill.getBillNumber(), expectedReference, rowAmount, paidDate));
                    break;
                }
            }
        }

        if (!matchedBills.isEmpty()) {
            billRepo.saveAll(matchedBills.values());
        }
        return new ReconciliationResult(processedRows, matched.size(), Math.max(0, processedRows - matchedRows.size()), matched);
    }

    public static String bankReferenceForBill(Bill bill) {
        if (bill.getBankTransferReference() != null && !bill.getBankTransferReference().isBlank()) {
            return bill.getBankTransferReference().trim();
        }
        return UpnQrPayloadBuilder.toRfReference(bill.getBillNumber());
    }

    private static char guessDelimiter(String line) {
        int semis = count(line, ';');
        int commas = count(line, ',');
        int tabs = count(line, '	');
        if (tabs >= semis && tabs >= commas && tabs > 0) return '	';
        return semis >= commas ? ';' : ',';
    }

    private static int count(String value, char ch) {
        int c = 0;
        for (int i = 0; i < value.length(); i++) if (value.charAt(i) == ch) c++;
        return c;
    }

    private static List<String> splitRow(String line, char delimiter) {
        List<String> cells = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (!quoted && ch == delimiter) {
                cells.add(cur.toString().trim());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        cells.add(cur.toString().trim());
        return cells;
    }

    private static BigDecimal firstAmount(List<String> cells) {
        for (String cell : cells) {
            BigDecimal parsed = parseAmount(cell);
            if (parsed != null && parsed.compareTo(BigDecimal.ZERO) > 0) return parsed.setScale(2, RoundingMode.HALF_UP);
        }
        return null;
    }

    private static BigDecimal parseAmount(String raw) {
        if (raw == null) return null;
        String value = raw.trim().replace(" ", " ").replaceAll("[^0-9,.-]", "");
        if (value.isBlank() || value.equals("-") || value.equals(",") || value.equals(".")) return null;
        int lastComma = value.lastIndexOf(',');
        int lastDot = value.lastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0) {
            if (lastComma > lastDot) value = value.replace(".", "").replace(',', '.');
            else value = value.replace(",", "");
        } else if (lastComma >= 0) {
            value = value.replace(".", "").replace(',', '.');
        }
        try { return new BigDecimal(value); } catch (Exception ignored) { return null; }
    }

    private static LocalDate firstDate(List<String> cells) {
        for (String cell : cells) {
            LocalDate parsed = parseDate(cell);
            if (parsed != null) return parsed;
        }
        return null;
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        List<DateTimeFormatter> formats = List.of(
                DateTimeFormatter.ofPattern("d.M.uuuu", Locale.ROOT),
                DateTimeFormatter.ofPattern("dd.MM.uuuu", Locale.ROOT),
                DateTimeFormatter.ofPattern("d/M/uuuu", Locale.ROOT),
                DateTimeFormatter.ofPattern("dd/MM/uuuu", Locale.ROOT),
                DateTimeFormatter.ISO_LOCAL_DATE
        );
        for (DateTimeFormatter fmt : formats) {
            try { return LocalDate.parse(raw.trim(), fmt); } catch (DateTimeParseException ignored) {}
        }
        return null;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    public record MatchedBill(Long billId, String billNumber, String reference, BigDecimal amount, LocalDate paidDate) {}
    public record ReconciliationResult(int processedRows, int matchedCount, int unmatchedCount, List<MatchedBill> matchedBills) {}
}
