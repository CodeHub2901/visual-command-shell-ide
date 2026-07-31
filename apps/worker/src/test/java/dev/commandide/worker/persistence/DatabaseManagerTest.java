// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.ResultSet;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class DatabaseManagerTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void appliesMigrationsIdempotently() throws Exception {
        var manager = new DatabaseManager(temporaryDirectory.resolve("data").resolve("command-ide.db"), false);

        manager.initialize();
        manager.initialize();

        assertEquals(DatabaseManager.CURRENT_SCHEMA_VERSION, manager.currentVersion());
        try (var connection = manager.open();
                var statement = connection.createStatement();
                ResultSet tables = statement.executeQuery(
                        "SELECT name FROM sqlite_master WHERE type='table'")) {
            Set<String> names = new HashSet<>();
            while (tables.next()) names.add(tables.getString("name"));
            assertTrue(names.containsAll(Set.of(
                    "schema_migrations", "settings", "projects", "bookmarks", "execution_history")));
        }
    }

    @Test
    void schemaContainsNoCredentialColumns() throws Exception {
        var manager = new DatabaseManager(temporaryDirectory.resolve("command-ide.db"), false);
        manager.initialize();

        try (var connection = manager.open();
                var statement = connection.createStatement();
                ResultSet columns = statement.executeQuery(
                        "SELECT name FROM pragma_table_info('settings')")) {
            Set<String> names = new HashSet<>();
            while (columns.next()) {
                names.add(columns.getString("name").toLowerCase());
            }
            assertFalse(names.contains("password"));
            assertFalse(names.contains("secret"));
            assertFalse(names.contains("token"));
            assertFalse(names.contains("api_key"));
            assertFalse(names.contains("credential"));
        }
    }

    @Test
    void preservesACorruptDatabaseAndStartsWithAFreshSchema() throws Exception {
        Path databasePath = temporaryDirectory.resolve("command-ide.sqlite3");
        java.nio.file.Files.write(
                databasePath,
                "not a sqlite database".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var manager = new DatabaseManager(databasePath, false);

        DatabaseManager.RecoveryResult result = manager.initializeWithRecovery();

        assertTrue(result.recovered());
        assertTrue(result.backupFileName().startsWith("command-ide.sqlite3.corrupt-"));
        assertTrue(java.nio.file.Files.isRegularFile(
                temporaryDirectory.resolve(result.backupFileName())));
        assertEquals(
                "not a sqlite database",
                java.nio.file.Files.readString(
                        temporaryDirectory.resolve(result.backupFileName())));
        assertEquals(DatabaseManager.CURRENT_SCHEMA_VERSION, manager.currentVersion());
    }
}
