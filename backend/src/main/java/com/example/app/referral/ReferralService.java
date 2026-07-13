package com.example.app.referral;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates and resolves personal referral codes and records referral signups.
 * Reward granting on first payment lives in {@link ReferralRewardService}.
 */
@Service
public class ReferralService {

    private static final Logger log = LoggerFactory.getLogger(ReferralService.class);
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;
    private static final int DEFAULT_MONTHLY_CAP = 12;

    private final ReferralCodeRepository codes;
    private final ReferralRepository referrals;
    private final AppSettingRepository settings;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String publicBaseUrl;

    public ReferralService(
            ReferralCodeRepository codes,
            ReferralRepository referrals,
            AppSettingRepository settings,
            @Value("${app.public-base-url:}") String publicBaseUrl
    ) {
        this.codes = codes;
        this.referrals = referrals;
        this.settings = settings;
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.trim();
    }

    /** Response payload for the tenant-facing "Refer a friend" card. */
    public record MyReferralLink(
            String code,
            String url,
            long referralsQualified,
            long freeMonthsEarned,
            int monthlyCap,
            long capRemaining
    ) {}

    public record MyReferralRow(
            Long id,
            String status,
            String referredCompanyName,
            String referredEmail,
            Instant registeredAt,
            Instant qualifiedAt,
            boolean rewardGranted
    ) {}

    @Transactional
    public MyReferralLink getOrCreateMyLink(User user) {
        ReferralCode code = getOrCreateCodeForUser(user);
        Long companyId = user.getCompany() == null ? null : user.getCompany().getId();
        long qualified = companyId == null ? 0L
                : referrals.countByReferrerCompanyIdAndStatus(companyId, ReferralStatus.REWARDED)
                + referrals.countByReferrerCompanyIdAndStatus(companyId, ReferralStatus.QUALIFIED);
        long freeMonths = companyId == null ? 0L : rewardedInLast12Months(companyId);
        int cap = resolveMonthlyCap();
        long remaining = Math.max(0L, cap - freeMonths);
        return new MyReferralLink(code.getCode(), buildShareUrl(code.getCode()), qualified, freeMonths, cap, remaining);
    }

    @Transactional(readOnly = true)
    public java.util.List<MyReferralRow> listMyReferrals(User user) {
        Long companyId = user.getCompany() == null ? null : user.getCompany().getId();
        if (companyId == null) {
            return java.util.List.of();
        }
        return referrals.findAllByReferrerCompanyIdOrderByCreatedAtDesc(companyId).stream()
                .map(r -> new MyReferralRow(
                        r.getId(),
                        r.getStatus() == null ? ReferralStatus.PENDING.name() : r.getStatus().name(),
                        r.getReferredCompany() == null ? null : r.getReferredCompany().getName(),
                        r.getReferredEmail(),
                        r.getRegisteredAt(),
                        r.getQualifiedAt(),
                        r.isReferrerRewardGranted()))
                .toList();
    }

    @Transactional
    public ReferralCode getOrCreateCodeForUser(User user) {
        return codes.findByUserId(user.getId()).orElseGet(() -> {
            ReferralCode row = new ReferralCode();
            row.setUser(user);
            row.setCompany(user.getCompany());
            row.setCode(generateUniqueCode());
            row.setActive(true);
            return codes.save(row);
        });
    }

    /**
     * Records a referral for a freshly provisioned tenant. Safe to call unconditionally; it silently ignores
     * a blank code, an unknown/inactive code, self-referrals, or a company that already has a referral row.
     */
    @Transactional
    public void registerReferral(String rawCode, Company newCompany, String referredEmail) {
        String code = rawCode == null ? "" : rawCode.trim();
        if (code.isEmpty() || newCompany == null || newCompany.getId() == null) {
            return;
        }
        try {
            ReferralCode referralCode = codes.findByCodeIgnoreCase(code).orElse(null);
            if (referralCode == null || !referralCode.isActive()) {
                return;
            }
            Company referrerCompany = referralCode.getCompany();
            User referrerUser = referralCode.getUser();
            if (referrerCompany == null || referrerUser == null) {
                return;
            }
            if (referrerCompany.getId() != null && referrerCompany.getId().equals(newCompany.getId())) {
                return; // no self-referral
            }
            if (referrals.existsByReferredCompanyId(newCompany.getId())) {
                return; // already attributed
            }
            Referral referral = new Referral();
            referral.setReferrerCompany(referrerCompany);
            referral.setReferrerUser(referrerUser);
            referral.setCode(referralCode.getCode());
            referral.setReferredCompany(newCompany);
            referral.setReferredEmail(referredEmail == null ? null : referredEmail.trim().toLowerCase(Locale.ROOT));
            referral.setStatus(ReferralStatus.PENDING);
            referral.setRegisteredAt(Instant.now());
            referrals.save(referral);
            log.info("Referral recorded: referrerCompanyId={} referredCompanyId={} code={}",
                    referrerCompany.getId(), newCompany.getId(), referralCode.getCode());
        } catch (Exception e) {
            // Referral tracking must never block signup.
            log.warn("Referral registration skipped for company {}: {}",
                    newCompany.getId(), e.getMessage());
        }
    }

    /** Extracts the {@code ref} query parameter from a stored register return-search string. */
    public static String parseRefFromReturnSearch(String returnSearch) {
        if (returnSearch == null || returnSearch.isBlank()) {
            return null;
        }
        String q = returnSearch.startsWith("?") ? returnSearch.substring(1) : returnSearch;
        for (String pair : q.split("&")) {
            if (pair.isBlank()) continue;
            int sep = pair.indexOf('=');
            String key = sep >= 0 ? pair.substring(0, sep) : pair;
            String value = sep >= 0 ? pair.substring(sep + 1) : "";
            try {
                key = URLDecoder.decode(key, StandardCharsets.UTF_8).trim();
            } catch (Exception ignored) {
                key = key.trim();
            }
            if (!"ref".equalsIgnoreCase(key)) continue;
            try {
                String decoded = URLDecoder.decode(value, StandardCharsets.UTF_8).trim();
                return decoded.isEmpty() ? null : decoded;
            } catch (Exception ignored) {
                return value.trim().isEmpty() ? null : value.trim();
            }
        }
        return null;
    }

    public int resolveMonthlyCap() {
        return settings.findAllByKey(SettingKey.GLOBAL_REFERRAL_MONTHLY_CAP).stream()
                .map(AppSetting::getValue)
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .map(v -> {
                    try {
                        int parsed = Integer.parseInt(v.trim());
                        return parsed > 0 ? parsed : DEFAULT_MONTHLY_CAP;
                    } catch (NumberFormatException e) {
                        return DEFAULT_MONTHLY_CAP;
                    }
                })
                .orElse(DEFAULT_MONTHLY_CAP);
    }

    private long rewardedInLast12Months(Long companyId) {
        Instant windowStart = Instant.now().minus(365, ChronoUnit.DAYS);
        return referrals.countByReferrerCompanyIdAndReferrerRewardGrantedTrueAndQualifiedAtAfter(companyId, windowStart);
    }

    private String buildShareUrl(String code) {
        String base = publicBaseUrl.isBlank() ? "https://calendra.si" : publicBaseUrl;
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/register?ref=" + code;
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            String candidate = randomCode();
            if (!codes.existsByCodeIgnoreCase(candidate)) {
                return candidate;
            }
        }
        // Extremely unlikely; fall back to a longer code to guarantee uniqueness.
        return randomCode() + randomCode();
    }

    private String randomCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(CODE_ALPHABET.charAt(secureRandom.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }
}
