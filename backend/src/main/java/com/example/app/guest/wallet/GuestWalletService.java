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
import java.util.List;
import java.util.Map;
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
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        return new GuestDtos.WalletResponse(
                entitlements.findAllByClientIdAndCompanyIdOrderByCreatedAtDesc(link.getClient().getId(), companyId).stream().map(GuestMapper::toEntitlement).toList(),
                orders.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(guestUser.getId(), companyId).stream()
                        .map(this::toWalletOrder)
                        .toList()
        );
    }

    private GuestDtos.WalletOrderResponse toWalletOrder(GuestOrder order) {
        Bill bill = order.getBillId() == null ? null : bills.findById(order.getBillId()).orElse(null);
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
        if (productName == null) {
            productName = entitlements.findBySourceOrderId(order.getId())
                    .map(e -> e.getProduct() == null ? null : e.getProduct().getName())
                    .orElse(null);
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

    private String settingValue(Long companyId, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue())
                .map(String::trim)
                .filter(v -> !v.isBlank())
                .orElse(fallback);
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.BookingHistoryItemResponse> history(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        return bookings.findByClientIdAndCompanyId(link.getClient().getId(), companyId).stream()
                .filter(b -> b.getStartTime() != null && b.getStartTime().isBefore(LocalDateTime.now()))
                .sorted(java.util.Comparator.comparing(com.example.app.session.SessionBooking::getStartTime).reversed())
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
