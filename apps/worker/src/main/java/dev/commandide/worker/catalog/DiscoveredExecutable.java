package dev.commandide.worker.catalog;

public record DiscoveredExecutable(
        String executable,
        String path,
        String catalogCommandId,
        String category,
        String summary) {}
