// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

import dev.commandide.worker.logging.StructuredLog;
import dev.commandide.worker.catalog.ExecutableDiscovery;
import dev.commandide.worker.persistence.ExecutionHistoryEntry;
import dev.commandide.worker.persistence.ExecutionHistoryRepository;
import dev.commandide.worker.risk.RiskAssessment;
import dev.commandide.worker.risk.RiskAssessmentService;
import dev.commandide.worker.security.SecretRedactor;
import dev.commandide.worker.system.SystemProfile;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public final class ExecutionService implements AutoCloseable {
    private static final int MAX_SESSIONS = 4;
    private static final int MAX_SCRIPT_CHARS = 1_000_000;
    private static final int MAX_INPUT_BYTES = 65_536;
    private static final long MAX_OUTPUT_CHARS = 20_000_000;
    private static final Set<String> ALLOWED_ENVIRONMENT = Set.of(
            "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG",
            "TMPDIR", "TMP", "TEMP", "DISPLAY", "WAYLAND_DISPLAY");

    private final Path bash;
    private final RiskAssessmentService risks;
    private final ExecutionHistoryRepository history;
    private final TerminalProcessFactory processes;
    private final EventSink events;
    private final Clock clock;
    private final SecretRedactor redactor = new SecretRedactor();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public ExecutionService(
            SystemProfile profile,
            RiskAssessmentService risks,
            ExecutionHistoryRepository history,
            EventSink events) {
        this(
                ExecutableDiscovery.find("bash", profile.pathEntries(), profile.operatingSystem()).orElse(null),
                risks,
                history,
                new Pty4jTerminalProcessFactory(),
                events,
                Clock.systemUTC());
    }

    ExecutionService(
            Path bash,
            RiskAssessmentService risks,
            ExecutionHistoryRepository history,
            TerminalProcessFactory processes,
            EventSink events,
            Clock clock) {
        this.bash = bash;
        this.risks = risks;
        this.history = history;
        this.processes = processes;
        this.events = events;
        this.clock = clock;
    }

    public synchronized ExecutionStartResult start(ExecutionRequest request) throws Exception {
        if (sessions.size() >= MAX_SESSIONS) {
            throw new IllegalStateException("At most four terminal sessions may run at once");
        }
        if (bash == null) {
            throw new IllegalStateException("Execution requires a discovered bash executable");
        }
        validateRequestShape(request);
        RiskAssessment assessment = risks.assess(request.program());
        if (!assessment.script().equals(request.reviewedScript())
                || !assessment.reviewHash().equals(request.reviewHash())) {
            throw new IllegalArgumentException("The reviewed script or hash is stale");
        }
        requireConfirmation(request, assessment);
        Path workingDirectory = validateWorkingDirectory(request.workingDirectory());
        String sessionId = UUID.randomUUID().toString();
        Instant startedAt = clock.instant();
        TerminalProcess process = processes.start(
                bash,
                List.of("--noprofile", "--norc", "-c", request.reviewedScript()),
                terminalEnvironment(),
                workingDirectory,
                request.columns(),
                request.rows());
        Session session = new Session(sessionId, process, assessment, startedAt);
        sessions.put(sessionId, session);
        try {
            history.started(new ExecutionHistoryEntry(
                    sessionId,
                    startedAt,
                    null,
                    workingDirectory.toString(),
                    null,
                    redactor.redact(request.reviewedScript()),
                    assessment.level()));
            emit(session, "started", null, null, null);
            Thread.ofVirtual().name("terminal-session-" + sessionId).start(() -> runSession(session));
            return new ExecutionStartResult(
                    sessionId, assessment.level(), assessment.reviewHash(), startedAt.toString());
        } catch (Exception exception) {
            sessions.remove(sessionId);
            process.terminateTree();
            throw exception;
        }
    }

    public void input(String sessionId, String data) throws Exception {
        if (data == null || data.isEmpty()
                || data.getBytes(StandardCharsets.UTF_8).length > MAX_INPUT_BYTES
                || data.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Invalid terminal input");
        }
        Session session = requireSession(sessionId);
        synchronized (session.process.output()) {
            session.process.output().write(data.getBytes(StandardCharsets.UTF_8));
            session.process.output().flush();
        }
    }

    public void resize(String sessionId, int columns, int rows) {
        if (columns < 2 || columns > 500 || rows < 2 || rows > 200) {
            throw new IllegalArgumentException("Invalid terminal dimensions");
        }
        requireSession(sessionId).process.resize(columns, rows);
    }

    public void cancel(String sessionId) throws Exception {
        Session session = requireSession(sessionId);
        session.process.terminateTree();
    }

    public List<ExecutionHistoryItem> recentHistory(int limit) throws Exception {
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("Invalid history limit");
        return history.recent(limit).stream()
                .map(entry -> new ExecutionHistoryItem(
                        entry.id(),
                        entry.startedAt().toString(),
                        entry.finishedAt() == null ? null : entry.finishedAt().toString(),
                        entry.workingDirectory(),
                        entry.exitStatus(),
                        entry.redactedCommandText(),
                        entry.riskLevel()))
                .toList();
    }

    @Override
    public void close() {
        for (Session session : List.copyOf(sessions.values())) {
            try {
                session.process.terminateTree();
            } catch (Exception exception) {
                var context = new java.util.LinkedHashMap<>(StructuredLog.errorContext(exception));
                context.put("sessionId", session.id);
                StructuredLog.warn("execution.stop_failed", null, context);
            }
        }
        sessions.clear();
    }

    private void runSession(Session session) {
        int exitStatus = -1;
        try (var reader = new InputStreamReader(session.process.input(), StandardCharsets.UTF_8)) {
            char[] buffer = new char[4096];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                long total = session.outputChars.addAndGet(read);
                if (total > MAX_OUTPUT_CHARS) {
                    emit(session, "error", null, null, "Terminal output exceeded the 20 MB session limit");
                    session.process.terminateTree();
                    break;
                }
                emit(session, "output", new String(buffer, 0, read), null, null);
            }
            exitStatus = session.process.waitFor();
        } catch (Exception exception) {
            if (session.process.isAlive()) {
                emit(session, "error", null, null, "Terminal session failed");
                try {
                    session.process.terminateTree();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
        } finally {
            complete(session, exitStatus);
        }
    }

    private void complete(Session session, int exitStatus) {
        if (!session.completed.compareAndSet(false, true)) return;
        sessions.remove(session.id);
        Instant finishedAt = clock.instant();
        try {
            history.finished(session.id, finishedAt, exitStatus);
        } catch (Exception exception) {
            var context = new java.util.LinkedHashMap<>(StructuredLog.errorContext(exception));
            context.put("sessionId", session.id);
            StructuredLog.warn("execution.history_finish_failed", null, context);
        }
        emit(session, "exit", null, exitStatus, null);
    }

    private void emit(
            Session session,
            String type,
            String data,
            Integer exitStatus,
            String message) {
        try {
            events.send(new ExecutionEvent(
                    session.id,
                    session.sequence.incrementAndGet(),
                    type,
                    data,
                    exitStatus,
                    message,
                    clock.instant().toString()));
        } catch (Exception exception) {
            var context = new java.util.LinkedHashMap<>(StructuredLog.errorContext(exception));
            context.put("sessionId", session.id);
            context.put("status", type);
            StructuredLog.error("execution.event_publish_failed", null, context);
            try {
                if (session.process.isAlive()) session.process.terminateTree();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private Session requireSession(String sessionId) {
        try {
            UUID.fromString(sessionId);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid terminal session id");
        }
        Session session = sessions.get(sessionId);
        if (session == null) throw new IllegalArgumentException("Terminal session is not active");
        return session;
    }

    private static void validateRequestShape(ExecutionRequest request) {
        if (request == null || request.program() == null || request.reviewedScript() == null
                || request.reviewedScript().isEmpty()
                || request.reviewedScript().length() > MAX_SCRIPT_CHARS
                || request.reviewedScript().indexOf('\0') >= 0
                || request.reviewHash() == null
                || !request.reviewHash().matches("[a-f0-9]{64}")
                || !Set.of("guided", "compact").contains(request.interfaceMode())
                || request.typedConfirmation() != null && request.typedConfirmation().length() > 100
                || request.workingDirectory() == null || request.workingDirectory().length() > 4096
                || request.columns() < 2 || request.columns() > 500
                || request.rows() < 2 || request.rows() > 200) {
            throw new IllegalArgumentException("Invalid execution request");
        }
    }

    private static void requireConfirmation(ExecutionRequest request, RiskAssessment assessment) {
        if (assessment.level().equals("critical")) {
            if (!request.interfaceMode().equals("compact")) {
                throw new IllegalArgumentException("Critical execution is disabled in Guided mode");
            }
            String expected = confirmationPhrase(assessment.reviewHash());
            if (!request.confirmed() || !expected.equals(request.typedConfirmation())) {
                throw new IllegalArgumentException("Critical execution requires the exact typed confirmation");
            }
        } else if ((assessment.level().equals("medium") || assessment.level().equals("high"))
                && !request.confirmed()) {
            throw new IllegalArgumentException("This risk level requires explicit confirmation");
        }
    }

    public static String confirmationPhrase(String reviewHash) {
        if (reviewHash == null || !reviewHash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("Invalid review hash");
        }
        return "RUN " + reviewHash.substring(0, 12);
    }

    private static Path validateWorkingDirectory(String value) {
        try {
            Path path = Path.of(value);
            if (!path.isAbsolute()) throw new IllegalArgumentException("Working directory must be absolute");
            Path normalized = path.toAbsolutePath().normalize();
            if (!Files.isDirectory(normalized)) {
                throw new IllegalArgumentException("Working directory does not exist");
            }
            return normalized;
        } catch (InvalidPathException exception) {
            throw new IllegalArgumentException("Invalid working directory", exception);
        }
    }

    private static Map<String, String> terminalEnvironment() {
        Map<String, String> environment = new HashMap<>();
        System.getenv().forEach((name, value) -> {
            if (ALLOWED_ENVIRONMENT.contains(name) || name.startsWith("LC_") || name.startsWith("XDG_")) {
                environment.put(name, value);
            }
        });
        environment.put("TERM", "xterm-256color");
        environment.put("COLORTERM", "truecolor");
        environment.put("BASH_ENV", "");
        environment.put("ENV", "");
        return Map.copyOf(environment);
    }

    @FunctionalInterface
    public interface EventSink {
        void send(ExecutionEvent event) throws Exception;
    }

    private static final class Session {
        private final String id;
        private final TerminalProcess process;
        @SuppressWarnings("unused")
        private final RiskAssessment assessment;
        @SuppressWarnings("unused")
        private final Instant startedAt;
        private final AtomicLong sequence = new AtomicLong();
        private final AtomicLong outputChars = new AtomicLong();
        private final AtomicBoolean completed = new AtomicBoolean();

        private Session(
                String id,
                TerminalProcess process,
                RiskAssessment assessment,
                Instant startedAt) {
            this.id = id;
            this.process = process;
            this.assessment = assessment;
            this.startedAt = startedAt;
        }
    }
}
