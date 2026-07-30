package dev.commandide.worker.export;

import java.util.List;

public record ExportArtifact(
        String format,
        String suggestedFileName,
        String mediaType,
        String content,
        String syntaxValidation,
        List<String> warnings) {}
