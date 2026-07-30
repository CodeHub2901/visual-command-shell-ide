package dev.commandide.worker.risk;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.catalog.CommandSpec;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellGenerateResult;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.shell.ShellPrograms;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

public final class RiskAssessmentService {
    private static final Set<String> RECURSIVE_CRITICAL_COMMANDS = Set.of("rm", "chmod", "chown");
    private static final Set<String> SYSTEMCTL_READ_ONLY_OPERATIONS = Set.of(
            "status", "show", "cat", "help",
            "is-active", "is-failed", "is-enabled", "is-system-running",
            "list-units", "list-unit-files", "list-sockets", "list-timers",
            "list-dependencies", "list-jobs", "list-machines");
    private static final Set<String> SYSTEMCTL_CONFIGURATION_OPERATIONS = Set.of(
            "enable", "disable", "reenable", "preset", "preset-all",
            "mask", "unmask", "link", "revert", "edit",
            "set-default", "daemon-reload", "daemon-reexec");
    private static final Set<String> TIMEDATECTL_READ_ONLY_OPERATIONS = Set.of(
            "status", "show", "timesync-status", "show-timesync", "list-timezones");
    private static final Set<String> TIMEDATECTL_CONFIGURATION_OPERATIONS = Set.of(
            "set-time", "set-timezone", "set-local-rtc", "set-ntp");
    private static final Set<String> LOGINCTL_READ_ONLY_OPERATIONS = Set.of(
            "list-sessions", "list-users", "list-seats",
            "show-session", "show-user", "show-seat",
            "session-status", "user-status", "seat-status");
    private static final Set<String> LOGINCTL_CONFIGURATION_OPERATIONS = Set.of(
            "enable-linger", "disable-linger");
    private static final Set<String> HOSTNAMECTL_VALUE_OPERATIONS = Set.of(
            "hostname", "icon-name", "chassis", "deployment", "location");
    private static final Set<String> APT_QUERY_OPERATIONS = Set.of(
            "search", "show", "list", "depends", "rdepends", "changelog", "download", "source");
    private static final Set<String> DNF_QUERY_OPERATIONS = Set.of(
            "search", "info", "list", "repoquery", "provides", "check-update", "download");
    private static final Set<String> SHELL_EXECUTABLES = Set.of("sh", "bash", "zsh", "dash", "ksh");

    private final CatalogService catalogService;
    private final BashGenerator bashGenerator;

    public RiskAssessmentService(CatalogService catalogService, BashGenerator bashGenerator) {
        this.catalogService = catalogService;
        this.bashGenerator = bashGenerator;
    }

