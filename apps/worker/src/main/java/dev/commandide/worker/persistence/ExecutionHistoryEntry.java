package dev.commandide.worker.persistence;

import java.time.Instant;

public record ExecutionHistoryEntry(
        String id,
        Instant startedAt,
        Instant finishedAt,
        String workingDirectory,
        Integer exitStatus,
        String redactedCommandText,
        String riskLevel) {}
