package dev.commandide.worker.ai;

import java.util.List;

public record AiModelsResult(
        String status,
        List<AiModel> models,
        String reason) {}
