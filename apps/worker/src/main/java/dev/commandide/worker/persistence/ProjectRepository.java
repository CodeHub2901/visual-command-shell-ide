// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class ProjectRepository {
    private final DatabaseManager database;

    public ProjectRepository(DatabaseManager database) {
        this.database = database;
    }

    public void save(StoredProject project) throws SQLException {
        validate(project.id(), project.name(), project.schemaVersion());
        try (var connection = database.open();
                var statement = connection.prepareStatement("""
                        INSERT INTO projects(id, name, project_json, schema_version, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            project_json = excluded.project_json,
                            schema_version = excluded.schema_version,
                            updated_at = excluded.updated_at
                        """)) {
            statement.setString(1, project.id());
            statement.setString(2, project.name());
            statement.setString(3, project.projectJson());
            statement.setInt(4, project.schemaVersion());
            statement.setString(5, project.createdAt().toString());
            statement.setString(6, project.updatedAt().toString());
            statement.executeUpdate();
        }
    }

    public Optional<StoredProject> findById(String id) throws SQLException {
        try (var connection = database.open();
                var query = connection.prepareStatement("SELECT * FROM projects WHERE id = ?")) {
            query.setString(1, id);
            try (var result = query.executeQuery()) {
                if (!result.next()) return Optional.empty();
                return Optional.of(new StoredProject(
                        result.getString("id"),
                        result.getString("name"),
                        result.getString("project_json"),
                        result.getInt("schema_version"),
                        Instant.parse(result.getString("created_at")),
                        Instant.parse(result.getString("updated_at"))));
            }
        }
    }

    public boolean delete(String id) throws SQLException {
        try (var connection = database.open();
                var statement = connection.prepareStatement("DELETE FROM projects WHERE id = ?")) {
            statement.setString(1, id);
            return statement.executeUpdate() > 0;
        }
    }

    public List<StoredProject> recent(int limit) throws SQLException {
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("Limit must be between 1 and 100");
        try (var connection = database.open();
                var query = connection.prepareStatement(
                        "SELECT * FROM projects ORDER BY updated_at DESC LIMIT ?")) {
            query.setInt(1, limit);
            try (var result = query.executeQuery()) {
                List<StoredProject> projects = new ArrayList<>();
                while (result.next()) {
                    projects.add(new StoredProject(
                            result.getString("id"),
                            result.getString("name"),
                            result.getString("project_json"),
                            result.getInt("schema_version"),
                            Instant.parse(result.getString("created_at")),
                            Instant.parse(result.getString("updated_at"))));
                }
                return List.copyOf(projects);
            }
        }
    }

    private void validate(String id, String name, int schemaVersion) {
        if (id.isBlank() || name.isBlank() || schemaVersion < 1) {
            throw new IllegalArgumentException("Project id/name and positive schema version are required");
        }
    }
}
