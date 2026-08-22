package com.example.app.widget;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.client.ClientOnlineAccessGuard;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.auth.GuestTokenService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.GuestJoinMethod;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.tenant.GuestProviderLinkService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.BookingSource;
import com.example.app.settings.EntitlementsModuleAccessService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.workspaceclient.WorkspaceClient;
import com.example.app.workspaceclient.WorkspaceClientRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Bridges the anonymous website booking widget to the existing authenticated
 * {@link GuestOrderService} pipeline. The widget first opens a short-lived guest
 * session (Turnstile-verified), then replays the same create-order / checkout
 * calls that the guest mobile app uses.
 */
@Service
public class PublicWidgetOrderService {
    private final CompanyRepository companies;
    private final ClientCompanyRepository clientCompanies;
    private final GuestUserRepository guestUsers;
    private final GuestTenantLinkRepository guestTenantLinks;
    private final ClientRepository clients;
    private final UserRepository users;
    private final GuestTokenService guestTokenService;
    private final GuestOrderService guestOrderService;
    private final GuestEntitlementService guestEntitlementService;
    private final WidgetOriginValidator widgetOriginValidator;
    private final WidgetRateLimiter widgetRateLimiter;
    private final WidgetTurnstileService widgetTurnstileService;
    private final WidgetPublicAuditLogger widgetPublicAuditLogger;
    private final WebsiteWidgetSettingsService websiteWidgetSettingsService;
    private final WidgetBookingIdempotencyService widgetBookingIdempotencyService;

    @Autowired(required = false)
    private LocationRepository publicLocations;

    @Autowired(required = false)
    private SessionTypeRepository sessionTypes;

    @Autowired(required = false)
    private WorkspaceClientRepository workspaceClients;

    @Autowired(required = false)
    private EntitlementsModuleAccessService entitlementsModuleAccessService;

    @Autowired(required = false)
    private GuestProviderLinkService guestProviderLinks;

    public PublicWidgetOrderService(
            CompanyRepository companies,
            ClientCompanyRepository clientCompanies,
            GuestUserRepository guestUsers,
            GuestTenantLinkRepository guestTenantLinks,
            ClientRepository clients,
            UserRepository users,
            GuestTokenService guestTokenService,
            GuestOrderService guestOrderService,
            GuestEntitlementService guestEntitlementService,
            WidgetOriginValidator widgetOriginValidator,
            WidgetRateLimiter widgetRateLimiter,
            WidgetTurnstileService widgetTurnstileService,
            WidgetPublicAuditLogger widgetPublicAuditLogger,
            WebsiteWidgetSettingsService websiteWidgetSettingsService,
            WidgetBookingIdempotencyService widgetBookingIdempotencyService
    ) {
        this.companies = companies;
        this.clientCompanies = clientCompanies;
        this.guestUsers = guestUsers;
        this.guestTenantLinks = guestTenantLinks;
        this.clients = clients;
        this.users = users;
        this.guestTokenService = guestTokenService;
        this.guestOrderService = guestOrderService;
        this.guestEntitlementService = guestEntitlementService;
        this.widgetOriginValidator = widgetOriginValidator;
        this.widgetRateLimiter = widgetRateLimiter;
        this.widgetTurnstileService = widgetTurnstileService;
        this.widgetPublicAuditLogger = widgetPublicAuditLogger;
        this.websiteWidgetSettingsService = websiteWidgetSettingsService;
        this.widgetBookingIdempotencyService = widgetBookingIdempotencyService;
    }

