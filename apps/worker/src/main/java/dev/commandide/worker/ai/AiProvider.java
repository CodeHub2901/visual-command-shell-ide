package dev.commandide.worker.ai;

public interface AiProvider {
    AiModelsResult listModels(AiProviderConfig config);

    AiConnectionResult testConnection(AiProviderConfig config);

    AiConnectionResult probeStructuredOutput(AiProviderConfig config);

    ProviderResponse generateExample(AiProviderConfig config, AiGenerationInput input);

    ProviderResponse explain(AiProviderConfig config, AiGenerationInput input);

    ProviderResponse completeScript(AiProviderConfig config, AiGenerationInput input);

    ProviderResponse improveScript(AiProviderConfig config, AiGenerationInput input);

    ProviderResponse explainFailure(AiProviderConfig config, AiGenerationInput input);
}
