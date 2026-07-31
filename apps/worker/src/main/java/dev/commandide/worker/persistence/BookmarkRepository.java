// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.time.Instant;
import java.util.Optional;

public final class BookmarkRepository {
    private final DatabaseManager database;

    public BookmarkRepository(DatabaseManager database) {
        this.database = database;
    }

    public void save(StoredBookmark bookmark) throws SQLException {
        if (bookmark.id().isBlank() || bookmark.name().isBlank() || bookmark.schemaVersion() < 1) {
            throw new IllegalArgumentException("Bookmark id/name and positive schema version are required");
        }
        try (var connection = database.open();
                var statement = connection.prepareStatement("""
                        INSERT INTO bookmarks(id, name, structured_selection_json, schema_version, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            structured_selection_json = excluded.structured_selection_json,
                            schema_version = excluded.schema_version,
                            updated_at = excluded.updated_at
                        """)) {
            statement.setString(1, bookmark.id());
            statement.setString(2, bookmark.name());
            statement.setString(3, bookmark.structuredSelectionJson());
            statement.setInt(4, bookmark.schemaVersion());
            statement.setString(5, bookmark.createdAt().toString());
            statement.setString(6, bookmark.updatedAt().toString());
            statement.executeUpdate();
        }
    }

    public Optional<StoredBookmark> findById(String id) throws SQLException {
        try (var connection = database.open();
                var query = connection.prepareStatement("SELECT * FROM bookmarks WHERE id = ?")) {
            query.setString(1, id);
            try (var result = query.executeQuery()) {
                if (!result.next()) return Optional.empty();
                return Optional.of(new StoredBookmark(
                        result.getString("id"),
                        result.getString("name"),
                        result.getString("structured_selection_json"),
                        result.getInt("schema_version"),
                        Instant.parse(result.getString("created_at")),
                        Instant.parse(result.getString("updated_at"))));
            }
        }
    }

    public List<StoredBookmark> recent(int limit) throws SQLException {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("Bookmark limit must be between 1 and 100");
        }
        try (var connection = database.open();
                var query = connection.prepareStatement(
                        "SELECT * FROM bookmarks ORDER BY updated_at DESC LIMIT ?")) {
            query.setInt(1, limit);
            try (var result = query.executeQuery()) {
                List<StoredBookmark> bookmarks = new ArrayList<>();
                while (result.next()) {
                    bookmarks.add(new StoredBookmark(
                            result.getString("id"),
                            result.getString("name"),
                            result.getString("structured_selection_json"),
                            result.getInt("schema_version"),
                            Instant.parse(result.getString("created_at")),
                            Instant.parse(result.getString("updated_at"))));
                }
                return List.copyOf(bookmarks);
            }
        }
    }

    public boolean delete(String id) throws SQLException {
        try (var connection = database.open();
                var statement = connection.prepareStatement("DELETE FROM bookmarks WHERE id = ?")) {
            statement.setString(1, id);
            return statement.executeUpdate() == 1;
        }
    }
}
