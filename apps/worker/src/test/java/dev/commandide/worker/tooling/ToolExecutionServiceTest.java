package dev.commandide.worker.tooling;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.process.ProcessRunner;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

final class ToolExecutionServiceTest {
    @Test
    void runsOnlyFixedShellCheckArgumentsAndNormalizesDiagnostics() {
        AtomicReference<String> input = new AtomicReference<>();
        ProcessRunner runner = runner((executable, arguments, environment, timeout, source) -> {
            assertEquals(Path.of("/trusted/shellcheck"), executable);
            assertEquals(List.of("--format=json", "--shell=bash", "-"), arguments);
            assertEquals(Map.of("LC_ALL", "C", "LANG", "C"), environment);
            assertEquals(Duration.ofSeconds(5), timeout);
            input.set(source);
            return new ProcessRunner.ProcessResult(1, """
                    [{"file":"-","line":2,"endLine":2,"column":6,"endColumn":12,
                    "level":"warning","code":2086,"message":"Double quote to prevent globbing."}]
                    """, false, false);
        });
        ToolExecutionService service = new ToolExecutionService(
                Path.of("/trusted/shellcheck"), null, runner);

        ShellCheckResult result = service.shellCheck("echo $VALUE");

        assertEquals("completed", result.status());
        assertEquals("echo $VALUE", input.get());
        assertEquals("SC2086", result.diagnostics().getFirst().code());
        assertEquals(1, result.diagnostics().getFirst().range().start().line());
        assertEquals(5, result.diagnostics().getFirst().range().start().character());
        assertEquals("ShellCheck", result.diagnostics().getFirst().source());
    }

    @Test
    void returnsFormattedSourceOnlyAsAnExplicitPreview() {
        ProcessRunner runner = runner((executable, arguments, environment, timeout, source) -> {
            assertEquals(Path.of("/trusted/shfmt"), executable);
            assertEquals(List.of("-ln", "bash"), arguments);
            return new ProcessRunner.ProcessResult(0, "if true; then\n\techo ok\nfi\n", false, false);
        });
        ToolExecutionService service = new ToolExecutionService(
                null, Path.of("/trusted/shfmt"), runner);

        ShfmtResult result = service.shfmt("if true;then echo ok;fi");

        assertEquals("formatted", result.status());
        assertTrue(result.changed());
        assertEquals("if true; then\n\techo ok\nfi\n", result.source());
        assertNull(result.reason());
    }

    @Test
    void degradesCleanlyWhenToolsAreMissingOrOutputIsUnsafe() {
        ToolExecutionService missing = new ToolExecutionService(null, null, runner(
                (executable, arguments, environment, timeout, source) -> {
                    throw new AssertionError("Missing tools must not run");
                }));
        assertEquals("unavailable", missing.shellCheck("echo ok").status());
        assertEquals("unavailable", missing.shfmt("echo ok").status());

        ToolExecutionService truncated = new ToolExecutionService(
                Path.of("/trusted/shellcheck"), Path.of("/trusted/shfmt"), runner(
                (executable, arguments, environment, timeout, source) ->
                        new ProcessRunner.ProcessResult(0, "partial", false, true)));
        assertEquals("failed", truncated.shellCheck("echo ok").status());
        assertEquals("failed", truncated.shfmt("echo ok").status());
    }

    private ProcessRunner runner(InputRunner inputRunner) {
        return new ProcessRunner() {
            @Override
            public ProcessResult run(
                    Path executable,
                    List<String> arguments,
                    Map<String, String> environment,
                    Duration timeout) throws Exception {
                return inputRunner.run(executable, arguments, environment, timeout, "");
            }

            @Override
            public ProcessResult runWithInput(
                    Path executable,
                    List<String> arguments,
                    Map<String, String> environment,
                    Duration timeout,
                    String input) throws Exception {
                return inputRunner.run(executable, arguments, environment, timeout, input);
            }
        };
    }

    @FunctionalInterface
    private interface InputRunner {
        ProcessRunner.ProcessResult run(
                Path executable,
                List<String> arguments,
                Map<String, String> environment,
                Duration timeout,
                String input) throws Exception;
    }
}
