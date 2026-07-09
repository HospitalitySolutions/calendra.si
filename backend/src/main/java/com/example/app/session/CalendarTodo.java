package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** ToDo task: a single-point-in-time task, not a booked session. Displayed at end of day as a list. */
@Getter
@Setter
@JsonIgnoreProperties({"passwordHash", "preferredSlots", "assignedTo", "spaces", "types", "consultant", "company", "visibleUsers"})
@Entity
@Table(name = "calendar_todos")
public class CalendarTodo extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    private User owner;

    @Column(nullable = false)
    private LocalDateTime startTime;

    /** Display name shown on the calendar. */
    @Column(nullable = false, length = 200)
    private String task;

    @Column(length = 1000)
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility_scope", nullable = false, length = 20)
    private TodoVisibilityScope visibilityScope = TodoVisibilityScope.SELECTED;

    @ManyToMany
    @JoinTable(name = "calendar_todo_visible_users",
            joinColumns = @JoinColumn(name = "todo_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    private Set<User> visibleUsers = new HashSet<>();
}
