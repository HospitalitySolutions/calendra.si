package com.example.app.workspacebooking;

import com.example.app.common.BaseEntity;
import com.example.app.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "workspace_public_booking_settings")
public class WorkspacePublicBookingSettings extends BaseEntity {
    @OneToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false, unique = true)
    private Workspace workspace;

    @Column(nullable = false, length = 80)
    private String slug;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "location_selection_mode", nullable = false, length = 24)
    private String locationSelectionMode = "LOCATION_FIRST";

    @Column(name = "allow_any_location", nullable = false)
    private boolean allowAnyLocation = true;

    @Column(name = "show_prices", nullable = false)
    private boolean showPrices = true;

    @Column(name = "allow_employee_selection", nullable = false)
    private boolean allowEmployeeSelection = true;

    @Column(name = "default_language", nullable = false, length = 8)
    private String defaultLanguage = "sl";

    @Column(name = "primary_color", length = 20)
    private String primaryColor;

    @Column(name = "logo_url", length = 512)
    private String logoUrl;

    @Column(name = "page_title", length = 180)
    private String pageTitle;

    @Column(columnDefinition = "TEXT")
    private String introduction;

    @Column(name = "confirmation_text", columnDefinition = "TEXT")
    private String confirmationText;

    @Column(name = "privacy_url", length = 512)
    private String privacyUrl;

    @Column(name = "terms_url", length = 512)
    private String termsUrl;
}
