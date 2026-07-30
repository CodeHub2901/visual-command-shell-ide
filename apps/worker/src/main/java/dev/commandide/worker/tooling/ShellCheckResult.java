package dev.commandide.worker.tooling;

import dev.commandide.worker.language.LanguageDiagnostic;
import java.util.List;

public record ShellCheckResult(
        String status,
        List<LanguageDiagnostic> diagnostics,
        String reason) {}
