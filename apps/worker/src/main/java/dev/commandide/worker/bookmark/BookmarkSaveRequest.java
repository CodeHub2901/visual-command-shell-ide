// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.bookmark;

import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.shell.ShellProgram;
import java.util.List;

public record BookmarkSaveRequest(
        String bookmarkId,
        String name,
        ShellProgram program,
        List<ScriptProject.ProjectParameter> parameters) {}
