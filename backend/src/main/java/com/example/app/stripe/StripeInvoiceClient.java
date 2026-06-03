package com.example.app.stripe;

import com.example.app.billing.Bill;
import com.example.app.billing.BillItem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripeInvoiceClient {
    private static final Logger log = LoggerFactory.getLogger(StripeInvoiceClient.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final StripeConfig config;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public StripeInvoiceClient(StripeConfig config) {
        this.config = config;
    }

    public StripeBankTransferInvoiceResult createBankTransferInvoice(Bill bill, int daysUntilDue) {
        return createBankTransferInvoice(bill, daysUntilDue, legacyContext());
    }

    public StripeBankTransferInvoiceResult createBankTransferInvoice(
            Bill bill,
            int daysUntilDue,
            String secretKey,
            String currency,
            String euBankTransferCountry,
            String connectedAccountId
    ) {
        return createBankTransferInvoice(
                bill,
                daysUntilDue,
                new StripeInvoiceRequestContext(secretKey, currency, euBankTransferCountry, connectedAccountId)
        );
    }

    public StripeBankTransferInvoiceResult retrieveBankTransferInvoice(String customerId, String invoiceId) {
        return retrieveBankTransferInvoice(customerId, invoiceId, legacyContext());
    }

    public StripeBankTransferInvoiceResult retrieveBankTransferInvoice(
            String customerId,
            String invoiceId,
            String secretKey,
            String currency,
            String euBankTransferCountry,
            String connectedAccountId
    ) {
        return retrieveBankTransferInvoice(
                customerId,
                invoiceId,
                new StripeInvoiceRequestContext(secretKey, currency, euBankTransferCountry, connectedAccountId)
        );
    }

    private StripeBankTransferInvoiceResult createBankTransferInvoice(Bill bill, int daysUntilDue, StripeInvoiceRequestContext context) {
        validateConfig(context);
        String customerId = createCustomer(bill, context);
        String invoiceId = createDraftInvoice(bill, customerId, daysUntilDue, context);
        createInvoiceItems(bill, customerId, invoiceId, context);
        JsonNode finalized = finalizeInvoice(invoiceId, context);
        JsonNode funding = createOrRetrieveFundingInstructions(customerId, context);
        return toInvoiceResult(customerId, finalized, funding);
    }

    private StripeBankTransferInvoiceResult retrieveBankTransferInvoice(String customerId, String invoiceId, StripeInvoiceRequestContext context) {
        validateConfig(context);
        if (customerId == null || customerId.isBlank() || invoiceId == null || invoiceId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing Stripe customer/invoice for bank transfer retrieval.");
        }
        JsonNode invoice = get("/v1/invoices/" + invoiceId, context);
        JsonNode funding = createOrRetrieveFundingInstructions(customerId, context);
        return toInvoiceResult(customerId, invoice, funding);
    }

    private StripeInvoiceRequestContext legacyContext() {
        return new StripeInvoiceRequestContext(
                config.secretKey(),
                config.currency(),
                config.euBankTransferCountry(),
                ""
        );
    }

    private void validateConfig(StripeInvoiceRequestContext context) {
        if (context.secretKey().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe secret key is not configured.");
        }
    }

    private String createCustomer(Bill bill, StripeInvoiceRequestContext context) {
        Map<String, String> form = new LinkedHashMap<>();
        String email = resolveCustomerEmail(bill);
        String phone = resolveCustomerPhone(bill);
        String name = resolveCustomerName(bill);
        if (name != null && !name.isBlank()) form.put("name", name);
        if (email != null && !email.isBlank()) form.put("email", email);
        if (phone != null && !phone.isBlank()) form.put("phone", phone);
        form.put("metadata[bill_id]", String.valueOf(bill.getId()));
        form.put("metadata[bill_number]", safe(bill.getBillNumber()));
        form.put("metadata[company_id]", String.valueOf(bill.getCompany().getId()));
        if (bill.getClient() != null) {
            form.put("metadata[client_id]", String.valueOf(bill.getClient().getId()));
        }
        addConnectMetadata(form, bill);
        JsonNode node = postForm(
                "/v1/customers",
                form,
                "bill-bank-transfer-customer-" + bill.getId(),
                context
        );
        String id = node.path("id").asText("");
        if (id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe customer response is missing id.");
        }
        return id;
    }

    private String createDraftInvoice(Bill bill, String customerId, int daysUntilDue, StripeInvoiceRequestContext context) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("customer", customerId);
        form.put("collection_method", "send_invoice");
        form.put("days_until_due", String.valueOf(Math.max(daysUntilDue, 0)));
        form.put("payment_settings[payment_method_types][]", "customer_balance");
        form.put("payment_settings[payment_method_options][customer_balance][funding_type]", "bank_transfer");
        form.put("payment_settings[payment_method_options][customer_balance][bank_transfer][type]", "eu_bank_transfer");
        form.put("payment_settings[payment_method_options][customer_balance][bank_transfer][eu_bank_transfer][country]", context.euBankTransferCountry());
        form.put("currency", context.currency());
        form.put("metadata[bill_id]", String.valueOf(bill.getId()));
        form.put("metadata[bill_number]", safe(bill.getBillNumber()));
        if (bill.getSourceSessionIdSnapshot() != null) {
            form.put("metadata[session_id]", String.valueOf(bill.getSourceSessionIdSnapshot()));
        }
        addConnectMetadata(form, bill);
        JsonNode node = postForm(
                "/v1/invoices",
                form,
                "bill-bank-transfer-invoice-" + bill.getId(),
                context
        );
        String id = node.path("id").asText("");
        if (id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe invoice response is missing id.");
        }
        return id;
    }

    private void createInvoiceItems(Bill bill, String customerId, String invoiceId, StripeInvoiceRequestContext context) {
        List<BillItem> items = bill.getItems() == null ? List.of() : bill.getItems();
        if (items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bill has no items for Stripe invoice creation.");
        }
        for (int i = 0; i < items.size(); i++) {
            BillItem item = items.get(i);
            Map<String, String> form = new LinkedHashMap<>();
            form.put("customer", customerId);
            form.put("invoice", invoiceId);
            form.put("currency", context.currency());
            form.put("amount", String.valueOf(toMinorUnits(item.getGrossPrice())));
            form.put("description", buildLineDescription(item));
            postForm(
                    "/v1/invoiceitems",
                    form,
                    "bill-bank-transfer-item-" + bill.getId() + "-" + i,
                    context
            );
        }
    }

    private JsonNode finalizeInvoice(String invoiceId, StripeInvoiceRequestContext context) {
        JsonNode node = postForm(
                "/v1/invoices/" + invoiceId + "/finalize",
                Map.of(),
                "bill-bank-transfer-finalize-" + invoiceId,
                context
        );
        String id = node.path("id").asText("");
        String hostedInvoiceUrl = node.path("hosted_invoice_url").asText("");
        if (id.isBlank() || hostedInvoiceUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe finalized invoice is missing id/hosted_invoice_url.");
        }
        return node;
    }

    private JsonNode createOrRetrieveFundingInstructions(String customerId, StripeInvoiceRequestContext context) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("funding_type", "bank_transfer");
        form.put("currency", context.currency());
        form.put("bank_transfer[type]", "eu_bank_transfer");
        form.put("bank_transfer[eu_bank_transfer][country]", context.euBankTransferCountry());
        form.put("bank_transfer[requested_address_types][]", "iban");
        return postForm(
                "/v1/customers/" + customerId + "/funding_instructions",
                form,
                "bill-bank-transfer-funding-" + customerId + "-" + context.currency() + "-" + context.euBankTransferCountry(),
                context
        );
    }

    private StripeBankTransferInvoiceResult toInvoiceResult(String customerId, JsonNode invoiceNode, JsonNode fundingNode) {
        String invoiceId = invoiceNode.path("id").asText("");
        String hostedInvoiceUrl = invoiceNode.path("hosted_invoice_url").asText("");
        String status = invoiceNode.path("status").asText("");
        String invoiceNumber = invoiceNode.path("number").asText("");
        JsonNode ibanNode = fundingNode.path("bank_transfer").path("financial_addresses").isArray()
                ? findIbanNode(fundingNode.path("bank_transfer").path("financial_addresses"))
                : null;
        if (invoiceId.isBlank() || hostedInvoiceUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe invoice details are incomplete.");
        }
        if (ibanNode == null || ibanNode.isMissingNode()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe funding instructions are missing IBAN details.");
        }
        return new StripeBankTransferInvoiceResult(
                customerId,
                invoiceId,
                hostedInvoiceUrl,
                status,
                invoiceNumber,
                ibanNode.path("iban").asText(""),
                ibanNode.path("bic").asText(""),
                ibanNode.path("account_holder_name").asText(""),
                ibanNode.path("account_holder_address").path("line1").asText(""),
                ibanNode.path("account_holder_address").path("postal_code").asText(""),
                ibanNode.path("account_holder_address").path("city").asText(""),
                ibanNode.path("country").asText("")
        );
    }

    private JsonNode findIbanNode(JsonNode addresses) {
        for (JsonNode address : addresses) {
            if ("iban".equalsIgnoreCase(address.path("type").asText("")) && address.hasNonNull("iban")) {
                return address.path("iban");
            }
        }
        return null;
    }

    private JsonNode get(String path, StripeInvoiceRequestContext context) {
        String url = normalizeUrl(path);
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + context.secretKey())
                .GET();
        addStripeAccountHeader(requestBuilder, context);
        HttpRequest request = requestBuilder.build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("Stripe GET failed url={} connectedAccount={} status={} body={}", url, context.connectedAccountId(), response.statusCode(), response.body());
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe bank transfer lookup failed.");
            }
            return JSON.readTree(response.body());
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Stripe GET failed url={} connectedAccount={}", url, context.connectedAccountId(), ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to fetch Stripe bank transfer invoice.");
        }
    }

    private JsonNode postForm(String path, Map<String, String> form, String idempotencyKey, StripeInvoiceRequestContext context) {
        String body = toFormData(form);
        String url = normalizeUrl(path);
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + context.secretKey())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Idempotency-Key", idempotencyKey)
                .POST(HttpRequest.BodyPublishers.ofString(body));
        addStripeAccountHeader(requestBuilder, context);
        HttpRequest request = requestBuilder.build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("Stripe POST failed url={} connectedAccount={} status={} body={}", url, context.connectedAccountId(), response.statusCode(), response.body());
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe bank transfer request failed.");
            }
            return JSON.readTree(response.body());
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Stripe POST failed url={} connectedAccount={}", url, context.connectedAccountId(), ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to create Stripe bank transfer invoice.");
        }
    }

    private void addStripeAccountHeader(HttpRequest.Builder requestBuilder, StripeInvoiceRequestContext context) {
        if (context.connectedAccountId() != null && !context.connectedAccountId().isBlank()) {
            requestBuilder.header("Stripe-Account", context.connectedAccountId());
        }
    }

    private void addConnectMetadata(Map<String, String> form, Bill bill) {
        if (bill.getStripeConnectMode() != null && !bill.getStripeConnectMode().isBlank()) {
            form.put("metadata[stripe_connect_mode]", bill.getStripeConnectMode().trim());
        }
        if (bill.getStripeConnectedAccountId() != null && !bill.getStripeConnectedAccountId().isBlank()) {
            form.put("metadata[stripe_connected_account_id]", bill.getStripeConnectedAccountId().trim());
        }
    }

    private String resolveCustomerName(Bill bill) {
        if (bill.getRecipientCompanyNameSnapshot() != null && !bill.getRecipientCompanyNameSnapshot().isBlank()) {
            return bill.getRecipientCompanyNameSnapshot().trim();
        }
        String first = bill.getClientFirstNameSnapshot() == null ? "" : bill.getClientFirstNameSnapshot().trim();
        String last = bill.getClientLastNameSnapshot() == null ? "" : bill.getClientLastNameSnapshot().trim();
        String joined = (first + " " + last).trim();
        return joined.isBlank() ? null : joined;
    }

    private String resolveCustomerEmail(Bill bill) {
        if (bill.getClient() != null && bill.getClient().getEmail() != null && !bill.getClient().getEmail().isBlank()) {
            return bill.getClient().getEmail().trim();
        }
        if (bill.getRecipientCompanyEmailSnapshot() != null && !bill.getRecipientCompanyEmailSnapshot().isBlank()) {
            return bill.getRecipientCompanyEmailSnapshot().trim();
        }
        return null;
    }

    private String resolveCustomerPhone(Bill bill) {
        if (bill.getClient() != null && bill.getClient().getPhone() != null && !bill.getClient().getPhone().isBlank()) {
            return bill.getClient().getPhone().trim();
        }
        if (bill.getRecipientCompanyTelephoneSnapshot() != null && !bill.getRecipientCompanyTelephoneSnapshot().isBlank()) {
            return bill.getRecipientCompanyTelephoneSnapshot().trim();
        }
        return null;
    }

    private long toMinorUnits(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe invoice amount must be positive.");
        }
        return amount.multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }

    private String buildLineDescription(BillItem item) {
        String override = item.getInvoiceLineDescription() == null ? "" : item.getInvoiceLineDescription().trim();
        String description = !override.isBlank()
                ? override
                : (item.getTransactionService() == null ? "Therapy service" : safe(item.getTransactionService().getDescription()));
        Integer quantity = item.getQuantity();
        if (quantity != null && quantity > 1) {
            return description + " × " + quantity;
        }
        return description;
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeUrl(String path) {
        String base = config.baseUrl();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + (path.startsWith("/") ? path : "/" + path);
    }


    private String toFormData(Map<String, String> form) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : form.entrySet()) {
            if (sb.length() > 0) sb.append('&');
            sb.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));
            sb.append('=');
            sb.append(URLEncoder.encode(entry.getValue() == null ? "" : entry.getValue(), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private record StripeInvoiceRequestContext(
            String secretKey,
            String currency,
            String euBankTransferCountry,
            String connectedAccountId
    ) {
        private StripeInvoiceRequestContext {
            secretKey = secretKey == null ? "" : secretKey.trim();
            currency = currency == null || currency.isBlank() ? "eur" : currency.trim().toLowerCase();
            euBankTransferCountry = euBankTransferCountry == null || euBankTransferCountry.isBlank() ? "NL" : euBankTransferCountry.trim().toUpperCase();
            connectedAccountId = connectedAccountId == null ? "" : connectedAccountId.trim();
        }
    }
}
