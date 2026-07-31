// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import java.util.List;

public record RawAiProposal(
        String proposedCode,
        String explanation,
        List<String> assumptions,
        List<String> warnings,
        List<String> riskHints) {}
