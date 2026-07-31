// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.project;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.persistence.ProjectRepository;
import dev.commandide.worker.persistence.StoredProject;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class ProjectServiceTest {
    private static final String PROJECT_ID = "68d4861b-3ba5-47c8-8828-6ba2efc9945d";

    @TempDir
    Path temporaryDirectory;
    private ProjectService service;
    private ProjectRepository repository;

    @BeforeEach
    void initialize() throws Exception {
        DatabaseManager database = new DatabaseManager(temporaryDirectory.resolve("projects.db"), false);
        database.initialize();
        CatalogService catalog = new CatalogService(new SystemProfile(
                "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true), List.of()));
        repository = new ProjectRepository(database);
        service = new ProjectService(
                repository,
                new BashGenerator(catalog),
                Clock.fixed(Instant.parse("2026-07-18T15:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void normalizesStoresRetrievesAndListsProjects() throws Exception {
        ScriptProject saved = service.save(project(program("."), List.of()));

        assertEquals("2026-07-18T15:00:00Z", saved.createdAt());
        assertEquals(saved, service.get(PROJECT_ID).orElseThrow());
        assertEquals(PROJECT_ID, service.recent(10).getFirst().projectId());
    }

    @Test
    void storesNestedFunctionsAndBlocksWithoutFlatteningTheProgram() throws Exception {
        ShellProgram nested = new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.FunctionNode(
                        "function-1",
                        "inspect_tree",
                        List.of(new ShellProgram.BlockNode(
                                "subshell-1",
                                "subshell",
                                List.of(new ShellProgram.CommandNode(
                                        "node-1",
                                        "ls",
                                        List.of(),
                                        List.of(new ShellProgram.ArgumentValue("files", ".", "literal")))))))));

        ScriptProject saved = service.save(project(nested, List.of()));

        assertEquals(saved, service.get(PROJECT_ID).orElseThrow());
        ShellProgram.FunctionNode function =
                (ShellProgram.FunctionNode) saved.program().statements().getFirst();
        ShellProgram.BlockNode block = (ShellProgram.BlockNode) function.body().getFirst();
        assertEquals("subshell", block.mode());
        assertEquals("node-1", block.statements().getFirst().nodeId());
    }

    @Test
    void storesRecursiveControlFlowWithoutFlatteningBranches() throws Exception {
        ShellProgram conditional = new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.IfNode(
                        "if-1",
                        List.of(new ShellProgram.IfBranch(
                                new ShellProgram.CommandNode(
                                        "node-1", "ls", List.of(), List.of()),
                                List.of(new ShellProgram.ForNode(
                                        "for-1", "FILE",
                                        List.of(new ShellProgram.ShellWord(".", "literal")),
                                        List.of(new ShellProgram.CommandNode(
                                                "body-1", "ls", List.of(),
                                                List.of(new ShellProgram.ArgumentValue(
                                                        "files", "FILE", "variable")))))))),
                        List.of(new ShellProgram.CaseNode(
                                "case-1",
                                new ShellProgram.ShellWord("MODE", "variable"),
                                List.of(new ShellProgram.CaseArm(
                                        List.of(new ShellProgram.CasePattern("*", "glob")),
                                        List.of(new ShellProgram.CommandNode(
                                                "case-body-1", "ls", List.of(), List.of())))))))));

        ScriptProject saved = service.save(project(conditional, List.of()));

        ShellProgram.IfNode restored = (ShellProgram.IfNode) service.get(PROJECT_ID)
                .orElseThrow().program().statements().getFirst();
        assertEquals(saved.program(), conditional);
        assertTrue(restored.branches().getFirst().body().getFirst() instanceof ShellProgram.ForNode);
        assertTrue(restored.elseBody().getFirst() instanceof ShellProgram.CaseNode);
    }

    @Test
    void rejectsSensitiveDefaultsAndEmbeddedCredentials() {
        ScriptProject.ProjectParameter secret = new ScriptProject.ProjectParameter(
                "API_TOKEN", "Runtime token", true, true, "secret");

        assertThrows(IllegalArgumentException.class,
                () -> service.save(project(program("."), List.of(secret))));
        assertThrows(IllegalArgumentException.class,
                () -> service.save(project(program("TOKEN=secretvalue"), List.of())));
    }

    @Test
    void migratesStoredVersionOneProjectsWithoutLosingTheCommand() throws Exception {
        Instant storedAt = Instant.parse("2026-07-17T12:00:00Z");
        repository.save(new StoredProject(
                PROJECT_ID,
                "Legacy list",
                """
                {
                  "schemaVersion":"1.0.0",
                  "projectId":"68d4861b-3ba5-47c8-8828-6ba2efc9945d",
                  "name":"Legacy list",
                  "createdAt":"2026-07-17T12:00:00Z",
                  "updatedAt":"2026-07-17T12:00:00Z",
                  "catalogVersion":"1.2.0",
                  "target":{"operatingSystem":"linux","architecture":"x86_64","shellDialect":"bash","distroFamily":"ubuntu","distroVersion":"24.04"},
                  "program":{"schemaVersion":"1.0.0","dialect":"bash","statements":[{"type":"command","nodeId":"node-1","commandId":"ls","options":[{"optionId":"long","spelling":"-l","value":null}],"arguments":[{"argumentId":"files","value":"."}]}]},
                  "layout":{"nodes":[{"nodeId":"node-1","x":0,"y":0}],"viewport":{"x":0,"y":0,"zoom":1}},
                  "parameters":[]
                }
                """,
                1,
                storedAt,
                storedAt));

        ScriptProject migrated = service.get(PROJECT_ID).orElseThrow();

        assertEquals("1.4.0", migrated.schemaVersion());
        assertEquals("1.4.0", migrated.program().schemaVersion());
        ShellProgram.CommandNode command = (ShellProgram.CommandNode) migrated.program().statements().getFirst();
        assertEquals("ls", command.commandId());
        assertEquals(null, command.options().getFirst().valueKind());
        assertEquals("literal", command.arguments().getFirst().valueKind());
    }

    @Test
    void migratesVersionOnePointTwoAssignmentsWithoutChangingValueKinds() throws Exception {
        Instant storedAt = Instant.parse("2026-07-17T12:00:00Z");
        repository.save(new StoredProject(
                PROJECT_ID,
                "Legacy variables",
                """
                {
                  "schemaVersion":"1.2.0",
                  "projectId":"68d4861b-3ba5-47c8-8828-6ba2efc9945d",
                  "name":"Legacy variables",
                  "createdAt":"2026-07-17T12:00:00Z",
                  "updatedAt":"2026-07-17T12:00:00Z",
                  "catalogVersion":"1.2.0",
                  "target":{"operatingSystem":"linux","architecture":"x86_64","shellDialect":"bash","distroFamily":"ubuntu","distroVersion":"24.04"},
                  "program":{"schemaVersion":"1.2.0","dialect":"bash","statements":[{"type":"assignment","nodeId":"assign","name":"ROOT","value":"/tmp","valueKind":"literal","exported":true}]},
                  "layout":{"nodes":[{"nodeId":"assign","x":0,"y":0}],"viewport":{"x":0,"y":0,"zoom":1}},
                  "parameters":[]
                }
                """,
                1,
                storedAt,
                storedAt));

        ScriptProject migrated = service.get(PROJECT_ID).orElseThrow();

        assertEquals("1.4.0", migrated.schemaVersion());
        ShellProgram.AssignmentNode assignment = (ShellProgram.AssignmentNode) migrated.program().statements().getFirst();
        assertEquals("literal", assignment.valueKind());
        assertTrue(assignment.exported());
    }

    @Test
    void migratesVersionOnePointThreeNestedPrograms() throws Exception {
        Instant storedAt = Instant.parse("2026-07-17T12:00:00Z");
        repository.save(new StoredProject(
                PROJECT_ID,
                "Legacy function",
                """
                {
                  "schemaVersion":"1.3.0",
                  "projectId":"68d4861b-3ba5-47c8-8828-6ba2efc9945d",
                  "name":"Legacy function",
                  "createdAt":"2026-07-17T12:00:00Z",
                  "updatedAt":"2026-07-17T12:00:00Z",
                  "catalogVersion":"1.2.0",
                  "target":{"operatingSystem":"linux","architecture":"x86_64","shellDialect":"bash","distroFamily":"ubuntu","distroVersion":"24.04"},
                  "program":{"schemaVersion":"1.3.0","dialect":"bash","statements":[{"type":"function","nodeId":"function-1","name":"inspect_tree","body":[{"type":"command","nodeId":"node-1","commandId":"ls","options":[],"arguments":[{"argumentId":"files","value":".","valueKind":"literal"}]}]}]},
                  "layout":{"nodes":[{"nodeId":"node-1","x":0,"y":0}],"viewport":{"x":0,"y":0,"zoom":1}},
                  "parameters":[]
                }
                """,
                1,
                storedAt,
                storedAt));

        ScriptProject migrated = service.get(PROJECT_ID).orElseThrow();

        assertEquals("1.4.0", migrated.schemaVersion());
        assertEquals("1.4.0", migrated.program().schemaVersion());
        assertTrue(migrated.program().statements().getFirst() instanceof ShellProgram.FunctionNode);
    }

    @Test
    void importsAndMigratesProjectJsonWithoutPersistingIt() throws Exception {
        String legacy = """
                {
                  "schemaVersion":"1.3.0",
                  "projectId":"68d4861b-3ba5-47c8-8828-6ba2efc9945d",
                  "name":"Imported list",
                  "createdAt":"2026-07-17T12:00:00Z",
                  "updatedAt":"2026-07-17T12:00:00Z",
                  "catalogVersion":"1.2.0",
                  "target":{"operatingSystem":"linux","architecture":"x86_64","shellDialect":"bash","distroFamily":"ubuntu","distroVersion":"24.04"},
                  "program":{"schemaVersion":"1.3.0","dialect":"bash","statements":[{"type":"command","nodeId":"node-1","commandId":"ls","options":[],"arguments":[{"argumentId":"files","value":".","valueKind":"literal"}]}]},
                  "layout":{"nodes":[{"nodeId":"node-1","x":0,"y":0}],"viewport":{"x":0,"y":0,"zoom":1}},
                  "parameters":[]
                }
                """;

        ScriptProject imported = service.importJson(legacy);

        assertEquals("1.4.0", imported.schemaVersion());
        assertTrue(service.recent(10).isEmpty());
    }

    private ScriptProject project(
            ShellProgram program,
            List<ScriptProject.ProjectParameter> parameters) {
        return new ScriptProject(
                "1.4.0",
                PROJECT_ID,
                "  List files  ",
                "2020-01-01T00:00:00Z",
                "2020-01-01T00:00:00Z",
                "1.2.0",
                new ScriptProject.ProjectTarget("linux", "x86_64", "bash", "ubuntu", "24.04"),
                program,
                new ScriptProject.ProjectLayout(
                        List.of(new ScriptProject.LayoutNode("node-1", 10, 20)),
                        new ScriptProject.Viewport(0, 0, 1)),
                parameters);
    }

    private ShellProgram program(String path) {
        return new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.CommandNode(
                        "node-1", "ls", List.of(),
                        List.of(new ShellProgram.ArgumentValue("files", path)))));
    }
}
