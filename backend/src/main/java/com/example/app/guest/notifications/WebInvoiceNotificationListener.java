package com.example.app.guest.notifications;

import com.example.app.billing.BillRepository;
import com.example.app.billing.WebInvoiceCreatedEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class WebInvoiceNotificationListener {
    private final BillRepository bills;
    private final GuestNotificationService notifications;

    public WebInvoiceNotificationListener(BillRepository bills, GuestNotificationService notifications) {
        this.bills = bills;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onWebInvoiceCreated(WebInvoiceCreatedEvent event) {
        if (event == null || event.billId() == null || event.companyId() == null) {
            return;
        }
        bills.findByIdAndCompanyId(event.billId(), event.companyId())
                .ifPresent(notifications::webInvoiceCreated);
    }
}
