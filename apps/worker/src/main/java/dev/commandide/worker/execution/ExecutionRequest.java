// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

import dev.commandide.worker.shell.ShellProgram;

public record ExecutionRequest(
        ShellProgram program,
        String reviewedScript,
        String reviewHash,
        String interfaceMode,
        boolean confirmed,
        String typedConfirmation,
        String workingDirectory,
        int columns,
        int rows) {}
