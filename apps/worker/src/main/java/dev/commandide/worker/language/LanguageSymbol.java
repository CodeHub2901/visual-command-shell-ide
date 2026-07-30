package dev.commandide.worker.language;

public record LanguageSymbol(
        String name,
        String detail,
        String containerName,
        int kind,
        LanguageRange range,
        LanguageRange selectionRange) {}
