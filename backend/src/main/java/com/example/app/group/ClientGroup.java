package com.example.app.group;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.ClientCompany;
import com.example.app.company.Company;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "client_groups")
public class ClientGroup extends BaseEntity {

    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String name;

    private String email;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean batchPaymentEnabled = false;

    @Column(nullable = false)
    private boolean individualPaymentEnabled = false;

    @ManyToOne
    @JoinColumn(name = "billing_company_id")
    private ClientCompany billingCompany;

    @ManyToMany
    @JoinTable(
            name = "client_group_members",
            joinColumns = @JoinColumn(name = "group_id"),
            inverseJoinColumns = @JoinColumn(name = "client_id")
    )
    private List<Client> members = new ArrayList<>();
}
