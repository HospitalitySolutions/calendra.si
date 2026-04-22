package com.example.app.guest.order;

import com.example.app.billing.BillPaidEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * When a {@link com.example.app.billing.Bill} is flipped to PAID in the web app
 * (manually or via bank statement reconciliation), forward that to the guest
 * order service so any wallet order linked to the bill can be settled (entitlement
 * created, push/email notification sent).
 */
@Component
public class GuestOrderBillPaidListener {
    private final GuestOrderService guestOrderService;

    public GuestOrderBillPaidListener(GuestOrderService guestOrderService) {
        this.guestOrderService = guestOrderService;
    }

    @EventListener
    public void on(BillPaidEvent event) {
        guestOrderService.onWalletBillPaid(event.billId());
    }
}
