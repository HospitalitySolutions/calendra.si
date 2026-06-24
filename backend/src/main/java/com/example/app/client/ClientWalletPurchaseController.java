package com.example.app.client;

import com.example.app.billing.BillType;
import com.example.app.billing.OpenBill;
import com.example.app.billing.OpenBillItem;
import com.example.app.billing.OpenBillPayment;
import com.example.app.billing.OpenBillRepository;
import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.billing.PriceMath;
import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.guest.model.GuestJoinMethod;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestPaymentMethodType;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.guest.model.OrderStatus;
import com.example.app.guest.model.ProductType;
import com.example.app.security.SecurityUtils;
import com.example.app.settings.CourseModuleAccessService;
import com.example.app.session.TypeTransactionService;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/clients/{clientId}/wallet")
public class ClientWalletPurchaseController {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<ProductType> BUYABLE_WALLET_TYPES = List.of(
            ProductType.CLASS_TICKET,
            ProductType.PACK,
            ProductType.MEMBERSHIP,
            ProductType.GIFT_CARD,
            ProductType.COURSE
    );

    private final ClientRepository clients;
    private final GuestProductRepository products;
    private final GuestOrderRepository orders;
    private final GuestTenantLinkRepository guestTenantLinks;
    private final GuestUserRepository guestUsers;
    private final OpenBillRepository openBills;
    private final PaymentMethodRepository paymentMethods;
    private final TransactionServiceRepository transactionServices;
    private final CourseModuleAccessService courseModuleAccessService;

    @Autowired
    public ClientWalletPurchaseController(
            ClientRepository clients,
            GuestProductRepository products,
            GuestOrderRepository orders,
            GuestTenantLinkRepository guestTenantLinks,
            GuestUserRepository guestUsers,
            OpenBillRepository openBills,
            PaymentMethodRepository paymentMethods,
            TransactionServiceRepository transactionServices,
            CourseModuleAccessService courseModuleAccessService
    ) {
        this.clients = clients;
        this.products = products;
        this.orders = orders;
        this.guestTenantLinks = guestTenantLinks;
        this.guestUsers = guestUsers;
        this.openBills = openBills;
        this.paymentMethods = paymentMethods;
        this.transactionServices = transactionServices;
        this.courseModuleAccessService = courseModuleAccessService;
    }

    /** Backwards-compatible constructor for older unit tests. Runtime wiring uses the @Autowired constructor above. */
    public ClientWalletPurchaseController(
            ClientRepository clients,
            GuestProductRepository products,
            GuestOrderRepository orders,
            GuestTenantLinkRepository guestTenantLinks,
            GuestUserRepository guestUsers,
            OpenBillRepository openBills,
            PaymentMethodRepository paymentMethods,
            TransactionServiceRepository transactionServices
    ) {
        this(clients, products, orders, guestTenantLinks, guestUsers, openBills, paymentMethods, transactionServices, null);
    }

    public record WalletProductResponse(
            Long id,
            String name,
            String productType,
            BigDecimal priceGross,
            String currency,
            boolean active,
            boolean guestVisible,
            boolean bookable,
            Integer usageLimit,
            Integer validityDays,
            boolean autoRenews,
            Long sessionTypeId,
            String sessionTypeName,
            Long transactionServiceId,
            String transactionServiceCode,
            String transactionServiceDescription
    ) {}

    public record CreateWalletPurchaseOpenBillRequest(String giftCardTo, String giftCardText) {}
    public record CreateWalletPurchaseOpenBillResponse(Long openBillId, Long orderId, Long productId) {}
    public record WalletPurchaseErrorResponse(String message) {}

    @GetMapping("/products")
    @Transactional(readOnly = true)
    public List<WalletProductResponse> listBuyableProducts(
            @PathVariable Long clientId,
            @AuthenticationPrincipal User me
    ) {
        loadClientForWalletWrite(clientId, me);
        Long companyId = me.getCompany().getId();
        boolean coursesEnabled = courseModuleAccessService == null || courseModuleAccessService.isEnabled(companyId);
        return products.findAllByCompanyIdOrderBySortOrderAscIdAsc(companyId).stream()
                .filter(GuestProduct::isActive)
                .filter(product -> product.getCourse() == null)
                .filter(product -> BUYABLE_WALLET_TYPES.contains(product.getProductType()))
                .filter(product -> product.getProductType() != ProductType.COURSE || coursesEnabled)
                .map(this::toWalletProductResponse)
                .toList();
    }

