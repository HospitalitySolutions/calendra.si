package com.example.app.observability.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.app.admin.PlatformMonitoringController;
import com.example.app.auth.AuthController;
import com.example.app.billing.BillingController;
import com.example.app.guest.common.GuestBookingActionsController;
import com.example.app.guest.preview.GuestPreviewController;
import com.example.app.inbox.ClientMessageController;
import com.example.app.mfa.MfaController;
import com.example.app.notification.TenantNotificationController;
import com.example.app.settings.SettingsController;
import java.lang.reflect.Method;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class LegacyEndpointAnnotationCoverageTest {

    @Test
    void everyCatalogEntryIsAttachedToAControllerHandler() {
        List<Class<?>> controllers = List.of(
                AuthController.class,
                BillingController.class,
                GuestBookingActionsController.class,
                GuestPreviewController.class,
                ClientMessageController.class,
                MfaController.class,
                TenantNotificationController.class,
                SettingsController.class,
                PlatformMonitoringController.class
        );
        Set<LegacyEndpointDefinition> tracked = EnumSet.noneOf(LegacyEndpointDefinition.class);
        for (Class<?> controller : controllers) {
            TrackLegacyEndpoint typeAnnotation = controller.getAnnotation(TrackLegacyEndpoint.class);
            if (typeAnnotation != null) tracked.add(typeAnnotation.value());
            for (Method method : controller.getDeclaredMethods()) {
                TrackLegacyEndpoint methodAnnotation = method.getAnnotation(TrackLegacyEndpoint.class);
                if (methodAnnotation != null) tracked.add(methodAnnotation.value());
            }
        }

        assertThat(tracked).containsExactlyInAnyOrder(LegacyEndpointDefinition.values());
    }
}