    public PublicWidgetOrderController.GuestSessionResponse exchangeCustomerHandoff(
            String tenantCode,
            PublicWidgetOrderController.CustomerHandoffRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        guardWidgetRequest(company, httpRequest, false, "customer-handoff");
        if (request == null || request.handoffToken() == null || request.handoffToken().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking handoff token is required.");
        }

        GuestTokenService.BookingHandoffClaims claims;
        try {
            claims = guestTokenService.parseBookingHandoff(request.handoffToken().trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Booking handoff is invalid or expired.");
        }
        if (!Objects.equals(claims.companyId(), company.getId())
                || !claims.tenantCode().equalsIgnoreCase(company.getTenantCode())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Booking handoff does not belong to this provider.");
        }
        if (publicLocations == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location-aware booking is unavailable.");
        }
        Long requestedLocationId = claims.locationId();
        if (request.locationId() != null && !request.locationId().isBlank()) {
            try {
                Long submittedLocationId = Long.valueOf(request.locationId().trim());
                if (!Objects.equals(submittedLocationId, requestedLocationId)) {
                    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Booking handoff location does not match.");
                }
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location.");
            }
        }
        publicLocations.findByIdAndCompanyId(requestedLocationId, company.getId())
                .filter(Location::isActive)
                .filter(Location::isPublicBookingEnabled)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location is not available for online booking."));

        GuestUser guestUser = guestUsers.findById(claims.guestUserId())
                .filter(GuestUser::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer account is not available."));
        return sessionResponse(company, guestUser);
    }

    @Transactional
    public PublicWidgetOrderController.GuestSessionResponse startSession(
            String tenantCode,
            PublicWidgetOrderController.GuestSessionRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        guardWidgetRequest(company, httpRequest, false, "guest-session");
        GuestUser authenticatedGuest = optionalAuthenticatedGuest(httpRequest);
        if (authenticatedGuest == null) {
            widgetTurnstileService.verifyForPublicAction(company, request.turnstileToken(), widgetPublicAuditLogger.clientIp(httpRequest));
        }

        String email = normalizeEmail(request.email());
        if (email == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required.");
        }
        String firstName = blankToFallback(request.firstName(), "Guest");
        String lastName = blankToFallback(request.lastName(), "User");
        String phone = normalizePhone(request.phone());
        String companyName = normalizeCompanyName(request.companyName());

        GuestUser guestUser;
        if (authenticatedGuest != null) {
            String accountEmail = normalizeEmail(authenticatedGuest.getEmail());
            if (accountEmail == null || !accountEmail.equals(email)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Booking email must match the signed-in Calendra account.");
            }
            guestUser = authenticatedGuest;
            if (guestUser.getFirstName() == null || guestUser.getFirstName().isBlank()) guestUser.setFirstName(firstName);
            if (guestUser.getLastName() == null || guestUser.getLastName().isBlank()) guestUser.setLastName(lastName);
            if ((guestUser.getPhone() == null || guestUser.getPhone().isBlank()) && phone != null) guestUser.setPhone(phone);
            guestUser.setLastLoginAt(Instant.now());
            guestUser = guestUsers.save(guestUser);

            if (guestProviderLinks != null) {
                guestProviderLinks.activate(
                        guestUser, company, null, GuestJoinMethod.PUBLIC_SEARCH,
                        preferredLocale(request.locale(), guestUserLocale(guestUser)), null
                );
            } else {
                ensureTenantLink(guestUser, company, firstName, lastName, email, phone, companyName, request.locale());
            }
        } else {
            guestUser = guestUsers.findByEmailIgnoreCase(email).orElseGet(() -> {
                GuestUser fresh = new GuestUser();
                fresh.setEmail(email);
                fresh.setFirstName(firstName);
                fresh.setLastName(lastName);
                fresh.setPhone(phone);
                fresh.setActive(true);
                fresh.setEmailVerified(false);
                fresh.setLanguage("sl");
                return fresh;
            });
            if (guestUser.getFirstName() == null || guestUser.getFirstName().isBlank()) guestUser.setFirstName(firstName);
            if (guestUser.getLastName() == null || guestUser.getLastName().isBlank()) guestUser.setLastName(lastName);
            if ((guestUser.getPhone() == null || guestUser.getPhone().isBlank()) && phone != null) guestUser.setPhone(phone);
            guestUser.setLastLoginAt(Instant.now());
            guestUser = guestUsers.save(guestUser);
            ensureTenantLink(guestUser, company, firstName, lastName, email, phone, companyName, request.locale());
        }

        return sessionResponse(company, guestUser);
    }

    private PublicWidgetOrderController.GuestSessionResponse sessionResponse(Company company, GuestUser guestUser) {
        return new PublicWidgetOrderController.GuestSessionResponse(
                guestTokenService.issueToken(guestUser.getId()),
                String.valueOf(guestUser.getId()),
                String.valueOf(company.getId()),
                guestUser.getEmail(),
                guestUser.getFirstName(),
                guestUser.getLastName(),
                guestUser.getPhone(),
                guestUser.getLanguage()
        );
    }

    public PublicWidgetOrderController.VoucherResolutionResponse resolveVouchers(
            String tenantCode,
            PublicWidgetOrderController.VoucherResolutionRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        if (entitlementsModuleAccessService != null) {
            entitlementsModuleAccessService.assertEnabled(company.getId());
        }
        guardWidgetRequest(company, httpRequest, false, "voucher-resolution");
        GuestUser guestUser = requireGuest(httpRequest);
        GuestTenantLink link = guestTenantLinks.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId())
                .filter(value -> value.getStatus() == GuestTenantLinkStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest is not linked to this tenant."));
        Client client = link.getClient();
        if (client == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Guest client is not available.");
        }

        List<String> serviceIds = request == null || request.serviceIds() == null ? List.of() : request.serviceIds();
        List<GuestEntitlementService.VoucherSelectionLine> services = new java.util.ArrayList<>();
        for (int position = 0; position < serviceIds.size(); position++) {
            String raw = serviceIds.get(position);
            if (raw == null || raw.isBlank()) continue;
            try {
                services.add(new GuestEntitlementService.VoucherSelectionLine(position, Long.valueOf(raw.trim())));
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service identifier.");
            }
        }
        String effectiveLocationId = resolvePublicLocationId(company, request == null ? null : request.locationId());
        Long locationId;
        try {
            locationId = Long.valueOf(effectiveLocationId);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location.");
        }
        GuestEntitlementService.VoucherResolution resolution = guestEntitlementService.resolveVoucherCodesForServices(
                client,
                company.getId(),
                locationId,
                services,
                request == null ? null : request.currency(),
                request == null ? List.of() : request.voucherCodes()
        );
        return new PublicWidgetOrderController.VoucherResolutionResponse(
                resolution.vouchers().stream()
                        .map(item -> new PublicWidgetOrderController.VoucherCodeResponse(
                                item.code(),
                                String.valueOf(item.entitlementId()),
                                item.mode() == null ? null : item.mode().name(),
                                item.remainingValueGross() == null ? null : item.remainingValueGross().doubleValue(),
                                item.faceValueGross() == null ? null : item.faceValueGross().doubleValue(),
                                List.copyOf(item.eligibleServiceNames())
                        ))
                        .toList(),
                resolution.serviceAssignments().stream()
                        .map(item -> new PublicWidgetOrderController.VoucherServiceAssignmentResponse(
                                item.position(),
                                String.valueOf(item.sessionTypeId()),
                                String.valueOf(item.entitlementId()),
                                item.code()
                        ))
                        .toList(),
                resolution.valueVoucherCodes()
        );
    }

    public GuestDtos.CreateOrderResponse createOrder(
            String tenantCode,
            GuestDtos.CreateOrderRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        guardWidgetRequest(company, httpRequest, true, "orders");
        GuestUser guestUser = requireGuest(httpRequest);
        // The widget endpoint is tenant-scoped via the URL path, so always force the
        // request's companyId to match the resolved tenant to prevent spoofing.
        String effectiveLocationId = resolvePublicLocationId(company, request.locationId());
        GuestDtos.CreateOrderRequest normalized = new GuestDtos.CreateOrderRequest(
                String.valueOf(company.getId()),
                request.productId(),
                request.slotId(),
                request.paymentMethodType(),
                request.entitlementId(),
                request.locale(),
                request.language(),
                request.services(),
                request.consultantId(),
                request.holdToken(),
                effectiveLocationId
        );
        validatePublicLocationAndServices(company, normalized);
        if (guestProviderLinks != null) {
            Location selectedLocation = publicLocations.findByIdAndCompanyId(
                            Long.valueOf(effectiveLocationId), company.getId())
                    .filter(Location::isActive)
                    .filter(Location::isPublicBookingEnabled)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location."));
            guestProviderLinks.activateMarketplaceLocation(
                    guestUser, company, selectedLocation, firstNonBlank(request.locale(), request.language()));
        }
        String idempotencyKey = idempotencyKey(httpRequest);
        BookingSource bookingSource = WidgetBookingSourceResolver.resolve(httpRequest);
        return widgetBookingIdempotencyService.execute(
                company,
                "orders",
                idempotencyKey,
                normalized,
                GuestDtos.CreateOrderResponse.class,
                () -> guestOrderService.createOrder(
                        guestUser,
                        normalized,
                        GuestOrderService.PaymentChannel.WEBSITE,
                        bookingSource
                )
        );
    }

    public GuestDtos.CheckoutResponse checkout(
            String tenantCode,
            Long orderId,
            GuestDtos.CheckoutRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        guardWidgetRequest(company, httpRequest, false, "orders/checkout");
        GuestUser guestUser = requireGuest(httpRequest);
        // The downstream service verifies that the order belongs to this guest user. The widget is
        // tenant-scoped, so any mismatch between order company and tenant code is rejected upstream
        // via the order lookup + requireLink check on the order's company.
        String idempotencyKey = idempotencyKey(httpRequest);
        return widgetBookingIdempotencyService.execute(
                company,
                "orders-checkout",
                idempotencyKey,
                new WidgetCheckoutIdempotencyRequest(orderId, request),
                GuestDtos.CheckoutResponse.class,
                () -> guestOrderService.checkout(guestUser, orderId, request, GuestOrderService.PaymentChannel.WEBSITE)
        );
    }



    private String resolvePublicLocationId(Company company, String requestedLocationId) {
        if (publicLocations == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location-aware booking is unavailable.");
        }
        if (requestedLocationId != null && !requestedLocationId.isBlank()) {
            Long parsed;
            try {
                parsed = Long.valueOf(requestedLocationId.trim());
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location.");
            }
            Location location = publicLocations.findByIdAndCompanyId(parsed, company.getId())
                    .filter(Location::isActive)
                    .filter(Location::isPublicBookingEnabled)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location."));
            return String.valueOf(location.getId());
        }

        List<Location> available = publicLocations
                .findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(company.getId()).stream()
                .filter(Location::isPublicBookingEnabled)
                .toList();
        if (available.size() == 1) return String.valueOf(available.get(0).getId());
        if (available.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No locations are available for online booking.");
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location selection is required.");
    }

    private void validatePublicLocationAndServices(Company company, GuestDtos.CreateOrderRequest request) {
        if (request == null || request.locationId() == null || request.locationId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location selection is required.");
        }
        if (publicLocations == null || sessionTypes == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location-aware booking is unavailable.");
        }
        Long locationId;
        try {
            locationId = Long.valueOf(request.locationId().trim());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location.");
        }
        Location location = publicLocations.findByIdAndCompanyId(locationId, company.getId())
                .filter(Location::isActive)
                .filter(Location::isPublicBookingEnabled)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location."));

        List<Long> typeIds = request.services() == null ? List.of() : request.services().stream()
                .filter(Objects::nonNull)
                .map(service -> firstNonBlank(service.sessionTypeId(), sessionTypeIdFromProduct(service.productId())))
                .filter(Objects::nonNull)
                .map(value -> {
                    try {
                        return Long.valueOf(value.trim());
                    } catch (NumberFormatException ex) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service.");
                    }
                })
                .distinct()
                .toList();
        if (typeIds.isEmpty()) {
            String fallback = sessionTypeIdFromProduct(request.productId());
            if (fallback != null) {
                try {
                    typeIds = List.of(Long.valueOf(fallback));
                } catch (NumberFormatException ex) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service.");
                }
            }
        }
        for (Long typeId : typeIds) {
            SessionType type = sessionTypes.findByIdAndCompanyIdWithLinkedServices(typeId, company.getId())
                    .filter(SessionType::isActive)
                    .filter(candidate -> candidate.isGuestBookingEnabled() || candidate.isWidgetGroupBookingEnabled())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service."));
            boolean available = type.isAvailableAllLocations() || type.getLocations().stream()
                    .anyMatch(value -> Objects.equals(value.getId(), location.getId()));
            if (!available) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The selected service is not offered at this location.");
            }
        }
    }

