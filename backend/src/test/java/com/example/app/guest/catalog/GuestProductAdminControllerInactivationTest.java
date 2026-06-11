package com.example.app.guest.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.course.CourseRepository;
import com.example.app.course.MembershipCourseRepository;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrderItemRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.ProductType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class GuestProductAdminControllerInactivationTest {

    @Mock private GuestProductRepository products;
    @Mock private SessionTypeRepository sessionTypes;
    @Mock private TransactionServiceRepository transactionServices;
    @Mock private GuestOrderItemRepository orderItems;
    @Mock private GuestEntitlementRepository entitlements;
    @Mock private CourseRepository courses;
    @Mock private MembershipCourseRepository membershipCourses;

    private GuestProductAdminController controller;
    private User me;
    private GuestProduct existing;

    @BeforeEach
    void setUp() {
        controller = new GuestProductAdminController(products, sessionTypes, transactionServices, orderItems, entitlements, courses, membershipCourses);

        Company company = new Company();
        company.setId(1L);

        me = new User();
        me.setCompany(company);

        existing = new GuestProduct();
        existing.setId(5L);
        existing.setCompany(company);
        existing.setName("Starter membership");
        existing.setProductType(ProductType.MEMBERSHIP);
        existing.setPriceGross(new BigDecimal("49.99"));
        existing.setCurrency("EUR");
        existing.setActive(true);
        existing.setGuestVisible(true);
        existing.setBookable(false);
    }

    @Test
    void update_blocksInactivationWhenEntitlementsExist() {
        when(products.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(existing));
        when(entitlements.countByProductId(5L)).thenReturn(1L);

        var req = new GuestProductAdminController.ProductAdminRequest(
                "Starter membership",
                null,
                null,
                "MEMBERSHIP",
                new BigDecimal("49.99"),
                "EUR",
                false,
                true,
                false,
                null,
                null,
                false,
                0,
                null,
                null,
                java.util.List.of()
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.update(5L, req, me));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void update_allowsInactivationWhenNoEntitlementsExist() {
        when(products.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(existing));
        when(entitlements.countByProductId(5L)).thenReturn(0L);
        when(products.save(any(GuestProduct.class))).thenAnswer(inv -> inv.getArgument(0));

        var req = new GuestProductAdminController.ProductAdminRequest(
                "Starter membership",
                null,
                null,
                "MEMBERSHIP",
                new BigDecimal("49.99"),
                "EUR",
                false,
                true,
                false,
                null,
                null,
                false,
                0,
                null,
                null,
                java.util.List.of()
        );

        var updated = controller.update(5L, req, me);
        assertFalse(updated.active());
    }
}
