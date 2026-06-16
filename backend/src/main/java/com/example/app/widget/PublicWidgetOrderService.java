package com.example.app.widget;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
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
import com.example.app.guest.order.GuestOrderService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
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
    private final WidgetOriginValidator widgetOriginValidator;
    private final WidgetRateLimiter widgetRateLimiter;
    private final WidgetTurnstileService widgetTurnstileService;
    private final WidgetPublicAuditLogger widgetPublicAuditLogger;
    private final WebsiteWidgetSettingsService websiteWidgetSettingsService;

    public PublicWidgetOrderService(
            CompanyRepository companies,
            ClientCompanyRepository clientCompanies,
            GuestUserRepository guestUsers,
            GuestTenantLinkRepository guestTenantLinks,
            ClientRepository clients,
            UserRepository users,
            GuestTokenService guestTokenService,
            GuestOrderService guestOrderService,
            WidgetOriginValidator widgetOriginValidator,
            WidgetRateLimiter widgetRateLimiter,
            WidgetTurnstileService widgetTurnstileService,
            WidgetPublicAuditLogger widgetPublicAuditLogger,
            WebsiteWidgetSettingsService websiteWidgetSettingsService
    ) {
        this.companies = companies;
        this.clientCompanies = clientCompanies;
        this.guestUsers = guestUsers;
        this.guestTenantLinks = guestTenantLinks;
        this.clients = clients;
        this.users = users;
        this.guestTokenService = guestTokenService;
        this.guestOrderService = guestOrderService;
        this.widgetOriginValidator = widgetOriginValidator;
        this.widgetRateLimiter = widgetRateLimiter;
        this.widgetTurnstileService = widgetTurnstileService;
        this.widgetPublicAuditLogger = widgetPublicAuditLogger;
        this.websiteWidgetSettingsService = websiteWidgetSettingsService;
    }

    @Transactional
    public PublicWidgetOrderController.GuestSessionResponse startSession(
            String tenantCode,
            PublicWidgetOrderController.GuestSessionRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        // Opening the short-lived widget guest session is only the first step of the checkout flow.
        // Do not count it against the stricter booking limiter, otherwise one normal booking flow
        // consumes multiple booking tokens (guest-session + order + checkout) and a real user can hit
        // 429 after only a couple of attempts/minute. The actual slot/order creation below remains
        // protected by the booking limiter.
        guardWidgetRequest(company, httpRequest, false, "guest-session");
        widgetTurnstileService.verifyForPublicAction(company, request.turnstileToken(), widgetPublicAuditLogger.clientIp(httpRequest));

        String email = normalizeEmail(request.email());
        if (email == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required.");
        }
        String firstName = blankToFallback(request.firstName(), "Guest");
        String lastName = blankToFallback(request.lastName(), "User");
        String phone = normalizePhone(request.phone());
        String companyName = normalizeCompanyName(request.companyName());

        GuestUser guestUser = guestUsers.findByEmailIgnoreCase(email).orElseGet(() -> {
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
        if (guestUser.getFirstName() == null || guestUser.getFirstName().isBlank()) {
            guestUser.setFirstName(firstName);
        }
        if (guestUser.getLastName() == null || guestUser.getLastName().isBlank()) {
            guestUser.setLastName(lastName);
        }
        if ((guestUser.getPhone() == null || guestUser.getPhone().isBlank()) && phone != null) {
            guestUser.setPhone(phone);
        }
        guestUser.setLastLoginAt(Instant.now());
        guestUser = guestUsers.save(guestUser);

        ensureTenantLink(guestUser, company, firstName, lastName, email, phone, companyName);

        String token = guestTokenService.issueToken(guestUser.getId());
        return new PublicWidgetOrderController.GuestSessionResponse(
                token,
                String.valueOf(guestUser.getId()),
                String.valueOf(company.getId()),
                guestUser.getEmail(),
                guestUser.getFirstName(),
                guestUser.getLastName()
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
        GuestDtos.CreateOrderRequest normalized = new GuestDtos.CreateOrderRequest(
                String.valueOf(company.getId()),
                request.productId(),
                request.slotId(),
                request.paymentMethodType(),
                request.entitlementId(),
                request.locale(),
                request.language()
        );
        return guestOrderService.createOrder(guestUser, normalized, GuestOrderService.PaymentChannel.WEBSITE);
    }

    public GuestDtos.CheckoutResponse checkout(
            String tenantCode,
            Long orderId,
            GuestDtos.CheckoutRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        // Checkout completes an already-created widget order. The order creation endpoint is the
        // point where a booking slot is consumed, so use the general limiter here to avoid counting
        // a single booking flow twice against APP_WIDGET_BOOKINGS_PER_MINUTE_PER_IP.
        guardWidgetRequest(company, httpRequest, false, "orders/checkout");
        GuestUser guestUser = requireGuest(httpRequest);
        // The downstream service verifies that the order belongs to this guest user. The widget is
        // tenant-scoped, so any mismatch between order company and tenant code is rejected upstream
        // via the order lookup + requireLink check on the order's company.
        return guestOrderService.checkout(guestUser, orderId, request, GuestOrderService.PaymentChannel.WEBSITE);
    }



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


    private void ensureTenantLink(GuestUser guestUser, Company company, String firstName, String lastName, String email, String phone, String companyName) {
        GuestTenantLink existing = guestTenantLinks.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId()).orElse(null);
        Client client;
        if (existing != null && existing.getClient() != null) {
            client = existing.getClient();
        } else {
            companies.findByIdForUpdate(company.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
            client = matchOrCreateClient(company, firstName, lastName, email, phone);
        }
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
        Client match = email == null
                ? null
                : clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(company.getId(), email).stream()
                        .findFirst()
                        .orElse(null);
        if (match == null && phone != null) {
            match = clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(company.getId(), phone).stream()
                    .findFirst()
                    .orElse(null);
        }
        if (match != null) {
            if (match.getEmail() == null || match.getEmail().isBlank()) {
                match.setEmail(email);
            }
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
        client.setEmail(email);
        client.setPhone(phone);
        client.setActive(true);
        return clients.save(client);
    }

    private GuestUser requireGuest(HttpServletRequest request) {
        String auth = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (auth == null || !auth.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest session required.");
        }
        String token = auth.substring("Bearer ".length()).trim();
        try {
            Long guestUserId = guestTokenService.parseGuestUserId(token);
            return guestUsers.findById(guestUserId)
                    .filter(GuestUser::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest session not found."));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid guest session.");
        }
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
