package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class ActivityActionUsageTest {
    /**
     * Reserved action codes are intentionally kept for the next dedicated flows.
     * Once one is emitted in production, remove it from this set so the test
     * starts protecting that hook as well.
     */
    private static final Set<ActivityAction> RESERVED = EnumSet.of(
            ActivityAction.OPEN_BILL_CREATED,
            ActivityAction.OPEN_BILL_UPDATED,
            ActivityAction.GROUP_MESSAGE_SENT,
            ActivityAction.GROUP_MESSAGE_SCHEDULED,
            ActivityAction.COMPANY_CREATED,
            ActivityAction.COMPANY_UPDATED,
            ActivityAction.COMPANY_DELETED,
            ActivityAction.COMPANY_DEACTIVATED,
            ActivityAction.COMPANY_ACTIVATED
    );

    @Test
    void everyNonReservedActivityActionIsEmittedByProductionCode() throws IOException {
        Path javaRoot = backendRoot().resolve("src/main/java/com/example/app");
        String productionSources;
        try (var files = Files.walk(javaRoot)) {
            productionSources = files
                    .filter(path -> path.toString().endsWith(".java"))
                    .filter(path -> !path.endsWith("activitylog/ActivityAction.java"))
                    .map(ActivityActionUsageTest::readUnchecked)
                    .collect(Collectors.joining("\n"));
        }

        for (ActivityAction action : ActivityAction.values()) {
            boolean referenced = productionSources.contains("ActivityAction." + action.name());
            if (RESERVED.contains(action)) {
                assertThat(referenced)
                        .as("Reserved action %s is now used; remove it from RESERVED so CI protects the hook", action)
                        .isFalse();
            } else {
                assertThat(referenced)
                        .as("ActivityAction.%s has no production emission hook. Restore the hook or explicitly reserve the action.", action)
                        .isTrue();
            }
        }
    }

    private static String readUnchecked(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to read " + path, ex);
        }
    }

    private static Path backendRoot() {
        Path cwd = Path.of("").toAbsolutePath().normalize();
        if (Files.isDirectory(cwd.resolve("src/main/java"))) return cwd;
        if (Files.isDirectory(cwd.resolve("backend/src/main/java"))) return cwd.resolve("backend");
        throw new IllegalStateException("Cannot locate backend source root from " + cwd);
    }
}
