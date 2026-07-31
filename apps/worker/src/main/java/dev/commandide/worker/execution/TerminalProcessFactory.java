// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@FunctionalInterface
interface TerminalProcessFactory {
    TerminalProcess start(
            Path executable,
            List<String> arguments,
            Map<String, String> environment,
            Path workingDirectory,
            int columns,
            int rows) throws Exception;
}
