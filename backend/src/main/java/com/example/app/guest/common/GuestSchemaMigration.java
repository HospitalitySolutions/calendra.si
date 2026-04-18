package com.example.app.guest.common;

import jakarta.annotation.PostConstruct;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class GuestSchemaMigration {
    private static final Logger log = LoggerFactory.getLogger(GuestSchemaMigration.class);
    private final JdbcTemplate jdbc;

    public GuestSchemaMigration(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @PostConstruct
    public void migrate() {
        try {
            jdbc.execute("ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS guest_enabled BOOLEAN");
            jdbc.execute("UPDATE payment_methods SET guest_enabled = false WHERE guest_enabled IS NULL");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN guest_enabled SET DEFAULT false");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN guest_enabled SET NOT NULL");

            jdbc.execute("ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS guest_display_order INTEGER");
            jdbc.execute("UPDATE payment_methods SET guest_display_order = 0 WHERE guest_display_order IS NULL");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN guest_display_order SET DEFAULT 0");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN guest_display_order SET NOT NULL");

            jdbc.execute("ALTER TABLE session_type ADD COLUMN IF NOT EXISTS guest_booking_enabled BOOLEAN");
            jdbc.execute("UPDATE session_type SET guest_booking_enabled = true WHERE guest_booking_enabled IS NULL");
            jdbc.execute("ALTER TABLE session_type ALTER COLUMN guest_booking_enabled SET DEFAULT true");
            jdbc.execute("ALTER TABLE session_type ALTER COLUMN guest_booking_enabled SET NOT NULL");
            jdbc.execute("ALTER TABLE session_type ADD COLUMN IF NOT EXISTS guest_booking_description TEXT");
            jdbc.execute("ALTER TABLE session_type ADD COLUMN IF NOT EXISTS guest_sort_order INTEGER");
            jdbc.execute("UPDATE session_type SET guest_sort_order = 0 WHERE guest_sort_order IS NULL");
            jdbc.execute("ALTER TABLE session_type ALTER COLUMN guest_sort_order SET DEFAULT 0");
            jdbc.execute("ALTER TABLE session_type ALTER COLUMN guest_sort_order SET NOT NULL");

            jdbc.execute("ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS booking_status VARCHAR(32)");
            jdbc.execute("UPDATE session_booking SET booking_status = 'CONFIRMED' WHERE booking_status IS NULL");
            jdbc.execute("ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS source_channel VARCHAR(32)");
            jdbc.execute("UPDATE session_booking SET source_channel = 'STAFF' WHERE source_channel IS NULL");
            jdbc.execute("ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS source_order_id VARCHAR(64)");
            jdbc.execute("ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS guest_user_id VARCHAR(64)");
        } catch (Exception ex) {
            log.warn("Guest schema migration skipped/failed: {}", ex.getMessage());
        }
    }
}
