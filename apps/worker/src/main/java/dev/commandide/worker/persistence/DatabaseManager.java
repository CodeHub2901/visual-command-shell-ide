package dev.commandide.worker.persistence;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.sqlite.SQLiteException;

public final class DatabaseManager {
    public static final int CURRENT_SCHEMA_VERSION = 1;
    private static final DateTimeFormatter BACKUP_TIME =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss", Locale.ROOT)
                    .withZone(ZoneOffset.UTC);

    private final Path databasePath;
    private final boolean writeAheadLogging;

    public DatabaseManager(Path databasePath) {
        this(databasePath, true);
    }

    public DatabaseManager(Path databasePath, boolean writeAheadLogging) {
        this.databasePath = databasePath.toAbsolutePath().normalize();
        this.writeAheadLogging = writeAheadLogging;
    }

    public void initialize() throws SQLException, IOException {
        Path parent = databasePath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        try (Connection connection = open()) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("PRAGMA journal_mode = " + (writeAheadLogging ? "WAL" : "DELETE"));
            }
            connection.setAutoCommit(false);
            try {
                createMigrationTable(connection);
                int version = currentVersion(connection);
                for (Migration migration : migrations()) {
                    if (migration.version() > version) {
                        apply(connection, migration);
                    }
                }
                connection.commit();
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            } finally {
                connection.setAutoCommit(true);
            }
        }
    }

    public RecoveryResult initializeWithRecovery() throws SQLException, IOException {
        try {
            initialize();
            return new RecoveryResult(false, null);
        } catch (SQLException exception) {
            if (!isCorruption(exception) || !Files.isRegularFile(databasePath)) throw exception;
            Path backup = quarantineCorruptDatabase();
            initialize();
            return new RecoveryResult(true, backup.getFileName().toString());
        }
    }

    public int currentVersion() throws SQLException {
        try (Connection connection = open()) {
            createMigrationTable(connection);
            return currentVersion(connection);
        }
    }

    public Connection open() throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + databasePath);
        try {
            try (Statement statement = connection.createStatement()) {
                statement.execute("PRAGMA foreign_keys = ON");
                statement.execute("PRAGMA busy_timeout = 5000");
            }
            return connection;
        } catch (SQLException | RuntimeException failure) {
            try {
                connection.close();
            } catch (SQLException closeFailure) {
                failure.addSuppressed(closeFailure);
            }
            throw failure;
        }
    }

    private void createMigrationTable(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        applied_at TEXT NOT NULL
                    )
                    """);
        }
    }

    private int currentVersion(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(
                        "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")) {
            return result.next() ? result.getInt("version") : 0;
        }
    }

    private void apply(Connection connection, Migration migration) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            for (String sql : migration.statements()) {
                statement.executeUpdate(sql);
            }
        }
        try (var insert = connection.prepareStatement(
                "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")) {
            insert.setInt(1, migration.version());
            insert.setString(2, Instant.now().toString());
            insert.executeUpdate();
        }
    }

    private List<Migration> migrations() {
        return List.of(new Migration(1, List.of(
                """
                CREATE TABLE settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    project_json TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE bookmarks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    structured_selection_json TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE execution_history (
                    id TEXT PRIMARY KEY,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    working_directory TEXT NOT NULL,
                    exit_status INTEGER,
                    redacted_command_text TEXT NOT NULL,
                    risk_level TEXT NOT NULL
                )
                """)));
    }

    private boolean isCorruption(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof SQLiteException sqlite) {
                String code = sqlite.getResultCode().name();
                if (code.startsWith("SQLITE_CORRUPT") || code.equals("SQLITE_NOTADB")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    private Path quarantineCorruptDatabase() throws IOException {
        String suffix = ".corrupt-"
                + BACKUP_TIME.format(Instant.now())
                + "-"
                + UUID.randomUUID().toString().substring(0, 8);
        Path backup = databasePath.resolveSibling(databasePath.getFileName() + suffix);
        move(databasePath, backup);
        moveIfPresent(
                databasePath.resolveSibling(databasePath.getFileName() + "-wal"),
                backup.resolveSibling(backup.getFileName() + "-wal"));
        moveIfPresent(
                databasePath.resolveSibling(databasePath.getFileName() + "-shm"),
                backup.resolveSibling(backup.getFileName() + "-shm"));
        return backup;
    }

    private void moveIfPresent(Path source, Path target) throws IOException {
        if (Files.isRegularFile(source)) move(source, target);
    }

    private void move(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
            Files.move(source, target);
        }
    }

    public record RecoveryResult(boolean recovered, String backupFileName) {}

    private record Migration(int version, List<String> statements) {}
}
