package dev.commandide.worker.ai;

public record AiProposalResult(
        String status,
        AiProposal proposal,
        String reason) {}
