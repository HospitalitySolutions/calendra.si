package com.example.app.files;

import java.time.Instant;

public record StoredFileResponse(
        Long id,
        String fileName,
        String contentType,
        long sizeBytes,
        Instant uploadedAt
) {
    public static StoredFileResponse from(ClientFile file) {
        return new StoredFileResponse(
                file.getId(),
                file.getOriginalFileName(),
                file.getContentType(),
                file.getSizeBytes(),
                file.getCreatedAt());
    }

    public static StoredFileResponse from(CompanyFile file) {
        return new StoredFileResponse(
                file.getId(),
                file.getOriginalFileName(),
                file.getContentType(),
                file.getSizeBytes(),
                file.getCreatedAt());
    }
}
