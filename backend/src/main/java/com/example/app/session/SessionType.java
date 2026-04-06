package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "session_type",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "name" })
)
public class SessionType extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String name;
    private String description;

    /**
     * How long a booked session of this type should be (minutes).
     * If missing/older rows, treat as 60 minutes at the API layer.
     */
    @Column
    private Integer durationMinutes;

    /**
     * Optional cool-down / cleanup time after the session (minutes).
     * This time stays unavailable for new bookings but is rendered separately from the booked block.
     */
    @Column
    private Integer breakMinutes;

    @OneToMany(mappedBy = "sessionType", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TypeTransactionService> linkedServices = new ArrayList<>();
}