    private static String sessionTypeIdFromProduct(String productId) {
        if (productId == null) return null;
        String normalized = productId.trim();
        return normalized.startsWith("session-") && normalized.length() > 8
                ? normalized.substring(8)
                : null;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return null;
    }

    private static String idempotencyKey(HttpServletRequest request) {
        String value = request == null ? null : request.getHeader("Idempotency-Key");
        if (value == null || value.isBlank()) {
            value = request == null ? null : request.getHeader("idempotency-key");
        }
        if (value == null || value.isBlank()) {
            return null;
        }
        String clean = value.trim();
        return clean.length() <= 128 ? clean : clean.substring(0, 128);
    }

    private record WidgetCheckoutIdempotencyRequest(Long orderId, GuestDtos.CheckoutRequest request) {}

    public String renderStripeReturnPage(Long orderId, String status, String checkoutSessionId) {
        String normalized = normalizeStripeStatus(status);
        String title = "success".equals(normalized) ? "Plačilo uspešno" : "Plačilo posodobljeno";
        String message = "success".equals(normalized)
                ? "Rezervacija je potrjena. Potrditev plačila se bo samodejno uskladila prek Stripe webhooka."
                : "Status plačila je bil posodobljen.";
        return renderStripePage(title, message, orderId, checkoutSessionId, true);
    }

