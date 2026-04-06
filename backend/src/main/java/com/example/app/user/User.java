package com.example.app.user;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import com.example.app.session.Space;
import com.example.app.session.SessionType;
import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Getter
@Setter
@Entity
@Table(
        name = "users",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "email" })
)
public class User extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false)
    private String email;

    @JsonIgnore
    @Column(nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean consultant = false;

    @ManyToMany
    @JoinTable(name = "user_spaces",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "space_id"))
    private Set<Space> spaces = new HashSet<>();

    @ManyToMany
    @JoinTable(name = "user_types",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "type_id"))
    private Set<SessionType> types = new HashSet<>();

    /** Optional VAT identifier for billing integrations. */
    @Column(length = 64)
    private String vatId;

    /** Optional consultant phone number shown in the UI and reused for WhatsApp sender metadata. */
    @Column(length = 64)
    private String phone;

    /** Legacy consultant-specific WhatsApp sender label/number. Kept for compatibility. */
    @Column(length = 64)
    private String whatsappSenderNumber;

    /** Legacy consultant-specific Meta WhatsApp Cloud API phone number ID override. Kept for compatibility. */
    @Column(length = 128)
    private String whatsappPhoneNumberId;

    /** JSON: sameForAllDays, allDays {start,end}, byDay per weekday — see frontend WorkingHoursConfig. */
    @Column(columnDefinition = "TEXT")
    private String workingHoursJson;
}
