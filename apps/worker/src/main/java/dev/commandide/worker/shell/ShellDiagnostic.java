package dev.commandide.worker.shell;

public record ShellDiagnostic(
        String severity,
        String code,
        String message,
        int startOffset,
        int endOffset) {}
