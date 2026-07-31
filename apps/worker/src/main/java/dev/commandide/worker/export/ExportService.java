// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.export;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.commandide.worker.project.ProjectService;
import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellGenerateResult;
import java.util.List;
import java.util.Locale;

public final class ExportService {
    private static final int MAX_ARTIFACT_CHARS = 2_000_000;

    private final BashGenerator generator;
    private final ProjectService projects;
    private final BashSyntaxChecker syntaxChecker;
    private final ObjectMapper mapper = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    public ExportService(BashGenerator generator, ProjectService projects, BashSyntaxChecker syntaxChecker) {
        this.generator = generator;
        this.projects = projects;
        this.syntaxChecker = syntaxChecker;
    }

    public ExportArtifact create(
            ScriptProject candidate,
            String format,
            boolean strictMode,
            boolean includeSourceComments) throws Exception {
        ScriptProject project = projects.validateForTransfer(candidate);
        String stem = safeFileStem(project.name());
        ExportArtifact artifact = switch (format) {
            case "project" -> projectArtifact(project, stem);
            case "bash" -> bashArtifact(project, stem, strictMode, includeSourceComments);
            case "markdown" -> markdownArtifact(project, stem, strictMode, includeSourceComments);
            default -> throw new IllegalArgumentException("Unsupported export format");
        };
        if (artifact.content().length() > MAX_ARTIFACT_CHARS || artifact.content().indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Export artifact exceeds the bounded limit");
        }
        return artifact;
    }

    private ExportArtifact projectArtifact(ScriptProject project, String stem) throws Exception {
        String content = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(project) + "\n";
        return new ExportArtifact(
                "project", stem + ".cmdbuilder.json", "application/json", content,
                "not-applicable", List.of());
    }

    private ExportArtifact bashArtifact(
            ScriptProject project,
            String stem,
            boolean strictMode,
            boolean includeSourceComments) throws Exception {
        ShellGenerateResult generated = generator.generate(project.program());
        String script = buildBash(project, generated.script(), strictMode, includeSourceComments);
        syntaxChecker.requireValid(script);
        return new ExportArtifact(
                "bash", stem + ".sh", "text/x-shellscript", script,
                "passed", generated.warnings());
    }

    private ExportArtifact markdownArtifact(
            ScriptProject project,
            String stem,
            boolean strictMode,
            boolean includeSourceComments) {
        ShellGenerateResult generated = generator.generate(project.program());
        String script = buildBash(project, generated.script(), strictMode, includeSourceComments);
        String fence = "`".repeat(Math.max(3, longestBacktickRun(script) + 1));
        StringBuilder markdown = new StringBuilder("# ").append(markdownText(project.name())).append("\n\n")
                .append("Target: `").append(markdownCode(project.target().operatingSystem()))
                .append(" / ").append(markdownCode(project.target().architecture())).append(" / bash`\n\n");
        if (!project.parameters().isEmpty()) {
            markdown.append("## Parameters\n\n| Name | Required | Sensitive | Default | Description |\n")
                    .append("| --- | --- | --- | --- | --- |\n");
            for (ScriptProject.ProjectParameter parameter : project.parameters()) {
                markdown.append("| `").append(markdownCode(parameter.name())).append("` | ")
                        .append(parameter.required() ? "yes" : "no").append(" | ")
                        .append(parameter.sensitive() ? "yes" : "no").append(" | ")
                        .append(parameter.defaultValue() == null ? "—" : tableText(parameter.defaultValue()))
                        .append(" | ").append(tableText(parameter.description())).append(" |\n");
            }
            markdown.append('\n');
        }
        markdown.append("## Bash recipe\n\n").append(fence).append("bash\n")
                .append(script).append(fence).append("\n");
        return new ExportArtifact(
                "markdown", stem + ".md", "text/markdown", markdown.toString(),
                "not-applicable", generated.warnings());
    }

    private String buildBash(
            ScriptProject project,
            String generated,
            boolean strictMode,
            boolean includeSourceComments) {
        StringBuilder script = new StringBuilder("#!/usr/bin/env bash\n");
        if (strictMode) script.append("set -euo pipefail\n");
        if (includeSourceComments) {
            script.append("# Command IDE project: ").append(shellComment(project.name())).append("\n")
                    .append("# Target: ").append(shellComment(project.target().operatingSystem()))
                    .append(" / ").append(shellComment(project.target().architecture())).append(" / bash\n");
        }
        if (!project.parameters().isEmpty()) script.append('\n');
        for (ScriptProject.ProjectParameter parameter : project.parameters()) {
            if (!parameter.description().isBlank()) {
                script.append("# ").append(parameter.name()).append(": ")
                        .append(shellComment(parameter.description())).append('\n');
            }
            if (parameter.required() && parameter.defaultValue() == null) {
                script.append(": \"${").append(parameter.name()).append(":?Set ")
                        .append(parameter.name()).append(" before running this script}\"\n");
            } else if (parameter.defaultValue() != null) {
                script.append("if [[ ! -v ").append(parameter.name()).append(" ]]; then ")
                        .append(parameter.name()).append('=')
                        .append(BashGenerator.quoteLiteral(parameter.defaultValue())).append("; fi\n");
            } else {
                script.append(": \"${").append(parameter.name()).append(":=}\"\n");
            }
            script.append("export ").append(parameter.name()).append('\n');
        }
        if (!project.parameters().isEmpty()) script.append('\n');
        return script.append(generated).append('\n').toString();
    }

    private static String safeFileStem(String value) {
        String stem = value.strip().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9._-]+", "-")
                .replaceAll("^-+|-+$", "");
        if (stem.isBlank() || stem.equals(".") || stem.equals("..")) stem = "project";
        return stem.substring(0, Math.min(stem.length(), 80));
    }

    private static String shellComment(String value) {
        return value.replaceAll("[\\r\\n\\p{Cntrl}]+", " ").strip();
    }

    private static String markdownText(String value) {
        return value.replaceAll("[\\r\\n]+", " ").replace("#", "\\#").strip();
    }

    private static String markdownCode(String value) {
        return value.replace("`", "\\`").replaceAll("[\\r\\n]+", " ");
    }

    private static String tableText(String value) {
        return value.replace("|", "\\|").replaceAll("[\\r\\n]+", " ").strip();
    }

    private static int longestBacktickRun(String value) {
        int longest = 0;
        int current = 0;
        for (int index = 0; index < value.length(); index++) {
            if (value.charAt(index) == '`') longest = Math.max(longest, ++current);
            else current = 0;
        }
        return longest;
    }
}
