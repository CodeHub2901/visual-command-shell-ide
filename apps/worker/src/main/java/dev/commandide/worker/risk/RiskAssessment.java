package dev.commandide.worker.risk;

import java.util.List;

public record RiskAssessment(
        String script,
        String reviewHash,
        String level,
        String confirmation,
        List<RiskEvidence> evidence) {}
