package com.example.app.session;

import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Serializes conflict-sensitive booking writes across operating units.
 *
 * <p>Company row locking already protects concurrent writes inside one unit. PostgreSQL transaction-level
 * advisory locks add a workspace-wide lock for the same login account and globally unique room/resource IDs,
 * closing the check-then-insert race between two different units.</p>
 */
@Service
public class WorkspaceSchedulingLockService {
    private static final long CONSULTANT_NAMESPACE = 0x11L << 56;
    private static final long SPACE_NAMESPACE = 0x12L << 56;
    private static final long ID_MASK = 0x00FFFFFFFFFFFFFFL;

    private final JdbcTemplate jdbc;
    private final UserRepository users;

    public WorkspaceSchedulingLockService(JdbcTemplate jdbc, UserRepository users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    public void lock(Long companyId, Long consultantId, Collection<Long> spaceIds) {
        Set<Long> keys = new LinkedHashSet<>();
        if (companyId != null && consultantId != null) {
            User consultant = users.findByIdAndCompanyId(consultantId, companyId).orElse(null);
            Long globalIdentityId = consultant != null && consultant.getLoginAccount() != null
                    ? consultant.getLoginAccount().getId()
                    : consultantId;
            if (globalIdentityId != null) keys.add(key(CONSULTANT_NAMESPACE, globalIdentityId));
        }
        if (spaceIds != null) {
            spaceIds.stream()
                    .filter(id -> id != null && id > 0)
                    .map(id -> key(SPACE_NAMESPACE, id))
                    .sorted()
                    .forEach(keys::add);
        }
        List<Long> ordered = keys.stream().sorted().toList();
        for (Long key : ordered) {
            // IDs are numeric and generated internally, so concatenation cannot introduce SQL text.
            jdbc.execute("select pg_advisory_xact_lock(" + key + ")");
        }
    }

    static long key(long namespace, long id) {
        return namespace | (id & ID_MASK);
    }
}
