package com.example.app;

import io.github.cdimascio.dotenv.Dotenv;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Loads local secrets from {@code .env.local} before Spring starts. Skips if {@code DOTENV_DISABLE=true}.
 * Does not override real OS environment variables. Staging/production on AWS use Secrets Manager instead.
 */
final class DotenvLoader {

    private DotenvLoader() {}

    static void load() {
        if (Boolean.parseBoolean(System.getenv("DOTENV_DISABLE"))) {
            return;
        }
        List<Path> paths = new ArrayList<>();
        String custom = System.getenv("DOTENV_LOCAL_PATH");
        if (custom != null && !custom.isBlank()) {
            paths.add(Path.of(custom));
        }
        String userDir = System.getProperty("user.dir");
        paths.add(Path.of(userDir, ".env.local"));
        paths.add(Path.of(userDir, "backend", ".env.local"));
        // Backward compatibility for older local setup naming.
        paths.add(Path.of(userDir, "..env.local"));
        paths.add(Path.of(userDir, "backend", "..env.local"));
        // Support non-hidden example naming if copied directly.
        paths.add(Path.of(userDir, "env.local"));
        paths.add(Path.of(userDir, "backend", "env.local"));

        for (Path path : paths) {
            if (!Files.isRegularFile(path)) {
                continue;
            }
            Dotenv dotenv = Dotenv.configure()
                    .directory(path.getParent().toString())
                    .filename(path.getFileName().toString())
                    .ignoreIfMalformed()
                    .load();
            for (var entry : dotenv.entries()) {
                String k = entry.getKey();
                if (System.getenv(k) == null && System.getProperty(k) == null) {
                    System.setProperty(k, entry.getValue());
                }
            }
            return;
        }
    }
}
