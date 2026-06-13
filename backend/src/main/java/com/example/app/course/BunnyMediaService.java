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
import org.springframework.web.client.RestClientResponseException;
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


    public void deleteCourseMedia(Course course) {
        if (course == null) return;
        deleteVideoMedia(course.getBunnyLibraryId(), course.getBunnyLibraryName(), course.getBunnyVideoId());
        deleteAudioMedia(course.getBunnyStoragePath());
    }

    public void deleteUploadedMedia(CourseUploadResult result) {
        if (result == null) return;
        deleteVideoMedia(result.bunnyLibraryId(), result.bunnyLibraryName(), result.bunnyVideoId());
        deleteAudioMedia(result.bunnyStoragePath());
    }

    public void deleteVideoMedia(String libraryId, String libraryName, String videoId) {
        if (!hasText(videoId)) return;
        if (!hasText(libraryId)) {
            throw new IllegalStateException("Bunny Stream library id is missing; video cannot be deleted.");
        }
        deleteVideo(libraryId, libraryName, videoId);
    }

    public void deleteAudioMedia(String storagePath) {
        if (!hasText(storagePath)) return;
        deleteAudio(storagePath);
    }

    private void deleteVideo(String libraryId, String libraryName, String videoId) {
        if (!properties.hasStreamApiKey()) {
            throw new IllegalStateException("Bunny account API key is not configured; Bunny Stream video cannot be deleted.");
        }
        LibraryRef library = getVideoLibrary(libraryId, libraryName);
        if (!hasText(library.id())) {
            log.warn("Bunny Stream library {} could not be loaded while deleting video {}; assuming it was already removed.", libraryId, videoId);
            return;
        }
        if (!hasText(library.streamApiKey())) {
            throw new IllegalStateException("Bunny Stream library API key could not be resolved; video cannot be deleted.");
        }
        try {
            restClient.delete()
                    .uri(properties.effectiveStreamBaseUrl() + "/library/" + library.id().trim() + "/videos/" + videoId.trim())
                    .header("AccessKey", library.streamApiKey())
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                log.info("Bunny Stream video {} in library {} was already deleted.", videoId, library.id());
                return;
            }
            String body = ex.getResponseBodyAsString();
            log.warn("Could not delete Bunny Stream video {} from library {}. Bunny returned HTTP {}: {}", videoId, library.id(), ex.getStatusCode(), body, ex);
            throw new IllegalStateException("Bunny Stream video delete failed: HTTP " + ex.getStatusCode().value() + " " + abbreviate(body));
        } catch (Exception ex) {
            log.warn("Could not delete Bunny Stream video {} from library {}.", videoId, library.id(), ex);
            throw new IllegalStateException("Bunny Stream video delete failed: " + ex.getMessage());
        }
    }

    private void deleteAudio(String storagePath) {
        if (!properties.hasAudioStorage()) {
            throw new IllegalStateException("Bunny Storage credentials are not configured; Bunny audio cannot be deleted.");
        }
        String path = storagePath.trim();
        while (path.startsWith("/")) path = path.substring(1);
        try {
            restClient.delete()
                    .uri(properties.effectiveStorageRegionHost() + "/" + properties.storageZone().trim() + "/" + path)
                    .header("AccessKey", properties.storagePassword())
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                log.info("Bunny Storage audio {} was already deleted.", path);
                return;
            }
            String body = ex.getResponseBodyAsString();
            log.warn("Could not delete Bunny Storage audio {}. Bunny returned HTTP {}: {}", path, ex.getStatusCode(), body, ex);
            throw new IllegalStateException("Bunny Storage audio delete failed: HTTP " + ex.getStatusCode().value() + " " + abbreviate(body));
        } catch (Exception ex) {
            log.warn("Could not delete Bunny Storage audio {}.", path, ex);
            throw new IllegalStateException("Bunny Storage audio delete failed: " + ex.getMessage());
        }
    }

    public DirectVideoUploadSession createDirectVideoUploadSession(Course course, String fileName, String contentType) throws IOException {
        if (course.getMediaType() != CourseMediaType.VIDEO) {
            throw new IllegalArgumentException("Direct Bunny Stream upload sessions are only available for video courses.");
        }
        if (!properties.hasStreamApiKey()) {
            throw new IllegalStateException("Bunny account API key is not configured.");
        }

        LibraryRef library = resolveTenantVideoLibrary(course);
        if (!hasText(library.id())) {
            throw new IllegalStateException("Bunny Stream library could not be created for this tenant.");
        }
        if (!hasText(library.streamApiKey())) {
            throw new IllegalStateException("Bunny Stream library API key could not be resolved for this tenant.");
        }

        String createUrl = properties.effectiveStreamBaseUrl() + "/library/" + library.id() + "/videos";
        String title = hasText(course.getTitle()) ? course.getTitle() : safeFileName(fileName, "course-video");
        String titleJson = "{\"title\":" + JSON.writeValueAsString(title) + "}";
        JsonNode created = restClient.post()
                .uri(createUrl)
                .header("AccessKey", library.streamApiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(titleJson)
                .retrieve()
                .body(JsonNode.class);
        String videoId = created == null ? null : firstText(created, "guid", "videoId", "id");
        if (!hasText(videoId)) {
            throw new IllegalStateException("Bunny Stream did not return a video id.");
        }

        long expiration = Instant.now().plusSeconds(24 * 60 * 60).getEpochSecond();
        String signature = sha256Hex(library.id() + library.streamApiKey() + expiration + videoId);
        return new DirectVideoUploadSession(
                "TUS",
                properties.effectiveStreamBaseUrl() + "/tusupload",
                library.id(),
                library.name(),
                videoId,
                signature,
                expiration,
                safeFileName(fileName, "video.mp4"),
                hasText(contentType) ? contentType.trim() : "video/mp4",
                title
        );
    }

    private CourseUploadResult uploadVideo(Course course, MultipartFile file) throws IOException {
        LibraryRef library = resolveTenantVideoLibrary(course);
        if (!properties.hasStreamApiKey()) {
            log.warn("Bunny account API key is not configured; course {} media was marked for later upload.", course.getId());
            return new CourseUploadResult(library.id(), library.name(), null, null, null, "BUNNY_STREAM_NOT_CONFIGURED");
        }
        if (!hasText(library.id()) || !hasText(library.streamApiKey())) {
            throw new IllegalStateException("Bunny Stream library/API key could not be resolved for this tenant.");
        }
        String createUrl = properties.effectiveStreamBaseUrl() + "/library/" + library.id() + "/videos";
        String titleJson = "{\"title\":" + JSON.writeValueAsString(course.getTitle()) + "}";
        JsonNode created = restClient.post()
                .uri(createUrl)
                .header("AccessKey", library.streamApiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(titleJson)
                .retrieve()
                .body(JsonNode.class);
        String videoId = created == null ? null : firstText(created, "guid", "videoId", "id");
        if (!hasText(videoId)) {
            throw new IllegalStateException("Bunny Stream did not return a video id.");
        }
        String uploadUrl = properties.effectiveStreamBaseUrl() + "/library/" + library.id() + "/videos/" + videoId;
        restClient.put()
                .uri(uploadUrl)
                .header("AccessKey", library.streamApiKey())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(file.getBytes())
                .retrieve()
                .toBodilessEntity();
        return new CourseUploadResult(library.id(), library.name(), videoId, null, null, "UPLOADED_TO_BUNNY_STREAM");
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
        if (hasText(properties.audioCdnHost())) {
            String host = properties.audioCdnHost().trim();
            while (host.endsWith("/")) host = host.substring(0, host.length() - 1);
            cdnUrl = host + "/" + path;
        }
        return new CourseUploadResult(null, null, null, path, cdnUrl, "UPLOADED_TO_BUNNY_STORAGE");
    }

    private LibraryRef resolveTenantVideoLibrary(Course course) {
        if (course != null && hasText(course.getBunnyLibraryId())) {
            LibraryRef existing = getVideoLibrary(course.getBunnyLibraryId(), course.getBunnyLibraryName());
            if (hasText(existing.id())) return existing;
        }
        return ensureTenantVideoLibrary(course.getCompany());
    }

    private LibraryRef ensureTenantVideoLibrary(Company company) {
        String libraryName = "Calendra tenant " + company.getId() + " - " + safeLibraryName(company.getName());
        if (!properties.hasStreamApiKey()) {
            return new LibraryRef(null, libraryName, null);
        }
        try {
            JsonNode libraries = restClient.get()
                    .uri(properties.effectiveCoreBaseUrl() + "/videolibrary")
                    .header("AccessKey", properties.apiKey())
                    .retrieve()
                    .body(JsonNode.class);
            JsonNode items = libraries == null ? null : (libraries.isArray() ? libraries : libraries.get("Items"));
            if (items != null && items.isArray()) {
                for (JsonNode item : items) {
                    String name = firstText(item, "name", "Name");
                    if (libraryName.equals(name)) {
                        String id = firstText(item, "id", "Id", "libraryId");
                        LibraryRef full = getVideoLibrary(id, libraryName);
                        if (hasText(full.id())) return full;
                    }
                }
            }
            JsonNode created = restClient.post()
                    .uri(properties.effectiveCoreBaseUrl() + "/videolibrary")
                    .header("AccessKey", properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"Name\":" + JSON.writeValueAsString(libraryName) + "}")
                    .retrieve()
                    .body(JsonNode.class);
            String id = created == null ? null : firstText(created, "id", "Id", "libraryId");
            String name = created == null ? libraryName : firstText(created, "name", "Name");
            String streamApiKey = created == null ? null : firstText(created, "apiKey", "ApiKey", "ApiAccessKey");
            if (!hasText(streamApiKey) && hasText(id)) {
                return getVideoLibrary(id, hasText(name) ? name : libraryName);
            }
            return new LibraryRef(id, hasText(name) ? name : libraryName, streamApiKey);
        } catch (RestClientResponseException ex) {
            String body = ex.getResponseBodyAsString();
            log.warn("Could not create/find Bunny Stream library for tenant {}. Bunny returned HTTP {}: {}", company.getId(), ex.getStatusCode(), body, ex);
            throw new IllegalStateException("Bunny Stream library create/list failed: HTTP " + ex.getStatusCode().value() + " " + abbreviate(body));
        } catch (Exception ex) {
            log.warn("Could not create/find Bunny Stream library for tenant {}. Upload can be retried after Bunny configuration is fixed.", company.getId(), ex);
            throw new IllegalStateException("Bunny Stream library create/list failed: " + ex.getMessage());
        }
    }

    private LibraryRef getVideoLibrary(String libraryId, String nameFallback) {
        if (!hasText(libraryId)) return new LibraryRef(null, nameFallback, null);
        try {
            JsonNode library = restClient.get()
                    .uri(properties.effectiveCoreBaseUrl() + "/videolibrary/" + libraryId.trim())
                    .header("AccessKey", properties.apiKey())
                    .retrieve()
                    .body(JsonNode.class);
            String id = library == null ? libraryId : firstText(library, "id", "Id", "libraryId");
            String name = library == null ? nameFallback : firstText(library, "name", "Name");
            String streamApiKey = library == null ? null : firstText(library, "apiKey", "ApiKey", "ApiAccessKey");
            return new LibraryRef(hasText(id) ? id : libraryId, hasText(name) ? name : nameFallback, streamApiKey);
        } catch (RestClientResponseException ex) {
            String body = ex.getResponseBodyAsString();
            log.warn("Could not load Bunny Stream library {}. Bunny returned HTTP {}: {}", libraryId, ex.getStatusCode(), body, ex);
            return new LibraryRef(null, nameFallback, null);
        } catch (Exception ex) {
            log.warn("Could not load Bunny Stream library {}.", libraryId, ex);
            return new LibraryRef(null, nameFallback, null);
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
        value = value.replaceAll("[^A-Za-z0-9 ._-]", "-");
        while (value.contains("--")) value = value.replace("--", "-");
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

    private static String abbreviate(String value) {
        if (!hasText(value)) return "";
        String trimmed = value.replace('\n', ' ').replace('\r', ' ').trim();
        return trimmed.length() > 300 ? trimmed.substring(0, 300) + "..." : trimmed;
    }

    private record LibraryRef(String id, String name, String streamApiKey) {}

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
