// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import java.sql.SQLException;
import java.time.Instant;
import java.util.Optional;

public final class SettingsRepository {
    private final DatabaseManager database;

    public SettingsRepository(DatabaseManager database) {
        this.database = database;
    }

    public Optional<String> getJson(String key) throws SQLException {
        try (var connection = database.open();
                var query = connection.prepareStatement(
                        "SELECT value_json FROM settings WHERE key = ?")) {
            query.setString(1, key);
            try (var result = query.executeQuery()) {
                return result.next() ? Optional.of(result.getString("value_json")) : Optional.empty();
            }
        }
    }

    public void putJson(String key, String json) throws SQLException {
        if (key.isBlank()) throw new IllegalArgumentException("Setting key cannot be blank");
        try (var connection = database.open();
                var statement = connection.prepareStatement("""
                        INSERT INTO settings(key, value_json, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(key) DO UPDATE SET
                            value_json = excluded.value_json,
                            updated_at = excluded.updated_at
                        """)) {
            statement.setString(1, key);
            statement.setString(2, json);
            statement.setString(3, Instant.now().toString());
            statement.executeUpdate();
        }
    }

    public boolean delete(String key) throws SQLException {
        try (var connection = database.open();
                var statement = connection.prepareStatement("DELETE FROM settings WHERE key = ?")) {
            statement.setString(1, key);
            return statement.executeUpdate() > 0;
        }
    }
}

