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