    public RiskAssessment assess(ShellProgram program) {
        ShellGenerateResult generated = bashGenerator.generate(program);
        RiskLevel overall = RiskLevel.LOW;
        List<RiskEvidence> evidence = new ArrayList<>();
        int omitted = 0;
        for (ShellProgram.ShellNode node : ShellPrograms.depthFirst(program)) {
            if (node instanceof ShellProgram.CommandNode commandNode) {
                CommandSpec command = catalogService.findById(commandNode.commandId())
                        .orElseThrow(() -> new IllegalArgumentException("Unknown catalog command"));
                RuleMatch commandMatch = classify(command, commandNode);
                overall = RiskLevel.max(overall, commandMatch.level());
                omitted += addBounded(evidence, new RiskEvidence(
                        commandMatch.ruleId(), commandNode.nodeId(), commandMatch.message()));

                boolean assumesYes = hasOption(commandNode, "assume-yes")
                        && !isPackageSimulation(commandNode);
                if (assumesYes) {
                    overall = RiskLevel.max(overall, RiskLevel.HIGH);
                    omitted += addBounded(evidence, new RiskEvidence(
                            "option.assume-yes",
                            commandNode.nodeId(),
                            "Automatic confirmation can apply changes without another package-manager prompt."));
                }
            } else if (node instanceof ShellProgram.PipelineNode pipeline
                    && downloadsPipedToShell(pipeline)) {
                overall = RiskLevel.max(overall, RiskLevel.HIGH);
                omitted += addBounded(evidence, new RiskEvidence(
                        "shell.download-pipe",
                        pipeline.nodeId(),
                        "Downloaded content is passed directly to a shell interpreter."));
            } else if (node instanceof ShellProgram.RedirectNode redirect
                    && redirect.redirections().stream().anyMatch(item -> !item.operator().equals("<"))) {
                overall = RiskLevel.max(overall, RiskLevel.MEDIUM);
                omitted += addBounded(evidence, new RiskEvidence(
                        "shell.output-redirect",
                        redirect.nodeId(),
                        "Output redirection can create, replace, or append to a filesystem path."));
            } else if (node instanceof ShellProgram.RawCodeNode raw) {
                overall = RiskLevel.CRITICAL;
                omitted += addBounded(evidence, new RiskEvidence(
                        "shell.raw-code",
                        raw.nodeId(),
                        "Raw code is preserved exactly but cannot be semantically validated."));
            }
        }
        if (evidence.isEmpty()) {
            evidence.add(new RiskEvidence(
                    "shell.non-executable",
                    program.statements().getFirst().nodeId(),
                    "The program contains no executable catalog command."));
        }
        if (omitted > 0) {
            evidence.set(99, new RiskEvidence(
                    "assessment.evidence-truncated",
                    program.statements().get(0).nodeId(),
                    omitted + " additional evidence entries were omitted from the bounded response."));
        }
        return new RiskAssessment(
                generated.script(),
                sha256(generated.script()),
                overall.value,
                confirmation(overall),
                List.copyOf(evidence));
    }

    private static RuleMatch classify(CommandSpec command, ShellProgram.CommandNode node) {
        String commandId = command.id();
        if (commandId.equals("mount")) {
            boolean attachesFilesystem = !node.arguments().isEmpty()
                    || hasOption(node, "all");
            return attachesFilesystem
                    ? critical(
                            "operation.mount",
                            "Attaching filesystems changes the system mount hierarchy.")
                    : low(
                            "operation.read-only",
                            "Listing mounted filesystems is a read-only inspection.");
        }
        if (commandId.equals("umount")) {
            return critical(
                    "operation.mount",
                    "Detaching filesystems changes the system mount hierarchy and can disrupt active work.");
        }
        if (RECURSIVE_CRITICAL_COMMANDS.contains(commandId) && hasOption(node, "recursive")) {
            return critical(
                    "operation.recursive-destructive",
                    "This operation recursively removes data or changes security metadata across a directory tree.");
        }

        RuleMatch operationMatch = classifyOperation(commandId, node);
        return operationMatch == null ? classifyTags(command.riskTags()) : operationMatch;
    }

    private static RuleMatch classifyOperation(String commandId, ShellProgram.CommandNode node) {
        return switch (commandId) {
            case "systemctl" -> classifySystemctl(node);
            case "hostnamectl" -> classifyHostnamectl(node);
            case "timedatectl" -> classifyTimedatectl(node);
            case "loginctl" -> classifyLoginctl(node);
            case "apt", "dnf" -> classifyPackageManager(commandId, node);
            case "env" -> node.arguments().isEmpty()
                    ? low("operation.read-only", "Printing the current environment is a read-only inspection.")
                    : null;
            default -> null;
        };
    }

    private static RuleMatch classifySystemctl(ShellProgram.CommandNode node) {
        Optional<String> operation = literalArgument(node, "command");
        if (operation.isPresent() && SYSTEMCTL_READ_ONLY_OPERATIONS.contains(operation.get())) {
            return low("operation.read-only", "This systemctl operation only inspects systemd state.");
        }
        if (operation.isPresent() && SYSTEMCTL_CONFIGURATION_OPERATIONS.contains(operation.get())) {
            return critical(
                    "operation.system-configuration",
                    "This systemctl operation changes persistent system configuration.");
        }
        return null;
    }

