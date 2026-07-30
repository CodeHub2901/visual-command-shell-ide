package dev.commandide.worker.process;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public interface ProcessRunner {
    ProcessResult run(Path executable, List<String> arguments, Map<String, String> environment, Duration timeout)
            throws Exception;

    default ProcessResult runWithInput(
            Path executable,
            List<String> arguments,
            Map<String, String> environment,
            Duration timeout,
            String input) throws Exception {
        if (input != null && !input.isEmpty()) {
            throw new UnsupportedOperationException("This process runner does not accept stdin");
        }
        return run(executable, arguments, environment, timeout);
    }

    record ProcessResult(int exitCode, String output, boolean timedOut, boolean truncated) {}
}
