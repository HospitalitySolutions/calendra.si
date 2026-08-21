-- Public directory category is location-specific and uses the same canonical values
-- as Upravljanje računa -> Podjetje -> Tip podjetja.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_business_type VARCHAR(64);

-- Preserve current behaviour for existing locations by copying the tenant-level type
-- into each location once. Legacy values are normalized to the current canonical ids.
UPDATE locations l
SET public_business_type = CASE lower(replace(replace(btrim(COALESCE(
        NULLIF(l.public_business_type, ''),
        (
            SELECT s.value
            FROM app_settings s
            WHERE s.company_id = l.company_id
              AND s.key = 'MODULE_CONFIG_TYPE'
            ORDER BY s.id DESC
            LIMIT 1
        ),
        'hair_salon'
    )), '-', '_'), ' ', '_'))
    WHEN 'salon' THEN 'hair_salon'
    WHEN 'gym' THEN 'fitness_personal_training'
    WHEN 'therapy' THEN 'psychology_counselling'
    WHEN 'spa' THEN 'spa_sauna'
    WHEN 'personal_training' THEN 'fitness_personal_training'
    WHEN 'hair_salon' THEN 'hair_salon'
    WHEN 'beauty_salon' THEN 'beauty_salon'
    WHEN 'massage' THEN 'massage'
    WHEN 'spa_sauna' THEN 'spa_sauna'
    WHEN 'tattooing_piercing' THEN 'tattooing_piercing'
    WHEN 'fitness_personal_training' THEN 'fitness_personal_training'
    WHEN 'physical_therapy' THEN 'physical_therapy'
    WHEN 'psychology_counselling' THEN 'psychology_counselling'
    WHEN 'yoga_pilates' THEN 'yoga_pilates'
    WHEN 'pet_services' THEN 'pet_services'
    WHEN 'education_coaching' THEN 'education_coaching'
    WHEN 'other' THEN 'other'
    ELSE 'hair_salon'
END;

ALTER TABLE locations
    DROP CONSTRAINT IF EXISTS chk_locations_public_business_type;
ALTER TABLE locations
    ADD CONSTRAINT chk_locations_public_business_type CHECK (
        public_business_type IS NULL OR public_business_type IN (
            'hair_salon',
            'beauty_salon',
            'massage',
            'spa_sauna',
            'tattooing_piercing',
            'fitness_personal_training',
            'physical_therapy',
            'psychology_counselling',
            'yoga_pilates',
            'pet_services',
            'education_coaching',
            'other'
        )
    );
