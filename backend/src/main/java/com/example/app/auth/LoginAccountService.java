package com.example.app.auth;

import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LoginAccountService {
    private final LoginAccountRepository loginAccounts;
    private final UserRepository users;

    public LoginAccountService(LoginAccountRepository loginAccounts, UserRepository users) {
        this.loginAccounts = loginAccounts;
        this.users = users;
    }

    @Transactional
    public LoginAccount ensureForUser(User user) {
        if (user == null) {
            throw new IllegalArgumentException("User is required.");
        }
        if (user.getLoginAccount() != null) {
            return user.getLoginAccount();
        }

        LoginAccount account = new LoginAccount();
        account.setFirstName(defaultString(user.getFirstName(), "User"));
        account.setLastName(defaultString(user.getLastName(), ""));
        account.setEmail(normalizeEmail(user.getEmail()));
        account.setPasswordHash(user.getPasswordHash());
        account.setActive(true);
        account.setLastSelectedCompanyId(user.getCompany() == null ? null : user.getCompany().getId());
        account = loginAccounts.save(account);

        user.setLoginAccount(account);
        users.save(user);
        return account;
    }

    @Transactional
    public List<LoginAccount> findLoginCandidates(String email) {
        String normalized = normalizeEmail(email);
        List<LoginAccount> existing = new ArrayList<>(loginAccounts.findAllByEmailIgnoreCaseOrderByIdAsc(normalized));
        for (User user : users.findAllByEmailIgnoreCaseAndLoginAccountIsNull(normalized)) {
            LoginAccount created = ensureForUser(user);
            boolean duplicate = existing.stream().anyMatch(account -> account.getId().equals(created.getId()));
            if (!duplicate) {
                existing.add(created);
            }
        }
        return existing;
    }

    @Transactional(readOnly = true)
    public boolean hasMultipleMemberships(User user) {
        if (user == null || user.getLoginAccount() == null || user.getLoginAccount().getId() == null) {
            return false;
        }
        return users.countByLoginAccountId(user.getLoginAccount().getId()) > 1;
    }

    @Transactional(readOnly = true)
    public boolean canUseEmailAcrossMemberships(User user, String email) {
        if (user == null) {
            return false;
        }
        LoginAccount account = user.getLoginAccount();
        if (account == null || account.getId() == null) {
            return true;
        }
        String normalized = normalizeEmail(email);
        for (User membership : users.findAllByLoginAccountIdOrderByIdAsc(account.getId())) {
            if (membership.getCompany() == null || membership.getCompany().getId() == null) {
                continue;
            }
            User conflicting = users.findByEmailIgnoreCaseAndCompanyId(normalized, membership.getCompany().getId())
                    .orElse(null);
            if (conflicting != null
                    && (conflicting.getLoginAccount() == null
                    || !account.getId().equals(conflicting.getLoginAccount().getId()))) {
                return false;
            }
        }
        return true;
    }

    @Transactional
    public LoginAccount synchronizeCredentials(User source, boolean synchronizeEmail, boolean synchronizePassword) {
        LoginAccount account = ensureForUser(source);
        if (!synchronizeEmail && !synchronizePassword) {
            return account;
        }

        String normalizedEmail = synchronizeEmail ? normalizeEmail(source.getEmail()) : account.getEmail();
        if (synchronizeEmail && !canUseEmailAcrossMemberships(source, normalizedEmail)) {
            throw new IllegalArgumentException("This email is already used by another employee in one of the linked units.");
        }
        String passwordHash = synchronizePassword ? source.getPasswordHash() : account.getPasswordHash();

        if (synchronizeEmail) {
            account.setEmail(normalizedEmail);
        }
        if (synchronizePassword) {
            account.setPasswordHash(passwordHash);
        }

        List<User> memberships = users.findAllByLoginAccountIdOrderByIdAsc(account.getId());
        for (User membership : memberships) {
            if (synchronizeEmail) {
                membership.setEmail(normalizedEmail);
            }
            if (synchronizePassword) {
                membership.setPasswordHash(passwordHash);
            }
        }
        loginAccounts.save(account);
        users.saveAll(memberships);
        return account;
    }

    @Transactional(readOnly = true)
    public List<User> memberships(LoginAccount account) {
        if (account == null || account.getId() == null) {
            return List.of();
        }
        return users.findAllByLoginAccountIdOrderByIdAsc(account.getId());
    }

    @Transactional(readOnly = true)
    public List<User> activeMemberships(LoginAccount account) {
        if (account == null || account.getId() == null) {
            return List.of();
        }
        return users.findAllByLoginAccountIdAndActiveTrueOrderByIdAsc(account.getId()).stream()
                .filter(user -> user.getCompany() != null
                        && user.getCompany().getWorkspace() != null
                        && user.getCompany().getWorkspace().isActive())
                .toList();
    }

    @Transactional(readOnly = true)
    public User resolveDefaultMembership(LoginAccount account) {
        List<User> memberships = activeMemberships(account);
        if (memberships.isEmpty()) {
            return null;
        }

        Long preferredCompanyId = account.getLastSelectedCompanyId();
        if (preferredCompanyId != null) {
            User preferred = memberships.stream()
                    .filter(user -> user.getCompany() != null && preferredCompanyId.equals(user.getCompany().getId()))
                    .findFirst()
                    .orElse(null);
            if (preferred != null) {
                return preferred;
            }
        }

        return memberships.stream()
                .min(Comparator
                        .comparing((User user) -> user.getRole() == Role.SUPER_ADMIN ? 0 : 1)
                        .thenComparing(User::getId))
                .orElse(memberships.get(0));
    }

    @Transactional(readOnly = true)
    public User requireMembership(LoginAccount account, Long companyId) {
        if (account == null || account.getId() == null) {
            throw new IllegalArgumentException("Login account is required.");
        }
        if (companyId == null) {
            User membership = resolveDefaultMembership(account);
            if (membership == null) {
                throw new IllegalStateException("This login does not have access to an active unit.");
            }
            return membership;
        }
        return users.findByLoginAccountIdAndCompanyIdAndActiveTrue(account.getId(), companyId)
                .orElseThrow(() -> new SecurityException("You do not have access to the selected unit."));
    }

    @Transactional
    public void rememberSelectedUnit(LoginAccount account, Long companyId) {
        User membership = requireMembership(account, companyId);
        account.setLastSelectedCompanyId(membership.getCompany().getId());
        loginAccounts.save(account);
    }

    public String normalizeEmail(String email) {
        if (email == null) {
            return "";
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
