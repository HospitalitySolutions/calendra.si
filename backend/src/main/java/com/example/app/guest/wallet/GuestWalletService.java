package com.example.app.guest.wallet;

import com.example.app.billing.Bill;
import com.example.app.billing.BillRepository;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.model.*;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.session.SessionBookingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestWalletService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final GuestTenantService guestTenantService;
    private final GuestEntitlementRepository entitlements;
    private final GuestOrderRepository orders;
    private final SessionBookingRepository bookings;
    private final GuestEntitlementService entitlementService;
    private final BillRepository bills;
    private final AppSettingRepository settings;

    public GuestWalletService(GuestTenantService guestTenantService, GuestEntitlementRepository entitlements,
                              GuestOrderRepository orders, SessionBookingRepository bookings,
                              GuestEntitlementService entitlementService, BillRepository bills, AppSettingRepository settings) {
        this.guestTenantService = guestTenantService;
        this.entitlements = entitlements;
        this.orders = orders;
        this.bookings = bookings;
        this.entitlementService = entitlementService;
        this.bills = bills;
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    public GuestDtos.WalletResponse wallet(GuestUser guestUser, Long companyId) {
        return wallet(guestUser, companyId, 0, 100, 0, 100);
    }

    @Transactional(readOnly = true)
    public GuestDtos.WalletResponse wallet(GuestUser guestUser, Long companyId, int ordersPage, int ordersSize) {
        return wallet(guestUser, companyId, ordersPage, ordersSize, 0, 100);
    }

    @Transactional(readOnly = true)
    public GuestDtos.WalletResponse wallet(
            GuestUser guestUser,
            Long companyId,
            int ordersPage,
            int ordersSize,
            int entitlementsPage,
            int entitlementsSize
    ) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        var entitlementRows = entitlements.findAllByClientIdAndCompanyIdAndStatusNotOrderByCreatedAtDesc(
                link.getClient().getId(),
                companyId,
                EntitlementStatus.CANCELLED,
                PageRequest.of(safePage(entitlementsPage), safeSize(entitlementsSize, 100, 500))
        );
        var orderRows = orders.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(
                guestUser.getId(),
                companyId,
                PageRequest.of(safePage(ordersPage), safeSize(ordersSize, 100, 500))
        );
        Map<Long, Bill> billById = loadBillsById(orderRows.stream()
                .map(GuestOrder::getBillId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        Map<Long, ProductSummary> productByOrderId = loadProductSummariesByOrderId(orderRows.stream()
                .map(GuestOrder::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));

        return new GuestDtos.WalletResponse(
                entitlementRows.stream()
                        .map(GuestMapper::toEntitlement)
                        .toList(),
                orderRows.stream()
                        .map(order -> toWalletOrder(order, billById, productByOrderId))
                        .toList()
        );
    }

    private Map<Long, Bill> loadBillsById(Collection<Long> billIds) {
        if (billIds == null || billIds.isEmpty()) {
            return Map.of();
        }
        return bills.findAllById(billIds).stream()
                .filter(bill -> bill.getId() != null)
                .collect(Collectors.toMap(Bill::getId, bill -> bill));
    }

    private record ProductSummary(String name, String type) {}

    private Map<Long, ProductSummary> loadProductSummariesByOrderId(Collection<Long> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, ProductSummary> result = new HashMap<>();
        for (Object[] row : orders.findFirstEntitlementProductRowsForOrderIds(orderIds)) {
            if (row == null || row.length < 3 || row[0] == null) {
                continue;
            }
            Long orderId = (Long) row[0];
            result.putIfAbsent(orderId, new ProductSummary(
                    row[1] == null ? null : String.valueOf(row[1]),
                    row[2] == null ? null : String.valueOf(row[2])
            ));
        }
        return result;
    }

    private GuestDtos.WalletOrderResponse toWalletOrder(GuestOrder order, Map<Long, Bill> billById, Map<Long, ProductSummary> productByOrderId) {
        Bill bill = order.getBillId() == null ? null : billById.get(order.getBillId());
        String billPaymentStatus = bill == null ? null : bill.getPaymentStatus();
        String invoiceOrderId = bill == null ? null : bill.getOrderId();
        String productName = null;
        String productType = null;
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object pType = map.get("productType");
            if (pType != null) productType = String.valueOf(pType);
            Object pName = map.get("productName");
            if (pName != null) productName = String.valueOf(pName);
        } catch (Exception ignore) {
        }
        ProductSummary productSummary = productByOrderId.get(order.getId());
        if (productName == null && productSummary != null) {
            productName = productSummary.name();
        }
        if (productType == null && productSummary != null) {
            productType = productSummary.type();
        }
        boolean isPendingBankTransfer =
                order.getPaymentMethodType() == GuestPaymentMethodType.BANK_TRANSFER
                        && "PAYMENT_PENDING".equalsIgnoreCase(String.valueOf(billPaymentStatus));
        String paymentCompanyName = null;
        String paymentCompanyAddress = null;
        String paymentIban = null;
        if (isPendingBankTransfer) {
            Long companyId = order.getCompany().getId();
            paymentCompanyName = settingValue(companyId, SettingKey.COMPANY_NAME, order.getCompany().getName());
            paymentCompanyAddress = settingValue(companyId, SettingKey.COMPANY_ADDRESS, null);
            paymentIban = settingValue(companyId, SettingKey.COMPANY_IBAN, null);
        }
        return new GuestDtos.WalletOrderResponse(
                String.valueOf(order.getId()),
                invoiceOrderId,
                order.getStatus().name(),
                order.getPaymentMethodType().name(),
                order.getTotalGross().doubleValue(),
                order.getCurrency(),
                order.getPaidAt() == null ? null : order.getPaidAt().toString(),
                order.getCreatedAt() == null ? null : order.getCreatedAt().toString(),
                order.getReferenceCode(),
                productName,
                productType,
                billPaymentStatus,
                paymentCompanyName,
                paymentCompanyAddress,
                paymentIban
        );
    }

    private static int safePage(int page) {
        return Math.max(0, page);
    }

    private static int safeSize(int size, int defaultSize, int maxSize) {
        if (size <= 0) return defaultSize;
        return Math.min(size, maxSize);
    }

    private String settingValue(Long companyId, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue())
                .map(String::trim)
                .filter(v -> !v.isBlank())
                .orElse(fallback);
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.BookingHistoryItemResponse> history(GuestUser guestUser, Long companyId) {
        return history(guestUser, companyId, 0, 50);
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.BookingHistoryItemResponse> history(GuestUser guestUser, Long companyId, int page, int size) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        return bookings.findHistoryByClientIdAndCompanyId(
                        link.getClient().getId(),
                        companyId,
                        LocalDateTime.now(),
                        PageRequest.of(safePage(page), safeSize(size, 50, 200))
                ).stream()
                .map(b -> new GuestDtos.BookingHistoryItemResponse(
                        String.valueOf(b.getId()),
                        b.getType() == null ? "Session" : b.getType().getName(),
                        b.getStartTime().toString(),
                        b.getBookingStatus() == null ? "COMPLETED" : b.getBookingStatus()
                ))
                .toList();
    }

    @Transactional
    public GuestDtos.ToggleAutoRenewResponse updateAutoRenew(GuestUser guestUser, Long companyId, Long entitlementId, boolean autoRenews) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        GuestEntitlement entitlement = entitlementService.findOwnedEntitlement(entitlementId, link.getClient().getId(), companyId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Entitlement not found."));
        GuestEntitlement updated = entitlementService.updateAutoRenew(entitlement, autoRenews);
        return new GuestDtos.ToggleAutoRenewResponse(String.valueOf(updated.getId()), entitlementService.autoRenews(updated));
    }
}
