package dev.commandide.worker.export;

import dev.commandide.worker.catalog.ExecutableDiscovery;
import dev.commandide.worker.process.ProcessRunner;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public final class LocalBashSyntaxChecker implements BashSyntaxChecker {
    private final Path bash;
    private final ProcessRunner processRunner;

    public LocalBashSyntaxChecker(SystemProfile profile, ProcessRunner processRunner) {
        this.bash = ExecutableDiscovery.find("bash", profile.pathEntries(), profile.operatingSystem())
                .orElse(null);
        this.processRunner = processRunner;
    }

    @Override
    public void requireValid(String script) throws Exception {
        if (bash == null) {
            throw new IllegalStateException("Bash export requires a discovered bash executable");
        }
        ProcessRunner.ProcessResult result = processRunner.runWithInput(
                bash,
                List.of("--noprofile", "--norc", "-n"),
                Map.of("BASH_ENV", "", "ENV", ""),
                Duration.ofSeconds(5),
                script);
        if (result.timedOut() || result.truncated() || result.exitCode() != 0) {
            throw new IllegalArgumentException("Generated Bash did not pass local syntax validation");
        }
    }
}
