package dev.commandide.worker.ai;

public record AiGenerationInput(
        String instruction,
        String source,
        String failureMessage,
        String targetDescription) {}
