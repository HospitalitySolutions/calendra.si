package com.example.app.location;

import com.example.app.google.geocoding.GoogleGeocodingProperties;
import java.util.List;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Backfills existing public locations and refreshes cached coordinates before expiry. */
@Service
public class LocationGeocodingMaintenanceService {
    private static final Logger log = LoggerFactory.getLogger(LocationGeocodingMaintenanceService.class);

    private final LocationRepository locations;
    private final LocationGeocodingService geocoding;
    private final GoogleGeocodingProperties properties;

    public LocationGeocodingMaintenanceService(
            LocationRepository locations,
            LocationGeocodingService geocoding,
            GoogleGeocodingProperties properties
    ) {
        this.locations = locations;
        this.geocoding = geocoding;
        this.properties = properties;
    }

    @Scheduled(
            initialDelayString = "${app.google-geocoding.maintenance-initial-delay-ms:15000}",
            fixedDelayString = "${app.google-geocoding.maintenance-fixed-delay-ms:86400000}"
    )
    @SchedulerLock(name = "locationGeocodingMaintenance_refreshPublicLocations", lockAtMostFor = "PT15M", lockAtLeastFor = "PT30S")
    public void refreshPublicLocations() {
        if (!properties.isConfigured()) return;
        List<Location> candidates = locations.findAllByActiveTrueAndPublicDirectoryEnabledTrueOrderByCompanyIdAscNameAscIdAsc();
        int limit = Math.min(candidates.size(), properties.effectiveMaintenanceBatchSize());
        int changed = 0;
        for (int i = 0; i < limit; i++) {
            Location location = candidates.get(i);
            if (geocoding.refreshIfRequired(location)) {
                locations.save(location);
                changed++;
            }
        }
        if (changed > 0) {
            log.info("Location geocoding maintenance refreshed/checked {} public locations.", changed);
        }
    }
}
