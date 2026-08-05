package com.example.app.workspacehardening;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class WorkspaceRolloutInterceptorTest {
    @Test
    void allowsEnabledWorkspaceFeatures() throws Exception {
        WorkspaceRolloutProperties properties = new WorkspaceRolloutProperties();
        WorkspaceRolloutInterceptor interceptor = new WorkspaceRolloutInterceptor(properties);
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(
                request("GET", "/api/analytics/workspace/overview"), response, new Object())).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void hidesDisabledPublicWorkspaceBookingRoutes() throws Exception {
        WorkspaceRolloutProperties properties = new WorkspaceRolloutProperties();
        properties.setWorkspacePublicBooking(false);
        WorkspaceRolloutInterceptor interceptor = new WorkspaceRolloutInterceptor(properties);
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(
                request("GET", "/api/public/widget/workspaces/demo/config"), response, new Object())).isFalse();
        assertThat(response.getStatus()).isEqualTo(404);
        assertThat(response.getContentAsString()).contains("not found");
    }

    @Test
    void returnsForbiddenForDisabledAuthenticatedWorkspaceFeature() throws Exception {
        WorkspaceRolloutProperties properties = new WorkspaceRolloutProperties();
        properties.setWorkspaceAnalytics(false);
        WorkspaceRolloutInterceptor interceptor = new WorkspaceRolloutInterceptor(properties);
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(
                request("GET", "/api/analytics/workspace/overview"), response, new Object())).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void neverBlocksCorsPreflight() throws Exception {
        WorkspaceRolloutProperties properties = new WorkspaceRolloutProperties();
        properties.setSharedClients(false);
        WorkspaceRolloutInterceptor interceptor = new WorkspaceRolloutInterceptor(properties);

        assertThat(interceptor.preHandle(
                request("OPTIONS", "/api/workspace-clients/search"), new MockHttpServletResponse(), new Object())).isTrue();
    }

    @Test
    void mapsOnlyWorkspaceSpecificRoutes() {
        assertThat(WorkspaceRolloutInterceptor.featureForPath("/api/bookings/calendar/workspace"))
                .isEqualTo(WorkspaceRolloutFeature.CONSOLIDATED_SCHEDULING);
        assertThat(WorkspaceRolloutInterceptor.featureForPath("/api/bookings/calendar"))
                .isNull();
        assertThat(WorkspaceRolloutInterceptor.featureForPath("/api/billing/workspace-bills"))
                .isEqualTo(WorkspaceRolloutFeature.CONSOLIDATED_BILLING);
        assertThat(WorkspaceRolloutInterceptor.featureForPath("/api/billing/issuers"))
                .isNull();
        assertThat(WorkspaceRolloutInterceptor.featureForPath("/book/demo-workspace"))
                .isEqualTo(WorkspaceRolloutFeature.WORKSPACE_PUBLIC_BOOKING);
        assertThat(WorkspaceRolloutInterceptor.featureForPath("/widget/workspace/demo-workspace"))
                .isEqualTo(WorkspaceRolloutFeature.WORKSPACE_PUBLIC_BOOKING);
    }

    private MockHttpServletRequest request(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRequestURI(path);
        return request;
    }
}
