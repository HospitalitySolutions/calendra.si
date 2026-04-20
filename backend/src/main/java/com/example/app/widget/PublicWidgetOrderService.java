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
import java.util.Comparator;
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
            WidgetPublicAuditLogger widgetPublicAuditLogger
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
    }

    @Transactional
    public PublicWidgetOrderController.GuestSessionResponse startSession(
            String tenantCode,
            PublicWidgetOrderController.GuestSessionRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        guardWidgetRequest(company, httpRequest, true, "guest-session");
        widgetTurnstileService.verifyIfEnabled(company, request.turnstileToken(), widgetPublicAuditLogger.clientIp(httpRequest));

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
                request.paymentMethodType()
        );
        return guestOrderService.createOrder(guestUser, normalized);
    }

    public GuestDtos.CheckoutResponse checkout(
            String tenantCode,
            Long orderId,
            GuestDtos.CheckoutRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        guardWidgetRequest(company, httpRequest, true, "orders/checkout");
        GuestUser guestUser = requireGuest(httpRequest);
        // The downstream service verifies that the order belongs to this guest user. The widget is
        // tenant-scoped, so any mismatch between order company and tenant code is rejected upstream
        // via the order lookup + requireLink check on the order's company.
        return guestOrderService.checkout(guestUser, orderId, request);
    }

    private void ensureTenantLink(GuestUser guestUser, Company company, String firstName, String lastName, String email, String phone, String companyName) {
        GuestTenantLink existing = guestTenantLinks.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId()).orElse(null);
        Client client;
        if (existing != null && existing.getClient() != null) {
            client = existing.getClient();
        } else {
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
        List<Client> companyClients = clients.findAllByCompanyId(company.getId());
        Client match = companyClients.stream()
                .filter(c -> email != null && email.equalsIgnoreCase(normalizeEmail(c.getEmail())))
                .findFirst()
                .orElse(null);
        if (match == null && phone != null) {
            match = companyClients.stream()
                    .filter(c -> phone.equals(normalizePhone(c.getPhone())))
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
        User assigned = users.findAllByCompanyId(company.getId()).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
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
