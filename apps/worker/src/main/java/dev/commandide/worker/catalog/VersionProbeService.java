package dev.commandide.worker.catalog;

import dev.commandide.worker.process.BoundedProcessRunner;
import dev.commandide.worker.process.ProcessRunner;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

public final class VersionProbeService {
    private static final Duration TIMEOUT = Duration.ofSeconds(2);
    private static final Pattern ANSI = Pattern.compile("\\u001B\\[[0-?]*[ -/]*[@-~]");

    private final CatalogService catalogService;
    private final ProcessRunner runner;
    private final Map<String, VersionProbeResult> cache = new ConcurrentHashMap<>();

    public VersionProbeService(CatalogService catalogService) {
        this(catalogService, new BoundedProcessRunner());
    }

    VersionProbeService(CatalogService catalogService, ProcessRunner runner) {
        this.catalogService = catalogService;
        this.runner = runner;
    }

    public VersionProbeResult probe(String commandId, boolean force) {
        if (!force) {
            VersionProbeResult cached = cache.get(commandId);
            if (cached != null) return cached.asCached();
        }
        CommandSpec command = catalogService.findById(commandId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown catalog command"));
        VersionProbeResult result = execute(command);
        cache.put(commandId, result);
        return result;
    }

    private VersionProbeResult execute(CommandSpec command) {
        if (!command.availability().equals("installed") || command.executablePath() == null) {
            return new VersionProbeResult(command.id(), "unavailable", null, false, false);
        }
        try {
            ProcessRunner.ProcessResult output = runner.run(
                    Path.of(command.executablePath()),
                    command.versionProbeArguments(),
                    Map.of("LC_ALL", "C", "LANG", "C"),
                    TIMEOUT);
            if (output.timedOut()) {
                return new VersionProbeResult(command.id(), "timed-out", null, false, output.truncated());
            }
            String version = firstSafeLine(output.output());
            if (output.exitCode() != 0 || version == null) {
                return new VersionProbeResult(command.id(), "failed", null, false, output.truncated());
            }
            return new VersionProbeResult(command.id(), "detected", version, false, output.truncated());
        } catch (Exception exception) {
            return new VersionProbeResult(command.id(), "failed", null, false, false);
        }
    }

    private static String firstSafeLine(String raw) {
        String withoutAnsi = ANSI.matcher(raw == null ? "" : raw).replaceAll("");
        return withoutAnsi.lines()
                .map(line -> line.replaceAll("\\p{Cntrl}", "").strip().replaceAll("\\s+", " "))
                .filter(line -> !line.isBlank())
                .map(line -> line.length() <= 200 ? line : line.substring(0, 200))
                .findFirst()
                .orElse(null);
    }
}
