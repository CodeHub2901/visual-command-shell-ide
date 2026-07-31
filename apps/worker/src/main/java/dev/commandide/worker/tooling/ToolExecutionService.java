// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.tooling;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.commandide.worker.catalog.ExecutableDiscovery;
import dev.commandide.worker.language.LanguageDiagnostic;
import dev.commandide.worker.language.LanguagePosition;
import dev.commandide.worker.language.LanguageRange;
import dev.commandide.worker.process.BoundedProcessRunner;
import dev.commandide.worker.process.ProcessRunner;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class ToolExecutionService {
    private static final int MAX_SOURCE_LENGTH = 1_000_000;
    private static final int MAX_DIAGNOSTICS = 1000;
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final Map<String, String> ENVIRONMENT = Map.of("LC_ALL", "C", "LANG", "C");

    private final Path shellCheck;
    private final Path shfmt;
    private final ProcessRunner runner;
    private final ObjectMapper mapper = new ObjectMapper();

    public ToolExecutionService(SystemProfile profile) {
        this(
                ExecutableDiscovery.find(
                        "shellcheck", profile.pathEntries(), profile.operatingSystem()).orElse(null),
                ExecutableDiscovery.find(
                        "shfmt", profile.pathEntries(), profile.operatingSystem()).orElse(null),
                new BoundedProcessRunner());
    }

    ToolExecutionService(Path shellCheck, Path shfmt, ProcessRunner runner) {
        this.shellCheck = shellCheck;
        this.shfmt = shfmt;
        this.runner = runner;
    }

    public ShellCheckResult shellCheck(String source) {
        requireSource(source);
        if (shellCheck == null) {
            return new ShellCheckResult(
                    "unavailable", List.of(), "ShellCheck is not installed.");
        }
        try {
            ProcessRunner.ProcessResult result = runner.runWithInput(
                    shellCheck,
                    List.of("--format=json", "--shell=bash", "-"),
                    ENVIRONMENT,
                    TIMEOUT,
                    source);
            if (result.timedOut()) return shellCheckFailed("ShellCheck timed out.");
            if (result.truncated()) return shellCheckFailed("ShellCheck produced too much output.");
            if (result.exitCode() != 0 && result.exitCode() != 1) {
                return shellCheckFailed("ShellCheck could not analyze this source.");
            }
            JsonNode root = mapper.readTree(result.output().isBlank() ? "[]" : result.output());
            JsonNode values = root.isArray() ? root : root.path("comments");
            if (!values.isArray()) return shellCheckFailed("ShellCheck returned malformed output.");
            List<LanguageDiagnostic> diagnostics = new ArrayList<>();
            for (JsonNode value : values) {
                if (diagnostics.size() >= MAX_DIAGNOSTICS) break;
                LanguageDiagnostic diagnostic = parseDiagnostic(value);
                if (diagnostic != null) diagnostics.add(diagnostic);
            }
            return new ShellCheckResult("completed", List.copyOf(diagnostics), null);
        } catch (Exception exception) {
            return shellCheckFailed("ShellCheck could not analyze this source.");
        }
    }

    public ShfmtResult shfmt(String source) {
        requireSource(source);
        if (shfmt == null) {
            return new ShfmtResult("unavailable", null, false, "shfmt is not installed.");
        }
        try {
            ProcessRunner.ProcessResult result = runner.runWithInput(
                    shfmt,
                    List.of("-ln", "bash"),
                    ENVIRONMENT,
                    TIMEOUT,
                    source);
            if (result.timedOut()) return shfmtFailed("shfmt timed out.");
            if (result.truncated()) return shfmtFailed("shfmt produced too much output.");
            if (result.exitCode() != 0 || result.output().length() > MAX_SOURCE_LENGTH) {
                return shfmtFailed("shfmt could not format this source.");
            }
            return new ShfmtResult(
                    "formatted", result.output(), !result.output().equals(source), null);
        } catch (Exception exception) {
            return shfmtFailed("shfmt could not format this source.");
        }
    }

    private LanguageDiagnostic parseDiagnostic(JsonNode value) {
        int line = oneBased(value.path("line"));
        int column = oneBased(value.path("column"));
        int endLine = oneBased(value.path("endLine"));
        int endColumn = oneBased(value.path("endColumn"));
        String message = bounded(value.path("message").asText(""), 1000);
        if (line < 1 || column < 1 || message.isBlank()) return null;
        if (endLine < 1) endLine = line;
        if (endColumn < 1) endColumn = column + 1;
        String level = value.path("level").asText("info");
        String severity = switch (level) {
            case "error" -> "error";
            case "warning" -> "warning";
            default -> "information";
        };
        String code = value.path("code").isIntegralNumber()
                ? "SC" + value.path("code").asInt()
                : null;
        return new LanguageDiagnostic(
                new LanguageRange(
                        new LanguagePosition(line - 1, column - 1),
                        new LanguagePosition(endLine - 1, endColumn - 1)),
                severity,
                code,
                message,
                "ShellCheck");
    }

    private int oneBased(JsonNode value) {
        if (!value.isIntegralNumber() || !value.canConvertToInt()) return -1;
        int number = value.asInt();
        return number >= 1 && number <= 1_000_001 ? number : -1;
    }

    private ShellCheckResult shellCheckFailed(String reason) {
        return new ShellCheckResult("failed", List.of(), reason);
    }

    private ShfmtResult shfmtFailed(String reason) {
        return new ShfmtResult("failed", null, false, reason);
    }

    private void requireSource(String source) {
        if (source == null || source.length() > MAX_SOURCE_LENGTH) {
            throw new IllegalArgumentException("Bash source must contain at most 1,000,000 characters");
        }
    }

    private String bounded(String value, int maximum) {
        return value.length() <= maximum ? value : value.substring(0, maximum);
    }
}
