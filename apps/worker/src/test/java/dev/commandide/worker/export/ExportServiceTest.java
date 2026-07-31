// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.persistence.ProjectRepository;
import dev.commandide.worker.project.ProjectService;
import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class ExportServiceTest {
    @TempDir
    Path temporaryDirectory;
    private BashGenerator generator;
    private ProjectService projects;

    @BeforeEach
    void initialize() throws Exception {
        SystemProfile profile = new SystemProfile(
                "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true), List.of());
        generator = new BashGenerator(new CatalogService(profile));
        DatabaseManager database = new DatabaseManager(temporaryDirectory.resolve("projects.db"), false);
        database.initialize();
        projects = new ProjectService(new ProjectRepository(database), generator);
    }

    @Test
    void createsCanonicalProjectAndMarkdownArtifacts() throws Exception {
        ExportService service = new ExportService(generator, projects, ignored -> {});

        ExportArtifact projectArtifact = service.create(project(), "project", true, true);
        ExportArtifact recipe = service.create(project(), "markdown", true, true);

        assertEquals("list-files.cmdbuilder.json", projectArtifact.suggestedFileName());
        assertTrue(projectArtifact.content().endsWith("\n"));
        assertTrue(recipe.content().contains("## Parameters"));
        assertTrue(recipe.content().contains("set -euo pipefail"));
        assertTrue(recipe.content().contains("```bash"));
    }

    @Test
    void returnsBashOnlyAfterTheExactArtifactPassesSyntaxValidation() throws Exception {
        AtomicReference<String> validated = new AtomicReference<>();
        ExportService service = new ExportService(generator, projects, validated::set);

        ExportArtifact artifact = service.create(project(), "bash", true, true);

        assertEquals("passed", artifact.syntaxValidation());
        assertEquals(artifact.content(), validated.get());
        assertTrue(artifact.content().startsWith("#!/usr/bin/env bash\nset -euo pipefail\n"));
        assertTrue(artifact.content().contains(": \"${ROOT:?Set ROOT before running this script}\""));
    }

    @Test
    void refusesBashWhenSyntaxValidationFails() {
        ExportService service = new ExportService(
                generator, projects, ignored -> { throw new IllegalArgumentException("invalid"); });

        assertThrows(IllegalArgumentException.class,
                () -> service.create(project(), "bash", true, true));
    }

    private ScriptProject project() {
        return new ScriptProject(
                "1.4.0",
                "68d4861b-3ba5-47c8-8828-6ba2efc9945d",
                "List files",
                "2026-07-18T00:00:00Z",
                "2026-07-18T00:00:00Z",
                "1.2.0",
                new ScriptProject.ProjectTarget("linux", "x86_64", "bash", "ubuntu", "24.04"),
                new ShellProgram(
                        "1.4.0",
                        "bash",
                        List.of(new ShellProgram.CommandNode(
                                "node-1", "ls", List.of(),
                                List.of(new ShellProgram.ArgumentValue("files", ".", "literal"))))),
                new ScriptProject.ProjectLayout(
                        List.of(new ScriptProject.LayoutNode("node-1", 10, 20)),
                        new ScriptProject.Viewport(0, 0, 1)),
                List.of(new ScriptProject.ProjectParameter(
                        "ROOT", "Directory to list", true, false, null)));
    }
}
