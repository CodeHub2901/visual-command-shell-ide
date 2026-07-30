package dev.commandide.worker.language;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.commandide.worker.system.SystemProfile;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.function.Supplier;

public final class BashLanguageService implements AutoCloseable {
    private static final int MAX_DOCUMENTS = 16;
    private static final int MAX_SOURCE_LENGTH = 1_000_000;
    private static final int MAX_COMPLETIONS = 200;
    private static final int MAX_SYMBOLS = 500;
    private static final int MAX_REFERENCES = 1000;

    @FunctionalInterface
    interface ClientLauncher {
        LspClient launch(BashLanguageServerLaunch command, Consumer<JsonNode> listener) throws IOException;
    }

    private record Session(String id, String uri, int version) {}

    private final ObjectMapper mapper = new ObjectMapper();
    private final Supplier<Optional<BashLanguageServerLaunch>> launchCommand;
    private final ClientLauncher launcher;
    private final Consumer<LanguageDiagnosticsEvent> diagnosticsListener;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private volatile LspClient client;

    public BashLanguageService(
            SystemProfile profile,
            Consumer<LanguageDiagnosticsEvent> diagnosticsListener) {
        this(() -> BashLanguageServerLaunch.resolve(profile),
                LspClient::launch,
                diagnosticsListener);
    }

    BashLanguageService(
            Supplier<Optional<BashLanguageServerLaunch>> launchCommand,
            ClientLauncher launcher,
            Consumer<LanguageDiagnosticsEvent> diagnosticsListener) {
        this.launchCommand = launchCommand;
        this.launcher = launcher;
        this.diagnosticsListener = diagnosticsListener;
    }

    public synchronized LanguageOpenResult open(String source) {
        requireSource(source);
        if (sessions.size() >= MAX_DOCUMENTS) {
            throw new IllegalStateException("At most 16 language documents may be open");
        }
        if (client == null) {
            Optional<BashLanguageServerLaunch> command = launchCommand.get();
            if (command.isEmpty()) {
                return LanguageOpenResult.unavailable(
                        "The bundled Bash Language Server is unavailable. Catalog assistance remains available offline.");
            }
            try {
                client = launcher.launch(command.get(), this::handleNotification);
                initialize(client);
            } catch (IOException exception) {
                closeClient();
                return LanguageOpenResult.unavailable(
                        "Bash Language Server could not start. Catalog assistance remains available offline.");
            }
        }

        String id = UUID.randomUUID().toString();
        String uri = "untitled:command-ide/" + id + ".sh";
        Session session = new Session(id, uri, 1);
        sessions.put(id, session);
        try {
            client.notify("textDocument/didOpen", didOpenParams(session, source));
            return LanguageOpenResult.opened(id);
        } catch (IOException exception) {
            sessions.remove(id);
            closeClient();
            return LanguageOpenResult.unavailable(
                    "Bash Language Server stopped unexpectedly. Catalog assistance remains available offline.");
        }
    }

    public synchronized void change(String sessionId, String source, int version) throws IOException {
        requireSource(source);
        Session current = requireSession(sessionId);
        if (version <= current.version()) throw new IllegalArgumentException("Language document version must increase");
        Session changed = new Session(current.id(), current.uri(), version);
        ObjectNode params = mapper.createObjectNode();
        ObjectNode document = params.putObject("textDocument");
        document.put("uri", changed.uri());
        document.put("version", version);
        params.putArray("contentChanges").addObject().put("text", source);
        requireClient().notify("textDocument/didChange", params);
        sessions.put(sessionId, changed);
    }

    public synchronized void close(String sessionId) throws IOException {
        Session session = requireSession(sessionId);
        ObjectNode params = mapper.createObjectNode();
        params.putObject("textDocument").put("uri", session.uri());
        requireClient().notify("textDocument/didClose", params);
        sessions.remove(sessionId);
    }

    public LanguageCompletionResult completion(String sessionId, int line, int character) throws IOException {
        requirePosition(line, character);
        Session session = requireSession(sessionId);
        JsonNode result = requireClient().request(
                "textDocument/completion", positionParams(session, line, character));
        JsonNode items = result.isArray() ? result : result.path("items");
        boolean incomplete = result.isObject() && result.path("isIncomplete").asBoolean(false);
        List<LanguageCompletionItem> normalized = new ArrayList<>();
        if (items.isArray()) {
            for (JsonNode item : items) {
                if (normalized.size() >= MAX_COMPLETIONS) break;
                String label = LspClient.bounded(item.path("label").asText(""), 500);
                if (label.isBlank()) continue;
                String insertText = item.path("insertText").isTextual()
                        ? item.path("insertText").asText()
                        : item.path("textEdit").path("newText").asText(label);
                normalized.add(new LanguageCompletionItem(
                        label,
                        LspClient.bounded(insertText, 4096),
                        nullableText(item.get("detail"), 2000),
                        documentation(item.get("documentation")),
                        Math.max(1, Math.min(25, item.path("kind").asInt(1))),
                        item.path("insertTextFormat").asInt(1) == 2));
            }
        }
        return new LanguageCompletionResult(List.copyOf(normalized), incomplete);
    }