    private static RuleMatch classifyHostnamectl(ShellProgram.CommandNode node) {
        Optional<String> operation = literalArgument(node, "command");
        if (operation.isEmpty() || operation.get().equals("status")) {
            return low("operation.read-only", "This hostnamectl operation only inspects host identity.");
        }
        if (HOSTNAMECTL_VALUE_OPERATIONS.contains(operation.get())) {
            return hasArgument(node, "name")
                    ? critical(
                            "operation.system-configuration",
                            "This hostnamectl operation changes persistent host identity metadata.")
                    : low(
                            "operation.read-only",
                            "This hostnamectl operation only inspects host identity metadata.");
        }
        if (operation.get().startsWith("set-")) {
            return critical(
                    "operation.system-configuration",
                    "This hostnamectl operation changes persistent host identity metadata.");
        }
        return null;
    }

    private static RuleMatch classifyTimedatectl(ShellProgram.CommandNode node) {
        Optional<String> operation = literalArgument(node, "command");
        if (operation.isEmpty() || TIMEDATECTL_READ_ONLY_OPERATIONS.contains(operation.get())) {
            return low("operation.read-only", "This timedatectl operation only inspects time configuration.");
        }
        if (TIMEDATECTL_CONFIGURATION_OPERATIONS.contains(operation.get())) {
            return critical(
                    "operation.system-configuration",
                    "This timedatectl operation changes system time configuration.");
        }
        return null;
    }

    private static RuleMatch classifyLoginctl(ShellProgram.CommandNode node) {
        Optional<String> operation = literalArgument(node, "command");
        if (operation.isEmpty() || LOGINCTL_READ_ONLY_OPERATIONS.contains(operation.get())) {
            return low("operation.read-only", "This loginctl operation only inspects login-manager state.");
        }
        if (LOGINCTL_CONFIGURATION_OPERATIONS.contains(operation.get())) {
            return critical(
                    "operation.system-configuration",
                    "This loginctl operation changes persistent login-manager configuration.");
        }
        return null;
    }

    private static RuleMatch classifyPackageManager(
            String commandId,
            ShellProgram.CommandNode node) {
        Optional<String> operation = literalArgument(node, "command");
        Set<String> queries = commandId.equals("apt") ? APT_QUERY_OPERATIONS : DNF_QUERY_OPERATIONS;
        if (operation.isPresent() && queries.contains(operation.get())) {
            return new RuleMatch(
                    RiskLevel.MEDIUM,
                    "operation.package-query",
                    "This package-manager operation queries package or repository metadata.");
        }
        if (isPackageSimulation(node)) {
            return new RuleMatch(
                    RiskLevel.MEDIUM,
                    "operation.package-query",
                    "This package transaction is configured for review without applying changes.");
        }
        if (operation.isPresent()) {
            return high(
                    "operation.package-change",
                    "This package-manager operation can change installed packages or repository state.");
        }
        return null;
    }

    private static RuleMatch classifyTags(List<String> tags) {
        Set<String> values = Set.copyOf(tags);
        if (values.contains("destructive")) {
            return high(
                    "catalog.destructive",
                    "This command deletes data and requires detailed review.");
        }
        if (values.contains("system-change") || values.contains("package-change") || values.contains("privilege")) {
            return high(
                    "catalog.system-change",
                    "This command can change system or package state and may require privileges.");
        }
        if (values.contains("filesystem-write") || values.contains("network")
                || values.contains("process-signal") || values.contains("package-query")) {
            return new RuleMatch(RiskLevel.MEDIUM, "catalog.side-effect", "This command can write files or communicate over the network.");
        }
        return new RuleMatch(RiskLevel.LOW, "catalog.read-only", "Catalog metadata classifies this command as read-only.");
    }

