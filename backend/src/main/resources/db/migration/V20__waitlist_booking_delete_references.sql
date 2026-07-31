-- Ensure every canonical waitlist reference to session_booking is nullable on delete.
-- Older production databases may still have the original NO ACTION constraints,
-- which prevents deleting a booking that originated from the waitlist.
DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT ns.nspname AS schema_name,
               tbl.relname AS table_name,
               con.conname AS constraint_name
          FROM pg_constraint con
          JOIN pg_class tbl ON tbl.oid = con.conrelid
          JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
          JOIN pg_attribute attr
            ON attr.attrelid = tbl.oid
           AND attr.attnum = ANY (con.conkey)
         WHERE con.contype = 'f'
           AND ns.nspname = current_schema()
           AND con.confrelid = 'session_booking'::regclass
           AND (
                (tbl.relname = 'waitlist_requests' AND attr.attname IN ('target_session_id', 'booked_booking_id'))
             OR (tbl.relname = 'waitlist_offers' AND attr.attname = 'session_id')
             OR (tbl.relname = 'waitlist_booking_holds' AND attr.attname = 'session_id')
           )
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I',
            fk.schema_name,
            fk.table_name,
            fk.constraint_name
        );
    END LOOP;
END $$;

ALTER TABLE waitlist_requests
    ADD CONSTRAINT fk_waitlist_requests_target_session
        FOREIGN KEY (target_session_id) REFERENCES session_booking(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_waitlist_requests_booked_booking
        FOREIGN KEY (booked_booking_id) REFERENCES session_booking(id) ON DELETE SET NULL;

ALTER TABLE waitlist_offers
    ADD CONSTRAINT fk_waitlist_offers_session
        FOREIGN KEY (session_id) REFERENCES session_booking(id) ON DELETE SET NULL;

ALTER TABLE waitlist_booking_holds
    ADD CONSTRAINT fk_waitlist_booking_holds_session
        FOREIGN KEY (session_id) REFERENCES session_booking(id) ON DELETE SET NULL;
