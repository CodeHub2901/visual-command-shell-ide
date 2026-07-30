package dev.commandide.worker.persistence;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public final class ExecutionHistoryRepository {
    private final DatabaseManager database;

    public ExecutionHistoryRepository(DatabaseManager database) {
        this.database = database;
    }

    public void save(ExecutionHistoryEntry entry) throws SQLException {
        try (var connection = database.open();
                var statement = connection.prepareStatement("""
                        INSERT INTO execution_history(
                            id, started_at, finished_at, working_directory,
                            exit_status, redacted_command_text, risk_level
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """)) {
            statement.setString(1, entry.id());
            statement.setString(2, entry.startedAt().toString());
            statement.setString(3, entry.finishedAt() == null ? null : entry.finishedAt().toString());
            statement.setString(4, entry.workingDirectory());
            if (entry.exitStatus() == null) statement.setObject(5, null);
            else statement.setInt(5, entry.exitStatus());
            statement.setString(6, entry.redactedCommandText());
            statement.setString(7, entry.riskLevel());
            statement.executeUpdate();
        }
    }

    public void started(ExecutionHistoryEntry entry) throws SQLException {
        save(entry);
    }

    public void finished(String executionId, Instant finishedAt, int exitStatus) throws SQLException {
        try (var connection = database.open();
                var statement = connection.prepareStatement("""
                        UPDATE execution_history
                        SET finished_at = ?, exit_status = ?
                        WHERE id = ?
                        """)) {
            statement.setString(1, finishedAt.toString());
            statement.setInt(2, exitStatus);
            statement.setString(3, executionId);
            if (statement.executeUpdate() != 1) {
                throw new SQLException("Execution history row was not found");
            }
        }
    }

    public List<ExecutionHistoryEntry> recent(int limit) throws SQLException {
        try (var connection = database.open();
                var statement = connection.prepareStatement("""
                        SELECT id, started_at, finished_at, working_directory,
                               exit_status, redacted_command_text, risk_level
                        FROM execution_history
                        ORDER BY started_at DESC
                        LIMIT ?
                        """)) {
            statement.setInt(1, limit);
            try (var result = statement.executeQuery()) {
                List<ExecutionHistoryEntry> entries = new ArrayList<>();
                while (result.next()) {
                    entries.add(new ExecutionHistoryEntry(
                            result.getString("id"),
                            Instant.parse(result.getString("started_at")),
                            result.getString("finished_at") == null
                                    ? null
                                    : Instant.parse(result.getString("finished_at")),
                            result.getString("working_directory"),
                            result.getObject("exit_status", Integer.class),
                            result.getString("redacted_command_text"),
                            result.getString("risk_level")));
                }
                return List.copyOf(entries);
            }
        }
    }
}
