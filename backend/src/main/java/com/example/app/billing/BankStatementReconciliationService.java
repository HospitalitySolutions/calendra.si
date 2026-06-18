package com.example.app.billing;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BankStatementReconciliationService {
    private static final long MAX_BANK_STATEMENT_BYTES = 5L * 1024L * 1024L;

    private final BillRepository billRepo;
    private final ApplicationEventPublisher events;

    public BankStatementReconciliationService(BillRepository billRepo, ApplicationEventPublisher events) {
        this.billRepo = billRepo;
        this.events = events;
    }

    @Transactional
    public ReconciliationResult importStatement(Long companyId, MultipartFile file) throws IOException {
        if (file.getSize() > MAX_BANK_STATEMENT_BYTES) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Bank statement file is too large. Maximum allowed size is 5 MB."
            );
        }

        List<Bill> candidates = billRepo.findBankTransferReconciliationCandidates(
                        companyId,
                        BillPaymentStatus.PAID,
                        PaymentType.BANK_TRANSFER
                ).stream()
                .filter(b -> BillPaymentSplitSupport.resolveBankTransferDueGross(b).compareTo(BigDecimal.ZERO) > 0)
                .toList();
        Map<BigDecimal, List<ReconciliationCandidate>> candidatesByAmount = indexCandidatesByAmount(candidates);

        Map<Long, Bill> matchedBills = new LinkedHashMap<>();
        int matchedRows = 0;
        List<MatchedBill> matched = new ArrayList<>();
        int processedRows = 0;
        List<String> headerCells = List.of();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                List<String> cells = splitRow(line, guessDelimiter(line));
                if (isHeaderRow(cells)) {
                    headerCells = cells;
                    continue;
                }

                String normalized = normalize(String.join(" | ", cells));
                LocalDate paidDate = firstDate(cells);
                BigDecimal rowAmount = amountFromRow(cells, headerCells);
                if (rowAmount == null || rowAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

                processedRows++;
                for (ReconciliationCandidate candidate : candidatesByAmount.getOrDefault(rowAmount, List.of())) {
                    Bill bill = candidate.bill();
                    if (matchedBills.containsKey(bill.getId())) {
                        continue;
                    }
                    if ((!candidate.normalizedReference().isBlank() && normalized.contains(candidate.normalizedReference()))
                            || (!candidate.normalizedBillNumber().isBlank() && normalized.contains(candidate.normalizedBillNumber()))) {
                        bill.setPaymentStatus(BillPaymentStatus.PAID);
                        bill.setPaidAt(paidDate == null
                                ? OffsetDateTime.now()
                                : paidDate.atStartOfDay().plusHours(12).atOffset(ZoneOffset.UTC));

                        if (bill.getBankTransferReference() == null || bill.getBankTransferReference().isBlank()) {
                            bill.setBankTransferReference(candidate.expectedReference());
                        }

                        matchedBills.put(bill.getId(), bill);
                        matchedRows++;
                        matched.add(new MatchedBill(bill.getId(), bill.getBillNumber(), candidate.expectedReference(), rowAmount, paidDate));
                        break;
                    }
                }
            }
        }

        if (!matchedBills.isEmpty()) {
            billRepo.saveAll(new ArrayList<>(matchedBills.values()));

            for (Bill paid : matchedBills.values()) {
                Long eventCompanyId = paid.getCompany() != null ? paid.getCompany().getId() : companyId;
                events.publishEvent(new BillPaidEvent(paid.getId(), eventCompanyId));
            }
        }

        return new ReconciliationResult(
                processedRows,
                matched.size(),
                Math.max(0, processedRows - matchedRows),
                matched
        );
    }

    public static String bankReferenceForBill(Bill bill) {
        if (bill == null) {
            return "";
        }
        if (bill.getOrderId() != null && !bill.getOrderId().isBlank()) {
            return bill.getOrderId().trim();
        }
        if (bill.getBankTransferReference() != null && !bill.getBankTransferReference().isBlank()) {
            return bill.getBankTransferReference().trim();
        }

        return UpnQrPayloadBuilder.toRfReference(bill.getBillNumber());
    }

    private record ReconciliationCandidate(
            Bill bill,
            String expectedReference,
            String normalizedReference,
            String normalizedBillNumber
    ) {}

    private static Map<BigDecimal, List<ReconciliationCandidate>> indexCandidatesByAmount(List<Bill> bills) {
        Map<BigDecimal, List<ReconciliationCandidate>> index = new LinkedHashMap<>();
        for (Bill bill : bills) {
            BigDecimal expectedAmount = BillPaymentSplitSupport.resolveBankTransferDueGross(bill);
            if (expectedAmount.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            String expectedReference = bankReferenceForBill(bill);
            ReconciliationCandidate candidate = new ReconciliationCandidate(
                    bill,
                    expectedReference,
                    normalize(expectedReference),
                    normalize(bill.getBillNumber())
            );
            BigDecimal amountKey = expectedAmount.setScale(2, RoundingMode.HALF_UP);
            index.computeIfAbsent(amountKey, ignored -> new ArrayList<>()).add(candidate);
        }
        return index;
    }

    private static BigDecimal amountFromRow(List<String> cells, List<String> headerCells) {
        int dobroIndex = findHeaderIndex(headerCells, "DOBRO");

        if (dobroIndex >= 0) {
            if (dobroIndex >= cells.size()) {
                return null;
            }

            BigDecimal amount = parseAmount(cells.get(dobroIndex));
            if (amount != null && amount.compareTo(BigDecimal.ZERO) > 0) {
                return amount.setScale(2, RoundingMode.HALF_UP);
            }

            return null;
        }

        return firstAmount(cells);
    }

    private static boolean isHeaderRow(List<String> cells) {
        return findHeaderIndex(cells, "DOBRO") >= 0;
    }

    private static int findHeaderIndex(List<String> headerCells, String wanted) {
        String normalizedWanted = normalize(wanted);

        for (int i = 0; i < headerCells.size(); i++) {
            if (normalizedWanted.equals(normalize(headerCells.get(i)))) {
                return i;
            }
        }

        return -1;
    }

    private static char guessDelimiter(String line) {
        int semis = count(line, ';');
        int commas = count(line, ',');
        int tabs = count(line, '\t');

        if (tabs >= semis && tabs >= commas && tabs > 0) {
            return '\t';
        }

        return semis >= commas ? ';' : ',';
    }

    private static int count(String value, char ch) {
        int c = 0;

        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) == ch) {
                c++;
            }
        }

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

            if (parsed != null && parsed.compareTo(BigDecimal.ZERO) > 0) {
                return parsed.setScale(2, RoundingMode.HALF_UP);
            }
        }

        return null;
    }

    private static BigDecimal parseAmount(String raw) {
        if (raw == null) {
            return null;
        }

        String trimmed = raw.trim();

        if (trimmed.isBlank()) {
            return null;
        }

        // Do not treat dates like 05.04.2026 as money.
        if (trimmed.matches("\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}")) {
            return null;
        }

        String withoutCurrency = trimmed
                .replace("€", "")
                .replace(" ", " ")
                .replaceAll("(?i)\\bEUR\\b", "")
                .trim();

        // Do not treat IBANs/references like SI56040000280821828 or RF1168 as money.
        if (withoutCurrency.matches(".*[A-Za-z].*")) {
            return null;
        }

        String value = withoutCurrency
                .replace(" ", "")
                .replace("'", "")
                .replaceAll("[^0-9,.-]", "");

        if (value.isBlank() || value.equals("-") || value.equals(",") || value.equals(".")) {
            return null;
        }

        // Avoid treating long account/reference numbers as integer amounts.
        if (!value.contains(",") && !value.contains(".") && value.replace("-", "").length() > 6) {
            return null;
        }

        int lastComma = value.lastIndexOf(',');
        int lastDot = value.lastIndexOf('.');

        if (lastComma >= 0 && lastDot >= 0) {
            if (lastComma > lastDot) {
                value = value.replace(".", "").replace(',', '.');
            } else {
                value = value.replace(",", "");
            }
        } else if (lastComma >= 0) {
            value = value.replace(".", "").replace(',', '.');
        }

        try {
            return new BigDecimal(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static LocalDate firstDate(List<String> cells) {
        for (String cell : cells) {
            LocalDate parsed = parseDate(cell);

            if (parsed != null) {
                return parsed;
            }
        }

        return null;
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }

        List<DateTimeFormatter> formats = List.of(
                DateTimeFormatter.ofPattern("d.M.uuuu", Locale.ROOT),
                DateTimeFormatter.ofPattern("dd.MM.uuuu", Locale.ROOT),
                DateTimeFormatter.ofPattern("d/M/uuuu", Locale.ROOT),
                DateTimeFormatter.ofPattern("dd/MM/uuuu", Locale.ROOT),
                DateTimeFormatter.ISO_LOCAL_DATE
        );

        for (DateTimeFormatter fmt : formats) {
            try {
                return LocalDate.parse(raw.trim(), fmt);
            } catch (DateTimeParseException ignored) {
            }
        }

        return null;
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }

        return value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    public record MatchedBill(Long billId, String billNumber, String reference, BigDecimal amount, LocalDate paidDate) {
    }

    public record ReconciliationResult(int processedRows, int matchedCount, int unmatchedCount, List<MatchedBill> matchedBills) {
    }
}