    public LanguageHoverResult hover(String sessionId, int line, int character) throws IOException {
        requirePosition(line, character);
        Session session = requireSession(sessionId);
        JsonNode result = requireClient().request(
                "textDocument/hover", positionParams(session, line, character));
        if (result == null || result.isNull() || result.isMissingNode()) return new LanguageHoverResult(null);
        String contents = hoverContents(result.path("contents"));
        return new LanguageHoverResult(contents == null || contents.isBlank()
                ? null
                : LspClient.bounded(contents, 20_000));
    }

    public LanguageSymbolsResult symbols(String sessionId) throws IOException {
        Session session = requireSession(sessionId);
        ObjectNode params = mapper.createObjectNode();
        params.putObject("textDocument").put("uri", session.uri());
        JsonNode result = requireClient().request("textDocument/documentSymbol", params);
        List<LanguageSymbol> symbols = new ArrayList<>();
        if (result.isArray()) {
            for (JsonNode item : result) {
                appendSymbol(item, session.uri(), null, symbols, 0);
                if (symbols.size() >= MAX_SYMBOLS) break;
            }
        }
        return new LanguageSymbolsResult(List.copyOf(symbols));
    }

    public LanguageReferencesResult references(
            String sessionId,
            int line,
            int character) throws IOException {
        requirePosition(line, character);
        Session session = requireSession(sessionId);
        ObjectNode params = positionParams(session, line, character);
        params.putObject("context").put("includeDeclaration", true);
        JsonNode result = requireClient().request("textDocument/references", params);
        List<LanguageReference> references = new ArrayList<>();
        if (result.isArray()) {
            for (JsonNode item : result) {
                if (references.size() >= MAX_REFERENCES) break;
                if (!session.uri().equals(item.path("uri").asText(""))) continue;
                JsonNode range = item.path("range");
                if (validLspRange(range)) {
                    references.add(new LanguageReference(range(range)));
                }
            }
        }
        return new LanguageReferencesResult(List.copyOf(references));
    }

    private void initialize(LspClient languageClient) throws IOException {
        ObjectNode params = mapper.createObjectNode();
        params.put("processId", ProcessHandle.current().pid());
        params.putNull("rootUri");
        params.putObject("clientInfo").put("name", "Command IDE").put("version", "0.1.0");
        ObjectNode textDocument = params.putObject("capabilities").putObject("textDocument");
        textDocument.putObject("completion").putObject("completionItem")
                .putArray("documentationFormat").add("markdown").add("plaintext");
        textDocument.putObject("hover")
                .putArray("contentFormat").add("markdown").add("plaintext");
        params.putNull("workspaceFolders");
        languageClient.request("initialize", params);
        languageClient.notify("initialized", mapper.createObjectNode());
    }

    private ObjectNode didOpenParams(Session session, String source) {
        ObjectNode params = mapper.createObjectNode();
        ObjectNode document = params.putObject("textDocument");
        document.put("uri", session.uri());
        document.put("languageId", "shellscript");
        document.put("version", session.version());
        document.put("text", source);
        return params;
    }

    private ObjectNode positionParams(Session session, int line, int character) {
        ObjectNode params = mapper.createObjectNode();
        params.putObject("textDocument").put("uri", session.uri());
        ObjectNode position = params.putObject("position");
        position.put("line", line);
        position.put("character", character);
        return params;
    }

    private void handleNotification(JsonNode notification) {
        if (!"textDocument/publishDiagnostics".equals(notification.path("method").asText())) return;
        JsonNode params = notification.path("params");
        String uri = params.path("uri").asText("");
        Session session = sessions.values().stream()
                .filter(candidate -> candidate.uri().equals(uri))
                .findFirst()
                .orElse(null);
        if (session == null) return;
        List<LanguageDiagnostic> diagnostics = new ArrayList<>();
        JsonNode values = params.path("diagnostics");
        if (values.isArray()) {
            for (JsonNode value : values) {
                if (diagnostics.size() >= 1000) break;
                JsonNode range = value.path("range");
                String message = LspClient.bounded(value.path("message").asText(""), 1000);
                if (message.isBlank() || !validLspPosition(range.path("start"))
                        || !validLspPosition(range.path("end"))) continue;
                diagnostics.add(new LanguageDiagnostic(
                        new LanguageRange(
                                position(range.path("start")),
                                position(range.path("end"))),
                        severity(value.path("severity").asInt(3)),
                        nullableText(value.get("code"), 100),
                        message,
                        nullableText(value.get("source"), 100)));
            }
        }
        Integer version = params.path("version").isIntegralNumber()
                ? params.path("version").asInt()
                : null;
        diagnosticsListener.accept(new LanguageDiagnosticsEvent(
                session.id(), version, List.copyOf(diagnostics)));
    }

