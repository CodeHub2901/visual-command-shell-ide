package dev.commandide.worker.language;

import java.util.List;

public record LanguageCompletionResult(List<LanguageCompletionItem> items, boolean incomplete) {}
