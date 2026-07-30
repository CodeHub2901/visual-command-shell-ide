package dev.commandide.worker.ai;

public record AiModel(
        String id,
        String displayName,
        String parameterSize,
        String quantization) {}
