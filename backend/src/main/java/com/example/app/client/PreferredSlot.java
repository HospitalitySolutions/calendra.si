package com.example.app.client;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.ManyToOne;
import java.time.DayOfWeek;
import java.time.LocalTime;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Getter
@Setter
@JsonIgnoreProperties({"passwordHash", "preferredSlots", "assignedTo", "spaces", "types", "consultant", "client", "bill", "items"})
@Entity
public class PreferredSlot extends BaseEntity {
    @ManyToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Client client;

    @Enumerated(EnumType.STRING)
    private DayOfWeek dayOfWeek;

    private LocalTime startTime;
    private LocalTime endTime;
}
