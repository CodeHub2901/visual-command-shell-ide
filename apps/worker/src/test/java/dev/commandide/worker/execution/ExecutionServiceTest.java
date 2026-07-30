package dev.commandide.worker.execution;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.persistence.ExecutionHistoryRepository;
import dev.commandide.worker.risk.RiskAssessment;
import dev.commandide.worker.risk.RiskAssessmentService;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class ExecutionServiceTest {
    @TempDir
    Path temporaryDirectory;
    private RiskAssessmentService risks;
    private ExecutionHistoryRepository history;
    private FakeTerminalProcess process;
    private List<ExecutionEvent> events;
    private CountDownLatch exited;
    private ExecutionService service;

    @BeforeEach
    void initialize() throws Exception {
        SystemProfile profile = new SystemProfile(
                "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true), List.of());
        CatalogService catalog = new CatalogService(profile);
        BashGenerator generator = new BashGenerator(catalog);
        risks = new RiskAssessmentService(catalog, generator);
        DatabaseManager database = new DatabaseManager(temporaryDirectory.resolve("history.db"), false);
        database.initialize();
        history = new ExecutionHistoryRepository(database);
        process = new FakeTerminalProcess();
        events = new CopyOnWriteArrayList<>();
        exited = new CountDownLatch(1);
        service = new ExecutionService(
                Path.of("C:\\fake\\bash.exe"),
                risks,
                history,
                (executable, arguments, environment, directory, columns, rows) -> {
                    process.command = arguments;
                    process.columns = columns;
                    process.rows = rows;
                    return process;
                },
                event -> {
                    events.add(event);
                    if (event.type().equals("exit")) exited.countDown();
                },
                Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void streamsInputOutputResizeCancellationAndRedactedHistory() throws Exception {
        ShellProgram program = commandProgram("ls", List.of());
        RiskAssessment assessment = risks.assess(program);
        ExecutionStartResult started = service.start(request(program, assessment, false, null, "guided"));

        service.input(started.sessionId(), "secret input\n");
        service.resize(started.sessionId(), 120, 40);
        process.emit("hello from pty\r\n");
        service.cancel(started.sessionId());

        assertTrue(exited.await(2, TimeUnit.SECONDS));
        assertEquals("secret input\n", process.stdin.toString(StandardCharsets.UTF_8));
        assertEquals(120, process.columns);
        assertEquals(40, process.rows);
        assertEquals(List.of("--noprofile", "--norc", "-c", assessment.script()), process.command);
        assertTrue(events.stream().anyMatch(event ->
                event.type().equals("output") && event.data().contains("hello from pty")));
        assertTrue(events.stream().anyMatch(event ->
                event.type().equals("exit") && event.exitStatus() == 130));
        var stored = history.recent(1).getFirst();
        assertEquals(started.sessionId(), stored.id());
        assertEquals(130, stored.exitStatus());
        assertFalse(stored.redactedCommandText().contains("secret input"));
    }

    @Test
    void independentlyEnforcesMediumAndCriticalConfirmationsBeforeStarting() {
        ShellProgram medium = commandProgram("cp", List.of(
                new ShellProgram.ArgumentValue("source", "source.txt", "literal"),
                new ShellProgram.ArgumentValue("destination", "copy.txt", "literal")));
        RiskAssessment mediumRisk = risks.assess(medium);
        assertEquals("medium", mediumRisk.level());
        assertThrows(IllegalArgumentException.class,
                () -> service.start(request(medium, mediumRisk, false, null, "guided")));

        ShellProgram critical = new ShellProgram(
                "1.4.0", "bash",
                List.of(new ShellProgram.CommandNode(
                        "remove-tree",
                        "rm",
                        List.of(new ShellProgram.OptionSelection("recursive", "-r", null)),
                        List.of(new ShellProgram.ArgumentValue(
                                "files", "old-directory", "literal")))));
        RiskAssessment criticalRisk = risks.assess(critical);
        assertEquals("critical", criticalRisk.level());
        assertEquals("rm -r old-directory", criticalRisk.script());
        assertThrows(IllegalArgumentException.class,
                () -> service.start(request(
                        critical,
                        criticalRisk,
                        true,
                        ExecutionService.confirmationPhrase(criticalRisk.reviewHash()),
                        "guided")));
        assertThrows(IllegalArgumentException.class,
                () -> service.start(request(critical, criticalRisk, true, "RUN wrong", "compact")));
        assertTrue(process.command == null);
    }

    @Test
    void rejectsAStaleReviewedScriptOrHash() {
        ShellProgram program = commandProgram("ls", List.of());
        RiskAssessment assessment = risks.assess(program);
        ExecutionRequest stale = new ExecutionRequest(
                program,
                assessment.script() + " ",
                assessment.reviewHash(),
                "guided",
                false,
                null,
                temporaryDirectory.toString(),
                80,
                24);

        assertThrows(IllegalArgumentException.class, () -> service.start(stale));
        assertTrue(process.command == null);
    }

    @Test
    void recordsAndEmitsANonzeroExitStatus() throws Exception {
        ShellProgram program = commandProgram("ls", List.of());
        RiskAssessment assessment = risks.assess(program);
        ExecutionStartResult started = service.start(request(program, assessment, false, null, "guided"));

        process.finish(7);

        assertTrue(exited.await(2, TimeUnit.SECONDS));
        assertTrue(events.stream().anyMatch(event ->
                event.type().equals("exit") && event.exitStatus() == 7));
        var stored = history.recent(1).getFirst();
        assertEquals(started.sessionId(), stored.id());
        assertEquals(7, stored.exitStatus());
    }

    private ExecutionRequest request(
            ShellProgram program,
            RiskAssessment assessment,
            boolean confirmed,
            String typedConfirmation,
            String mode) {
        return new ExecutionRequest(
                program,
                assessment.script(),
                assessment.reviewHash(),
                mode,
                confirmed,
                typedConfirmation,
                temporaryDirectory.toString(),
                80,
                24);
    }

    private static ShellProgram commandProgram(
            String commandId,
            List<ShellProgram.ArgumentValue> arguments) {
        return new ShellProgram(
                "1.4.0", "bash",
                List.of(new ShellProgram.CommandNode(
                        "command", commandId, List.of(), arguments)));
    }

    private static final class FakeTerminalProcess implements TerminalProcess {
        private final PipedInputStream stdout = new PipedInputStream();
        private final PipedOutputStream producer;
        private final ByteArrayOutputStream stdin = new ByteArrayOutputStream();
        private final CountDownLatch terminated = new CountDownLatch(1);
        private volatile boolean alive = true;
        private volatile int columns;
        private volatile int rows;
        private volatile List<String> command;
        private volatile int exitStatus = 130;

        private FakeTerminalProcess() throws Exception {
            producer = new PipedOutputStream(stdout);
        }

        private void emit(String value) throws Exception {
            producer.write(value.getBytes(StandardCharsets.UTF_8));
            producer.flush();
        }

        private void finish(int status) throws Exception {
            exitStatus = status;
            alive = false;
            producer.close();
            terminated.countDown();
        }

        @Override
        public InputStream input() {
            return stdout;
        }

        @Override
        public OutputStream output() {
            return stdin;
        }

        @Override
        public void resize(int columns, int rows) {
            this.columns = columns;
            this.rows = rows;
        }

        @Override
        public int waitFor() throws InterruptedException {
            terminated.await();
            return exitStatus;
        }

        @Override
        public boolean isAlive() {
            return alive;
        }

        @Override
        public void terminateTree() throws InterruptedException {
            alive = false;
            try {
                producer.close();
            } catch (Exception ignored) {
                // The test process may already have reached EOF.
            }
            terminated.countDown();
        }
    }
}
