package com.example.app.files;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

public final class ClientFileUploadPolicy {
    public static final long MAX_FILE_SIZE_BYTES = 50L * 1024L * 1024L;
    public static final long MAX_TOTAL_SIZE_BYTES = 50L * 1024L * 1024L;
    public static final int MAX_ATTACHMENT_COUNT = 10;

    public static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/heic",
            "image/heif",
            "application/pdf",
            "text/plain",
            "text/csv",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    public static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "gif", "webp", "heic", "heif",
            "pdf", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx"
    );

    private ClientFileUploadPolicy() {}

    public static void validateClientFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A file is required.");
        }
        String fileName = sanitizeFileName(file.getOriginalFilename());
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fileName + " is larger than 50 MB.");
        }
        if (!isAllowed(file)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    fileName + " is not a supported file type. Allowed types: images, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT, PPTX.");
        }
    }

    public static void validateInboxAttachments(List<MultipartFile> files) {
        if (files == null || files.isEmpty()) return;
        List<MultipartFile> validFiles = files.stream()
                .filter(Objects::nonNull)
                .filter(file -> !file.isEmpty())
                .toList();
        if (validFiles.isEmpty()) return;
        if (validFiles.size() > MAX_ATTACHMENT_COUNT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can upload up to " + MAX_ATTACHMENT_COUNT + " attachments per message.");
        }
        long totalSize = 0L;
        for (MultipartFile file : validFiles) {
            validateClientFile(file);
            totalSize += Math.max(file.getSize(), 0L);
        }
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The combined attachment size must be 50 MB or smaller.");
        }
    }

    public static boolean isAllowed(MultipartFile file) {
        String contentType = blankToNull(file.getContentType());
        if (contentType != null && ALLOWED_CONTENT_TYPES.contains(contentType.trim().toLowerCase(Locale.ROOT))) {
            return true;
        }
        String extension = fileExtension(file.getOriginalFilename());
        return extension != null && ALLOWED_EXTENSIONS.contains(extension);
    }

    public static String sanitizeFileName(String originalFileName) {
        if (originalFileName == null || originalFileName.isBlank()) return "attachment";
        String normalized = originalFileName.strip().replace('\\', '_').replace('/', '_');
        return normalized.isBlank() ? "attachment" : normalized;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String fileExtension(String fileName) {
        if (fileName == null || fileName.isBlank()) return null;
        String normalized = fileName.strip();
        int dot = normalized.lastIndexOf('.');
        if (dot < 0 || dot == normalized.length() - 1) return null;
        return normalized.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
