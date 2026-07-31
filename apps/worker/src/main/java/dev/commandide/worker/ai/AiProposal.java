// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import dev.commandide.worker.risk.RiskAssessment;
import dev.commandide.worker.shell.ShellDiagnostic;
import dev.commandide.worker.shell.ShellProgram;
import java.util.List;

public record AiProposal(
        String schemaVersion,
        String provider,
        String model,
        String operation,
        String proposedCode,
        String explanation,
        List<String> assumptions,
        List<String> warnings,
        List<String> riskHints,
        ShellProgram program,
        List<ShellDiagnostic> diagnostics,
        boolean preservedRaw,
        RiskAssessment assessment) {}
