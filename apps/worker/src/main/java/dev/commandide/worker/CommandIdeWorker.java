// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker;

import dev.commandide.worker.protocol.FramedJsonRpcServer;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.logging.StructuredLog;
import java.nio.file.Path;
import java.util.Map;

public final class CommandIdeWorker {
    private CommandIdeWorker() {}

    public static void main(String[] args) {
        Thread.currentThread().setName("command-ide-worker-main");
        StructuredLog.info("worker.starting", null, Map.of(
                "version", "0.1.0-beta.2",
                "pid", ProcessHandle.current().pid()));

        try {
            Path dataDirectory = resolveDataDirectory();
            DatabaseManager database = new DatabaseManager(dataDirectory.resolve("command-ide.sqlite3"));
            DatabaseManager.RecoveryResult recovery = database.initializeWithRecovery();
            if (recovery.recovered()) {
                StructuredLog.warn("database.recovered", null, Map.of(
                        "backupFileName", recovery.backupFileName()));
            }
            new FramedJsonRpcServer(System.in, System.out, database).run();
        } catch (Exception exception) {
            StructuredLog.error("worker.terminated", null, StructuredLog.errorContext(exception));
            System.exit(1);
        }
    }

    private static Path resolveDataDirectory() {
        String configured = System.getenv("CMD_IDE_DATA_DIR");
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        return Path.of(System.getProperty("user.home"), ".command-ide").toAbsolutePath().normalize();
    }
}
