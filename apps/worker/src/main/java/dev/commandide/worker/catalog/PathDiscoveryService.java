// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Inventories PATH entries without launching or reading any discovered executable. */
public final class PathDiscoveryService {
    static final int MAX_PATH_DIRECTORIES = 512;
    static final int MAX_ENTRIES_PER_DIRECTORY = 10_000;
    static final int MAX_UNIQUE_EXECUTABLES = 20_000;

    private final CatalogService catalogService;
    private final String operatingSystem;
    private final List<String> pathEntries;
    private Snapshot cachedSnapshot;

    public PathDiscoveryService(
            CatalogService catalogService,
            String operatingSystem,
            List<String> pathEntries) {
        this.catalogService = catalogService;
        this.operatingSystem = operatingSystem;
        this.pathEntries = List.copyOf(pathEntries);
    }

    public synchronized CatalogDiscoveryResult discover(int limit, boolean refresh) {
        if (limit < 1 || limit > 5_000) {
            throw new IllegalArgumentException("Discovery limit must be between 1 and 5000");
        }
        boolean cached = cachedSnapshot != null && !refresh;
        if (!cached) {
            cachedSnapshot = scan();
        }
        Snapshot snapshot = cachedSnapshot;
        int returned = Math.min(limit, snapshot.executables().size());
        return new CatalogDiscoveryResult(
                snapshot.executables().size(),
                snapshot.truncated() || returned < snapshot.executables().size(),
                cached,
                snapshot.shadowedCount(),
                snapshot.skippedUnsafeNames(),
                List.copyOf(snapshot.executables().subList(0, returned)));
    }

    private Snapshot scan() {
        Map<String, DiscoveredExecutable> discovered = new LinkedHashMap<>();
        Set<Path> scannedDirectories = new HashSet<>();
        int shadowedCount = 0;
        int skippedUnsafeNames = 0;
        boolean truncated = pathEntries.size() > MAX_PATH_DIRECTORIES;

        for (String rawEntry : pathEntries.stream().limit(MAX_PATH_DIRECTORIES).toList()) {
            Path directory;
            try {
                directory = Path.of(rawEntry).toAbsolutePath().normalize();
            } catch (InvalidPathException exception) {
                continue;
            }
            if (!scannedDirectories.add(directory) || !Files.isDirectory(directory)) {
                continue;
            }

            int visited = 0;
            try (DirectoryStream<Path> entries = Files.newDirectoryStream(directory)) {
                for (Path candidate : entries) {
                    if (++visited > MAX_ENTRIES_PER_DIRECTORY) {
                        truncated = true;
                        break;
                    }
                    String filename = candidate.getFileName().toString();
                    String executable = normalizedExecutableName(filename);
                    if (executable == null) {
                        if (containsUnsafeCharacters(filename) || filename.length() > 255) {
                            skippedUnsafeNames++;
                        }
                        continue;
                    }
                    boolean usable = Files.isRegularFile(candidate)
                            && (isWindows() || Files.isExecutable(candidate));
                    if (!usable) {
                        continue;
                    }
                    String key = isWindows() ? executable.toLowerCase(Locale.ROOT) : executable;
                    if (discovered.containsKey(key)) {
                        shadowedCount++;
                        continue;
                    }
                    if (discovered.size() >= MAX_UNIQUE_EXECUTABLES) {
                        truncated = true;
                        break;
                    }
                    CommandSpec catalog = catalogService.findByExecutable(executable).orElse(null);
                    discovered.put(key, new DiscoveredExecutable(
                            executable,
                            candidate.toAbsolutePath().normalize().toString(),
                            catalog == null ? null : catalog.id(),
                            catalog == null ? null : catalog.category(),
                            catalog == null ? null : catalog.summary()));
                }
            } catch (IOException | SecurityException ignored) {
                // A PATH entry may disappear or become unreadable while a refresh is in progress.
            }
            if (discovered.size() >= MAX_UNIQUE_EXECUTABLES) {
                break;
            }
        }

        List<DiscoveredExecutable> ordered = new ArrayList<>(discovered.values());
        ordered.sort(Comparator.comparing(DiscoveredExecutable::executable, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(DiscoveredExecutable::executable)
                .thenComparing(DiscoveredExecutable::path));
        return new Snapshot(List.copyOf(ordered), truncated, shadowedCount, skippedUnsafeNames);
    }

    private String normalizedExecutableName(String filename) {
        if (filename.isBlank() || filename.length() > 255 || containsUnsafeCharacters(filename)) {
            return null;
        }
        if (!isWindows()) {
            return filename;
        }
        String lower = filename.toLowerCase(Locale.ROOT);
        for (String suffix : List.of(".exe", ".cmd", ".bat", ".com")) {
            if (lower.endsWith(suffix) && filename.length() > suffix.length()) {
                return filename.substring(0, filename.length() - suffix.length());
            }
        }
        return null;
    }

    private boolean isWindows() {
        return operatingSystem.equals("windows");
    }

    private static boolean containsUnsafeCharacters(String value) {
        return value.codePoints().anyMatch(character -> Character.isISOControl(character));
    }

    private record Snapshot(
            List<DiscoveredExecutable> executables,
            boolean truncated,
            int shadowedCount,
            int skippedUnsafeNames) {}
}