    private void appendSymbol(
            JsonNode item,
            String allowedUri,
            String inheritedContainer,
            List<LanguageSymbol> symbols,
            int depth) {
        if (symbols.size() >= MAX_SYMBOLS || depth > 32) return;
        String name = LspClient.bounded(item.path("name").asText(""), 500);
        JsonNode symbolRange = item.path("range");
        JsonNode selectionRange = item.path("selectionRange");
        String container = inheritedContainer;
        if (!validLspRange(symbolRange)) {
            JsonNode location = item.path("location");
            if (!allowedUri.equals(location.path("uri").asText(""))
                    || !validLspRange(location.path("range"))) return;
            symbolRange = location.path("range");
            selectionRange = symbolRange;
            container = nullableText(item.get("containerName"), 500);
        } else if (!validLspRange(selectionRange)) {
            selectionRange = symbolRange;
        }
        if (name.isBlank()) return;
        symbols.add(new LanguageSymbol(
                name,
                nullableText(item.get("detail"), 2000),
                container,
                Math.max(1, Math.min(26, item.path("kind").asInt(1))),
                range(symbolRange),
                range(selectionRange)));
        JsonNode children = item.path("children");
        if (children.isArray()) {
            for (JsonNode child : children) {
                appendSymbol(child, allowedUri, name, symbols, depth + 1);
                if (symbols.size() >= MAX_SYMBOLS) return;
            }
        }
    }

    private String documentation(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (value.isTextual()) return LspClient.bounded(value.asText(), 20_000);
        if (value.isObject() && value.path("value").isTextual()) {
            return LspClient.bounded(value.path("value").asText(), 20_000);
        }
        return null;
    }

    private String hoverContents(JsonNode value) {
        if (value.isTextual()) return value.asText();
        if (value.isObject()) return value.path("value").isTextual() ? value.path("value").asText() : null;
        if (!value.isArray()) return null;
        List<String> parts = new ArrayList<>();
        for (JsonNode item : value) {
            String text = item.isTextual() ? item.asText()
                    : item.path("value").isTextual() ? item.path("value").asText() : null;
            if (text != null && !text.isBlank()) parts.add(text);
        }
        return String.join("\n\n", parts);
    }

    private String nullableText(JsonNode value, int maximum) {
        if (value == null || value.isNull()) return null;
        if (value.isTextual() || value.isNumber()) return LspClient.bounded(value.asText(), maximum);
        return null;
    }

    private String severity(int severity) {
        return switch (severity) {
            case 1 -> "error";
            case 2 -> "warning";
            case 4 -> "hint";
            default -> "information";
        };
    }

    private boolean validLspPosition(JsonNode value) {
        return value.path("line").isIntegralNumber()
                && value.path("line").canConvertToInt()
                && value.path("line").asInt() >= 0
                && value.path("line").asInt() <= 1_000_000
                && value.path("character").isIntegralNumber()
                && value.path("character").canConvertToInt()
                && value.path("character").asInt() >= 0
                && value.path("character").asInt() <= 1_000_000;
    }

    private boolean validLspRange(JsonNode value) {
        return value.isObject()
                && validLspPosition(value.path("start"))
                && validLspPosition(value.path("end"));
    }

    private LanguagePosition position(JsonNode value) {
        return new LanguagePosition(value.path("line").asInt(), value.path("character").asInt());
    }

    private LanguageRange range(JsonNode value) {
        return new LanguageRange(position(value.path("start")), position(value.path("end")));
    }

    private Session requireSession(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) throw new IllegalArgumentException("Unknown language session");
        return session;
    }

    private LspClient requireClient() throws IOException {
        LspClient current = client;
        if (current == null) throw new IOException("Bash Language Server is unavailable");
        return current;
    }

    private void requireSource(String source) {
        if (source == null || source.length() > MAX_SOURCE_LENGTH) {
            throw new IllegalArgumentException("Bash source must contain at most 1,000,000 characters");
        }
    }

    private void requirePosition(int line, int character) {
        if (line < 0 || line > 1_000_000 || character < 0 || character > 1_000_000) {
            throw new IllegalArgumentException("Language position is outside the allowed range");
        }
    }

    private synchronized void closeClient() {
        sessions.clear();
        LspClient current = client;
        client = null;
        if (current != null) current.close();
    }

    @Override
    public void close() {
        closeClient();
    }
}
