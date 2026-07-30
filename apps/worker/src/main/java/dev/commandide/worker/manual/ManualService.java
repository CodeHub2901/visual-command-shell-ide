package dev.commandide.worker.manual;

import dev.commandide.worker.catalog.CatalogCommand;
import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.catalog.CommandSpec;
import dev.commandide.worker.process.BoundedProcessRunner;
import dev.commandide.worker.process.ProcessRunner;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class ManualService {
    private static final Duration PROCESS_TIMEOUT = Duration.ofMillis(2_500);

    private final CatalogService catalogService;
    private final SystemProfile systemProfile;
    private final ProcessRunner runner;
    private final TldrService tldrService;
    private final Map<String, ManualResult> cache = new ConcurrentHashMap<>();

    public ManualService(CatalogService catalogService, SystemProfile systemProfile) {
        this(catalogService, systemProfile, new BoundedProcessRunner());
    }

    ManualService(
            CatalogService catalogService,
            SystemProfile systemProfile,
            ProcessRunner runner) {
        this.catalogService = catalogService;
        this.systemProfile = systemProfile;
        this.runner = runner;
        this.tldrService = new TldrService();
    }

    public ManualResult get(String commandId) {
        return cache.computeIfAbsent(commandId, this::load);
    }

    private ManualResult load(String commandId) {
        CommandSpec command = catalogService.findById(commandId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown catalog command"));
        CatalogCommand.CommandManual fallback = command.manual();
        TldrSupplement tldr = tldrService.find(commandId).orElse(null);

        ManualResult man = tryMan(command, fallback, tldr);
        if (man != null) return man;
        ManualResult help = tryHelp(command, fallback, tldr);
        if (help != null) return help;
        return new ManualResult(command.id(), "bundled", false, fallback, tldr);
    }

    private ManualResult tryMan(
            CommandSpec command,
            CatalogCommand.CommandManual fallback,
            TldrSupplement tldr) {
        if (!systemProfile.operatingSystem().equals("linux")
                && !systemProfile.operatingSystem().equals("macos")) {
            return null;
        }
        Path man = catalogService.resolveExecutable("man").orElse(null);
        if (man == null) return null;
        try {
            ProcessRunner.ProcessResult output = runner.run(
                    man,
                    List.of(command.executable()),
                    Map.of("MANPAGER", "cat", "PAGER", "cat", "MANWIDTH", "100"),
                    PROCESS_TIMEOUT);
            CatalogCommand.CommandManual parsed = !output.timedOut() && output.exitCode() == 0
                    ? ManualParser.parseMan(output.output(), fallback)
                    : null;
            return parsed == null ? null : new ManualResult(command.id(), "man", output.truncated(), parsed, tldr);
        } catch (Exception exception) {
            return null;
        }
    }

    private ManualResult tryHelp(
            CommandSpec command,
            CatalogCommand.CommandManual fallback,
            TldrSupplement tldr) {
        if (!command.availability().equals("installed") || command.executablePath() == null) {
            return null;
        }
        try {
            ProcessRunner.ProcessResult output = runner.run(
                    Path.of(command.executablePath()),
                    List.of("--help"),
                    Map.of("LC_ALL", "C", "LANG", "C"),
                    PROCESS_TIMEOUT);
            CatalogCommand.CommandManual parsed = !output.timedOut() && output.exitCode() == 0
                    ? ManualParser.parseHelp(output.output(), fallback)
                    : null;
            return parsed == null ? null : new ManualResult(command.id(), "help", output.truncated(), parsed, tldr);
        } catch (Exception exception) {
            return null;
        }
    }
}
