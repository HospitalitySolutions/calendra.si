package com.example.app.company;

import com.example.app.billing.OpenBill;
import com.example.app.billing.OpenBillRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.client.InvoiceRecipientType;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps a tenant's main company profile in sync with the Platform Admin tenant account and payee profile.
 *
 * <p>The canonical editable source for tenants is Configuration -> Account Management -> Company -> Main profile.
 * That profile is mirrored to:
 * <ul>
 *   <li>the tenant account row used by Platform Admin -> Tenant management ({@link Company}), and</li>
 *   <li>the matching payee company under the Platform Admin tenant's Clients -> Company profiles ({@link ClientCompany}).</li>
 * </ul>
 *
 * <p>The link is stored on the Platform Admin payee company through {@code platformTenantCompany} so later saves do
 * not depend on name, email or VAT matching.</p>
 */
@Service
public class PlatformTenantAccountLinkService {
    private static final Logger log = LoggerFactory.getLogger(PlatformTenantAccountLinkService.class);
    private static final String PLATFORM_ADMIN_COMPANY_NAME = "Platform Admin";
    private static final String OPEN_BILL_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";

    private final CompanyRepository companies;
    private final ClientCompanyRepository clientCompanies;
    private final ClientRepository clients;
    private final OpenBillRepository openBills;
    private final UserRepository users;
    private final AppSettingRepository settings;
    private final ObjectMapper objectMapper;