    public String renderStripeCancelPage(Long orderId, String checkoutSessionId) {
        try {
            guestOrderService.onStripeCheckoutExpiredOrFailed(orderId, checkoutSessionId);
        } catch (Exception ignored) {
        }
        return renderStripePage("Plačilo preklicano", "Stripe plačilo je bilo preklicano. Termin ni bil potrjen kot plačan.", orderId, checkoutSessionId, false);
    }

    private static String normalizeStripeStatus(String status) {
        String value = status == null ? "success" : status.trim().toLowerCase(Locale.ROOT);
        if (value.equals("success") || value.equals("completed") || value.equals("paid")) return "success";
        if (value.equals("cancel") || value.equals("cancelled") || value.equals("canceled")) return "cancelled";
        return value.isBlank() ? "success" : value;
    }

    private static String renderStripePage(String title, String message, Long orderId, String checkoutSessionId, boolean success) {
        String accent = success ? "#0f6bff" : "#64748b";
        String safeSession = checkoutSessionId == null || checkoutSessionId.isBlank()
                ? ""
                : "<p class=\"tiny\">Stripe session: " + escapeHtml(checkoutSessionId) + "</p>";
        String safeOrder = orderId == null ? "" : "<p class=\"tiny\">Order ID: " + orderId + "</p>";
        return """
                <!doctype html>
                <html lang="sl">
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <title>%s</title>
                  <style>
                    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#f8fafc; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#07122f; }
                    .card { width:min(560px, calc(100vw - 32px)); background:#fff; border:1px solid #dfe6f1; border-radius:28px; box-shadow:0 28px 70px rgba(15,23,42,.10); padding:36px; text-align:center; }
                    .mark { width:58px; height:58px; border-radius:999px; margin:0 auto 18px; display:grid; place-items:center; background:%s; color:white; font-size:28px; font-weight:900; }
                    h1 { margin:0 0 10px; font-size:30px; }
                    p { color:#66738d; line-height:1.55; margin:0 0 14px; }
                    .tiny { font-size:12px; color:#94a3b8; word-break:break-all; }
                    .brand { display:flex; align-items:center; justify-content:center; gap:8px; margin-top:22px; color:#66738d; font-size:13px; font-weight:700; }
                    .brand b { color:#0f6bff; }
                  </style>
                </head>
                <body>
                  <main class="card">
                    <div class="mark">%s</div>
                    <h1>%s</h1>
                    <p>%s</p>
                    %s
                    %s
                    <div class="brand"><b>calendra</b><span>Powered by Calendra</span></div>
                  </main>
                </body>
                </html>
                """.formatted(
                escapeHtml(title),
                accent,
                success ? "✓" : "!",
                escapeHtml(title),
                escapeHtml(message),
                safeOrder,
                safeSession
        );
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }


