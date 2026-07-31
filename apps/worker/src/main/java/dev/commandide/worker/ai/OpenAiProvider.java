// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import dev.commandide.worker.credential.CredentialLease;
import dev.commandide.worker.credential.CredentialService;
import java.net.URI;
import java.util.List;

public final class OpenAiProvider implements AiProvider {
    public static final String DEFAULT_ENDPOINT = "https://api.openai.com/v1";
    public static final String DEFAULT_MODEL = "gpt-5.6";
    private final CredentialService credentials;
    private final String safetyIdentifier;
    private final OpenAiTransport transport;

    public OpenAiProvider(CredentialService credentials, String safetyIdentifier) {
        this(credentials, safetyIdentifier, new OpenAiSdkTransport());
    }

    OpenAiProvider(
            CredentialService credentials,
            String safetyIdentifier,
            OpenAiTransport transport) {
        this.credentials = credentials;
        this.safetyIdentifier = safetyIdentifier;
        this.transport = transport;
    }

    @Override
    public AiModelsResult listModels(AiProviderConfig config) {
        validateEndpoint(config);
        return new AiModelsResult("available", List.of(
                model("gpt-5.6", "GPT-5.6 (flagship alias)"),
                model("gpt-5.6-sol", "GPT-5.6 Sol"),
                model("gpt-5.6-terra", "GPT-5.6 Terra"),
                model("gpt-5.6-luna", "GPT-5.6 Luna")), null);
    }

    @Override
    public AiConnectionResult testConnection(AiProviderConfig config) {
        validateEndpoint(config);
        return probe(config.endpoint(), DEFAULT_MODEL);
    }

    @Override
    public AiConnectionResult probeStructuredOutput(AiProviderConfig config) {
        validateEndpoint(config);
        String model = requireModel(config.model());
        return probe(config.endpoint(), model);
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

    private AiConnectionResult probe(String endpoint, String model) {
        var lease = credentials.acquire("openai");
        if (lease.isEmpty()) {
            return new AiConnectionResult(
                    "unavailable", "Configure an OpenAI API key before testing the provider.");
        }
        try (CredentialLease credential = lease.get()) {
            return transport.probe(
                    credential.value(), endpoint, model, safetyIdentifier);
        }
    }

    private ProviderResponse generate(
            AiProviderConfig config,
            AiGenerationInput input,
            String operation) {
        validateEndpoint(config);
        String model = requireModel(config.model());
        var lease = credentials.acquire("openai");
        if (lease.isEmpty()) {
            return ProviderResponse.failed(
                    "Configure an OpenAI API key before requesting a proposal.");
        }
        try (CredentialLease credential = lease.get()) {
            return transport.generate(
                    credential.value(),
                    config.endpoint(),
                    model,
                    operation,
                    input,
                    safetyIdentifier);
        }
    }

    private AiModel model(String id, String displayName) {
        return new AiModel(id, displayName, null, null);
    }

    private String requireModel(String model) {
        if (model == null
                || model.isBlank()
                || model.length() > 500
                || !model.matches("[A-Za-z0-9][A-Za-z0-9._:-]*")) {
            throw new IllegalArgumentException("Select a valid OpenAI model");
        }
        return model;
    }

    private void validateEndpoint(AiProviderConfig config) {
        try {
            URI endpoint = URI.create(config.endpoint());
            URI expected = URI.create(DEFAULT_ENDPOINT);
            if (!endpoint.equals(expected)
                    || !endpoint.getScheme().equals("https")
                    || endpoint.getUserInfo() != null
                    || endpoint.getQuery() != null
                    || endpoint.getFragment() != null) {
                throw new IllegalArgumentException("OpenAI uses only the official API endpoint");
            }
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("OpenAI uses only the official API endpoint");
        }
    }
}
