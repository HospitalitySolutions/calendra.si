package com.example.app.workspacehardening;

import java.util.EnumSet;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.workspace-rollout")
public class WorkspaceRolloutProperties {
    private boolean sharedClients = true;
    private boolean consolidatedScheduling = true;
    private boolean consolidatedBilling = true;
    private boolean sharedServices = true;
    private boolean workspaceAnalytics = true;
    private boolean workspacePublicBooking = true;
    private boolean workspaceUnitManagement = true;
    private boolean integrityHealthEnabled = false;

    public boolean isEnabled(WorkspaceRolloutFeature feature) {
        if (feature == null) return true;
        return switch (feature) {
            case SHARED_CLIENTS -> sharedClients;
            case CONSOLIDATED_SCHEDULING -> consolidatedScheduling;
            case CONSOLIDATED_BILLING -> consolidatedBilling;
            case SHARED_SERVICES -> sharedServices;
            case WORKSPACE_ANALYTICS -> workspaceAnalytics;
            case WORKSPACE_PUBLIC_BOOKING -> workspacePublicBooking;
            case WORKSPACE_UNIT_MANAGEMENT -> workspaceUnitManagement;
        };
    }

    public List<String> enabledFeatureKeys() {
        return EnumSet.allOf(WorkspaceRolloutFeature.class).stream()
                .filter(this::isEnabled)
                .map(Enum::name)
                .toList();
    }

    public static List<String> allFeatureKeys() {
        return EnumSet.allOf(WorkspaceRolloutFeature.class).stream().map(Enum::name).toList();
    }

    public boolean isSharedClients() { return sharedClients; }
    public void setSharedClients(boolean sharedClients) { this.sharedClients = sharedClients; }
    public boolean isConsolidatedScheduling() { return consolidatedScheduling; }
    public void setConsolidatedScheduling(boolean consolidatedScheduling) { this.consolidatedScheduling = consolidatedScheduling; }
    public boolean isConsolidatedBilling() { return consolidatedBilling; }
    public void setConsolidatedBilling(boolean consolidatedBilling) { this.consolidatedBilling = consolidatedBilling; }
    public boolean isSharedServices() { return sharedServices; }
    public void setSharedServices(boolean sharedServices) { this.sharedServices = sharedServices; }
    public boolean isWorkspaceAnalytics() { return workspaceAnalytics; }
    public void setWorkspaceAnalytics(boolean workspaceAnalytics) { this.workspaceAnalytics = workspaceAnalytics; }
    public boolean isWorkspacePublicBooking() { return workspacePublicBooking; }
    public void setWorkspacePublicBooking(boolean workspacePublicBooking) { this.workspacePublicBooking = workspacePublicBooking; }
    public boolean isWorkspaceUnitManagement() { return workspaceUnitManagement; }
    public void setWorkspaceUnitManagement(boolean workspaceUnitManagement) { this.workspaceUnitManagement = workspaceUnitManagement; }
    public boolean isIntegrityHealthEnabled() { return integrityHealthEnabled; }
    public void setIntegrityHealthEnabled(boolean integrityHealthEnabled) { this.integrityHealthEnabled = integrityHealthEnabled; }
}
