package com.example.app.guest.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.ProductType;
import com.example.app.location.Location;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionType;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

class GuestEntitlementServiceGiftCardSplitTest {

    @Test
    void consumeBestMatchingGiftCard_usesMultipleCardsFromLowestBalanceFirst() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        Client client = new Client();
        client.setId(1L);
        SessionBooking booking = new SessionBooking();
        booking.setId(55L);
        booking.setLocation(testLocation());

        GuestEntitlement cardLow = giftCardEntitlement(101L, client, "EUR", new BigDecimal("3.00"), Instant.parse("2026-01-01T10:00:00Z"));
        GuestEntitlement cardMid = giftCardEntitlement(102L, client, "EUR", new BigDecimal("7.00"), Instant.parse("2026-01-01T11:00:00Z"));
        GuestEntitlement cardHigh = giftCardEntitlement(103L, client, "EUR", new BigDecimal("20.00"), Instant.parse("2026-01-01T12:00:00Z"));

        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(55L)).thenReturn(List.of());
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(1L, 10L, List.of(EntitlementStatus.ACTIVE)))
                .thenReturn(List.of(cardHigh, cardMid, cardLow));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var selection = service.consumeBestMatchingGiftCard(client, 10L, new BigDecimal("10.00"), "EUR", booking);

        assertThat(selection.consumed()).isTrue();
        assertThat(selection.entitlement().getId()).isEqualTo(101L);
        assertThat(cardLow.getRemainingValueGross()).isEqualByComparingTo("0.00");
        assertThat(cardMid.getRemainingValueGross()).isEqualByComparingTo("0.00");
        assertThat(cardHigh.getRemainingValueGross()).isEqualByComparingTo("20.00");
        assertThat(cardLow.getStatus()).isEqualTo(EntitlementStatus.USED_UP);
        assertThat(cardMid.getStatus()).isEqualTo(EntitlementStatus.USED_UP);

        ArgumentCaptor<GuestEntitlementUsage> usageCaptor = ArgumentCaptor.forClass(GuestEntitlementUsage.class);
        verify(usages, times(2)).save(usageCaptor.capture());
        List<GuestEntitlementUsage> usageRows = usageCaptor.getAllValues();
        assertThat(usageRows.get(0).getEntitlement().getId()).isEqualTo(101L);
        assertThat(usageRows.get(0).getUnitsBefore()).isEqualTo(300);
        assertThat(usageRows.get(0).getUnitsAfter()).isEqualTo(0);
        assertThat(usageRows.get(0).getLocation()).isSameAs(booking.getLocation());
        assertThat(usageRows.get(1).getEntitlement().getId()).isEqualTo(102L);
        assertThat(usageRows.get(1).getUnitsBefore()).isEqualTo(700);
        assertThat(usageRows.get(1).getUnitsAfter()).isEqualTo(0);
    }

    @Test
    void consumeBestMatchingGiftCard_failsWhenTotalBalanceIsInsufficient() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        Client client = new Client();
        client.setId(1L);
        SessionBooking booking = new SessionBooking();
        booking.setId(56L);
        booking.setLocation(testLocation());

        GuestEntitlement cardA = giftCardEntitlement(201L, client, "EUR", new BigDecimal("2.00"), Instant.parse("2026-01-01T10:00:00Z"));
        GuestEntitlement cardB = giftCardEntitlement(202L, client, "EUR", new BigDecimal("3.00"), Instant.parse("2026-01-01T11:00:00Z"));

        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(56L)).thenReturn(List.of());
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(1L, 10L, List.of(EntitlementStatus.ACTIVE)))
                .thenReturn(List.of(cardA, cardB));

        try {
            service.consumeBestMatchingGiftCard(client, 10L, new BigDecimal("10.00"), "EUR", booking);
        } catch (ResponseStatusException ex) {
            assertThat(ex.getReason()).contains("enough total balance");
            return;
        }
        throw new AssertionError("Expected ResponseStatusException for insufficient total gift-card balance.");
    }

    @Test
    void consumeBestMatchingGiftCard_respectsSelectedServiceScope() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        Client client = new Client();
        client.setId(1L);
        SessionType bookingType = new SessionType();
        bookingType.setId(9L);
        SessionBooking booking = new SessionBooking();
        booking.setId(57L);
        booking.setLocation(testLocation());
        booking.setType(bookingType);

        GuestEntitlement wrongService = giftCardEntitlement(211L, client, "EUR", new BigDecimal("100.00"), Instant.parse("2026-01-01T10:00:00Z"));
        wrongService.setMetadataJson("{\"voucherMode\":\"VALUE\",\"voucherScope\":\"SELECTED_SERVICES\",\"eligibleSessionTypeIds\":[10]}");
        GuestEntitlement matchingService = giftCardEntitlement(212L, client, "EUR", new BigDecimal("15.00"), Instant.parse("2026-01-01T11:00:00Z"));
        matchingService.setMetadataJson("{\"voucherMode\":\"VALUE\",\"voucherScope\":\"SELECTED_SERVICES\",\"eligibleSessionTypeIds\":[9]}");

        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(57L)).thenReturn(List.of());
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(1L, 10L, List.of(EntitlementStatus.ACTIVE)))
                .thenReturn(List.of(wrongService, matchingService));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var selection = service.consumeBestMatchingGiftCard(client, 10L, new BigDecimal("10.00"), "EUR", booking);

        assertThat(selection.entitlement().getId()).isEqualTo(212L);
        assertThat(wrongService.getRemainingValueGross()).isEqualByComparingTo("100.00");
        assertThat(matchingService.getRemainingValueGross()).isEqualByComparingTo("5.00");
    }

    @Test
    void maybeRestoreCreditForBooking_restoresAllGiftCardUsages() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        SessionBooking booking = new SessionBooking();
        booking.setId(77L);
        booking.setLocation(testLocation());
        Client client = new Client();
        client.setId(1L);
        GuestEntitlement cardA = giftCardEntitlement(301L, client, "EUR", new BigDecimal("0.00"), Instant.parse("2026-01-01T10:00:00Z"));
        GuestEntitlement cardB = giftCardEntitlement(302L, client, "EUR", new BigDecimal("2.00"), Instant.parse("2026-01-01T11:00:00Z"));
        cardA.setStatus(EntitlementStatus.USED_UP);
        cardB.setStatus(EntitlementStatus.ACTIVE);

        GuestEntitlementUsage usageA = new GuestEntitlementUsage();
        usageA.setEntitlement(cardA);
        usageA.setSessionBooking(booking);
        usageA.setUnitsUsed(300);
        usageA.setUnitsBefore(300);
        usageA.setUnitsAfter(0);

        GuestEntitlementUsage usageB = new GuestEntitlementUsage();
        usageB.setEntitlement(cardB);
        usageB.setSessionBooking(booking);
        usageB.setUnitsUsed(500);
        usageB.setUnitsBefore(700);
        usageB.setUnitsAfter(200);

        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(77L)).thenReturn(List.of(usageA, usageB));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        boolean restored = service.maybeRestoreCreditForBooking(booking);

        assertThat(restored).isTrue();
        assertThat(cardA.getRemainingValueGross()).isEqualByComparingTo("3.00");
        assertThat(cardB.getRemainingValueGross()).isEqualByComparingTo("7.00");
        assertThat(cardA.getStatus()).isEqualTo(EntitlementStatus.ACTIVE);
        assertThat(cardB.getStatus()).isEqualTo(EntitlementStatus.ACTIVE);
        verify(entitlements, times(2)).save(any(GuestEntitlement.class));
        verify(usages).deleteAll(List.of(usageA, usageB));
    }

    @Test
    void restoreValueVoucher_addsRedeemedAmountInsteadOfRewindingToHistoricalBalance() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        SessionBooking booking = new SessionBooking();
        booking.setId(78L);
        booking.setLocation(testLocation());
        Client client = new Client();
        client.setId(1L);
        GuestEntitlement card = giftCardEntitlement(303L, client, "EUR", new BigDecimal("50.00"), Instant.parse("2026-01-01T10:00:00Z"));
        card.setMetadataJson("{\"voucherMode\":\"VALUE\",\"voucherScope\":\"ALL_SERVICES\",\"faceValueGross\":100.00}");

        // Historical booking A used 30 EUR when the balance was 100 -> 70. Booking B was then
        // redeemed for another 20 EUR, so the current balance is 50. Cancelling A must restore
        // only its 30 EUR, resulting in 80 EUR rather than rewinding the card to 100 EUR.
        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(card);
        usage.setSessionBooking(booking);
        usage.setUnitsUsed(3000);
        usage.setUnitsBefore(10000);
        usage.setUnitsAfter(7000);

        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(78L))
                .thenReturn(List.of(usage), List.of());
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.maybeRestoreCreditForBooking(booking)).isTrue();
        assertThat(card.getRemainingValueGross()).isEqualByComparingTo("80.00");
        assertThat(service.maybeRestoreCreditForBooking(booking)).isFalse();
        assertThat(card.getRemainingValueGross()).isEqualByComparingTo("80.00");
        verify(usages).deleteAll(List.of(usage));
    }

    @Test
    void restoreExpiredVoucher_restoresCreditButKeepsVoucherExpired() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        SessionBooking booking = new SessionBooking();
        booking.setId(79L);
        booking.setLocation(testLocation());
        Client client = new Client();
        client.setId(1L);
        GuestEntitlement card = giftCardEntitlement(304L, client, "EUR", BigDecimal.ZERO, Instant.parse("2025-01-01T10:00:00Z"));
        card.setStatus(EntitlementStatus.USED_UP);
        card.setValidUntil(Instant.parse("2025-12-31T23:59:59Z"));
        card.setMetadataJson("{\"voucherMode\":\"VALUE\",\"voucherScope\":\"ALL_SERVICES\",\"faceValueGross\":100.00}");

        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(card);
        usage.setSessionBooking(booking);
        usage.setUnitsUsed(2000);
        usage.setUnitsBefore(2000);
        usage.setUnitsAfter(0);
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(79L)).thenReturn(List.of(usage));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.maybeRestoreCreditForBooking(booking)).isTrue();
        assertThat(card.getRemainingValueGross()).isEqualByComparingTo("20.00");
        assertThat(card.getStatus()).isEqualTo(EntitlementStatus.EXPIRED);
    }

    @Test
    void restoreCancelledVoucher_restoresBalanceWithoutReactivatingManualDeactivation() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        SessionBooking booking = new SessionBooking();
        booking.setId(81L);
        booking.setLocation(testLocation());
        Client client = new Client();
        client.setId(1L);
        GuestEntitlement voucher = giftCardEntitlement(307L, client, "EUR", new BigDecimal("10.00"), Instant.parse("2026-01-01T10:00:00Z"));
        voucher.setStatus(EntitlementStatus.CANCELLED);
        voucher.setMetadataJson("{\"voucherMode\":\"VALUE\",\"voucherScope\":\"ALL_SERVICES\",\"faceValueGross\":50.00}");

        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(voucher);
        usage.setSessionBooking(booking);
        usage.setUnitsUsed(500);
        usage.setUnitsBefore(1500);
        usage.setUnitsAfter(1000);
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(81L)).thenReturn(List.of(usage));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.maybeRestoreCreditForBooking(booking)).isTrue();
        assertThat(voucher.getRemainingValueGross()).isEqualByComparingTo("15.00");
        assertThat(voucher.getStatus()).isEqualTo(EntitlementStatus.CANCELLED);
    }

    @Test
    void refundVoucherRestore_restoresOnlyVoucherUsagesAndLeavesOtherEntitlementsUntouched() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        SessionBooking booking = new SessionBooking();
        booking.setId(80L);
        booking.setLocation(testLocation());
        Client client = new Client();
        client.setId(1L);
        GuestEntitlement voucher = giftCardEntitlement(305L, client, "EUR", BigDecimal.ZERO, Instant.parse("2026-01-01T10:00:00Z"));
        voucher.setStatus(EntitlementStatus.USED_UP);
        voucher.setMetadataJson("{\"voucherMode\":\"VALUE\",\"voucherScope\":\"ALL_SERVICES\",\"faceValueGross\":50.00}");

        GuestEntitlement pack = new GuestEntitlement();
        pack.setId(306L);
        pack.setCompany(voucher.getCompany());
        pack.setClient(client);
        pack.setEntitlementType(EntitlementType.PACK);
        pack.setStatus(EntitlementStatus.ACTIVE);
        pack.setRemainingUses(2);
        GuestProduct packProduct = new GuestProduct();
        packProduct.setProductType(ProductType.PACK);
        packProduct.setName("Pack");
        pack.setProduct(packProduct);

        GuestEntitlementUsage voucherUsage = new GuestEntitlementUsage();
        voucherUsage.setEntitlement(voucher);
        voucherUsage.setSessionBooking(booking);
        voucherUsage.setUnitsUsed(500);
        voucherUsage.setUnitsBefore(500);
        voucherUsage.setUnitsAfter(0);
        GuestEntitlementUsage packUsage = new GuestEntitlementUsage();
        packUsage.setEntitlement(pack);
        packUsage.setSessionBooking(booking);
        packUsage.setUnitsUsed(1);

        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(80L)).thenReturn(List.of(voucherUsage, packUsage));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.maybeRestoreVoucherCreditsForBooking(booking)).isTrue();
        assertThat(voucher.getRemainingValueGross()).isEqualByComparingTo("5.00");
        assertThat(pack.getRemainingUses()).isEqualTo(2);
        verify(usages).deleteAll(List.of(voucherUsage));
        verify(entitlements, times(1)).save(any(GuestEntitlement.class));
    }

    private static GuestEntitlement giftCardEntitlement(
            Long id,
            Client client,
            String currency,
            BigDecimal balance,
            Instant createdAt
    ) {
        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setId(id);
        Company company = new Company();
        company.setId(10L);
        entitlement.setCompany(company);
        entitlement.setClient(client);
        GuestProduct product = new GuestProduct();
        product.setProductType(ProductType.GIFT_CARD);
        product.setCurrency(currency);
        product.setName("Voucher");
        entitlement.setProduct(product);
        entitlement.setEntitlementType(EntitlementType.GIFT_CARD);
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlement.setValidFrom(Instant.parse("2025-01-01T00:00:00Z"));
        entitlement.setValidUntil(Instant.parse("2027-01-01T00:00:00Z"));
        entitlement.setRemainingValueGross(balance);
        entitlement.setRemainingUses(1);
        entitlement.setCreatedAt(createdAt);
        return entitlement;
    }

    private static Location testLocation() {
        Location location = new Location();
        location.setId(1L);
        location.setName("Test location");
        location.setActive(true);
        return location;
    }

}

