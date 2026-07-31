// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.shell;

import java.util.List;

public record ShellParseResult(
        ShellProgram program,
        List<SourceSpan> sourceSpans,
        List<ShellDiagnostic> diagnostics,
        boolean preservedRaw) {}