    public PlatformTenantAccountLinkService(
            CompanyRepository companies,
            ClientCompanyRepository clientCompanies,
            ClientRepository clients,
            OpenBillRepository openBills,
            UserRepository users,
            AppSettingRepository settings,
            ObjectMapper objectMapper
    ) {
        this.companies = companies;
        this.clientCompanies = clientCompanies;
        this.clients = clients;
        this.openBills = openBills;
        this.users = users;
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void syncFromTenantSettings(Company tenantCompany, Map<String, String> payload) {
        if (tenantCompany == null || tenantCompany.getId() == null || payload == null || payload.isEmpty()) {
            return;
        }
        if (!containsCompanyProfilePayload(payload)) {
            return;
        }
        CompanyProfileSnapshot profile = profileFromPayload(payload);
        if (profile.isEmpty()) {
            return;
        }
        Company tenant = companies.findByIdForUpdate(tenantCompany.getId()).orElse(tenantCompany);
        if (notBlank(profile.name()) && !Objects.equals(tenant.getName(), profile.name())) {
            tenant.setName(profile.name());
            companies.save(tenant);
        }
        syncToPlatformPayee(tenant, profile);
    }

    @Transactional
    public void syncFromPlatformPayeeCompany(ClientCompany payeeCompany) {
        if (payeeCompany == null || payeeCompany.getPlatformTenantCompany() == null || payeeCompany.getPlatformTenantCompany().getId() == null) {
            return;
        }
        Company tenant = companies.findByIdForUpdate(payeeCompany.getPlatformTenantCompany().getId()).orElse(null);
        if (tenant == null) {
            return;
        }
        CompanyProfileSnapshot profile = CompanyProfileSnapshot.fromPayee(payeeCompany);
        if (notBlank(profile.name()) && !Objects.equals(tenant.getName(), profile.name())) {
            tenant.setName(profile.name());
            companies.save(tenant);
        }
        upsertSetting(tenant, SettingKey.COMPANY_NAME, profile.name());
        upsertSetting(tenant, SettingKey.COMPANY_ADDRESS, profile.address());
        upsertSetting(tenant, SettingKey.COMPANY_POSTAL_CODE, profile.postalCode());
        upsertSetting(tenant, SettingKey.COMPANY_CITY, profile.city());
        upsertSetting(tenant, SettingKey.COMPANY_VAT_ID, profile.vatId());
        upsertSetting(tenant, SettingKey.COMPANY_IBAN, profile.iban());
        upsertSetting(tenant, SettingKey.COMPANY_EMAIL, profile.email());
        upsertSetting(tenant, SettingKey.COMPANY_TELEPHONE, profile.telephone());
        upsertCompanyProfilesSetting(tenant, profile);
    }

    @Transactional
    public ClientCompany ensurePlatformPayeeLink(
            Company tenantCompany,
            String name,
            String vatId,
            String address,
            String postalCode,
            String city,
            String email,
            String phone
    ) {
        if (tenantCompany == null || tenantCompany.getId() == null) {
            return null;
        }
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (platformCompany == null || platformCompany.getId() == null || Objects.equals(platformCompany.getId(), tenantCompany.getId())) {
            return null;
        }
        CompanyProfileSnapshot profile = new CompanyProfileSnapshot(
                normalize(name), normalize(address), normalize(postalCode), normalize(city), normalizeVat(vatId),
                normalize(email), normalize(phone), null, null, null, null
        );
        ClientCompany payee = resolvePayeeCompany(platformCompany, tenantCompany, profile);
        applyProfileToPayee(payee, tenantCompany, profile);
        return clientCompanies.save(payee);
    }

    private void syncToPlatformPayee(Company tenant, CompanyProfileSnapshot profile) {
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (platformCompany == null || platformCompany.getId() == null || Objects.equals(platformCompany.getId(), tenant.getId())) {
            return;
        }
        ClientCompany payee = resolvePayeeCompany(platformCompany, tenant, profile);
        applyProfileToPayee(payee, tenant, profile);
        payee = clientCompanies.save(payee);
        syncLinkedPlatformClients(platformCompany, payee, profile);
    }

    private ClientCompany resolvePayeeCompany(Company platformCompany, Company tenant, CompanyProfileSnapshot profile) {
        ClientCompany linked = clientCompanies.findFirstLinkedPlatformPayee(platformCompany.getId(), tenant.getId()).orElse(null);
        if (linked != null) {
            return linked;
        }
        ClientCompany fromSubscriptionOpenBill = findPayeeFromSubscriptionOpenBill(platformCompany, tenant).orElse(null);
        if (fromSubscriptionOpenBill != null) {
            fromSubscriptionOpenBill.setPlatformTenantCompany(tenant);
            return fromSubscriptionOpenBill;
        }
        ClientCompany matched = null;
        if (notBlank(profile.vatId())) {
            matched = clientCompanies.findFirstByOwnerCompanyIdAndVatId(platformCompany.getId(), profile.vatId()).orElse(null);
        }
        if (matched == null && notBlank(profile.email())) {
            matched = clientCompanies.findFirstByOwnerCompanyIdAndEmailIgnoreCase(platformCompany.getId(), profile.email()).orElse(null);
        }
        if (matched == null && notBlank(profile.name())) {
            matched = clientCompanies.findFirstByOwnerCompanyIdAndNameIgnoreCase(platformCompany.getId(), profile.name()).orElse(null);
        }
        if (matched != null) {
            matched.setPlatformTenantCompany(tenant);
            return matched;
        }
        ClientCompany created = new ClientCompany();
        created.setOwnerCompany(platformCompany);
        created.setPlatformTenantCompany(tenant);
        return created;
    }

    private Optional<ClientCompany> findPayeeFromSubscriptionOpenBill(Company platformCompany, Company tenant) {
        return openBills.findFirstByCompanyIdAndReferenceOrderByIdAsc(
                        platformCompany.getId(), OPEN_BILL_REFERENCE_PREFIX + tenant.getId())
                .map(OpenBill::getBatchTargetCompanyId)
                .filter(Objects::nonNull)
                .flatMap(payeeId -> clientCompanies.findByIdAndOwnerCompanyId(payeeId, platformCompany.getId()));
    }

    private void applyProfileToPayee(ClientCompany payee, Company tenant, CompanyProfileSnapshot profile) {
        payee.setPlatformTenantCompany(tenant);
        payee.setName(firstNonBlank(profile.name(), tenant.getName(), payee.getName(), "Calendra tenant"));
        payee.setAddress(profile.address());
        payee.setPostalCode(profile.postalCode());
        payee.setCity(profile.city());
        payee.setVatId(profile.vatId());
        payee.setIban(profile.iban());
        payee.setEmail(normalizeEmail(profile.email()));
        payee.setTelephone(profile.telephone());
        payee.setActive(true);
        payee.setBatchPaymentEnabled(true);
    }

    private void syncLinkedPlatformClients(Company platformCompany, ClientCompany payee, CompanyProfileSnapshot profile) {
        List<Client> linkedClients = clients.findAllByCompanyIdAndBillingCompanyId(platformCompany.getId(), payee.getId());
        for (Client client : linkedClients) {
            client.setBillingCompany(payee);
            client.setInvoiceRecipientType(InvoiceRecipientType.COMPANY);
            client.setInvoiceCompanyName(payee.getName());
            client.setInvoiceCompanyAddressLine(stringOrEmpty(profile.address()));
            client.setInvoiceCompanyPostalCode(stringOrEmpty(profile.postalCode()));
            client.setInvoiceCompanyCity(stringOrEmpty(profile.city()));
            client.setInvoiceCompanyVatId(profile.vatId());
            if (client.getEmail() == null || client.getEmail().isBlank()) {
                client.setEmail(normalizeEmail(profile.email()));
            }
            if (client.getPhone() == null || client.getPhone().isBlank()) {
                client.setPhone(profile.telephone());
            }
            clients.save(client);
        }
    }

    private Optional<Company> resolvePlatformCompany() {
        Optional<Company> named = companies.findAll().stream()
                .filter(c -> c.getName() != null && PLATFORM_ADMIN_COMPANY_NAME.equalsIgnoreCase(c.getName().trim()))
                .min(Comparator.comparing(Company::getId));
        if (named.isPresent()) {
            return named;
        }
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .map(User::getCompany)
                .filter(Objects::nonNull)
                .findFirst();
    }

    private CompanyProfileSnapshot profileFromPayload(Map<String, String> payload) {
        CompanyProfileSnapshot fromProfiles = profileFromProfilesJson(payload.get(SettingKey.COMPANY_PROFILES.name())).orElse(null);
        if (fromProfiles != null) {
            return fromProfiles;
        }
        return new CompanyProfileSnapshot(
                normalize(payload.get(SettingKey.COMPANY_NAME.name())),
                normalize(payload.get(SettingKey.COMPANY_ADDRESS.name())),
                normalize(payload.get(SettingKey.COMPANY_POSTAL_CODE.name())),
                normalize(payload.get(SettingKey.COMPANY_CITY.name())),
                normalizeVat(payload.get(SettingKey.COMPANY_VAT_ID.name())),
                normalize(payload.get(SettingKey.COMPANY_EMAIL.name())),
                normalize(payload.get(SettingKey.COMPANY_TELEPHONE.name())),
                normalize(payload.get(SettingKey.COMPANY_IBAN.name())),
                normalize(payload.get(SettingKey.COMPANY_BIC.name())),
                normalize(payload.get(SettingKey.BANK_QR_PURPOSE_CODE.name())),
                normalize(payload.get(SettingKey.BANK_QR_PURPOSE_TEXT.name()))
        );
    }

    private Optional<CompanyProfileSnapshot> profileFromProfilesJson(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return Optional.empty();
        }
        try {
            List<Map<String, Object>> profiles = objectMapper.readValue(rawJson, new TypeReference<List<Map<String, Object>>>() {});
            if (profiles == null || profiles.isEmpty()) {
                return Optional.empty();
            }
            Map<String, Object> selected = profiles.stream()
                    .filter(row -> Boolean.TRUE.equals(row.get("isDefault")))
                    .findFirst()
                    .orElse(profiles.get(0));
            return Optional.of(new CompanyProfileSnapshot(
                    normalize(asString(selected.get("name"))),
                    normalize(asString(selected.get("address"))),
                    normalize(asString(selected.get("postalCode"))),
                    normalize(asString(selected.get("city"))),
                    normalizeVat(asString(selected.get("vatId"))),
                    normalize(asString(selected.get("email"))),
                    normalize(asString(selected.get("telephone"))),
                    normalize(asString(selected.get("iban"))),
                    normalize(asString(selected.get("bic"))),
                    normalize(asString(selected.get("bankQrPurposeCode"))),
                    normalize(asString(selected.get("bankQrPurposeText")))
            ));
        } catch (Exception ex) {
            log.warn("Could not parse COMPANY_PROFILES for platform tenant sync. Falling back to legacy fields.", ex);
            return Optional.empty();
        }
    }

