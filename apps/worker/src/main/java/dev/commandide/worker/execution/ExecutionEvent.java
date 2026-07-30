package dev.commandide.worker.execution;

public record ExecutionEvent(
        String sessionId,
        long sequence,
        String type,
        String data,
        Integer exitStatus,
        String message,
        String occurredAt) {}
