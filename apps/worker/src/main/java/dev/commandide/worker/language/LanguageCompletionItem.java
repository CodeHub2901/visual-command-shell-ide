package dev.commandide.worker.language;

public record LanguageCompletionItem(
        String label,
        String insertText,
        String detail,
        String documentation,
        int kind,
        boolean snippet) {}
