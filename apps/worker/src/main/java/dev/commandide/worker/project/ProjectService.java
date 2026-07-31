// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.project;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.commandide.worker.persistence.ProjectRepository;
import dev.commandide.worker.persistence.StoredProject;
import dev.commandide.worker.security.SecretRedactor;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellPrograms;
import java.sql.SQLException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

public final class ProjectService {
    private static final int MAX_IMPORTED_PROJECT_BYTES = 2_000_000;
    private static final String PROJECT_VERSION = "1.4.0";
    private static final String CATALOG_VERSION = "1.2.0";
    private static final Pattern PARAMETER_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Pattern SECRET_NAME = Pattern.compile(
            "(?i).*(api_?key|access_?token|token|password|passwd|secret).*");

    private final ProjectRepository repository;
    private final BashGenerator generator;
    private final SecretRedactor redactor;
    private final Clock clock;
    private final ObjectMapper mapper;

    public ProjectService(ProjectRepository repository, BashGenerator generator) {
        this(repository, generator, Clock.systemUTC());
    }

    ProjectService(ProjectRepository repository, BashGenerator generator, Clock clock) {
        this.repository = repository;
        this.generator = generator;
        this.clock = clock;
        this.redactor = new SecretRedactor();
        this.mapper = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public ScriptProject save(ScriptProject candidate) throws Exception {
        validateForTransfer(candidate);

        Instant now = clock.instant();
        Instant createdAt = repository.findById(candidate.projectId())
                .map(StoredProject::createdAt)
                .orElse(now);
        ScriptProject normalized = new ScriptProject(
                PROJECT_VERSION,
                candidate.projectId(),
                candidate.name().strip(),
                createdAt.toString(),
                now.toString(),
                CATALOG_VERSION,
                candidate.target(),
                candidate.program(),
                candidate.layout(),
                List.copyOf(candidate.parameters()));
        repository.save(new StoredProject(
                normalized.projectId(),
                normalized.name(),
                mapper.writeValueAsString(normalized),
                1,
                createdAt,
                now));
        return normalized;
    }

    public Optional<ScriptProject> get(String projectId) throws Exception {
        UUID.fromString(projectId);
        Optional<StoredProject> stored = repository.findById(projectId);
        if (stored.isEmpty()) return Optional.empty();
        if (stored.get().schemaVersion() != 1) {
            throw new IllegalStateException("Unsupported stored project schema");
        }
        JsonNode source = mapper.readTree(stored.get().projectJson());
        migrate(source);
        ScriptProject project = mapper.treeToValue(source, ScriptProject.class);
        validate(project);
        return Optional.of(project);
    }

    public List<ProjectSummary> recent(int limit) throws SQLException {
        return repository.recent(limit).stream()
                .map(project -> new ProjectSummary(
                        project.id(), project.name(), project.updatedAt().toString()))
                .toList();
    }

    public ScriptProject validateForTransfer(ScriptProject project) {
        validate(project);
        String script = generator.generate(project.program()).script();
        if (!script.equals(redactor.redact(script))) {
            throw new IllegalArgumentException("Projects cannot contain embedded credentials; use a sensitive parameter");
        }
        return project;
    }

    public ScriptProject importJson(String content) throws Exception {
        if (content == null || content.isBlank()
                || content.getBytes(StandardCharsets.UTF_8).length > MAX_IMPORTED_PROJECT_BYTES) {
            throw new IllegalArgumentException("Invalid project import");
        }
        JsonNode source = mapper.readTree(content);
        migrate(source);
        ScriptProject project = mapper.treeToValue(source, ScriptProject.class);
        return validateForTransfer(project);
    }

    private void validate(ScriptProject project) {
        if (project == null || !PROJECT_VERSION.equals(project.schemaVersion())
                || !CATALOG_VERSION.equals(project.catalogVersion())
                || project.name() == null || project.name().isBlank() || project.name().strip().length() > 120
                || project.target() == null || project.program() == null || project.layout() == null
                || project.parameters() == null || project.parameters().size() > 200) {
            throw new IllegalArgumentException("Invalid project metadata");
        }
        UUID.fromString(project.projectId());
        Instant.parse(project.createdAt());
        Instant.parse(project.updatedAt());
        if (project.target().operatingSystem() == null || project.target().architecture() == null
                || project.target().shellDialect() == null) {
            throw new IllegalArgumentException("Invalid project target");
        }
        if (!project.target().shellDialect().equals(project.program().dialect())) {
            throw new IllegalArgumentException("Project target and program dialect differ");
        }
        validateLayout(project);
        validateParameters(project.parameters());
        generator.generate(project.program());
    }

    private void validateLayout(ScriptProject project) {
        if (project.layout().nodes() == null || project.layout().nodes().size() > 5000
                || project.layout().viewport() == null
                || !Double.isFinite(project.layout().viewport().x())
                || !Double.isFinite(project.layout().viewport().y())
                || !Double.isFinite(project.layout().viewport().zoom())
                || project.layout().viewport().zoom() < 0.05
                || project.layout().viewport().zoom() > 8) {
            throw new IllegalArgumentException("Invalid project layout");
        }
        Set<String> programNodes = new HashSet<>();
        ShellPrograms.depthFirst(project.program()).forEach(node -> programNodes.add(node.nodeId()));
        Set<String> layoutNodes = new HashSet<>();
        for (ScriptProject.LayoutNode node : project.layout().nodes()) {
            if (node == null || !programNodes.contains(node.nodeId()) || !layoutNodes.add(node.nodeId())
                    || !Double.isFinite(node.x()) || !Double.isFinite(node.y())) {
                throw new IllegalArgumentException("Invalid project layout node");
            }
        }
    }

    private void validateParameters(List<ScriptProject.ProjectParameter> parameters) {
        Set<String> names = new HashSet<>();
        for (ScriptProject.ProjectParameter parameter : parameters) {
            if (parameter == null || parameter.name() == null
                    || !PARAMETER_NAME.matcher(parameter.name()).matches()
                    || !names.add(parameter.name())
                    || parameter.description() == null || parameter.description().length() > 1000
                    || parameter.defaultValue() != null && parameter.defaultValue().length() > 4096
                    || parameter.sensitive() && parameter.defaultValue() != null
                    || SECRET_NAME.matcher(parameter.name()).matches() && parameter.defaultValue() != null) {
                throw new IllegalArgumentException("Invalid or secret-bearing project parameter");
            }
        }
    }

    private void migrate(JsonNode source) {
        if (!(source instanceof ObjectNode project)) {
            throw new IllegalArgumentException("Stored project is not an object");
        }
        String projectVersion = project.path("schemaVersion").asText();
        if ("1.0.0".equals(projectVersion)
                || "1.1.0".equals(projectVersion)
                || "1.2.0".equals(projectVersion)
                || "1.3.0".equals(projectVersion)) {
            project.put("schemaVersion", PROJECT_VERSION);
            JsonNode program = project.path("program");
            if (!(program instanceof ObjectNode programObject)) {
                throw new IllegalArgumentException("Legacy project has an incompatible program");
            }
            String programVersion = programObject.path("schemaVersion").asText();
            if (!programVersion.equals(projectVersion)) {
                throw new IllegalArgumentException("Legacy project and program versions differ");
            }
            programObject.put("schemaVersion", PROJECT_VERSION);
            if (projectVersion.equals("1.0.0") || projectVersion.equals("1.1.0")) {
                addLegacyValueKinds(programObject);
            }
        }
    }

    private void addLegacyValueKinds(JsonNode node) {
        if (node instanceof ObjectNode object) {
            if (object.has("optionId") && object.has("value") && !object.has("valueKind")) {
                if (object.path("value").isNull()) object.putNull("valueKind");
                else object.put("valueKind", "literal");
            }
            if (object.has("argumentId") && object.has("value") && !object.has("valueKind")) {
                object.put("valueKind", "literal");
            }
            if (object.has("operator") && object.has("target") && !object.has("targetKind")) {
                object.put("targetKind", "literal");
            }
            object.elements().forEachRemaining(this::addLegacyValueKinds);
        } else if (node.isArray()) {
            node.elements().forEachRemaining(this::addLegacyValueKinds);
        }
    }
}
