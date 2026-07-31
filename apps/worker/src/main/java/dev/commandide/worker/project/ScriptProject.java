// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.project;

import dev.commandide.worker.shell.ShellProgram;
import java.util.List;

public record ScriptProject(
        String schemaVersion,
        String projectId,
        String name,
        String createdAt,
        String updatedAt,
        String catalogVersion,
        ProjectTarget target,
        ShellProgram program,
        ProjectLayout layout,
        List<ProjectParameter> parameters) {
    public record ProjectTarget(
            String operatingSystem,
            String architecture,
            String shellDialect,
            String distroFamily,
            String distroVersion) {}

    public record ProjectLayout(List<LayoutNode> nodes, Viewport viewport) {}

    public record LayoutNode(String nodeId, double x, double y) {}

    public record Viewport(double x, double y, double zoom) {}

    public record ProjectParameter(
            String name,
            String description,
            boolean required,
            boolean sensitive,
            String defaultValue) {}
}
