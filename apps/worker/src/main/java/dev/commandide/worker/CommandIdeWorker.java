package dev.commandide.worker;

import dev.commandide.worker.protocol.FramedJsonRpcServer;
import dev.commandide.worker.persistence.DatabaseManager;
import java.nio.file.Path;

public final class CommandIdeWorker {
    private CommandIdeWorker() {}

    public static void main(String[] args) {
        Thread.currentThread().setName("command-ide-worker-main");
        System.err.println("Command IDE Java worker 0.1.0 starting");

        try {
            Path dataDirectory = resolveDataDirectory();
            DatabaseManager database = new DatabaseManager(dataDirectory.resolve("command-ide.sqlite3"));
            DatabaseManager.RecoveryResult recovery = database.initializeWithRecovery();
            if (recovery.recovered()) {
                System.err.println(
                        "Recovered a corrupt local database; preserved backup "
                                + recovery.backupFileName());
            }
            new FramedJsonRpcServer(System.in, System.out, database).run();
        } catch (Exception exception) {
            System.err.println("Java worker terminated after a protocol failure: " + exception.getMessage());
            exception.printStackTrace(System.err);
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
