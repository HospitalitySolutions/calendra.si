package com.example.app.common;

/**
 * Thread-local record of which tenant (company id) the current thread is acting for, used by
 * {@link TimeService} to resolve a per-tenant simulated clock offset.
 *
 * <p>Set by the request interceptor for authenticated requests and inside scheduled-job loops that
 * process one tenant at a time. When no tenant is bound, the effective clock falls back to real time.</p>
 */
public final class SimulatedTimeContext {
    private static final ThreadLocal<Long> CURRENT_TENANT = new ThreadLocal<>();

    private SimulatedTimeContext() {
    }

    public static void set(Long tenantId) {
        if (tenantId == null) {
            CURRENT_TENANT.remove();
        } else {
            CURRENT_TENANT.set(tenantId);
        }
    }

    public static Long getTenantId() {
        return CURRENT_TENANT.get();
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }

    /** Runs {@code action} with the given tenant bound, restoring the previous binding afterwards. */
    public static void runAs(Long tenantId, Runnable action) {
        Long previous = CURRENT_TENANT.get();
        set(tenantId);
        try {
            action.run();
        } finally {
            set(previous);
        }
    }
}
