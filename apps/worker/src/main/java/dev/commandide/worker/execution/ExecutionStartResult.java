package dev.commandide.worker.execution;

public record ExecutionStartResult(
        String sessionId,
        String riskLevel,
        String reviewHash,
        String startedAt) {}