    private void ensureTenantLink(GuestUser guestUser, Company company, String firstName, String lastName, String email, String phone, String companyName, String requestedLocale) {
        GuestTenantLink existing = guestTenantLinks.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId()).orElse(null);
        String normalizedEmail = normalizeEmail(email);
        String publicLocale = preferredLocale(requestedLocale, guestUserLocale(guestUser));
        Client client = normalizedEmail == null
                ? null
                : clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(company.getId(), normalizedEmail).stream()
                        .filter(candidate -> candidate != null && !candidate.isAnonymized())
                        .findFirst()
                        .orElse(null);
        if (client == null) {
            companies.findByIdForUpdate(company.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
            client = matchOrCreateClient(company, firstName, lastName, normalizedEmail, phone);
        }
        ClientOnlineAccessGuard.requireAllowed(client, publicLocale);
        // When the widget includes a company name, resolve (or create) a ClientCompany for the
        // tenant and attach it as the client's linked/billing company. We only set it when the
        // client does not already have a linked company so returning guests don't get overridden.
        if (companyName != null) {
            ClientCompany billingCompany = resolveOrCreateClientCompany(company, companyName);
            if (client.getBillingCompany() == null) {
                client.setBillingCompany(billingCompany);
                client = clients.save(client);
            }
        }
        GuestTenantLink link = existing != null ? existing : new GuestTenantLink();
        link.setGuestUser(guestUser);
        link.setCompany(company);
        link.setClient(client);
        link.setStatus(GuestTenantLinkStatus.ACTIVE);
        link.setJoinedVia(existing != null ? existing.getJoinedVia() : GuestJoinMethod.TENANT_CODE);
        link.setJoinedAt(existing != null ? existing.getJoinedAt() : Instant.now());
        link.setLastUsedAt(Instant.now());
        guestTenantLinks.save(link);
    }

