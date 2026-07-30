package dev.commandide.worker.bookmark;

import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.shell.ShellProgram;
import java.util.List;

public record StructuredBookmark(
        String schemaVersion,
        String bookmarkId,
        String name,
        ShellProgram program,
        List<ScriptProject.ProjectParameter> parameters,
        String createdAt,
        String updatedAt) {}
