package dev.commandide.worker.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class OllamaAiProvider implements AiProvider {
    private static final Duration DISCOVERY_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration GENERATION_TIMEOUT = Duration.ofSeconds(30);
    private static final int MAX_MODELS = 200;
    private static final int MAX_LIST_ITEMS = 50;
    private final OllamaTransport transport;
    private final ObjectMapper mapper = new ObjectMapper();

    public OllamaAiProvider() {
        this(new JavaHttpOllamaTransport());
    }

    OllamaAiProvider(OllamaTransport transport) {
        this.transport = transport;
    }

    @Override
    public AiModelsResult listModels(AiProviderConfig config) {
        try {
            URI endpoint = endpoint(config);
            OllamaTransport.Response response = transport.get(
                    OllamaEndpoint.api(endpoint, "/api/tags"), DISCOVERY_TIMEOUT);
            if (response.statusCode() != 200) {
                return new AiModelsResult("unavailable", List.of(), "Ollama is not available.");
            }
            JsonNode root = mapper.readTree(response.body());
            JsonNode values = root.path("models");
            if (!root.isObject() || !values.isArray()) {
                return new AiModelsResult("failed", List.of(), "Ollama returned malformed model data.");
            }
            List<AiModel> models = new ArrayList<>();
            Set<String> ids = new HashSet<>();
            for (JsonNode value : values) {
                if (models.size() >= MAX_MODELS) break;
                String id = bounded(value.path("name").asText(""), 500);
                if (id.isBlank() || containsControl(id) || !ids.add(id)) continue;
                JsonNode details = value.path("details");
                models.add(new AiModel(
                        id,
                        id,
                        nullableBounded(details.get("parameter_size"), 100),
                        nullableBounded(details.get("quantization_level"), 100)));
            }
            return new AiModelsResult("available", List.copyOf(models), null);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            return new AiModelsResult("unavailable", List.of(), "Ollama is not available.");
        }
    }

    @Override
    public AiConnectionResult testConnection(AiProviderConfig config) {
        AiModelsResult models = listModels(config);
        return models.status().equals("available")
                ? new AiConnectionResult("connected", null)
                : new AiConnectionResult(models.status(), models.reason());
    }

    @Override
    public AiConnectionResult probeStructuredOutput(AiProviderConfig config) {
        requireSelectedInstalledModel(config);
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");
        properties.putObject("supported").put("type", "boolean");
        schema.putArray("required").add("supported");
        schema.put("additionalProperties", false);
        ObjectNode request = chatRequest(
                config.model(),
                "Return {\"supported\":true}.",
                "Respond only through the supplied JSON schema.",
                schema);
        try {
            JsonNode response = postChat(config, request);
            String content = response.path("message").path("content").asText("");
            JsonNode parsed = mapper.readTree(content);
            return parsed.isObject() && parsed.size() == 1 && parsed.path("supported").isBoolean()
                    ? new AiConnectionResult("supported", null)
                    : new AiConnectionResult("unsupported", "The selected model did not honor structured output.");
        } catch (Exception exception) {
            return new AiConnectionResult("unsupported", "The selected model did not honor structured output.");
        }
    }

    @Override
    public ProviderResponse generateExample(AiProviderConfig config, AiGenerationInput input) {
        return generate(config, input, "generateExample");
    }

    @Override
    public ProviderResponse explain(AiProviderConfig config, AiGenerationInput input) {
        return generate(config, input, "explain");
    }

    @Override
    public ProviderResponse completeScript(AiProviderConfig config, AiGenerationInput input) {
        return generate(config, input, "completeScript");
    }

    @Override
    public ProviderResponse improveScript(AiProviderConfig config, AiGenerationInput input) {
        return generate(config, input, "improveScript");
    }

    @Override
    public ProviderResponse explainFailure(AiProviderConfig config, AiGenerationInput input) {
        return generate(config, input, "explainFailure");
    }

    private ProviderResponse generate(
            AiProviderConfig config,
            AiGenerationInput input,
            String operation) {
        requireSelectedInstalledModel(config);
        try {
            ObjectNode schema = proposalSchema();
            ObjectNode request = chatRequest(
                    config.model(),
                    userPrompt(operation, input, schema),
                    systemPrompt(),
                    schema);
            JsonNode response = postChat(config, request);
            String content = response.path("message").path("content").asText("");
            return parseProviderResponse(content);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            return ProviderResponse.failed("Ollama proposal generation failed or timed out.");
        }
    }

    private JsonNode postChat(AiProviderConfig config, ObjectNode request) throws Exception {
        URI endpoint = endpoint(config);
        OllamaTransport.Response response = transport.post(
                OllamaEndpoint.api(endpoint, "/api/chat"),
                mapper.writeValueAsString(request),
                GENERATION_TIMEOUT);
        if (response.statusCode() != 200) {
            throw new IllegalStateException("Ollama returned an error");
        }
        JsonNode root = mapper.readTree(response.body());
        if (!root.isObject() || !root.path("message").path("content").isTextual()) {
            throw new IllegalArgumentException("Malformed Ollama response");
        }
        return root;
    }

    private ProviderResponse parseProviderResponse(String content) throws Exception {
        if (content.isBlank() || content.length() > 1_500_000) {
            return ProviderResponse.failed("Ollama returned a malformed proposal.");
        }
        JsonNode value = mapper.readTree(content);
        if (!validEnvelope(value)) return ProviderResponse.failed("Ollama returned a malformed proposal.");
        String status = value.path("status").asText();
        if (status.equals("refused")) {
            String reason = bounded(value.path("reason").asText("The model refused the request."), 2000);
            return ProviderResponse.refused(reason.isBlank() ? "The model refused the request." : reason);
        }
        String code = value.path("proposedCode").asText("");
        String explanation = value.path("explanation").asText("");
        if (code.isBlank() || code.length() > 1_000_000
                || explanation.isBlank() || explanation.length() > 20_000) {
            return ProviderResponse.failed("Ollama returned a malformed proposal.");
        }
        return ProviderResponse.proposed(new RawAiProposal(
                code,
                explanation,
                stringList(value.path("assumptions")),
                stringList(value.path("warnings")),
                stringList(value.path("riskHints"))));
    }

    private boolean validEnvelope(JsonNode value) {
        if (!value.isObject() || value.size() != 8
                || !Set.of("proposed", "refused").contains(value.path("status").asText())
                || !value.has("proposedCode")
                || !value.has("explanation")
                || !value.path("assumptions").isArray()
                || !value.path("warnings").isArray()
                || !value.path("riskHints").isArray()
                || !value.has("reason")
                || !value.has("schemaVersion")
                || !"1.0.0".equals(value.path("schemaVersion").asText())) {
            return false;
        }
        Set<String> fields = Set.of(
                "schemaVersion", "status", "proposedCode", "explanation",
                "assumptions", "warnings", "riskHints", "reason");
        var names = value.fieldNames();
        while (names.hasNext()) if (!fields.contains(names.next())) return false;
        if (!validStringArray(value.path("assumptions"))
                || !validStringArray(value.path("warnings"))
                || !validStringArray(value.path("riskHints"))) return false;
        if (value.path("status").asText().equals("refused")) {
            return value.path("proposedCode").isNull()
                    && value.path("explanation").isNull()
                    && value.path("reason").isTextual();
        }
        return value.path("proposedCode").isTextual()
                && value.path("explanation").isTextual()
                && value.path("reason").isNull();
    }

    private boolean validStringArray(JsonNode value) {
        if (!value.isArray() || value.size() > MAX_LIST_ITEMS) return false;
        for (JsonNode item : value) {
            if (!item.isTextual() || item.asText().isBlank() || item.asText().length() > 2000) return false;
        }
        return true;
    }

    private List<String> stringList(JsonNode value) {
        List<String> result = new ArrayList<>();
        value.forEach(item -> result.add(item.asText()));
        return List.copyOf(result);
    }

    private ObjectNode chatRequest(
            String model,
            String userPrompt,
            String systemPrompt,
            ObjectNode schema) {
        ObjectNode request = mapper.createObjectNode();
        request.put("model", model);
        ArrayNode messages = request.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", userPrompt);
        request.put("stream", false);
        request.set("format", schema);
        request.putObject("options").put("temperature", 0);
        return request;
    }

    private ObjectNode proposalSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");
        properties.putObject("schemaVersion").put("const", "1.0.0");
        properties.putObject("status").put("type", "string")
                .putArray("enum").add("proposed").add("refused");
        nullableString(properties.putObject("proposedCode"), 1_000_000);
        nullableString(properties.putObject("explanation"), 20_000);
        stringArray(properties.putObject("assumptions"));
        stringArray(properties.putObject("warnings"));
        stringArray(properties.putObject("riskHints"));
        nullableString(properties.putObject("reason"), 2000);
        schema.putArray("required")
                .add("schemaVersion").add("status").add("proposedCode").add("explanation")
                .add("assumptions").add("warnings").add("riskHints").add("reason");
        schema.put("additionalProperties", false);
        return schema;
    }

    private void nullableString(ObjectNode schema, int maximum) {
        schema.putArray("type").add("string").add("null");
        schema.put("maxLength", maximum);
    }

    private void stringArray(ObjectNode schema) {
        schema.put("type", "array");
        schema.put("maxItems", MAX_LIST_ITEMS);
        schema.putObject("items").put("type", "string").put("maxLength", 2000);
    }

    private String systemPrompt() {
        return """
                You propose Bash for a local visual shell IDE. You cannot execute tools or commands.
                Return only the supplied schema. Use status refused when the request is unsafe,
                underspecified beyond repair, or asks for credentials. Never include passwords,
                API keys, sudo input, or invented success claims. The proposedCode must be reviewable
                Bash and must not use Markdown fences.
                """;
    }

    private String userPrompt(String operation, AiGenerationInput input, ObjectNode schema) {
        String source = input.source() == null ? "(none)" : input.source();
        String failure = input.failureMessage() == null ? "(none)" : input.failureMessage();
        return "Operation: " + operation
                + "\nTarget: " + input.targetDescription()
                + "\nInstruction: " + input.instruction()
                + "\nCurrent Bash:\n" + source
                + "\nFailure text:\n" + failure
                + "\nReturn JSON matching this schema:\n" + schema;
    }

    private void requireSelectedInstalledModel(AiProviderConfig config) {
        String model = config.model();
        if (model == null || model.isBlank() || model.length() > 500 || containsControl(model)) {
            throw new IllegalArgumentException("Select an installed Ollama model");
        }
        AiModelsResult models = listModels(config);
        if (!models.status().equals("available")
                || models.models().stream().noneMatch(item -> item.id().equals(model))) {
            throw new IllegalArgumentException("Select an installed Ollama model");
        }
    }

    private URI endpoint(AiProviderConfig config) {
        return OllamaEndpoint.validate(config.endpoint(), config.remoteEndpointConfirmed());
    }

    private String nullableBounded(JsonNode value, int maximum) {
        return value == null || !value.isTextual() || value.asText().isBlank()
                ? null
                : bounded(value.asText(), maximum);
    }

    private String bounded(String value, int maximum) {
        return value.length() <= maximum ? value : value.substring(0, maximum);
    }

    private boolean containsControl(String value) {
        return value.codePoints().anyMatch(Character::isISOControl);
    }
}
