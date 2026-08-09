package com.example.app.widget;

import com.example.app.files.StoredS3File;
import com.example.app.files.TenantFileS3Service;
import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/public/widget/location-assets")
public class PublicLocationAssetController {
    private final TenantFileS3Service fileStorage;

    public PublicLocationAssetController(TenantFileS3Service fileStorage) {
        this.fileStorage = fileStorage;
    }

    @GetMapping
    public ResponseEntity<byte[]> asset(@RequestParam("key") String key) {
        String objectKey = normalizeLocationAssetKey(key);
        StoredS3File file = fileStorage.downloadFile(objectKey);
        MediaType mediaType = parseMediaType(file.contentType());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setCacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic().getHeaderValue());
        return new ResponseEntity<>(file.bytes(), headers, HttpStatus.OK);
    }

    private static String normalizeLocationAssetKey(String raw) {
        String key = raw == null ? "" : raw.trim().replaceAll("^/+", "");
        if (key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Asset key is required.");
        }
        if (key.contains("..") || !key.contains("/locations/") || !key.contains("/public-logo/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported asset key.");
        }
        return key;
    }

    private static MediaType parseMediaType(String contentType) {
        try {
            if (contentType != null && !contentType.isBlank()) {
                return MediaType.parseMediaType(contentType);
            }
        } catch (Exception ignored) {
            // Fallback below.
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