    private static boolean downloadsPipedToShell(ShellProgram.PipelineNode pipeline) {
        if (!pipeline.operator().equals("|") && !pipeline.operator().equals("|&")) return false;
        for (int index = 0; index + 1 < pipeline.stages().size(); index++) {
            ShellProgram.CommandNode producer = commandSubject(pipeline.stages().get(index));
            ShellProgram.CommandNode consumer = commandSubject(pipeline.stages().get(index + 1));
            if (producer != null && consumer != null
                    && Set.of("curl", "wget").contains(producer.commandId())
                    && invokesShell(consumer)) {
                return true;
            }
        }
        return false;
    }

    private static ShellProgram.CommandNode commandSubject(ShellProgram.ShellNode node) {
        if (node instanceof ShellProgram.CommandNode command) return command;
        if (node instanceof ShellProgram.RedirectNode redirect) return redirect.subject();
        return null;
    }

    private static boolean invokesShell(ShellProgram.CommandNode command) {
        if (SHELL_EXECUTABLES.contains(command.commandId())) return true;
        if (command.commandId().equals("sudo")) {
            return literalArgument(command, "command").map(RiskAssessmentService::isShellExecutable).orElse(false);
        }
        if (command.commandId().equals("env")) {
            return command.arguments().stream()
                    .filter(argument -> argument.argumentId().equals("assignments-or-command"))
                    .filter(argument -> argument.valueKind().equals("literal"))
                    .map(ShellProgram.ArgumentValue::value)
                    .filter(value -> !value.contains("="))
                    .findFirst()
                    .map(RiskAssessmentService::isShellExecutable)
                    .orElse(false);
        }
        return false;
    }

    private static boolean isShellExecutable(String value) {
        String normalized = value.replace('\\', '/');
        int separator = normalized.lastIndexOf('/');
        String basename = separator < 0 ? normalized : normalized.substring(separator + 1);
        return SHELL_EXECUTABLES.contains(basename.toLowerCase(Locale.ROOT));
    }

    private static Optional<String> literalArgument(
            ShellProgram.CommandNode node,
            String argumentId) {
        return node.arguments().stream()
                .filter(argument -> argument.argumentId().equals(argumentId))
                .filter(argument -> argument.valueKind().equals("literal"))
                .map(argument -> argument.value().toLowerCase(Locale.ROOT))
                .findFirst();
    }

    private static boolean hasArgument(ShellProgram.CommandNode node, String argumentId) {
        return node.arguments().stream().anyMatch(argument -> argument.argumentId().equals(argumentId));
    }

    private static boolean hasOption(ShellProgram.CommandNode node, String optionId) {
        return node.options().stream().anyMatch(option -> option.optionId().equals(optionId));
    }

    private static boolean isPackageSimulation(ShellProgram.CommandNode node) {
        return (node.commandId().equals("apt") && hasOption(node, "simulate"))
                || (node.commandId().equals("dnf") && hasOption(node, "assume-no"));
    }

    private static RuleMatch low(String ruleId, String message) {
        return new RuleMatch(RiskLevel.LOW, ruleId, message);
    }

    private static RuleMatch high(String ruleId, String message) {
        return new RuleMatch(RiskLevel.HIGH, ruleId, message);
    }

    private static RuleMatch critical(String ruleId, String message) {
        return new RuleMatch(RiskLevel.CRITICAL, ruleId, message);
    }

    private static int addBounded(List<RiskEvidence> evidence, RiskEvidence item) {
        if (evidence.size() < 100) {
            evidence.add(item);
            return 0;
        }
        return 1;
    }

    private static String confirmation(RiskLevel level) {
        return switch (level) {
            case LOW -> "none";
            case MEDIUM, HIGH -> "confirm";
            case CRITICAL -> "type-script";
        };
    }

    private static String sha256(String script) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(script.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private enum RiskLevel {
        LOW("low"), MEDIUM("medium"), HIGH("high"), CRITICAL("critical");

        private final String value;

        RiskLevel(String value) {
            this.value = value;
        }

        static RiskLevel max(RiskLevel left, RiskLevel right) {
            return left.ordinal() >= right.ordinal() ? left : right;
        }
    }

    private record RuleMatch(RiskLevel level, String ruleId, String message) {}
}
