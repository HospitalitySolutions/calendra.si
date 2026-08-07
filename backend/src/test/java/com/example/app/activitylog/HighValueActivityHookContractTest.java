package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Protects the Phase 1/2 high-value hooks from being accidentally removed while
 * controller/service internals are refactored. Behavioral tests cover central
 * logging plus representative client/session flows; this contract keeps the
 * invoice and inbox semantic hooks visible even when those services require
 * large integration fixtures.
 */
class HighValueActivityHookContractTest {

    @Test
    void calendarClientBillingAndInboxRetainTheirCoreSemanticHooks() throws IOException {
        Path root = backendRoot().resolve("src/main/java/com/example/app");
        Map<String, String[]> required = Map.of(
                "session/SessionBookingCreationService.java", new String[] {
                        "ActivityAction.SESSION_CREATED",
                        "ActivityAction.SESSION_UPDATED",
                        "ActivityAction.SESSION_RESCHEDULED",
                        "ActivityAction.SESSION_CANCELLED",
                        "ActivityAction.SESSION_PARTICIPANT_ADDED",
                        "ActivityAction.SESSION_PARTICIPANT_REMOVED"
                },
                "client/ClientController.java", new String[] {
                        "ActivityAction.CLIENT_CREATED",
                        "ActivityAction.CLIENT_UPDATED",
                        "ActivityAction.CLIENT_DELETED",
                        "ActivityAction.CLIENT_ANONYMIZED"
                },
                "billing/BillingController.java", new String[] {
                        "ActivityAction.INVOICE_CREATED",
                        "ActivityAction.INVOICE_PAID",
                        "ActivityAction.INVOICE_SENT",
                        "ActivityAction.ENTITLEMENT_USED"
                },
                "inbox/ClientMessageService.java", new String[] {
                        "ActivityAction.MESSAGE_SENT",
                        "ActivityAction.MESSAGE_SCHEDULED",
                        "ActivityAction.MESSAGE_SCHEDULE_CANCELLED",
                        "ActivityAction.INTERNAL_NOTE_ADDED"
                }
        );

        for (Map.Entry<String, String[]> entry : required.entrySet()) {
            String source = Files.readString(root.resolve(entry.getKey()));
            for (String hook : entry.getValue()) {
                assertThat(source)
                        .as("Expected high-value audit hook %s in %s", hook, entry.getKey())
                        .contains(hook);
            }
        }
    }

    private static Path backendRoot() {
        Path cwd = Path.of("").toAbsolutePath().normalize();
        if (Files.isDirectory(cwd.resolve("src/main/java"))) return cwd;
        if (Files.isDirectory(cwd.resolve("backend/src/main/java"))) return cwd.resolve("backend");
        throw new IllegalStateException("Cannot locate backend source root from " + cwd);
    }
}
