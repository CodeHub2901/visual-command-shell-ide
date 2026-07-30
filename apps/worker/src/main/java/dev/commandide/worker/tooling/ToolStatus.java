package dev.commandide.worker.tooling;

public record ToolStatus(
        String id,
        String displayName,
        String status,
        String source,
        String executablePath,
        String installGuidance) {}
