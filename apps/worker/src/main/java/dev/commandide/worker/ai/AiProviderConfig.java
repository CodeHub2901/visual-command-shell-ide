package dev.commandide.worker.ai;

public record AiProviderConfig(
        String endpoint,
        String model,
        boolean remoteEndpointConfirmed) {}
