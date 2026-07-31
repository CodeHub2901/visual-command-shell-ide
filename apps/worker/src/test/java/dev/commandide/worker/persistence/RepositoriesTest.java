// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class RepositoriesTest {
    @TempDir
    Path temporaryDirectory;
    private DatabaseManager database;

    @BeforeEach
    void initialize() throws Exception {
        database = new DatabaseManager(temporaryDirectory.resolve("command-ide.db"), false);
        database.initialize();
    }

    @Test
    void storesAndUpdatesSettings() throws Exception {
        var repository = new SettingsRepository(database);
        assertTrue(repository.getJson("ui.mode").isEmpty());
        repository.putJson("ui.mode", "\"guided\"");
        repository.putJson("ui.mode", "\"compact\"");
        assertEquals("\"compact\"", repository.getJson("ui.mode").orElseThrow());
        assertTrue(repository.delete("ui.mode"));
        assertFalse(repository.delete("ui.mode"));
    }

    @Test
    void storesStructuredProjectsAndBookmarks() throws Exception {
        Instant created = Instant.parse("2026-07-18T12:00:00Z");
        var projects = new ProjectRepository(database);
        projects.save(new StoredProject("p1", "List files", "{\"ast\":{}}", 1, created, created));
        assertEquals("List files", projects.findById("p1").orElseThrow().name());

        var bookmarks = new BookmarkRepository(database);
        bookmarks.save(new StoredBookmark("b1", "Detailed list", "{\"options\":[\"-l\"]}", 1, created, created));
        assertEquals(1, bookmarks.findById("b1").orElseThrow().schemaVersion());
        assertEquals("b1", bookmarks.recent(10).getFirst().id());
        assertTrue(bookmarks.delete("b1"));
        assertFalse(bookmarks.delete("b1"));
    }

    @Test
    void returnsRecentHistoryInDescendingOrder() throws Exception {
        var history = new ExecutionHistoryRepository(database);
        history.save(new ExecutionHistoryEntry(
                "h1", Instant.parse("2026-07-18T12:00:00Z"), null,
                "/tmp", null, "curl --token=<redacted>", "medium"));
        history.save(new ExecutionHistoryEntry(
                "h2", Instant.parse("2026-07-18T13:00:00Z"), Instant.parse("2026-07-18T13:00:01Z"),
                "/tmp", 0, "ls -al", "low"));

        assertEquals("h2", history.recent(1).getFirst().id());
    }
}
