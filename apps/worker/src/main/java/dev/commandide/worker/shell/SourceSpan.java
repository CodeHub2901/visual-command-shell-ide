package dev.commandide.worker.shell;

public record SourceSpan(
        String nodeId,
        int startOffset,
        int endOffset,
        int startLine,
        int startColumn,
        int endLine,
        int endColumn) {}
