package dev.commandide.worker.shell;

import java.util.List;

public record ShellParseResult(
        ShellProgram program,
        List<SourceSpan> sourceSpans,
        List<ShellDiagnostic> diagnostics,
        boolean preservedRaw) {}
