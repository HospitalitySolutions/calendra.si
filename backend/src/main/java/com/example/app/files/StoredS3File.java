package com.example.app.files;

public record StoredS3File(
        String objectKey,
        String contentType,
        long sizeBytes,
        byte[] bytes
) {}
