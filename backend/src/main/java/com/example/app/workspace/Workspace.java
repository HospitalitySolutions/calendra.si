package com.example.app.workspace;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "workspaces")
public class Workspace extends BaseEntity {
    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private boolean active = true;
}
