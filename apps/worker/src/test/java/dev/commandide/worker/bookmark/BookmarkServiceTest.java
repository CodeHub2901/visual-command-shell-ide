package dev.commandide.worker.bookmark;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.persistence.BookmarkRepository;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class BookmarkServiceTest {
    private static final String BOOKMARK_ID = "bdc62cba-64d3-4384-955d-8617c7ab8768";

    @TempDir
    Path temporaryDirectory;
    private BookmarkService service;

    @BeforeEach
    void initialize() throws Exception {
        DatabaseManager database = new DatabaseManager(temporaryDirectory.resolve("bookmarks.db"), false);
        database.initialize();
        CatalogService catalog = new CatalogService(new SystemProfile(
                "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true), List.of()));
        service = new BookmarkService(
                new BookmarkRepository(database),
                new BashGenerator(catalog),
                Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void preservesStructuredVariableSelectionsAndParameterMetadata() throws Exception {
        ScriptProject.ProjectParameter parameter = new ScriptProject.ProjectParameter(
                "ROOT", "Directory to inspect", true, false, "/tmp");
        StructuredBookmark saved = service.save(new BookmarkSaveRequest(
                BOOKMARK_ID, "  Inspect directory  ", variableProgram(), List.of(parameter)));

        assertEquals("Inspect directory", saved.name());
        assertEquals("variable", ((ShellProgram.CommandNode) saved.program().statements().getFirst())
                .arguments().getFirst().valueKind());
        assertEquals(parameter, saved.parameters().getFirst());
        assertEquals(saved, service.recent(10).getFirst());
    }

    @Test
    void createsIdsAndDeletesBookmarks() throws Exception {
        StructuredBookmark saved = service.save(new BookmarkSaveRequest(
                null, "List files", literalProgram("."), List.of()));

        assertFalse(saved.bookmarkId().isBlank());
        assertTrue(service.delete(saved.bookmarkId()));
        assertTrue(service.recent(10).isEmpty());
    }

    @Test
    void rejectsSecretBearingContentAndSensitiveDefaults() {
        ScriptProject.ProjectParameter secretDefault = new ScriptProject.ProjectParameter(
                "API_TOKEN", "Credential", true, true, "not-allowed");

        assertThrows(IllegalArgumentException.class, () -> service.save(new BookmarkSaveRequest(
                null, "Secret command", literalProgram("TOKEN=secret-value"), List.of())));
        assertThrows(IllegalArgumentException.class, () -> service.save(new BookmarkSaveRequest(
                null, "Secret default", literalProgram("."), List.of(secretDefault))));
    }

    private ShellProgram variableProgram() {
        return new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.CommandNode(
                        "node-1",
                        "ls",
                        List.of(),
                        List.of(new ShellProgram.ArgumentValue("files", "ROOT", "variable")))));
    }

    private ShellProgram literalProgram(String value) {
        return new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.CommandNode(
                        "node-1",
                        "ls",
                        List.of(),
                        List.of(new ShellProgram.ArgumentValue("files", value, "literal")))));
    }
}
