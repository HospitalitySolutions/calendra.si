package com.example.app.workspacesubscription;

import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspaceEntitlementService {
    private final WorkspaceSubscriptionService subscriptions;

    public WorkspaceEntitlementService(WorkspaceSubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Transactional(readOnly = true)
    public boolean hasFeature(User actor, WorkspaceFeature feature) {
        return subscriptions.hasFeature(subscriptions.requireFor(actor), feature);
    }

    @Transactional(readOnly = true)
    public void requireFeature(User actor, WorkspaceFeature feature) {
        WorkspaceSubscription subscription = subscriptions.requireFor(actor);
        if (!subscriptions.hasFeature(subscription, feature)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "This workspace subscription does not include " + feature.name().toLowerCase().replace('_', ' ') + ".");
        }
    }
}
