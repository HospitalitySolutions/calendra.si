package com.example.app.location;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.files.TenantFileS3Service;
import com.example.app.user.User;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/locations")
public class LocationPublicLogoController {
    private final LocationRepository locations;
    private final TenantFileS3Service fileStorage;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    public LocationPublicLogoController(LocationRepository locations, TenantFileS3Service fileStorage) {
        this.locations = locations;
        this.fileStorage = fileStorage;
    }

    @PostMapping(value = "/{id}/public-logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public PublicLogoResponse upload(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        Location location = requireLocation(id, me);
        validateImage(file);

        String previousKey = location.getPublicLogoS3Key();
        var stored = fileStorage.uploadLocationPublicLogo(me.getCompany(), location.getId(), file);
        location.setPublicLogoS3Key(stored.objectKey());
        try {
            locations.save(location);
        } catch (RuntimeException ex) {
            fileStorage.deleteQuietly(stored.objectKey());
            throw ex;
        }
        scheduleReplacementCleanup(previousKey, stored.objectKey());
        record(me, location, "Updated location public logo");
        return new PublicLogoResponse(
                location.getId(),
                stored.objectKey(),
                LocationPublicPresentationService.publicLogoPath(stored.objectKey()),
                stored.contentType(),
                stored.sizeBytes()
        );
    }

    @DeleteMapping("/{id}/public-logo")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Location location = requireLocation(id, me);
        String previousKey = location.getPublicLogoS3Key();
        location.setPublicLogoS3Key(null);
        locations.save(location);
        deleteAfterCommit(previousKey);
        record(me, location, "Removed location public logo");
    }

    private void scheduleReplacementCleanup(String previousKey, String newKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            if (previousKey != null && !previousKey.isBlank() && !previousKey.equals(newKey)) {
                fileStorage.deleteQuietly(previousKey);
            }
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                if (previousKey != null && !previousKey.isBlank() && !previousKey.equals(newKey)) {
                    fileStorage.deleteQuietly(previousKey);
                }
            }

            @Override
            public void afterCompletion(int status) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) {
                    fileStorage.deleteQuietly(newKey);
                }
            }
        });
    }

    private void deleteAfterCommit(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            fileStorage.deleteQuietly(objectKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                fileStorage.deleteQuietly(objectKey);
            }
        });
    }

    private Location requireLocation(Long id, User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return locations.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().trim().toLowerCase(Locale.ROOT);
        if (!contentType.equals("image/png")
                && !contentType.equals("image/jpeg")
                && !contentType.equals("image/webp")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only PNG, JPG and WebP images are allowed.");
        }
    }

    private void record(User me, Location location, String summary) {
        if (activityLogs == null || location == null) return;
        activityLogs.recordUser(
                me,
                ActivityModule.CONFIGURATION,
                ActivityAction.LOCATION_UPDATED,
                "LOCATION",
                location.getId(),
                location.getName(),
                summary,
                location.getId(),
                null,
                ActivityDetails.of(
                        "publicLogoS3Key", location.getPublicLogoS3Key(),
                        "targetPath", "/configuration?tab=company&subtab=operatingUnits"
                )
        );
    }

    public record PublicLogoResponse(
            Long locationId,
            String objectKey,
            String publicUrl,
            String contentType,
            long sizeBytes
    ) {}
}
