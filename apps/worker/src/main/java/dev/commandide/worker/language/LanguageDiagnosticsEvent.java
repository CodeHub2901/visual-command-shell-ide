package dev.commandide.worker.language;

import java.util.List;

public record LanguageDiagnosticsEvent(
        String sessionId,
        Integer version,
        List<LanguageDiagnostic> diagnostics) {}
