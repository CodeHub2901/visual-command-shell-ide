package dev.commandide.worker.catalog;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

public final class ExecutableDiscovery {
    private ExecutableDiscovery() {}

    public static Optional<Path> find(String executable, List<String> pathEntries, String operatingSystem) {
        if (executable.isBlank() || executable.contains("/") || executable.contains("\\")) {
            return Optional.empty();
        }
        List<String> suffixes = operatingSystem.equals("windows")
                ? List.of("", ".exe", ".cmd", ".bat", ".com")
                : List.of("");
        for (String entry : pathEntries) {
            try {
                Path directory = Path.of(entry);
                for (String suffix : suffixes) {
                    Path candidate = directory.resolve(executable + suffix).toAbsolutePath().normalize();
                    boolean usable = Files.isRegularFile(candidate)
                            && (operatingSystem.equals("windows") || Files.isExecutable(candidate));
                    if (usable) {
                        return Optional.of(candidate);
                    }
                }
            } catch (InvalidPathException ignored) {
                // Ignore malformed PATH entries supplied by the host environment.
            }
        }
        return Optional.empty();
    }
}
