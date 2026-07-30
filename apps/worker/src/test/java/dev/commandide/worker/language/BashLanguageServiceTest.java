package dev.commandide.worker.language;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

final class BashLanguageServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void remainsAvailableWithCatalogFallbackWhenServerIsMissing() {
        try (BashLanguageService service = new BashLanguageService(
                Optional::<BashLanguageServerLaunch>empty,
                (path, listener) -> { throw new AssertionError("Missing tool must not launch"); },
                event -> {})) {
            LanguageOpenResult result = service.open("echo hello");

            assertEquals("unavailable", result.status());
            assertNull(result.sessionId());
            assertTrue(result.reason().contains("bundled"));
        }
    }

    @Test
    void ownsInitializeDocumentRequestsAndNormalizedDiagnostics() throws Exception {
        AtomicReference<LanguageDiagnosticsEvent> published = new AtomicReference<>();
        CountDownLatch diagnosticsReady = new CountDownLatch(1);
        try (BashLanguageService service = new BashLanguageService(
                () -> Optional.of(new BashLanguageServerLaunch(
                        Path.of("/trusted/bash-language-server"),
                        List.of("start"),
                        Map.of(),
                        "system",
                        "/trusted/bash-language-server")),
                (command, listener) -> fakeClient(listener),
                event -> {
                    published.set(event);
                    diagnosticsReady.countDown();
                })) {
            LanguageOpenResult opened = service.open("echo hello");
            LanguageCompletionResult completions = service.completion(opened.sessionId(), 0, 4);
            LanguageHoverResult hover = service.hover(opened.sessionId(), 0, 1);
            LanguageSymbolsResult symbols = service.symbols(opened.sessionId());
            LanguageReferencesResult references = service.references(opened.sessionId(), 0, 1);
            service.change(opened.sessionId(), "echo changed", 2);

            assertEquals("opened", opened.status());
            assertEquals(1, completions.items().size());
            assertEquals("echo", completions.items().getFirst().label());
            assertEquals("echo ${1:text}", completions.items().getFirst().insertText());
            assertTrue(completions.items().getFirst().snippet());
            assertEquals("Print text", hover.contents());
            assertEquals(List.of("run", "VALUE"),
                    symbols.symbols().stream().map(LanguageSymbol::name).toList());
            assertEquals("run", symbols.symbols().get(1).containerName());
            assertEquals(1, references.references().size());
            assertTrue(diagnosticsReady.await(2, TimeUnit.SECONDS));
            assertEquals(opened.sessionId(), published.get().sessionId());
            assertEquals("warning", published.get().diagnostics().getFirst().severity());
            assertEquals("SC1000", published.get().diagnostics().getFirst().code());

            service.close(opened.sessionId());
        }
    }

    private LspClient fakeClient(java.util.function.Consumer<JsonNode> listener) throws IOException {
        PipedInputStream serverInput = new PipedInputStream();
        PipedOutputStream clientOutput = new PipedOutputStream(serverInput);
        PipedInputStream clientInput = new PipedInputStream();
        PipedOutputStream serverOutput = new PipedOutputStream(clientInput);
        Thread.ofPlatform().name("fake-bash-language-server").daemon(true).start(() -> {
            try (serverInput; serverOutput) {
                String documentUri = null;
                while (true) {
                    byte[] frame = LspFrameCodec.readFrame(serverInput);
                    if (frame == null) return;
                    JsonNode message = mapper.readTree(frame);
                    String method = message.path("method").asText();
                    if ("initialize".equals(method)) {
                        respond(serverOutput, message.path("id").asLong(), mapper.createObjectNode());
                    } else if ("textDocument/didOpen".equals(method)) {
                        documentUri = message.path("params").path("textDocument").path("uri").asText();
                        ObjectNode notification = rpcNotification("textDocument/publishDiagnostics");
                        ObjectNode params = notification.putObject("params");
                        params.put("uri", documentUri);
                        params.put("version", 1);
                        ObjectNode diagnostic = params.putArray("diagnostics").addObject();
                        ObjectNode range = diagnostic.putObject("range");
                        range.putObject("start").put("line", 0).put("character", 0);
                        range.putObject("end").put("line", 0).put("character", 4);
                        diagnostic.put("severity", 2);
                        diagnostic.put("code", "SC1000");
                        diagnostic.put("source", "shellcheck");
                        diagnostic.put("message", "Example warning");
                        write(serverOutput, notification);
                    } else if ("textDocument/completion".equals(method)) {
                        ArrayNode items = mapper.createArrayNode();
                        items.addObject()
                                .put("label", "echo")
                                .put("insertText", "echo ${1:text}")
                                .put("insertTextFormat", 2)
                                .put("detail", "Bash builtin")
                                .put("kind", 3)
                                .putObject("documentation")
                                .put("kind", "markdown")
                                .put("value", "Print arguments");
                        respond(serverOutput, message.path("id").asLong(), items);
                    } else if ("textDocument/hover".equals(method)) {
                        ObjectNode result = mapper.createObjectNode();
                        result.putObject("contents").put("kind", "markdown").put("value", "Print text");
                        respond(serverOutput, message.path("id").asLong(), result);
                    } else if ("textDocument/documentSymbol".equals(method)) {
                        ArrayNode result = mapper.createArrayNode();
                        ObjectNode function = result.addObject();
                        function.put("name", "run").put("kind", 12);
                        addRange(function.putObject("range"), 0, 0, 2, 1);
                        addRange(function.putObject("selectionRange"), 0, 0, 0, 3);
                        ObjectNode variable = function.putArray("children").addObject();
                        variable.put("name", "VALUE").put("kind", 13);
                        addRange(variable.putObject("range"), 1, 2, 1, 12);
                        addRange(variable.putObject("selectionRange"), 1, 2, 1, 7);
                        respond(serverOutput, message.path("id").asLong(), result);
                    } else if ("textDocument/references".equals(method)) {
                        ArrayNode result = mapper.createArrayNode();
                        ObjectNode local = result.addObject().put("uri", documentUri);
                        addRange(local.putObject("range"), 0, 0, 0, 3);
                        ObjectNode external = result.addObject().put("uri", "file:///private/other.sh");
                        addRange(external.putObject("range"), 0, 0, 0, 3);
                        respond(serverOutput, message.path("id").asLong(), result);
                    } else if ("shutdown".equals(method)) {
                        respond(serverOutput, message.path("id").asLong(), mapper.nullNode());
                    } else if ("exit".equals(method)) {
                        return;
                    }
                }
            } catch (Exception ignored) {
                // Client closure is the normal end of the fake server.
            }
        });
        return LspClient.forTest(clientInput, clientOutput, listener);
    }

    private ObjectNode rpcNotification(String method) {
        ObjectNode message = mapper.createObjectNode();
        message.put("jsonrpc", "2.0");
        message.put("method", method);
        return message;
    }

    private void respond(PipedOutputStream output, long id, JsonNode result) throws Exception {
        ObjectNode response = mapper.createObjectNode();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.set("result", result);
        write(output, response);
    }

    private void write(PipedOutputStream output, JsonNode message) throws Exception {
        LspFrameCodec.writeFrame(output, mapper.writeValueAsBytes(message));
    }

    private void addRange(
            ObjectNode range,
            int startLine,
            int startCharacter,
            int endLine,
            int endCharacter) {
        range.putObject("start").put("line", startLine).put("character", startCharacter);
        range.putObject("end").put("line", endLine).put("character", endCharacter);
    }
}
