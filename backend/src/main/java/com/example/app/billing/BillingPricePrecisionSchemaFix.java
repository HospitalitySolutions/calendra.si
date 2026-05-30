package com.example.app.billing;

import jakarta.annotation.PostConstruct;
import java.sql.Connection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Keeps gross-first billing stable.
 *
 * Gross is the user-entered source of truth. Net prices are kept at 4 decimals
 * only as derived taxable-base values, and open-bill rows store their own gross
 * unit price so Billing does not need to recalculate gross from net.
 */
@Component
public class BillingPricePrecisionSchemaFix {
    private static final Logger log = LoggerFactory.getLogger(BillingPricePrecisionSchemaFix.class);

    private final JdbcTemplate jdbc;

    public BillingPricePrecisionSchemaFix(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void ensureGrossFirstBillingColumns() {
        if (!isPostgres()) {
            return;
        }
        try {
            jdbc.execute("ALTER TABLE IF EXISTS open_bill_items ALTER COLUMN net_price TYPE NUMERIC(12,4)");
            jdbc.execute("ALTER TABLE IF EXISTS bill_item ALTER COLUMN net_price TYPE NUMERIC(12,4)");
            jdbc.execute("ALTER TABLE IF EXISTS open_bill_items ADD COLUMN IF NOT EXISTS unit_gross_price NUMERIC(12,2)");
            jdbc.execute("""
                    UPDATE open_bill_items obi
                    SET unit_gross_price = ROUND((COALESCE(
                        CASE
                            -- Existing rows may have already lost precision (e.g. 36.8852 -> 36.89),
                            -- so when the rounded row matches the configured service price, backfill from
                            -- the higher-precision transaction-service net price to preserve the original gross.
                            WHEN ROUND(COALESCE(obi.net_price, 0), 2) = ROUND(COALESCE(ts.net_price, 0), 2)
                                THEN ts.net_price
                            ELSE obi.net_price
                        END,
                        0
                    ) *
                        CASE ts.tax_rate
                            WHEN 'VAT_22' THEN 1.22
                            WHEN 'VAT_9_5' THEN 1.095
                            ELSE 1
                        END)::numeric, 2)
                    FROM transaction_service ts
                    WHERE obi.transaction_service_id = ts.id
                      AND obi.unit_gross_price IS NULL
                    """);
            log.info("Ensured gross-first billing columns are available.");
        } catch (Exception ex) {
            log.warn("Could not prepare gross-first billing columns; Billing prices may round incorrectly until the schema is updated.", ex);
        }
    }

    private boolean isPostgres() {
        try {
            return Boolean.TRUE.equals(jdbc.execute((Connection connection) -> {
                String product = connection.getMetaData().getDatabaseProductName();
                return product != null && product.toLowerCase().contains("postgres");
            }));
        } catch (Exception ex) {
            log.warn("Could not detect database product for billing line precision check.", ex);
            return false;
        }
    }
}