    @PostMapping("/products/{productId}/open-bill")
    @Transactional
    public CreateWalletPurchaseOpenBillResponse createPurchaseOpenBill(
            @PathVariable Long clientId,
            @PathVariable Long productId,
            @RequestBody(required = false) CreateWalletPurchaseOpenBillRequest request,
            @AuthenticationPrincipal User me
    ) {
        var client = loadClientForWalletWrite(clientId, me);
        Long companyId = me.getCompany().getId();
        var product = products.findByIdAndCompanyId(productId, companyId)
                .filter(GuestProduct::isActive)
                .filter(p -> p.getCourse() == null)
                .filter(p -> BUYABLE_WALLET_TYPES.contains(p.getProductType()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Wallet product not found."));
        if (product.getProductType() == ProductType.COURSE && courseModuleAccessService != null) {
            courseModuleAccessService.assertEnabled(companyId);
        }

        GuestTenantLink link = resolveOrCreateGuestLink(client);
        var paymentMethod = resolveDefaultPaymentMethod(companyId);
        var order = createPendingWalletOrder(client, link.getGuestUser(), product, request);

        var open = new OpenBill();
        open.setCompany(me.getCompany());
        open.setClient(client);
        open.setConsultant(me);
        open.setPaymentMethod(paymentMethod);
        open.setReference(order.getReferenceCode());
        open.setBillType(BillType.INVOICE);
        open.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        open.setManualSplitLocked(false);
        long manualNo = nextManualSessionNumber(companyId);
        open.setManualSessionNumbersCsv(String.valueOf(manualNo));
        open.setManualSessionNumberMax(manualNo);
        open.setSourceGuestOrderId(order.getId());

        addWalletProductLine(open, product);
        addFullAmountPayment(open, paymentMethod, safeGross(product.getPriceGross()));

        open = openBills.saveAndFlush(open);
        return new CreateWalletPurchaseOpenBillResponse(open.getId(), order.getId(), product.getId());
    }

    /**
     * Backwards-compatible overload for direct controller tests and internal callers
     * that do not need optional gift-card recipient/message metadata.
     */
    public CreateWalletPurchaseOpenBillResponse createPurchaseOpenBill(
            Long clientId,
            Long productId,
            User me
    ) {
        return createPurchaseOpenBill(clientId, productId, null, me);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<WalletPurchaseErrorResponse> handleWalletPurchaseError(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new WalletPurchaseErrorResponse(errorMessage(ex)));
    }

    private String errorMessage(ResponseStatusException ex) {
        String reason = ex.getReason();
        if (reason != null && !reason.isBlank()) {
            return reason;
        }
        return switch (ex.getStatusCode().value()) {
            case 400 -> "Bad request.";
            case 403 -> "You do not have permission to perform this action.";
            case 404 -> "Requested resource was not found.";
            case 409 -> "The requested change conflicts with existing data.";
            default -> "Request failed.";
        };
    }

    private Client loadClientForWalletWrite(Long clientId, User me) {
        var client = clients.findByIdAndCompanyId(clientId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me)
                && !SecurityUtils.canScanWalletEntitlements(me)
                && (client.getAssignedTo() == null || !Objects.equals(client.getAssignedTo().getId(), me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return client;
    }

    private GuestTenantLink resolveOrCreateGuestLink(Client client) {
        Long companyId = client.getCompany().getId();
        var activeLink = guestTenantLinks.findFirstByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(companyId, client.getId(), GuestTenantLinkStatus.ACTIVE);
        if (activeLink.isPresent()) {
            return activeLink.get();
        }

        String email = Client.normalizeEmailStorage(client.getEmail());
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Client needs an email or an active guest-app link before a wallet entitlement can be bought."
            );
        }

        GuestUser guestUser = guestUsers.findByEmailIgnoreCase(email).orElseGet(() -> {
            var created = new GuestUser();
            created.setEmail(email);
            created.setFirstName(blankToFallback(client.getFirstName(), "Guest"));
            created.setLastName(blankToFallback(client.getLastName(), "Client"));
            created.setPhone(client.getPhone());
            created.setLanguage("sl");
            created.setActive(true);
            created.setEmailVerified(false);
            return guestUsers.save(created);
        });

        var existingCompanyLink = guestTenantLinks.findByGuestUserIdAndCompanyId(guestUser.getId(), companyId);
        if (existingCompanyLink.isPresent()) {
            GuestTenantLink link = existingCompanyLink.get();
            if (!Objects.equals(link.getClient().getId(), client.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "This guest email is already linked to another client in this tenancy."
                );
            }
            link.setStatus(GuestTenantLinkStatus.ACTIVE);
            link.setLastUsedAt(Instant.now());
            return guestTenantLinks.save(link);
        }

        var link = new GuestTenantLink();
        link.setGuestUser(guestUser);
        link.setCompany(client.getCompany());
        link.setClient(client);
        link.setStatus(GuestTenantLinkStatus.ACTIVE);
        link.setJoinedVia(GuestJoinMethod.TENANT_CODE);
        link.setJoinedAt(Instant.now());
        link.setLastUsedAt(Instant.now());
        return guestTenantLinks.save(link);
    }

    private GuestOrder createPendingWalletOrder(Client client, GuestUser guestUser, GuestProduct product, CreateWalletPurchaseOpenBillRequest request) {
        BigDecimal total = safeGross(product.getPriceGross());
        var order = new GuestOrder();
        order.setCompany(client.getCompany());
        order.setClient(client);
        order.setGuestUser(guestUser);
        order.setStatus(OrderStatus.PENDING);
        order.setPaymentMethodType(GuestPaymentMethodType.BANK_TRANSFER);
        order.setCurrency(defaultCurrency(product.getCurrency()));
        order.setSubtotalGross(total);
        order.setTaxAmount(BigDecimal.ZERO);
        order.setTotalGross(total);
        order.setReferenceCode("ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT));
        order.setMetadataJson(buildMetadataJson(product, request));
        return orders.save(order);
    }

    private void addWalletProductLine(OpenBill open, GuestProduct product) {
        TransactionService service = resolveWalletTransactionService(product);
        int quantity = product.getUsageLimit() != null && product.getUsageLimit() > 0
                && (product.getProductType() == ProductType.CLASS_TICKET || product.getProductType() == ProductType.PACK)
                ? product.getUsageLimit()
                : 1;
        BigDecimal unitGross = safeGross(product.getPriceGross())
                .divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        BigDecimal unitNet = PriceMath.netFromGross(unitGross, service.getTaxRate() == null ? TaxRate.NO_VAT : service.getTaxRate()).setScale(4, RoundingMode.HALF_UP);

        var item = new OpenBillItem();
        item.setOpenBill(open);
        item.setTransactionService(service);
        item.setQuantity(quantity);
        item.setNetPrice(unitNet);
        item.setUnitGrossPrice(unitGross);
        item.setInvoiceLineDescription(walletProductInvoiceLineDescription(product));
        open.getItems().add(item);
    }

    private String walletProductInvoiceLineDescription(GuestProduct product) {
        if (product == null) return "Wallet product";
        String name = product.getName() == null ? "" : product.getName().trim();
        if (!name.isBlank()) return name;
        return switch (product.getProductType() == null ? ProductType.PACK : product.getProductType()) {
            case MEMBERSHIP -> "Membership";
            case GIFT_CARD -> "Gift card";
            case COURSE -> "Course";
            case CLASS_TICKET -> "Ticket";
            case PACK -> "Pack";
            case SESSION_SINGLE -> "Session";
        };
    }

    private void addFullAmountPayment(OpenBill open, PaymentMethod paymentMethod, BigDecimal amountGross) {
        var split = new OpenBillPayment();
        split.setOpenBill(open);
        split.setPaymentMethod(paymentMethod);
        split.setAmountGross(amountGross);
        split.setSortOrder(0);
        open.getPaymentSplits().add(split);
    }

    private TransactionService resolveWalletTransactionService(GuestProduct product) {
        if (product.getTransactionService() != null) {
            return product.getTransactionService();
        }
        if (product.getSessionType() != null && product.getSessionType().getLinkedServices() != null) {
            TransactionService linked = product.getSessionType().getLinkedServices().stream()
                    .map(TypeTransactionService::getTransactionService)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(null);
            if (linked != null) return linked;
        }
        String code = "GP-" + product.getId();
        return transactionServices.findAllByCompanyId(product.getCompany().getId()).stream()
                .filter(service -> code.equalsIgnoreCase(service.getCode()))
                .findFirst()
                .orElseGet(() -> {
                    var created = new TransactionService();
                    created.setCompany(product.getCompany());
                    created.setCode(code);
                    created.setDescription(product.getName() == null || product.getName().isBlank() ? "Wallet product" : product.getName().trim());
                    created.setTaxRate(TaxRate.NO_VAT);
                    created.setNetPrice(safeGross(product.getPriceGross()).setScale(4, RoundingMode.HALF_UP));
                    created.setActive(true);
                    return transactionServices.save(created);
                });
    }

    private long nextManualSessionNumber(Long companyId) {
        Long max = openBills.findMaxManualSessionNumberByCompanyId(companyId);
        long current = max == null ? 0L : max;
        return current <= 0 ? 1L : current + 1L;
    }

    private PaymentMethod resolveDefaultPaymentMethod(Long companyId) {
        var all = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        if (all.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No payment methods configured. Add one in Configuration > Billing.");
        }
        return all.stream()
                .filter(method -> method.getPaymentType() != PaymentType.ADVANCE)
                .findFirst()
                .orElse(all.getFirst());
    }

    private String buildMetadataJson(GuestProduct product, CreateWalletPurchaseOpenBillRequest request) {
        try {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("slotId", null);
            map.put("productType", product.getProductType() == null ? null : product.getProductType().name());
            map.put("productName", product.getName());
            map.put("guestProductId", product.getId());
            map.put("sessionTypeId", product.getSessionType() == null ? null : product.getSessionType().getId());
            map.put("currency", defaultCurrency(product.getCurrency()));
            map.put("priceGross", safeGross(product.getPriceGross()).doubleValue());
            if (product.getProductType() == ProductType.GIFT_CARD) {
                String recipientName = truncate(cleanOptionalText(request == null ? null : request.giftCardTo()), 120);
                String message = truncate(cleanOptionalText(request == null ? null : request.giftCardText()), 300);
                if (recipientName != null) {
                    map.put("giftCardRecipientName", recipientName);
                }
                if (message != null) {
                    map.put("giftCardMessage", message);
                }
            }
            map.put("source", "STAFF_CLIENT_WALLET");
            return JSON.writeValueAsString(map);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private WalletProductResponse toWalletProductResponse(GuestProduct product) {
        var sessionType = product.getSessionType();
        var transactionService = product.getTransactionService();
        return new WalletProductResponse(
                product.getId(),
                product.getName(),
                product.getProductType() == null ? null : product.getProductType().name(),
                safeGross(product.getPriceGross()),
                defaultCurrency(product.getCurrency()),
                product.isActive(),
                product.isGuestVisible(),
                product.isBookable(),
                product.getUsageLimit(),
                product.getValidityDays(),
                product.isAutoRenews(),
                sessionType == null ? null : sessionType.getId(),
                sessionType == null ? null : sessionType.getName(),
                transactionService == null ? null : transactionService.getId(),
                transactionService == null ? null : transactionService.getCode(),
                transactionService == null ? null : transactionService.getDescription()
        );
    }

    private static String cleanOptionalText(String value) {
        if (value == null) return null;
        String cleaned = value.trim();
        return cleaned.isBlank() ? null : cleaned;
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return null;
        if (value.length() <= maxLength) return value;
        return value.substring(0, maxLength);
    }

    private static BigDecimal safeGross(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String defaultCurrency(String currency) {
        return currency == null || currency.isBlank() ? "EUR" : currency.trim().toUpperCase(Locale.ROOT);
    }

    private static String blankToFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
