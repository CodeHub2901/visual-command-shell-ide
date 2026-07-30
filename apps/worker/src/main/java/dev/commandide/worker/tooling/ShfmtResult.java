package dev.commandide.worker.tooling;

public record ShfmtResult(
        String status,
        String source,
        boolean changed,
        String reason) {}
