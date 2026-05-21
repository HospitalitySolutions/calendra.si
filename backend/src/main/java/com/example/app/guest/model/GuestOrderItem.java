package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.session.SessionType;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_order_items")
public class GuestOrderItem extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private GuestOrder order;

    @ManyToOne(optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private GuestProduct product;

    @ManyToOne
    @JoinColumn(name = "session_type_id")
    private SessionType sessionType;

    @Column(nullable = false)
    private int quantity = 1;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPriceGross;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal lineTotalGross;

    @Column(columnDefinition = "TEXT")
    private String metadataJson;
}
