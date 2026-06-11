package com.example.app.course;

import com.example.app.company.Company;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

@Service
public class BunnyMediaService {
    private static final Logger log = LoggerFactory.getLogger(BunnyMediaService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final BunnyProperties properties;
    private final RestClient restClient;

    public BunnyMediaService(BunnyProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClient = restClientBuilder.build();
    }

    public CourseUploadResult upload(Course course, MultipartFile file) throws IOException {
        if (course.getMediaType() == CourseMediaType.AUDIO) {
            return uploadAudio(course, file);
        }
        return uploadVideo(course, file);
    }

    public DirectVideoUploadSession createDirectVideoUploadSession(Course course, String fileName, String contentType) throws IOException {
        if (course.getMediaType() != CourseMediaType.VIDEO) {
            throw new IllegalArgumentException("Direct Bunny Stream upload sessions are only available for video courses.");
        }
        if (!properties.hasStreamApiKey()) {
            throw new IllegalStateException("Bunny Stream API key is not configured.");
        }

        String libraryId = course.getBunnyLibraryId();
        String libraryName = course.getBunnyLibraryName();
        if (libraryId == null || libraryId.isBlank()) {
            LibraryRef library = ensureTenantVideoLibrary(course.getCompany());
            libraryId = library.id();
            libraryName = library.name();
        }
        if (libraryId == null || libraryId.isBlank()) {
            throw new IllegalStateException("Bunny Stream library could not be created for this tenant.");
        }

        String createUrl = properties.effectiveStreamBaseUrl() + "/library/" + libraryId + "/videos";
        String title = hasText(course.getTitle()) ? course.getTitle() : safeFileName(fileName, "course-video");
        String titleJson = "{\"title\":" + JSON.writeValueAsString(title) + "}";
        JsonNode created = restClient.post()
                .uri(createUrl)
                .header("AccessKey", properties.apiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(titleJson)
                .retrieve()
                .body(JsonNode.class);
        String videoId = created == null ? null : firstText(created, "guid", "videoId", "id");
        if (videoId == null || videoId.isBlank()) {
            throw new IllegalStateException("Bunny Stream did not return a video id.");
        }

        long expiration = Instant.now().plusSeconds(24 * 60 * 60).getEpochSecond();
        String signature = sha256Hex(libraryId + properties.apiKey() + expiration + videoId);
        return new DirectVideoUploadSession(
                "TUS",
                properties.effectiveStreamBaseUrl() + "/tusupload",
                libraryId,
                libraryName,
                videoId,
                signature,
                expiration,
                safeFileName(fileName, "video.mp4"),
                hasText(contentType) ? contentType.trim() : "video/mp4",
                title
        );
    }

    private CourseUploadResult uploadVideo(Course course, MultipartFile file) throws IOException {
        String libraryId = course.getBunnyLibraryId();
        String libraryName = course.getBunnyLibraryName();
        if (libraryId == null || libraryId.isBlank()) {
            LibraryRef library = ensureTenantVideoLibrary(course.getCompany());
            libraryId = library.id();
            libraryName = library.name();
        }
        if (!properties.hasStreamApiKey()) {
            log.warn("Bunny Stream API key is not configured; course {} media was marked for later upload.", course.getId());
            return new CourseUploadResult(libraryId, libraryName, null, null, null, "BUNNY_STREAM_NOT_CONFIGURED");
        }
        String createUrl = properties.effectiveStreamBaseUrl() + "/library/" + libraryId + "/videos";
        String titleJson = "{\"title\":" + JSON.writeValueAsString(course.getTitle()) + "}";
        JsonNode created = restClient.post()
                .uri(createUrl)
                .header("AccessKey", properties.apiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(titleJson)
                .retrieve()
                .body(JsonNode.class);
        String videoId = created == null ? null : firstText(created, "guid", "videoId", "id");
        if (videoId == null || videoId.isBlank()) {
            throw new IllegalStateException("Bunny Stream did not return a video id.");
        }
        String uploadUrl = properties.effectiveStreamBaseUrl() + "/library/" + libraryId + "/videos/" + videoId;
        restClient.put()
                .uri(uploadUrl)
                .header("AccessKey", properties.apiKey())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(file.getBytes())
                .retrieve()
                .toBodilessEntity();
        return new CourseUploadResult(libraryId, libraryName, videoId, null, null, "UPLOADED_TO_BUNNY_STREAM");
    }

    private CourseUploadResult uploadAudio(Course course, MultipartFile file) throws IOException {
        if (!properties.hasAudioStorage()) {
            log.warn("Bunny Storage is not configured; course {} audio was marked for later upload.", course.getId());
            return new CourseUploadResult(course.getBunnyLibraryId(), course.getBunnyLibraryName(), null, null, null, "BUNNY_STORAGE_NOT_CONFIGURED");
        }
        String safeFile = safeFileName(file.getOriginalFilename(), "audio.bin");
        String tenantFolder = "tenant-" + course.getCompany().getId();
        String path = tenantFolder + "/courses/" + course.getId() + "/" + safeFile;
        String url = properties.effectiveStorageRegionHost() + "/" + properties.storageZone().trim() + "/" + path;
        restClient.put()
                .uri(url)
                .header("AccessKey", properties.storagePassword())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(file.getBytes())
                .retrieve()
                .toBodilessEntity();
        String cdnUrl = null;
        if (properties.audioCdnHost() != null && !properties.audioCdnHost().trim().isBlank()) {
            String host = properties.audioCdnHost().trim();
            while (host.endsWith("/")) host = host.substring(0, host.length() - 1);
            cdnUrl = host + "/" + path;
        }
        return new CourseUploadResult(null, null, null, path, cdnUrl, "UPLOADED_TO_BUNNY_STORAGE");
    }

    private LibraryRef ensureTenantVideoLibrary(Company company) {
        String libraryName = "Calendra tenant " + company.getId() + " - " + safeLibraryName(company.getName());
        if (!properties.hasStreamApiKey()) {
            return new LibraryRef(null, libraryName);
        }
        try {
            JsonNode libraries = restClient.get()
                    .uri(properties.effectiveStreamBaseUrl() + "/library")
                    .header("AccessKey", properties.apiKey())
                    .retrieve()
                    .body(JsonNode.class);
            if (libraries != null && libraries.isArray()) {
                for (JsonNode item : libraries) {
                    String name = firstText(item, "name", "Name");
                    if (libraryName.equals(name)) {
                        String id = firstText(item, "id", "Id", "libraryId");
                        if (id != null && !id.isBlank()) return new LibraryRef(id, libraryName);
                    }
                }
            }
            JsonNode created = restClient.post()
                    .uri(properties.effectiveStreamBaseUrl() + "/library")
                    .header("AccessKey", properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"Name\":" + JSON.writeValueAsString(libraryName) + "}")
                    .retrieve()
                    .body(JsonNode.class);
            String id = created == null ? null : firstText(created, "id", "Id", "libraryId");
            return new LibraryRef(id, libraryName);
        } catch (Exception ex) {
            log.warn("Could not create/find Bunny Stream library for tenant {}. Upload can be retried after Bunny configuration is fixed.", company.getId(), ex);
            return new LibraryRef(null, libraryName);
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isBlank();
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }

    private static String safeLibraryName(String raw) {
        String value = raw == null ? "Tenant" : raw.trim();
        if (value.isBlank()) value = "Tenant";
        return value.length() > 80 ? value.substring(0, 80) : value;
    }

    private static String safeFileName(String raw, String fallback) {
        String value = raw == null || raw.isBlank() ? fallback : raw.trim();
        value = value.replaceAll("[^A-Za-z0-9._-]", "-");
        while (value.contains("--")) value = value.replace("--", "-");
        return value.toLowerCase(Locale.ROOT);
    }

    private static String firstText(JsonNode node, String... names) {
        if (node == null || names == null) return null;
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull()) {
                String text = value.asText(null);
                if (text != null && !text.isBlank()) return text;
            }
        }
        return null;
    }

    private record LibraryRef(String id, String name) {}

    public record CourseUploadResult(
            String bunnyLibraryId,
            String bunnyLibraryName,
            String bunnyVideoId,
            String bunnyStoragePath,
            String bunnyCdnUrl,
            String uploadStatus
    ) {}

    public record DirectVideoUploadSession(
            String uploadType,
            String uploadUrl,
            String bunnyLibraryId,
            String bunnyLibraryName,
            String bunnyVideoId,
            String authorizationSignature,
            long authorizationExpire,
            String fileName,
            String contentType,
            String title
    ) {}
}
