package com.example.app.guest.auth;

import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

public final class GuestProfilePictureUploadPolicy {
    public static final long MAX_BYTES = 5L * 1024L * 1024L;

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/heic",
            "image/heif");

    private GuestProfilePictureUploadPolicy() {}

    public static void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A profile picture file is required.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Profile picture must be 5 MB or smaller.");
        }
        String contentType = normalizeContentType(file.getContentType());
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported image type. Use JPEG, PNG, WebP, GIF, or HEIC.");
        }
    }

    private static String normalizeContentType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim().toLowerCase(Locale.ROOT);
        int semi = trimmed.indexOf(';');
        if (semi >= 0) {
            trimmed = trimmed.substring(0, semi).trim();
        }
        return trimmed.isBlank() ? null : trimmed;
    }
}
