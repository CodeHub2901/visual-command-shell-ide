package dev.commandide.worker.shell;

import java.util.List;

public record ShellGenerateResult(String script, boolean compacted, List<String> warnings) {}
