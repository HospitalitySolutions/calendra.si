ALTER TABLE legal_entities
    ADD COLUMN IF NOT EXISTS fiscal_cadastral_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_building_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_building_section_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_house_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_house_number_additional VARCHAR(64);

-- Preserve existing single-company fiscal settings as the initial values for each
-- legal entity assigned to that company. Future edits are stored per legal entity.
UPDATE legal_entities le
SET fiscal_cadastral_number = COALESCE(
        le.fiscal_cadastral_number,
        (
            SELECT NULLIF(TRIM(s.value), '')
            FROM company_legal_entities cle
            JOIN app_settings s
              ON s.company_id = cle.company_id
             AND s.key = 'FISCAL_CADASTRAL_NUMBER'
            WHERE cle.legal_entity_id = le.id
            ORDER BY cle.default_issuer DESC, cle.id
            LIMIT 1
        )
    ),
    fiscal_building_number = COALESCE(
        le.fiscal_building_number,
        (
            SELECT NULLIF(TRIM(s.value), '')
            FROM company_legal_entities cle
            JOIN app_settings s
              ON s.company_id = cle.company_id
             AND s.key = 'FISCAL_BUILDING_NUMBER'
            WHERE cle.legal_entity_id = le.id
            ORDER BY cle.default_issuer DESC, cle.id
            LIMIT 1
        )
    ),
    fiscal_building_section_number = COALESCE(
        le.fiscal_building_section_number,
        (
            SELECT NULLIF(TRIM(s.value), '')
            FROM company_legal_entities cle
            JOIN app_settings s
              ON s.company_id = cle.company_id
             AND s.key = 'FISCAL_BUILDING_SECTION_NUMBER'
            WHERE cle.legal_entity_id = le.id
            ORDER BY cle.default_issuer DESC, cle.id
            LIMIT 1
        )
    ),
    fiscal_house_number = COALESCE(
        le.fiscal_house_number,
        (
            SELECT NULLIF(TRIM(s.value), '')
            FROM company_legal_entities cle
            JOIN app_settings s
              ON s.company_id = cle.company_id
             AND s.key = 'FISCAL_HOUSE_NUMBER'
            WHERE cle.legal_entity_id = le.id
            ORDER BY cle.default_issuer DESC, cle.id
            LIMIT 1
        )
    ),
    fiscal_house_number_additional = COALESCE(
        le.fiscal_house_number_additional,
        (
            SELECT NULLIF(TRIM(s.value), '')
            FROM company_legal_entities cle
            JOIN app_settings s
              ON s.company_id = cle.company_id
             AND s.key = 'FISCAL_HOUSE_NUMBER_ADDITIONAL'
            WHERE cle.legal_entity_id = le.id
            ORDER BY cle.default_issuer DESC, cle.id
            LIMIT 1
        )
    );
