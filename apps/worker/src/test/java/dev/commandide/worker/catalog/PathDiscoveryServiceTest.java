package dev.commandide.worker.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class PathDiscoveryServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void preservesPathPrecedenceDeduplicatesAndEnrichesWithoutExecution() throws Exception {
        Path first = Files.createDirectory(temporaryDirectory.resolve("first"));
        Path second = Files.createDirectory(temporaryDirectory.resolve("second"));
        Path preferred = Files.writeString(first.resolve("tool.exe"), "not executable content");
        Files.writeString(first.resolve("README"), "not a Windows executable");
        Files.writeString(second.resolve("TOOL.CMD"), "also not executable content");
        Files.writeString(second.resolve("helper.exe"), "not executable content");

        PathDiscoveryService service = new PathDiscoveryService(
                catalog(), "windows", List.of(first.toString(), second.toString(), first.toString()));

        CatalogDiscoveryResult result = service.discover(100, false);

        assertFalse(result.cached());
        assertFalse(result.truncated());
        assertEquals(2, result.total());
        assertEquals(1, result.shadowedCount());
        DiscoveredExecutable tool = result.executables().stream()
                .filter(executable -> executable.executable().equals("tool"))
                .findFirst().orElseThrow();
        assertEquals(preferred.toAbsolutePath().normalize().toString(), tool.path());
        assertEquals("tool", tool.catalogCommandId());
        assertEquals("Development", tool.category());
    }

    @Test
    void cachesUntilRefreshAndReportsResultLimitTruncation() throws Exception {
        Path directory = Files.createDirectory(temporaryDirectory.resolve("bin"));
        Files.writeString(directory.resolve("one.exe"), "one");
        PathDiscoveryService service = new PathDiscoveryService(
                catalog(), "windows", List.of(directory.toString()));

        assertEquals(1, service.discover(100, false).total());
        Files.writeString(directory.resolve("two.exe"), "two");

        CatalogDiscoveryResult cached = service.discover(100, false);
        CatalogDiscoveryResult refreshed = service.discover(1, true);

        assertTrue(cached.cached());
        assertEquals(1, cached.total());
        assertFalse(refreshed.cached());
        assertEquals(2, refreshed.total());
        assertEquals(1, refreshed.executables().size());
        assertTrue(refreshed.truncated());
    }

    private CatalogService catalog() {
        CatalogCommand command = new CatalogCommand(
                "tool", "tool", List.of("--version"), "tool", "Curated tool", "Development",
                List.of("windows"), List.of(), List.of(), List.of("read-only"), "never", List.of(),
                List.of("tool"), new CatalogCommand.CommandManual(
                        "tool", List.of(new CatalogCommand.ManualSection("Description", "Curated tool."))));
        return new CatalogService(List.of(command), "windows", "other", List.of());
    }
}
