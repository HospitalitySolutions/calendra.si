package com.example.app.guest.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.common.SimulatedTimeService;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.ProductType;
import com.example.app.session.SessionBooking;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuestEntitlementServiceVoucherResolutionTest {

    @Test
    void resolveVoucherCodesForServices_reassignsOverlappingServiceVouchersToReachValidMatching() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = service(entitlements, usages);
        Client client = client(1L);

        GuestEntitlement flexible = voucher(
                101L, client, "A", null,
                "{\"voucherMode\":\"SERVICE\",\"voucherScope\":\"SELECTED_SERVICES\",\"eligibleSessionTypeIds\":[11,12],\"eligibleServiceNames\":[\"S1\",\"S2\"]}"
        );
        GuestEntitlement onlyFirst = voucher(
                102L, client, "B", null,
                "{\"voucherMode\":\"SERVICE\",\"voucherScope\":\"SELECTED_SERVICES\",\"eligibleSessionTypeIds\":[11],\"eligibleServiceNames\":[\"S1\"]}"
        );
        when(entitlements.findByEntitlementCode("A")).thenReturn(java.util.Optional.of(flexible));
        when(entitlements.findByEntitlementCode("B")).thenReturn(java.util.Optional.of(onlyFirst));

        var result = service.resolveVoucherCodesForServices(
                client,
                10L,
                List.of(
                        new GuestEntitlementService.VoucherSelectionLine(0, 11L),
                        new GuestEntitlementService.VoucherSelectionLine(1, 12L)
                ),
                "EUR",
                List.of("A", "B")
        );

        assertThat(result.serviceAssignments()).hasSize(2);
        assertThat(result.serviceAssignments())
                .extracting(GuestEntitlementService.VoucherServiceAssignment::position,
                        GuestEntitlementService.VoucherServiceAssignment::entitlementId)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(0, 102L),
                        org.assertj.core.groups.Tuple.tuple(1, 101L)
                );
        assertThat(result.valueVoucherCodes()).isEmpty();
    }

    @Test
    void consumeGiftCardCodesForCharges_appliesSelectedScopeOnlyToEligibleServiceAmount() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = service(entitlements, usages);
        Client client = client(1L);
        SessionBooking booking = new SessionBooking();
        booking.setId(55L);

        GuestEntitlement valueVoucher = voucher(
                201L, client, "VALUE11", new BigDecimal("100.00"),
                "{\"voucherMode\":\"VALUE\",\"voucherScope\":\"SELECTED_SERVICES\",\"eligibleSessionTypeIds\":[11],\"faceValueGross\":100.00}"
        );
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(55L)).thenReturn(List.of());
        when(entitlements.findByEntitlementCode("VALUE11")).thenReturn(java.util.Optional.of(valueVoucher));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = service.consumeGiftCardCodesForCharges(
                client,
                10L,
                new BigDecimal("80.00"),
                "EUR",
                booking,
                List.of(
                        new GuestEntitlementService.VoucherChargeLine(0, 11L, new BigDecimal("30.00")),
                        new GuestEntitlementService.VoucherChargeLine(1, 12L, new BigDecimal("50.00"))
                ),
                List.of("VALUE11"),
                false
        );

        assertThat(result.amountApplied()).isEqualByComparingTo("30.00");
        assertThat(result.remainingAmount()).isEqualByComparingTo("50.00");
        assertThat(result.remainingChargeLines())
                .extracting(GuestEntitlementService.VoucherChargeLine::position,
                        GuestEntitlementService.VoucherChargeLine::amountGross)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(0, new BigDecimal("0.00")),
                        org.assertj.core.groups.Tuple.tuple(1, new BigDecimal("50.00"))
                );
        assertThat(valueVoucher.getRemainingValueGross()).isEqualByComparingTo("70.00");
        verify(usages).save(any(GuestEntitlementUsage.class));
    }

    @Test
    void consumeGiftCardCodesForCharges_allowsValueVoucherAlongsideExistingServiceVoucherUsage() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = service(entitlements, usages);
        Client client = client(1L);
        SessionBooking booking = new SessionBooking();
        booking.setId(56L);

        GuestEntitlement serviceVoucher = voucher(
                301L, client, "SERVICE", null,
                "{\"voucherMode\":\"SERVICE\",\"voucherScope\":\"ALL_SERVICES\"}"
        );
        GuestEntitlementUsage serviceUsage = new GuestEntitlementUsage();
        serviceUsage.setEntitlement(serviceVoucher);
        serviceUsage.setSessionBooking(booking);

        GuestEntitlement valueVoucher = voucher(
                302L, client, "VALUE", new BigDecimal("20.00"),
                "{\"voucherMode\":\"VALUE\",\"voucherScope\":\"ALL_SERVICES\",\"faceValueGross\":20.00}"
        );
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(56L)).thenReturn(List.of(serviceUsage));
        when(entitlements.findByEntitlementCode("VALUE")).thenReturn(java.util.Optional.of(valueVoucher));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = service.consumeGiftCardCodesForCharges(
                client,
                10L,
                new BigDecimal("15.00"),
                "EUR",
                booking,
                List.of(new GuestEntitlementService.VoucherChargeLine(12L, new BigDecimal("15.00"))),
                List.of("VALUE"),
                true
        );

        assertThat(result.remainingAmount()).isEqualByComparingTo("0.00");
        assertThat(valueVoucher.getRemainingValueGross()).isEqualByComparingTo("5.00");
    }

    private GuestEntitlementService service(
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository usages
    ) {
        return new GuestEntitlementService(
                entitlements,
                usages,
                new TimeService(new SimulatedTimeService(null, null, null, new ObjectMapper()))
        );
    }

    private Client client(Long id) {
        Client client = new Client();
        client.setId(id);
        return client;
    }

    private GuestEntitlement voucher(
            Long id,
            Client client,
            String code,
            BigDecimal balance,
            String metadata
    ) {
        Company company = new Company();
        company.setId(10L);
        GuestProduct product = new GuestProduct();
        product.setProductType(ProductType.GIFT_CARD);
        product.setName("Voucher");
        product.setCurrency("EUR");
        product.setPriceGross(balance == null ? new BigDecimal("50.00") : balance);

        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setId(id);
        entitlement.setCompany(company);
        entitlement.setClient(client);
        entitlement.setProduct(product);
        entitlement.setEntitlementType(EntitlementType.GIFT_CARD);
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlement.setRemainingUses(1);
        entitlement.setRemainingValueGross(balance);
        entitlement.setValidFrom(Instant.parse("2025-01-01T00:00:00Z"));
        entitlement.setValidUntil(Instant.parse("2027-01-01T00:00:00Z"));
        entitlement.setEntitlementCode(code);
        entitlement.setDisplayCode(code);
        entitlement.setMetadataJson(metadata);
        entitlement.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        return entitlement;
    }
}
