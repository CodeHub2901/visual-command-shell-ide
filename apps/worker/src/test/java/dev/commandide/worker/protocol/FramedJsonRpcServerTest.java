package dev.commandide.worker.protocol;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

final class FramedJsonRpcServerTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void handlesHealthCheck() throws Exception {
        String request = """
                {"jsonrpc":"2.0","id":"health-1","method":"v1.health.check","params":{}}
                """.trim();
        ByteArrayOutputStream framedRequest = new ByteArrayOutputStream();
        FrameCodec.writeFrame(framedRequest, request.getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream responseBytes = new ByteArrayOutputStream();

        new FramedJsonRpcServer(
                new ByteArrayInputStream(framedRequest.toByteArray()), responseBytes)
                .run();

        JsonNode response = mapper.readTree(FrameCodec.readFrame(
                new ByteArrayInputStream(responseBytes.toByteArray())));
        assertEquals("2.0", response.path("jsonrpc").asText());
        assertEquals("health-1", response.path("id").asText());
        assertEquals("1.0", response.path("result").path("protocolVersion").asText());
        assertEquals("0.1.0", response.path("result").path("workerVersion").asText());
        assertTrue(response.path("result").path("pid").asLong() > 0);
    }

    @Test
    void rejectsUnknownMethod() throws Exception {
        String request = """
                {"jsonrpc":"2.0","id":"unknown-1","method":"v1.unknown","params":{}}
                """.trim();
        ByteArrayOutputStream framedRequest = new ByteArrayOutputStream();
        FrameCodec.writeFrame(framedRequest, request.getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream responseBytes = new ByteArrayOutputStream();

        new FramedJsonRpcServer(
                new ByteArrayInputStream(framedRequest.toByteArray()), responseBytes)
                .run();

        JsonNode response = mapper.readTree(FrameCodec.readFrame(
                new ByteArrayInputStream(responseBytes.toByteArray())));
        assertEquals(-32601, response.path("error").path("code").asInt());
    }

    @Test
    void rejectsUnknownFieldsAtTheJavaBoundary() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"health-2","method":"v1.health.check","params":{},"injected":true}
                """);

        assertEquals(-32600, response.path("error").path("code").asInt());
    }

    @Test
    void rejectsInvalidIdTypes() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":true,"method":"v1.health.check","params":{}}
                """);

        assertEquals(-32600, response.path("error").path("code").asInt());
    }

    @Test
    void acceptsCancellationAsANotificationWithoutAResponse() throws Exception {
        String request = """
                {"jsonrpc":"2.0","method":"v1.request.cancel","params":{"requestId":"health-1"}}
                """.trim();
        ByteArrayOutputStream framedRequest = new ByteArrayOutputStream();
        FrameCodec.writeFrame(framedRequest, request.getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream responseBytes = new ByteArrayOutputStream();

        new FramedJsonRpcServer(
                new ByteArrayInputStream(framedRequest.toByteArray()), responseBytes)
                .run();

        assertArrayEquals(new byte[0], responseBytes.toByteArray());
    }

    @Test
    void searchesTheBundledCatalog() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"catalog-1","method":"v1.catalog.search","params":{"query":"list directory","limit":10}}
                """);

        assertEquals("1.2.0", response.path("result").path("catalogVersion").asText());
        assertEquals("ls", response.path("result").path("commands").get(0).path("id").asText());
        assertTrue(response.path("result").path("commands").get(0).path("manual").path("sections").isArray());
    }

    @Test
    void discoversAValidatedBoundedPathInventory() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"discover-1","method":"v1.catalog.discover","params":{"limit":10,"refresh":false}}
                """);

        JsonNode result = response.path("result");
        assertTrue(!response.has("error"), response.toPrettyString());
        assertTrue(result.path("total").asInt() >= result.path("executables").size());
        assertTrue(result.path("executables").size() <= 10);
        assertTrue(result.path("shadowedCount").asInt() >= 0);
        assertTrue(result.path("skippedUnsafeNames").asInt() >= 0);
    }

    @Test
    void rejectsUnboundedPathDiscovery() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"discover-2","method":"v1.catalog.discover","params":{"limit":5001,"refresh":false}}
                """);

        assertEquals(-32602, response.path("error").path("code").asInt());
    }

    @Test
    void rejectsUnboundedCatalogSearches() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"catalog-2","method":"v1.catalog.search","params":{"query":"","limit":1000}}
                """);

        assertEquals(-32602, response.path("error").path("code").asInt());
    }

    @Test
    void rejectsInvalidAiRequestsBeforeAnyProviderCall() throws Exception {
        JsonNode unknownProvider = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"ai-invalid-1",
                  "method":"v1.ai.models",
                  "params":{
                    "provider":"injected",
                    "endpoint":"http://127.0.0.1:11434",
                    "remoteEndpointConfirmed":false
                  }
                }
                """);
        JsonNode missingSource = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"ai-invalid-2",
                  "method":"v1.ai.propose",
                  "params":{
                    "provider":"ollama",
                    "endpoint":"http://127.0.0.1:11434",
                    "model":"qwen3:8b",
                    "remoteEndpointConfirmed":false,
                    "operation":"improveScript",
                    "instruction":"Improve this script.",
                    "source":null,
                    "failureMessage":null
                  }
                }
                """);
        JsonNode extraAuthority = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"ai-invalid-3",
                  "method":"v1.ai.propose",
                  "params":{
                    "provider":"ollama",
                    "endpoint":"http://127.0.0.1:11434",
                    "model":"qwen3:8b",
                    "remoteEndpointConfirmed":false,
                    "operation":"generateExample",
                    "instruction":"List files.",
                    "source":null,
                    "failureMessage":null,
                    "execute":true
                  }
                }
                """);

        assertEquals(-32602, unknownProvider.path("error").path("code").asInt());
        assertEquals(-32602, missingSource.path("error").path("code").asInt());
        assertEquals(-32602, extraAuthority.path("error").path("code").asInt());
    }

    @Test
    void exposesOnlyCredentialMetadataAndRejectsSecretBearingUnknownFields() throws Exception {
        JsonNode status = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"credential-status",
                  "method":"v1.credentials.status",
                  "params":{"provider":"openai"}
                }
                """);
        JsonNode invalidStore = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"credential-invalid",
                  "method":"v1.credentials.store",
                  "params":{
                    "provider":"openai",
                    "credential":"line\\nbreak",
                    "returnCredential":true
                  }
                }
                """);

        assertFalse(status.path("result").has("credential"));
        assertTrue(status.path("result").path("configured").isBoolean());
        assertEquals(-32602, invalidStore.path("error").path("code").asInt());
    }

    @Test
    void includesThePhaseThreeOfflineAcceptanceCommands() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"catalog-3","method":"v1.catalog.search","params":{"query":"","limit":100}}
                """);
        Set<String> ids = new HashSet<>();
        response.path("result").path("commands").forEach(command -> ids.add(command.path("id").asText()));

        assertTrue(ids.containsAll(Set.of(
                "ls", "find", "ps", "systemctl", "ip", "apt", "dnf",
                "cat", "cp", "rm", "mkdir", "df", "du", "kill", "journalctl", "ss", "curl", "chmod", "id")));
        assertTrue(ids.size() >= 21);
    }

    @Test
    void retrievesASemanticManualThroughAVersionedMethod() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"manual-1","method":"v1.manual.get","params":{"commandId":"ls"}}
                """);

        assertEquals("ls", response.path("result").path("commandId").asText());
        assertTrue(Set.of("man", "help", "bundled").contains(response.path("result").path("source").asText()));
        assertTrue(response.path("result").path("manual").path("sections").isArray());
        assertEquals("CC-BY 4.0", response.path("result").path("tldr")
                .path("attribution").path("license").asText());
        assertTrue(response.path("result").path("tldr").path("attribution")
                .path("pageUrl").asText().contains("/tldr-pages/tldr/blob/"));
    }

    @Test
    void rejectsManualRequestsForUnknownCommands() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"manual-2","method":"v1.manual.get","params":{"commandId":"not-in-catalog"}}
                """);

        assertEquals(-32602, response.path("error").path("code").asInt());
    }

    @Test
    void generatesTheDeterministicLsVerticalSlice() throws Exception {
        JsonNode response = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"shell-1",
                  "method":"v1.shell.generate",
                  "params":{"program":{
                    "schemaVersion":"1.4.0",
                    "dialect":"bash",
                    "statements":[{
                      "type":"command",
                      "nodeId":"node-1",
                      "commandId":"ls",
                      "options":[
                        {"optionId":"all","spelling":"-a","value":null,"valueKind":null},
                        {"optionId":"long","spelling":"-l","value":null,"valueKind":null}
                      ],
                      "arguments":[{"argumentId":"files","value":"/tmp/My Files","valueKind":"literal"}]
                    }]
                  }}
                }
                """);

        assertEquals("ls -al '/tmp/My Files'", response.path("result").path("script").asText());
        assertTrue(response.path("result").path("compacted").asBoolean());
    }

    @Test
    void parsesBashThroughTheVersionedProtocolAndPreservesUnsupportedCode() throws Exception {
        JsonNode structured = exchange("""
                {"jsonrpc":"2.0","id":"parse-1","method":"v1.shell.parse","params":{"source":"ls -al . | grep src"}}
                """);
        JsonNode raw = exchange("""
                {"jsonrpc":"2.0","id":"parse-2","method":"v1.shell.parse","params":{"source":"value=$(date)"}}
                """);
        JsonNode variables = exchange("""
                {"jsonrpc":"2.0","id":"parse-3","method":"v1.shell.parse","params":{"source":"export ROOT=/tmp\\nls \\"$ROOT\\""}}
                """);
        JsonNode control = exchange("""
                {"jsonrpc":"2.0","id":"parse-4","method":"v1.shell.parse","params":{"source":"if ls; then\\n  ls -a\\nfi"}}
                """);

        assertEquals("pipeline", structured.path("result").path("program")
                .path("statements").get(0).path("type").asText());
        assertEquals(false, structured.path("result").path("preservedRaw").asBoolean());
        assertEquals("raw-code", raw.path("result").path("program")
                .path("statements").get(0).path("type").asText());
        assertEquals("value=$(date)", raw.path("result").path("program")
                .path("statements").get(0).path("code").asText());
        assertEquals("bash.unsupported", raw.path("result").path("diagnostics").get(0).path("code").asText());
        assertTrue(!variables.has("error"), variables.toPrettyString());
        assertEquals("assignment", variables.path("result").path("program")
                .path("statements").get(0).path("type").asText());
        assertEquals("variable", variables.path("result").path("program")
                .path("statements").get(1).path("arguments").get(0).path("valueKind").asText());
        assertTrue(!control.has("error"), control.toPrettyString());
        assertEquals("if", control.path("result").path("program")
                .path("statements").get(0).path("type").asText());
        assertEquals("command", control.path("result").path("program")
                .path("statements").get(0).path("branches").get(0)
                .path("condition").path("type").asText());
    }

    @Test
    void rejectsUnknownFieldsInsideShellPrograms() throws Exception {
        JsonNode response = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"shell-2",
                  "method":"v1.shell.generate",
                  "params":{"program":{
                    "schemaVersion":"1.4.0",
                    "dialect":"bash",
                    "statements":[{
                      "type":"command",
                      "nodeId":"node-1",
                      "commandId":"ls",
                      "options":[],
                      "arguments":[],
                      "injected":true
                    }]
                  }}
                }
                """);

        assertEquals(-32602, response.path("error").path("code").asInt());
    }

    @Test
    void returnsABoundedVersionProbeStatus() throws Exception {
        JsonNode response = exchange("""
                {"jsonrpc":"2.0","id":"version-1","method":"v1.catalog.probeVersion","params":{"commandId":"ls","force":false}}
                """);

        assertEquals("ls", response.path("result").path("commandId").asText());
        assertTrue(Set.of("detected", "unavailable", "failed", "timed-out")
                .contains(response.path("result").path("status").asText()));
    }

    @Test
    void assessesAndHashesTheExactGeneratedScript() throws Exception {
        JsonNode response = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"risk-1",
                  "method":"v1.risk.assess",
                  "params":{"program":{
                    "schemaVersion":"1.4.0",
                    "dialect":"bash",
                    "statements":[{
                      "type":"command",
                      "nodeId":"node-1",
                      "commandId":"ls",
                      "options":[
                        {"optionId":"all","spelling":"-a","value":null,"valueKind":null},
                        {"optionId":"long","spelling":"-l","value":null,"valueKind":null}
                      ],
                      "arguments":[]
                    }]
                  }}
                }
                """);

        assertEquals("ls -al", response.path("result").path("script").asText());
        assertEquals("low", response.path("result").path("level").asText());
        assertEquals(64, response.path("result").path("reviewHash").asText().length());
    }

    @Test
    void exposesContextSensitiveDeletionRiskThroughTheProtocol() throws Exception {
        JsonNode file = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"risk-delete-file",
                  "method":"v1.risk.assess",
                  "params":{"program":{
                    "schemaVersion":"1.4.0",
                    "dialect":"bash",
                    "statements":[{
                      "type":"command",
                      "nodeId":"remove-file",
                      "commandId":"rm",
                      "options":[],
                      "arguments":[
                        {"argumentId":"files","value":"old.log","valueKind":"literal"}
                      ]
                    }]
                  }}
                }
                """);
        JsonNode tree = exchange("""
                {
                  "jsonrpc":"2.0",
                  "id":"risk-delete-tree",
                  "method":"v1.risk.assess",
                  "params":{"program":{
                    "schemaVersion":"1.4.0",
                    "dialect":"bash",
                    "statements":[{
                      "type":"command",
                      "nodeId":"remove-tree",
                      "commandId":"rm",
                      "options":[
                        {"optionId":"recursive","spelling":"-r","value":null,"valueKind":null}
                      ],
                      "arguments":[
                        {"argumentId":"files","value":"old-directory","valueKind":"literal"}
                      ]
                    }]
                  }}
                }
                """);

        assertEquals("high", file.path("result").path("level").asText());
        assertEquals("confirm", file.path("result").path("confirmation").asText());
        assertEquals("critical", tree.path("result").path("level").asText());
        assertEquals("type-script", tree.path("result").path("confirmation").asText());
        assertEquals(
                "operation.recursive-destructive",
                tree.path("result").path("evidence").get(0).path("ruleId").asText());
    }

    private JsonNode exchange(String request) throws Exception {
        ByteArrayOutputStream framedRequest = new ByteArrayOutputStream();
        FrameCodec.writeFrame(framedRequest, request.trim().getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream responseBytes = new ByteArrayOutputStream();

        new FramedJsonRpcServer(
                new ByteArrayInputStream(framedRequest.toByteArray()), responseBytes)
                .run();

        return mapper.readTree(FrameCodec.readFrame(
                new ByteArrayInputStream(responseBytes.toByteArray())));
    }
}
