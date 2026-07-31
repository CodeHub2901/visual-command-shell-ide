// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

public record ProviderResponse(
        String status,
        RawAiProposal proposal,
        String reason) {
    static ProviderResponse proposed(RawAiProposal proposal) {
        return new ProviderResponse("proposed", proposal, null);
    }

    static ProviderResponse refused(String reason) {
        return new ProviderResponse("refused", null, reason);
    }

    static ProviderResponse failed(String reason) {
        return new ProviderResponse("failed", null, reason);
    }
}
