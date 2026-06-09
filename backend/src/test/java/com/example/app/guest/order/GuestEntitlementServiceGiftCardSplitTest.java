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
import com.example.app.session.SessionBooking;
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
    void maybeRestoreCreditForBooking_restoresAllGiftCardUsages() {
        GuestEntitlementRepository entitlements = org.mockito.Mockito.mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = org.mockito.Mockito.mock(GuestEntitlementUsageRepository.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));

        SessionBooking booking = new SessionBooking();
        booking.setId(77L);
        Client client = new Client();
        client.setId(1L);
        GuestEntitlement cardA = giftCardEntitlement(301L, client, "EUR", new BigDecimal("0.00"), Instant.parse("2026-01-01T10:00:00Z"));
        GuestEntitlement cardB = giftCardEntitlement(302L, client, "EUR", new BigDecimal("2.00"), Instant.parse("2026-01-01T11:00:00Z"));
        cardA.setStatus(EntitlementStatus.USED_UP);
        cardB.setStatus(EntitlementStatus.ACTIVE);

        GuestEntitlementUsage usageA = new GuestEntitlementUsage();
        usageA.setEntitlement(cardA);
        usageA.setSessionBooking(booking);
        usageA.setUnitsBefore(300);
        usageA.setUnitsAfter(0);

        GuestEntitlementUsage usageB = new GuestEntitlementUsage();
        usageB.setEntitlement(cardB);
        usageB.setSessionBooking(booking);
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
        product.setName("Gift card");
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
}

