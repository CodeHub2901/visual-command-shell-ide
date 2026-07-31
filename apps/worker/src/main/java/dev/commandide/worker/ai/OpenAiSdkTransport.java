// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.responses.ResponseCreateParams;
import com.openai.models.responses.StructuredResponse;
import com.openai.models.responses.StructuredResponseCreateParams;
import java.time.Duration;
import java.util.List;

final class OpenAiSdkTransport implements OpenAiTransport {
    private static final Duration TIMEOUT = Duration.ofSeconds(45);

    @Override
    public AiConnectionResult probe(
            char[] apiKey,
            String endpoint,
            String model,
            String safetyIdentifier) {
        try {
            Extraction<OpenAiStructuredProbe> extracted = create(
                    apiKey,
                    endpoint,
                    model,
                    safetyIdentifier,
                    "Return supported=true through the supplied schema.",
                    "This is a connection and structured-output capability probe. Do not call tools.",
                    OpenAiStructuredProbe.class,
                    64);
            if (extracted.refusal() != null) {
                return new AiConnectionResult("unsupported", bounded(extracted.refusal(), 2000));
            }
            return extracted.value() != null && extracted.value().supported
                    ? new AiConnectionResult("supported", null)
                    : new AiConnectionResult(
                            "unsupported", "The selected OpenAI model did not return structured output.");
        } catch (Exception exception) {
            return new AiConnectionResult(
                    "unavailable", "OpenAI is unavailable or the configured credential was rejected.");
        }
    }

    @Override
    public ProviderResponse generate(
            char[] apiKey,
            String endpoint,
            String model,
            String operation,
            AiGenerationInput input,
            String safetyIdentifier) {
        try {
            Extraction<OpenAiStructuredProposal> extracted = create(
                    apiKey,
                    endpoint,
                    model,
                    safetyIdentifier,
                    userPrompt(operation, input),
                    systemPrompt(),
                    OpenAiStructuredProposal.class,
                    8192);
            if (extracted.refusal() != null) {
                return ProviderResponse.refused(bounded(extracted.refusal(), 2000));
            }
            return parse(extracted.value());
        } catch (Exception exception) {
            return ProviderResponse.failed("OpenAI proposal generation failed or timed out.");
        }
    }

    private <T> Extraction<T> create(
            char[] credential,
            String endpoint,
            String model,
            String safetyIdentifier,
            String input,
            String instructions,
            Class<T> responseType,
            long maxOutputTokens) {
        String apiKey = new String(credential);
        OpenAIClient client = OpenAIOkHttpClient.builder()
                .apiKey(apiKey)
                .baseUrl(endpoint)
                .timeout(TIMEOUT)
                .maxRetries(0)
                .responseValidation(true)
                .build();
        try {
            StructuredResponseCreateParams<T> parameters = ResponseCreateParams.builder()
                    .input(input)
                    .instructions(instructions)
                    .text(responseType)
                    .model(model)
                    .maxOutputTokens(maxOutputTokens)
                    .safetyIdentifier(safetyIdentifier)
                    .store(false)
                    .build();
            StructuredResponse<T> response = client.responses().create(parameters).validate();
            for (var item : response.output()) {
                var message = item.message();
                if (message.isEmpty()) continue;
                for (var content : message.get().content()) {
                    if (content.refusal().isPresent()) {
                        return new Extraction<>(
                                null, content.refusal().get().refusal());
                    }
                    if (content.outputText().isPresent()) {
                        return new Extraction<>(content.outputText().get(), null);
                    }
                }
            }
            return new Extraction<>(null, null);
        } finally {
            client.close();
        }
    }

    ProviderResponse parse(OpenAiStructuredProposal value) {
        if (value == null
                || value.schemaVersion == null
                || !value.schemaVersion.equals("1.0.0")
                || value.status == null
                || !List.of("proposed", "refused").contains(value.status)
                || value.assumptions == null
                || value.warnings == null
                || value.riskHints == null
                || !validList(value.assumptions)
                || !validList(value.warnings)
                || !validList(value.riskHints)
                || value.reason == null
                || value.proposedCode == null
                || value.explanation == null) {
            return ProviderResponse.failed("OpenAI returned a malformed proposal.");
        }
        if (value.status.equals("refused")) {
            String reason = value.reason.orElse("The model refused the request.");
            return ProviderResponse.refused(
                    reason.isBlank() ? "The model refused the request." : bounded(reason, 2000));
        }
        String code = value.proposedCode.orElse("");
        String explanation = value.explanation.orElse("");
        if (code.isBlank() || code.length() > 1_000_000
                || explanation.isBlank() || explanation.length() > 20_000
                || value.reason.isPresent()) {
            return ProviderResponse.failed("OpenAI returned a malformed proposal.");
        }
        return ProviderResponse.proposed(new RawAiProposal(
                code,
                explanation,
                List.copyOf(value.assumptions),
                List.copyOf(value.warnings),
                List.copyOf(value.riskHints)));
    }

    private boolean validList(List<String> values) {
        if (values.size() > 50) return false;
        return values.stream().allMatch(value ->
                value != null && !value.isBlank() && value.length() <= 2000);
    }

    private String systemPrompt() {
        return """
                You propose Bash for a local visual shell IDE. You have no tools and no execution
                authority. Return only the supplied structured output. Refuse requests for
                credentials or clearly unsafe abuse. Never claim that a command ran. Proposed code
                must be reviewable Bash without Markdown fences. Users will separately review,
                validate, risk-score, and decide whether to run it.
                """;
    }

    private String userPrompt(String operation, AiGenerationInput input) {
        String source = input.source() == null ? "(none)" : input.source();
        String failure = input.failureMessage() == null ? "(none)" : input.failureMessage();
        return "Operation: " + operation
                + "\nTarget: " + input.targetDescription()
                + "\nInstruction: " + input.instruction()
                + "\nCurrent Bash:\n" + source
                + "\nFailure text:\n" + failure;
    }

    private String bounded(String value, int maximum) {
        return value.length() <= maximum ? value : value.substring(0, maximum);
    }

    private record Extraction<T>(T value, String refusal) {}
}
