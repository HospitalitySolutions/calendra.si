package com.example.app.company;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class Company extends BaseEntity {
    /** Prefix for codes assigned before DB id exists; replaced by {@link TenantCodeService#assignIfMissing(Long)}. */
    public static final String TENANT_CODE_PROVISIONAL_PREFIX = "__TC_PENDING_";

    @Column(nullable = false)
    private String name;

    @Column(name = "tenant_code", nullable = false, unique = true, length = 64)
    private String tenantCode;

    @PrePersist
    void assignProvisionalTenantCode() {
        if (tenantCode == null || tenantCode.isBlank()) {
            tenantCode = TENANT_CODE_PROVISIONAL_PREFIX + UUID.randomUUID().toString().replace("-", "");
        }
    }
}

