-- Preserve an explicit appointment-level override even when the user intentionally
-- removes every consumable row. Without this marker a later unrelated appointment
-- edit would recreate service defaults because an empty list was indistinguishable
-- from "defaults have not been materialized yet".
ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS session_consumables_overridden BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing manually-edited session rows already imply an appointment-level override.
UPDATE session_booking b
SET session_consumables_overridden = TRUE
WHERE EXISTS (
    SELECT 1
    FROM session_consumable sc
    WHERE sc.company_id = b.company_id
      AND sc.booking_group_key = b.booking_group_key
      AND sc.manually_changed = TRUE
);

-- SessionConsumable.quantity is the configured/base quantity. For PER_PARTICIPANT
-- rows the effective stock usage is quantity * active participant count at checkout.
-- Earlier versions stored the already-multiplied total in session_consumable.quantity.
-- Normalize existing rows once so the new reconciliation remains idempotent and does
-- not create corrective stock movements solely because of this representation change.
WITH participant_counts AS (
    SELECT
        company_id,
        booking_group_key,
        GREATEST(
            COUNT(*) FILTER (
                WHERE client_id IS NOT NULL
                  AND UPPER(COALESCE(booking_status, 'RESERVED')) <> 'CANCELLED'
            ),
            1
        )::NUMERIC AS participant_count
    FROM session_booking
    WHERE booking_group_key IS NOT NULL
    GROUP BY company_id, booking_group_key
)
UPDATE session_consumable sc
SET quantity = ROUND(sc.quantity / pc.participant_count, 4),
    updated_at = CURRENT_TIMESTAMP
FROM participant_counts pc
WHERE sc.company_id = pc.company_id
  AND sc.booking_group_key = pc.booking_group_key
  AND sc.quantity_mode = 'PER_PARTICIPANT'
  AND pc.participant_count > 1;
