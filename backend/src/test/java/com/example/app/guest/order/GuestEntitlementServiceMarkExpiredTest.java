package com.example.app.guest.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GuestEntitlementServiceMarkExpiredTest {

    @Mock
    private GuestEntitlementRepository entitlements;
    @Mock
    private GuestEntitlementUsageRepository usages;

    @InjectMocks
    private GuestEntitlementService service;

    private Instant now;

    @BeforeEach
    void setUp() {
        now = Instant.parse("2026-05-04T12:00:00Z");
    }

    @Test
    void markExpiredEntitlements_returnsRepositoryUpdateCount() {
        when(entitlements.markExpiredEntitlements(
                eq(EntitlementStatus.EXPIRED),
                eq(List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING)),
                eq(now)))
                .thenReturn(5);
        assertEquals(5, service.markExpiredEntitlements(now));
    }

    @Test
    void markExpiredEntitlements_invokesBulkExpireQuery() {
        when(entitlements.markExpiredEntitlements(
                eq(EntitlementStatus.EXPIRED),
                eq(List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING)),
                eq(now)))
                .thenReturn(0);
        service.markExpiredEntitlements(now);
        verify(entitlements).markExpiredEntitlements(
                EntitlementStatus.EXPIRED,
                List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING),
                now);
    }
}
