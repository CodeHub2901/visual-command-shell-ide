package dev.commandide.worker.language;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

final class LspClient implements AutoCloseable {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final Set<String> SAFE_ENVIRONMENT = Set.of(
            "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC",
            "HOME", "USERPROFILE", "USER", "USERNAME", "LOGNAME",
            "LANG", "LC_ALL", "LC_CTYPE", "TMP", "TEMP", "TMPDIR",
            "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME");

    private final ObjectMapper mapper;
    private final InputStream input;
    private final OutputStream output;
    private final Process process;
    private final Consumer<JsonNode> notificationListener;
    private final Map<Long, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
    private final AtomicLong nextId = new AtomicLong(1);
    private final Object outputLock = new Object();
    private final Thread readerThread;
    private volatile boolean closed;

    private LspClient(
            ObjectMapper mapper,
            InputStream input,
            OutputStream output,
            Process process,
            Consumer<JsonNode> notificationListener) {
        this.mapper = mapper;
        this.input = input;
        this.output = output;
        this.process = process;
        this.notificationListener = notificationListener;
        this.readerThread = Thread.ofPlatform()
                .name("bash-language-server-reader")
                .daemon(true)
                .start(this::readLoop);
    }

    static LspClient launch(
            BashLanguageServerLaunch launch,
            Consumer<JsonNode> notificationListener) throws IOException {
        List<String> command = new ArrayList<>();
        command.add(launch.executable().toString());
        command.addAll(launch.arguments());
        ProcessBuilder builder = new ProcessBuilder(command);
        Map<String, String> environment = builder.environment();
        Map<String, String> inherited = System.getenv();
        environment.clear();
        inherited.forEach((name, value) -> {
            if (isSafeEnvironmentName(name)) environment.put(name, value);
        });
        environment.putAll(launch.environment());
        environment.put("BASH_IDE_LOG_LEVEL", "error");
        Process process = builder.start();
        Thread.ofPlatform().name("bash-language-server-stderr").daemon(true).start(() -> {
            try (InputStream errors = process.getErrorStream()) {
                errors.transferTo(OutputStream.nullOutputStream());
            } catch (IOException ignored) {
                // Process shutdown closes this stream.
            }
        });
        return new LspClient(
                new ObjectMapper(),
                process.getInputStream(),
                process.getOutputStream(),
                process,
                notificationListener);
    }

    static LspClient forTest(
            InputStream input,
            OutputStream output,
            Consumer<JsonNode> notificationListener) {
        return new LspClient(new ObjectMapper(), input, output, null, notificationListener);
    }

