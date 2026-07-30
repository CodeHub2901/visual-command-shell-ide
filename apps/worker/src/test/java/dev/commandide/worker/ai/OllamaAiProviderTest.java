package dev.commandide.worker.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Queue;
import org.junit.jupiter.api.Test;

final class OllamaAiProviderTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void listsInstalledModelsAndRequiresExplicitSecureRemoteEndpoints() {
        FakeTransport transport = new FakeTransport();
        transport.gets.add(new OllamaTransport.Response(200, """
                {"models":[{"name":"qwen3:8b","details":{
                "parameter_size":"8.2B","quantization_level":"Q4_K_M"}}]}
                """));
        OllamaAiProvider provider = new OllamaAiProvider(transport);

        AiModelsResult result = provider.listModels(local(null));

        assertEquals("available", result.status());
        assertEquals("qwen3:8b", result.models().getFirst().id());
        assertEquals("8.2B", result.models().getFirst().parameterSize());
        assertThrows(IllegalArgumentException.class, () -> provider.listModels(
                new AiProviderConfig("http://ollama.example.com", null, true)));
        assertThrows(IllegalArgumentException.class, () -> provider.listModels(
                new AiProviderConfig("https://ollama.example.com", null, false)));
    }

    @Test
    void probesStructuredOutputAndParsesStrictProposals() throws Exception {
        FakeTransport transport = new FakeTransport();
        transport.gets.add(tags());
        transport.posts.add(chatResponse("{\"supported\":true}"));
        transport.gets.add(tags());
        transport.posts.add(chatResponse("""
                {"schemaVersion":"1.0.0","status":"proposed",
                "proposedCode":"ls -al .","explanation":"Lists all entries.",
                "assumptions":["Current directory is readable."],
                "warnings":[],"riskHints":["Read-only catalog command."],"reason":null}
                """));
        OllamaAiProvider provider = new OllamaAiProvider(transport);
        AiProviderConfig config = local("qwen3:8b");

        assertEquals("supported", provider.probeStructuredOutput(config).status());
        ProviderResponse result = provider.generateExample(
                config,
                new AiGenerationInput("List files", null, null, "Linux Bash"));

        assertEquals("proposed", result.status());
        assertEquals("ls -al .", result.proposal().proposedCode());
        JsonNode sent = mapper.readTree(transport.lastPostBody);
        assertEquals(false, sent.path("stream").asBoolean());
        assertEquals(0, sent.path("options").path("temperature").asInt());
        assertTrue(sent.path("format").isObject());
    }

    @Test
    void handlesRefusalMalformedOutputTimeoutAndMissingService() {
        FakeTransport refusalTransport = new FakeTransport();
        refusalTransport.gets.add(tags());
        refusalTransport.posts.add(chatResponse("""
                {"schemaVersion":"1.0.0","status":"refused",
                "proposedCode":null,"explanation":null,"assumptions":[],
                "warnings":[],"riskHints":[],"reason":"Unsafe request."}
                """));
        ProviderResponse refused = new OllamaAiProvider(refusalTransport).generateExample(
                local("qwen3:8b"),
                new AiGenerationInput("unsafe", null, null, "Linux Bash"));
        assertEquals("refused", refused.status());

        FakeTransport malformedTransport = new FakeTransport();
        malformedTransport.gets.add(tags());
        malformedTransport.posts.add(chatResponse("{\"unexpected\":true}"));
        assertEquals("failed", new OllamaAiProvider(malformedTransport).generateExample(
                local("qwen3:8b"),
                new AiGenerationInput("list", null, null, "Linux Bash")).status());

        FakeTransport timedOut = new FakeTransport();
        timedOut.gets.add(tags());
        timedOut.postFailure = new java.net.http.HttpTimeoutException("timed out");
        assertEquals("failed", new OllamaAiProvider(timedOut).generateExample(
                local("qwen3:8b"),
                new AiGenerationInput("list", null, null, "Linux Bash")).status());

        FakeTransport missing = new FakeTransport();
        missing.failure = new java.net.ConnectException("offline");
        assertEquals("unavailable", new OllamaAiProvider(missing).listModels(local(null)).status());
    }

    private AiProviderConfig local(String model) {
        return new AiProviderConfig("http://127.0.0.1:11434", model, false);
    }

    private OllamaTransport.Response tags() {
        return new OllamaTransport.Response(200, """
                {"models":[{"name":"qwen3:8b","details":{}}]}
                """);
    }

    private OllamaTransport.Response chatResponse(String content) {
        try {
            var root = mapper.createObjectNode();
            root.put("done", true);
            root.putObject("message")
                    .put("role", "assistant")
                    .put("content", content);
            return new OllamaTransport.Response(200, mapper.writeValueAsString(root));
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private static final class FakeTransport implements OllamaTransport {
        final Queue<Response> gets = new ArrayDeque<>();
        final Queue<Response> posts = new ArrayDeque<>();
        Exception failure;
        Exception postFailure;
        String lastPostBody;

        @Override
        public Response get(URI uri, Duration timeout) throws Exception {
            if (failure != null) throw failure;
            assertEquals("/api/tags", uri.getPath());
            assertEquals(Duration.ofSeconds(3), timeout);
            return gets.remove();
        }

        @Override
        public Response post(URI uri, String body, Duration timeout) throws Exception {
            if (failure != null) throw failure;
            if (postFailure != null) throw postFailure;
            assertEquals("/api/chat", uri.getPath());
            assertEquals(Duration.ofSeconds(30), timeout);
            lastPostBody = body;
            return posts.remove();
        }
    }
}
