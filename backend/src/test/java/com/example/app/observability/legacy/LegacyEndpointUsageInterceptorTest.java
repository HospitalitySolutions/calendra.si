package com.example.app.observability.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

class LegacyEndpointUsageInterceptorTest {

    @Test
    void addsDeprecationHeadersAndRecordsUsage() throws Exception {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        LegacyEndpointUsageService usageService = new LegacyEndpointUsageService(meterRegistry);
        LegacyEndpointUsageInterceptor interceptor = new LegacyEndpointUsageInterceptor(usageService);
        HandlerMethod handler = new HandlerMethod(new TestController(), TestController.class.getMethod("legacyHandler"));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/notifications/unread-count");
        request.addHeader("User-Agent", "Calendra-Test/1.0");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request, response, handler)).isTrue();
        response.setStatus(200);
        interceptor.afterCompletion(request, response, handler, null);

        assertThat(response.getHeader("Deprecation")).isEqualTo("true");
        assertThat(response.getHeader("X-Calendra-Legacy-Endpoint")).isEqualTo("notifications-unread-count");
        assertThat(response.getHeader("X-Calendra-Replacement")).isEqualTo("/api/notifications");
        assertThat(response.getHeader("Link")).isEqualTo("</api/notifications>; rel=\"successor-version\"");
        assertThat(meterRegistry.get(LegacyEndpointUsageService.CALLS_METER)
                .tag("endpoint", "notifications-unread-count")
                .tag("method", "get")
                .tag("outcome", "success")
                .counter()
                .count()).isEqualTo(1d);

        LegacyEndpointUsageService.LegacyEndpointSnapshot snapshot = usageService.report().endpoints().stream()
                .filter(endpoint -> endpoint.id().equals("notifications-unread-count"))
                .findFirst()
                .orElseThrow();
        assertThat(snapshot.calls()).isEqualTo(1d);
        assertThat(snapshot.lastStatus()).isEqualTo(200);
        assertThat(snapshot.lastClient()).contains("Calendra-Test/1.0");
    }

    @Test
    void supportsClassLevelTrackingForGroupedLegacyApis() throws Exception {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        LegacyEndpointUsageService usageService = new LegacyEndpointUsageService(meterRegistry);
        LegacyEndpointUsageInterceptor interceptor = new LegacyEndpointUsageInterceptor(usageService);
        HandlerMethod handler = new HandlerMethod(new ClassTrackedController(), ClassTrackedController.class.getMethod("previewHandler"));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/guest/preview/session");
        MockHttpServletResponse response = new MockHttpServletResponse();

        interceptor.preHandle(request, response, handler);
        response.setStatus(404);
        interceptor.afterCompletion(request, response, handler, null);

        assertThat(response.getHeader("X-Calendra-Legacy-Endpoint")).isEqualTo("guest-preview-api");
        assertThat(meterRegistry.get(LegacyEndpointUsageService.CALLS_METER)
                .tag("endpoint", "guest-preview-api")
                .tag("outcome", "client_error")
                .counter()
                .count()).isEqualTo(1d);
    }

    static class TestController {
        @TrackLegacyEndpoint(LegacyEndpointDefinition.NOTIFICATIONS_UNREAD_COUNT)
        public void legacyHandler() {
        }
    }

    @TrackLegacyEndpoint(LegacyEndpointDefinition.GUEST_PREVIEW_API)
    static class ClassTrackedController {
        public void previewHandler() {
        }
    }
}