    private void upsertSetting(Company company, SettingKey key, String value) {
        AppSetting row = settings.findByCompanyIdAndKey(company.getId(), key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(key.name());
            return created;
        });
        row.setValue(value == null ? "" : value.trim());
        settings.save(row);
    }

    private void upsertCompanyProfilesSetting(Company company, CompanyProfileSnapshot profile) {
        try {
            List<Map<String, Object>> profiles = settings.findByCompanyIdAndKey(company.getId(), SettingKey.COMPANY_PROFILES)
                    .map(AppSetting::getValue)
                    .filter(v -> v != null && !v.isBlank())
                    .map(this::readCompanyProfilesJsonQuietly)
                    .orElseGet(ArrayList::new);
            Map<String, Object> main = profiles.stream()
                    .filter(row -> Boolean.TRUE.equals(row.get("isDefault")))
                    .findFirst()
                    .orElse(null);
            if (main == null && !profiles.isEmpty()) {
                main = profiles.get(0);
                main.put("isDefault", true);
            }
            if (main == null) {
                main = new LinkedHashMap<>();
                main.put("id", "default-company-profile");
                main.put("isDefault", true);
                profiles.add(main);
            }
            main.put("name", stringOrEmpty(profile.name()));
            main.put("address", stringOrEmpty(profile.address()));
            main.put("postalCode", stringOrEmpty(profile.postalCode()));
            main.put("city", stringOrEmpty(profile.city()));
            main.put("vatId", stringOrEmpty(profile.vatId()));
            main.put("email", stringOrEmpty(profile.email()));
            main.put("telephone", stringOrEmpty(profile.telephone()));
            main.put("iban", stringOrEmpty(profile.iban()));
            main.putIfAbsent("bic", "");
            main.putIfAbsent("bankQrPurposeCode", "OTHR");
            main.putIfAbsent("bankQrPurposeText", "PLACILO FOLIA");
            String selectedId = asString(main.get("id"));
            upsertSetting(company, SettingKey.COMPANY_PROFILES, objectMapper.writeValueAsString(profiles));
            upsertSetting(company, SettingKey.COMPANY_SELECTED_PROFILE_ID, firstNonBlank(selectedId, "default-company-profile"));
        } catch (Exception ex) {
            log.warn("Could not update COMPANY_PROFILES after platform payee sync for tenant {}.", company.getId(), ex);
        }
    }

    private List<Map<String, Object>> readCompanyProfilesJsonQuietly(String rawJson) {
        try {
            List<Map<String, Object>> profiles = objectMapper.readValue(rawJson, new TypeReference<List<Map<String, Object>>>() {});
            return profiles == null ? new ArrayList<>() : new ArrayList<>(profiles);
        } catch (Exception ex) {
            return new ArrayList<>();
        }
    }

    private static boolean containsCompanyProfilePayload(Map<String, String> payload) {
        return payload.containsKey(SettingKey.COMPANY_NAME.name())
                || payload.containsKey(SettingKey.COMPANY_ADDRESS.name())
                || payload.containsKey(SettingKey.COMPANY_POSTAL_CODE.name())
                || payload.containsKey(SettingKey.COMPANY_CITY.name())
                || payload.containsKey(SettingKey.COMPANY_VAT_ID.name())
                || payload.containsKey(SettingKey.COMPANY_EMAIL.name())
                || payload.containsKey(SettingKey.COMPANY_TELEPHONE.name())
                || payload.containsKey(SettingKey.COMPANY_IBAN.name())
                || payload.containsKey(SettingKey.COMPANY_PROFILES.name());
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (notBlank(value)) return value.trim();
        }
        return "";
    }

    private static boolean notBlank(String value) {
        return value != null && !value.trim().isBlank();
    }

    private static String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeVat(String value) {
        return ClientCompany.normalizeVatIdStorage(value);
    }

    private static String normalizeEmail(String value) {
        return Client.normalizeEmailStorage(value);
    }

    private static String stringOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private record CompanyProfileSnapshot(
            String name,
            String address,
            String postalCode,
            String city,
            String vatId,
            String email,
            String telephone,
            String iban,
            String bic,
            String bankQrPurposeCode,
            String bankQrPurposeText
    ) {
        boolean isEmpty() {
            return !notBlank(name)
                    && !notBlank(address)
                    && !notBlank(postalCode)
                    && !notBlank(city)
                    && !notBlank(vatId)
                    && !notBlank(email)
                    && !notBlank(telephone)
                    && !notBlank(iban);
        }

        static CompanyProfileSnapshot fromPayee(ClientCompany payee) {
            return new CompanyProfileSnapshot(
                    normalize(payee.getName()),
                    normalize(payee.getAddress()),
                    normalize(payee.getPostalCode()),
                    normalize(payee.getCity()),
                    normalizeVat(payee.getVatId()),
                    normalize(payee.getEmail()),
                    normalize(payee.getTelephone()),
                    normalize(payee.getIban()),
                    null,
                    null,
                    null
            );
        }
    }
}
