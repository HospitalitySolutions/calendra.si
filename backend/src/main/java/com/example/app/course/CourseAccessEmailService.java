package com.example.app.course;

import com.example.app.guest.model.GuestEntitlement;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.guest.model.GuestProduct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class CourseAccessEmailService {
    private static final Logger log = LoggerFactory.getLogger(CourseAccessEmailService.class);

    private final JavaMailSender mailSender;
    private final String from;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    public CourseAccessEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String from
    ) {
        this.mailSender = mailSender;
        this.from = from;
    }

    public void sendCourseAccessEmail(GuestEntitlement entitlement, String accessUrl) {
        if (mailSender == null || entitlement == null || entitlement.getClient() == null) return;
        String email = entitlement.getClient().getEmail();
        if (email == null || email.isBlank()) return;
        GuestProduct product = entitlement.getProduct();
        String courseName = product == null ? "Course" : product.getName();
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            if (from != null && !from.isBlank()) msg.setFrom(from.trim());
            msg.setTo(email.trim());
            msg.setSubject("Your course is ready: " + courseName);
            msg.setText("Your course is now available in Calendra.\n\n" +
                    courseName + "\n\n" +
                    "Open course: " + accessUrl + "\n\n" +
                    "The same access link is also available through the QR code on your course entitlement card.");
            mailSender.send(msg);
        } catch (Exception ex) {
            log.warn("Failed to send course access email for entitlement {}", entitlement.getId(), ex);
        }
    }
}
