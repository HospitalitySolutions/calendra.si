package com.example.app.company;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class Company extends BaseEntity {
    @Column(nullable = false)
    private String name;

    @Column(name = "tenant_code", unique = true, length = 64)
    private String tenantCode;
}