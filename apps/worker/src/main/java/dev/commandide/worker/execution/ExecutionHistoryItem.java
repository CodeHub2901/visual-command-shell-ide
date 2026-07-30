package dev.commandide.worker.execution;

public record ExecutionHistoryItem(
        String executionId,
        String startedAt,
        String finishedAt,
        String workingDirectory,
        Integer exitStatus,
        String redactedCommandText,
        String riskLevel) {}