    private Client matchOrCreateClient(Company company, String firstName, String lastName, String email, String phone) {
        String normalizedEmail = normalizeEmail(email);
        if (normalizedEmail == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required.");
        }
        // Email is the unique client identity inside a tenant. Online-payment flows must
        // resolve the existing tenant client by normalized email rather than creating a
        // second client because the submitted name or phone differs.
        Client match = clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(company.getId(), normalizedEmail)
                .stream()
                .filter(candidate -> candidate != null && !candidate.isAnonymized())
                .findFirst()
                .orElse(null);
        if (match != null) {
            if ((match.getPhone() == null || match.getPhone().isBlank()) && phone != null) {
                match.setPhone(phone);
            }
            return clients.save(match);
        }
        User assigned = users.findFirstByCompanyIdAndActiveTrueOrderByIdAsc(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No active tenant staff user is available to own new clients."));
        Client client = new Client();
        client.setCompany(company);
        client.setAssignedTo(assigned);
        client.setFirstName(firstName);
        client.setLastName(lastName);
        client.setEmail(normalizedEmail);
        client.setPhone(phone);
        if (workspaceClients != null && company.getWorkspace() != null && phone != null && !phone.isBlank()) {
            String normalizedWorkspacePhone = WorkspaceClient.normalizePhone(phone);
            if (normalizedWorkspacePhone != null) {
                workspaceClients.findExactActiveIdentity(
                                company.getWorkspace().getId(),
                                normalizedEmail,
                                normalizedWorkspacePhone,
                                firstName,
                                lastName,
                                org.springframework.data.domain.PageRequest.of(0, 1)
                        )
                        .stream()
                        .findFirst()
                        .ifPresent(client::setWorkspaceClient);
            }
        }
        client.setActive(true);
        return clients.save(client);
    }



    private static String guestUserLocale(GuestUser guestUser) {
        return guestUser == null ? null : guestUser.getLanguage();
    }

    private static String preferredLocale(String requestedLocale, String fallbackLocale) {
        if (requestedLocale != null && !requestedLocale.isBlank()) {
            return requestedLocale.trim();
        }
        return fallbackLocale;
    }

    private GuestUser optionalAuthenticatedGuest(HttpServletRequest request) {
        String auth = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (auth == null || !auth.startsWith("Bearer ")) return null;
        String token = auth.substring("Bearer ".length()).trim();
        if (token.isBlank()) return null;
        try {
            Long guestUserId = guestTokenService.parseGuestUserId(token);
            return guestUsers.findById(guestUserId).filter(GuestUser::isActive).orElse(null);
        } catch (Exception ex) {
            return null;
        }
    }

    private GuestUser requireGuest(HttpServletRequest request) {
        GuestUser guestUser = optionalAuthenticatedGuest(request);
        if (guestUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest session required.");
        }
        return guestUser;
    }

    private Company resolveCompany(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tenant code.");
        }
        return companies.findByTenantCodeIgnoreCase(tenantCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tenant code."));
    }

    private void guardWidgetRequest(Company company, HttpServletRequest request, boolean bookingRequest, String action) {
        try {
            if (!websiteWidgetSettingsService.widgetEnabled(company.getId())) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Website widget is disabled.");
            }
            widgetOriginValidator.validate(company, request);
            widgetRateLimiter.check(company.getTenantCode(), widgetPublicAuditLogger.clientIp(request), bookingRequest);
            widgetPublicAuditLogger.logAttempt(company, request, action, "allowed", "");
        } catch (RuntimeException ex) {
            widgetPublicAuditLogger.logAttempt(company, request, action, "rejected", ex.getMessage());
            throw ex;
        }
    }

    private ClientCompany resolveOrCreateClientCompany(Company ownerCompany, String name) {
        List<ClientCompany> existing = clientCompanies.findAllByOwnerCompanyIdOrderByNameAsc(ownerCompany.getId());
        ClientCompany match = existing.stream()
                .filter(c -> c.getName() != null && c.getName().trim().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);
        if (match != null) {
            if (!match.isActive()) {
                match.setActive(true);
                return clientCompanies.save(match);
            }
            return match;
        }
        ClientCompany created = new ClientCompany();
        created.setOwnerCompany(ownerCompany);
        created.setName(name);
        created.setActive(true);
        created.setBatchPaymentEnabled(false);
        return clientCompanies.save(created);
    }

    private static String normalizeCompanyName(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return null;
        return trimmed;
    }

    private static String normalizeEmail(String email) {
        if (email == null) return null;
        String trimmed = email.trim().toLowerCase(Locale.ROOT);
        return trimmed.isBlank() ? null : trimmed;
    }

    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) return null;
        String normalized = phone.replaceAll("[^0-9+]", "");
        return normalized.isBlank() ? null : normalized;
    }

    private static String blankToFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
