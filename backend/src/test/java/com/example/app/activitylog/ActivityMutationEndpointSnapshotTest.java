package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * CI tripwire for new mutating HTTP endpoints.
 *
 * The snapshot does not claim that every technical POST is a business audit event.
 * Its job is to make mutation-surface changes explicit: when a controller mutation
 * is added/removed/renamed, this test fails until ActivityLog coverage is reviewed
 * and the committed snapshot is intentionally regenerated.
 */
class ActivityMutationEndpointSnapshotTest {
    private static final Pattern MAPPING = Pattern.compile("@(PostMapping|PutMapping|PatchMapping|DeleteMapping)\\b");
    private static final Pattern METHOD = Pattern.compile(
            "\\bpublic\\s+(?:[\\w$<>?,.\\[\\]@]+\\s+)+([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(");

    @Test
    void mutatingControllerSurfaceMatchesReviewedAuditSnapshot() throws IOException {
        Path backend = backendRoot();
        Path javaRoot = backend.resolve("src/main/java/com/example/app");
        Path snapshot = backend.resolve("src/test/resources/activity-audit/mutation-endpoints.txt");

        List<String> expected = Files.readAllLines(snapshot).stream()
                .map(String::trim)
                .filter(line -> !line.isBlank() && !line.startsWith("#"))
                .sorted()
                .toList();
        List<String> actual = scan(javaRoot);

        assertThat(actual)
                .as("Mutating endpoint surface changed. Review whether each changed endpoint needs ActivityLog coverage, "
                        + "then regenerate with: python scripts/generate-activity-audit-endpoints.py")
                .containsExactlyElementsOf(expected);
    }

    private static List<String> scan(Path javaRoot) throws IOException {
        List<String> entries = new ArrayList<>();
        try (Stream<Path> files = Files.walk(javaRoot)) {
            for (Path path : files
                    .filter(file -> file.getFileName().toString().endsWith("Controller.java"))
                    .sorted(Comparator.comparing(Path::toString))
                    .toList()) {
                entries.addAll(scanFile(javaRoot, path));
            }
        }
        return entries.stream().distinct().sorted().toList();
    }

    private static List<String> scanFile(Path javaRoot, Path path) throws IOException {
        List<String> lines = Files.readAllLines(path);
        List<String> entries = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            Matcher mappingMatcher = MAPPING.matcher(lines.get(i));
            if (!mappingMatcher.find()) continue;

            StringBuilder annotation = new StringBuilder(lines.get(i).trim());
            int balance = parenBalance(annotation.toString());
            int annotationEnd = i;
            while (balance > 0 && annotationEnd + 1 < lines.size()) {
                annotationEnd++;
                String next = lines.get(annotationEnd).trim();
                annotation.append(' ').append(next);
                balance += parenBalance(next);
            }

            String methodName = null;
            StringBuilder declaration = new StringBuilder();
            for (int j = annotationEnd + 1; j < Math.min(lines.size(), annotationEnd + 80); j++) {
                String stripped = lines.get(j).trim();
                if (stripped.startsWith("@") && declaration.isEmpty()) continue;
                if (stripped.contains("public ") || !declaration.isEmpty()) {
                    declaration.append(' ').append(stripped);
                    Matcher methodMatcher = METHOD.matcher(declaration);
                    if (methodMatcher.find()) {
                        methodName = methodMatcher.group(1);
                        break;
                    }
                }
            }
            if (methodName == null) {
                throw new IllegalStateException("Unable to resolve controller method after "
                        + mappingMatcher.group() + " in " + path + ":" + (i + 1));
            }

            String relative = javaRoot.relativize(path).toString().replace('\\', '/');
            entries.add(relative + "|" + normalize(annotation.toString()) + "|" + methodName);
            i = annotationEnd;
        }
        return entries;
    }

    private static int parenBalance(String text) {
        int balance = 0;
        for (char c : text.toCharArray()) {
            if (c == '(') balance++;
            if (c == ')') balance--;
        }
        return balance;
    }

    private static String normalize(String value) {
        return value.replaceAll("\\s+", "").trim();
    }

    private static Path backendRoot() {
        Path cwd = Path.of("").toAbsolutePath().normalize();
        if (Files.isDirectory(cwd.resolve("src/main/java"))) return cwd;
        if (Files.isDirectory(cwd.resolve("backend/src/main/java"))) return cwd.resolve("backend");
        throw new IllegalStateException("Cannot locate backend source root from " + cwd);
    }
}