    JsonNode request(String method, JsonNode params) throws IOException {
        if (closed) throw new IOException("Bash Language Server is not available");
        long id = nextId.getAndIncrement();
        ObjectNode request = mapper.createObjectNode();
        request.put("jsonrpc", "2.0");
        request.put("id", id);
        request.put("method", method);
        request.set("params", params);
        CompletableFuture<JsonNode> response = new CompletableFuture<>();
        pending.put(id, response);
        try {
            write(request);
            return response.get(REQUEST_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while waiting for Bash Language Server", exception);
        } catch (TimeoutException exception) {
            throw new IOException("Bash Language Server request timed out: " + method, exception);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            throw cause instanceof IOException io
                    ? io
                    : new IOException("Bash Language Server request failed", cause);
        } finally {
            pending.remove(id);
        }
    }

    void notify(String method, JsonNode params) throws IOException {
        if (closed) throw new IOException("Bash Language Server is not available");
        ObjectNode notification = mapper.createObjectNode();
        notification.put("jsonrpc", "2.0");
        notification.put("method", method);
        notification.set("params", params);
        write(notification);
    }

    private void write(JsonNode message) throws IOException {
        byte[] payload = mapper.writeValueAsBytes(message);
        synchronized (outputLock) {
            LspFrameCodec.writeFrame(output, payload);
        }
    }

    private void readLoop() {
        try {
            byte[] payload;
            while (!closed && (payload = LspFrameCodec.readFrame(input)) != null) {
                JsonNode message = mapper.readTree(payload);
                if (!message.isObject() || !"2.0".equals(message.path("jsonrpc").asText())) {
                    throw new IOException("Invalid LSP JSON-RPC message");
                }
                if (message.has("id") && message.path("method").isTextual()) {
                    handleServerRequest(message);
                } else if (message.has("id")) handleResponse(message);
                else if (message.path("method").isTextual()) notificationListener.accept(message);
            }
            if (!closed) fail(new IOException("Bash Language Server closed its output"));
        } catch (Exception exception) {
            if (!closed) fail(exception instanceof IOException io
                    ? io
                    : new IOException("Invalid Bash Language Server message", exception));
        }
    }

    private void handleResponse(JsonNode message) {
        JsonNode idNode = message.path("id");
        if (!idNode.isIntegralNumber()) return;
        CompletableFuture<JsonNode> response = pending.remove(idNode.asLong());
        if (response == null) return;
        if (message.has("error")) {
            response.completeExceptionally(new IOException(
                    bounded(message.path("error").path("message").asText("Language server error"), 1000)));
        } else if (message.has("result")) {
            response.complete(message.get("result"));
        } else {
            response.completeExceptionally(new IOException("Malformed Bash Language Server response"));
        }
    }

    private void handleServerRequest(JsonNode message) throws IOException {
        String method = message.path("method").asText();
        ObjectNode response = mapper.createObjectNode();
        response.put("jsonrpc", "2.0");
        response.set("id", message.get("id"));
        switch (method) {
            case "workspace/configuration" -> {
                int count = message.path("params").path("items").isArray()
                        ? message.path("params").path("items").size()
                        : 0;
                response.set("result", mapper.createArrayNode().addAll(
                        java.util.Collections.nCopies(count, mapper.nullNode())));
            }
            case "workspace/workspaceFolders" -> response.set("result", mapper.createArrayNode());
            case "client/registerCapability", "client/unregisterCapability",
                    "window/showMessageRequest" -> response.putNull("result");
            case "workspace/applyEdit" -> {
                ObjectNode result = mapper.createObjectNode();
                result.put("applied", false);
                result.put("failureReason", "Command IDE does not permit language-server edits");
                response.set("result", result);
            }
            default -> {
                ObjectNode error = response.putObject("error");
                error.put("code", -32601);
                error.put("message", "Method not supported by Command IDE");
            }
        }
        write(response);
    }

    private void fail(IOException exception) {
        closed = true;
        pending.values().forEach(future -> future.completeExceptionally(exception));
        pending.clear();
    }

    @Override
    public void close() {
        if (closed) {
            terminateProcess();
            return;
        }
        try {
            request("shutdown", mapper.nullNode());
            notify("exit", mapper.nullNode());
        } catch (IOException ignored) {
            // A failed server cannot be shut down gracefully.
        } finally {
            closed = true;
            try {
                output.close();
            } catch (IOException ignored) {
                // Already closed by the process.
            }
            terminateProcess();
            readerThread.interrupt();
            pending.values().forEach(future ->
                    future.completeExceptionally(new IOException("Bash Language Server stopped")));
            pending.clear();
        }
    }

    private void terminateProcess() {
        if (process == null || !process.isAlive()) return;
        process.destroy();
        try {
            if (!process.waitFor(1, TimeUnit.SECONDS)) process.destroyForcibly();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    private static boolean isSafeEnvironmentName(String name) {
        String upper = name.toUpperCase(Locale.ROOT);
        return SAFE_ENVIRONMENT.contains(upper) || upper.startsWith("LC_");
    }

    static String bounded(String value, int maximum) {
        if (value == null) return null;
        return value.length() <= maximum ? value : value.substring(0, maximum);
    }
}
