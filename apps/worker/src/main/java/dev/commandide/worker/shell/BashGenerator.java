package dev.commandide.worker.shell;

import dev.commandide.worker.catalog.CatalogCommand;
import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.catalog.CommandSpec;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class BashGenerator {
    private static final Pattern UNQUOTED_SAFE = Pattern.compile("[A-Za-z0-9_@%+=:,./-]+");
    private static final Pattern VARIABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Set<String> REDIRECT_OPERATORS = Set.of("<", ">", ">>", "2>", "2>>", "&>");

    private final CatalogService catalogService;

    public BashGenerator(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    public ShellGenerateResult generate(ShellProgram program) {
        validateProgram(program);
        GenerationContext context = new GenerationContext();
        List<String> statements = new ArrayList<>();
        for (ShellProgram.ShellNode node : program.statements()) {
            statements.add(generateNode(node, context, 0));
        }
        return new ShellGenerateResult(
                String.join("\n", statements),
                context.compacted,
                List.copyOf(context.warnings));
    }

    private String generateNode(
            ShellProgram.ShellNode node,
            GenerationContext context,
            int depth) {
        if (node == null || depth > 64 || ++context.nodeCount > 5000
                || blank(node.nodeId()) || node.nodeId().length() > 128
                || !context.nodeIds.add(node.nodeId())) {
            throw new IllegalArgumentException("Invalid or duplicate shell node");
        }
        return switch (node) {
            case ShellProgram.CommandNode command -> generateCommand(command, context);
            case ShellProgram.RedirectNode redirect -> generateRedirect(redirect, context, depth);
            case ShellProgram.PipelineNode pipeline -> generatePipeline(pipeline, context, depth);
            case ShellProgram.BooleanChainNode chain -> generateBooleanChain(chain, context, depth);
            case ShellProgram.SequenceNode sequence -> generateSequence(sequence, context, depth);
            case ShellProgram.AssignmentNode assignment -> generateAssignment(assignment);
            case ShellProgram.BlockNode block -> generateBlock(block, context, depth);
            case ShellProgram.FunctionNode function -> generateFunction(function, context, depth);
            case ShellProgram.IfNode conditional -> generateIf(conditional, context, depth);
            case ShellProgram.LoopNode loop -> generateLoop(loop, context, depth);
            case ShellProgram.ForNode loop -> generateFor(loop, context, depth);
            case ShellProgram.CaseNode conditional -> generateCase(conditional, context, depth);
            case ShellProgram.CommentNode comment -> generateComment(comment);
            case ShellProgram.RawCodeNode raw -> generateRaw(raw, context);
        };
    }

    private String generateRedirect(
            ShellProgram.RedirectNode node,
            GenerationContext context,
            int depth) {
        if (node.subject() == null || node.redirections() == null
                || node.redirections().isEmpty() || node.redirections().size() > 16) {
            throw new IllegalArgumentException("Invalid redirect node");
        }
        StringBuilder script = new StringBuilder(generateNode(node.subject(), context, depth + 1));
        for (ShellProgram.Redirection redirection : node.redirections()) {
            if (redirection == null || !REDIRECT_OPERATORS.contains(redirection.operator())) {
                throw new IllegalArgumentException("Unsupported redirect operator");
            }
            validateValue(redirection.target(), redirection.targetKind());
            script.append(' ').append(redirection.operator()).append(' ')
                    .append(renderValue(redirection.target(), redirection.targetKind()));
        }
        return script.toString();
    }

    private String generatePipeline(
            ShellProgram.PipelineNode node,
            GenerationContext context,
            int depth) {
        if (!Set.of("|", "|&").contains(node.operator()) || node.stages() == null
                || node.stages().size() < 2 || node.stages().size() > 64
                || node.stages().stream().anyMatch(stage ->
                    !(stage instanceof ShellProgram.CommandNode
                            || stage instanceof ShellProgram.RedirectNode
                            || stage instanceof ShellProgram.BlockNode))) {
            throw new IllegalArgumentException("Invalid pipeline node");
        }
        List<String> stages = node.stages().stream()
                .map(stage -> generateNode(stage, context, depth + 1))
                .toList();
        return String.join(" " + node.operator() + " ", stages);
    }

    private String generateBooleanChain(
            ShellProgram.BooleanChainNode node,
            GenerationContext context,
            int depth) {
        if (!Set.of("&&", "||").contains(node.operator())
                || !isBooleanOperand(node.left()) || !isBooleanOperand(node.right())) {
            throw new IllegalArgumentException("Invalid boolean chain");
        }
        return generateNode(node.left(), context, depth + 1)
                + " " + node.operator() + " "
                + generateNode(node.right(), context, depth + 1);
    }

    private String generateSequence(
            ShellProgram.SequenceNode node,
            GenerationContext context,
            int depth) {
        if (!Set.of(";", "newline").contains(node.separator()) || node.items() == null
                || node.items().isEmpty() || node.items().size() > 1000
                || node.items().stream().anyMatch(ShellProgram.SequenceNode.class::isInstance)) {
            throw new IllegalArgumentException("Invalid sequence node");
        }
        List<String> items = node.items().stream()
                .map(item -> generateNode(item, context, depth + 1))
                .toList();
        return String.join(node.separator().equals(";") ? "; " : "\n", items);
    }

    private String generateComment(ShellProgram.CommentNode node) {
        if (node.text() == null || node.text().length() > 10_000 || node.text().indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Invalid comment node");
        }
        return node.text().lines()
                .map(line -> line.isEmpty() ? "#" : "# " + line)
                .reduce((left, right) -> left + "\n" + right)
                .orElse("#");
    }

    private String generateAssignment(ShellProgram.AssignmentNode node) {
        if (!validVariable(node.name())) {
            throw new IllegalArgumentException("Invalid assignment name");
        }
        validateValue(node.value(), node.valueKind());
        return (node.exported() ? "export " : "") + node.name() + "="
                + renderValue(node.value(), node.valueKind());
    }

    private String generateBlock(
            ShellProgram.BlockNode node,
            GenerationContext context,
            int depth) {
        if (!Set.of("group", "subshell").contains(node.mode())) {
            throw new IllegalArgumentException("Invalid block mode");
        }
        String body = generateBody(node.statements(), context, depth);
        return node.mode().equals("group") ? "{ " + body + "; }" : "( " + body + " )";
    }

    private String generateFunction(
            ShellProgram.FunctionNode node,
            GenerationContext context,
            int depth) {
        if (!validVariable(node.name())) {
            throw new IllegalArgumentException("Invalid function name");
        }
        return node.name() + "() { " + generateBody(node.body(), context, depth) + "; }";
    }

    private String generateIf(
            ShellProgram.IfNode node,
            GenerationContext context,
            int depth) {
        if (node.branches() == null || node.branches().isEmpty() || node.branches().size() > 32
                || node.elseBody() != null && node.elseBody().isEmpty()) {
            throw new IllegalArgumentException("Invalid if node");
        }
        StringBuilder script = new StringBuilder();
        for (int index = 0; index < node.branches().size(); index++) {
            ShellProgram.IfBranch branch = node.branches().get(index);
            if (branch == null || !isBooleanOperand(branch.condition())) {
                throw new IllegalArgumentException("Invalid if branch");
            }
            script.append(index == 0 ? "if " : "elif ")
                    .append(generateNode(branch.condition(), context, depth + 1))
                    .append("; then\n")
                    .append(indent(generateControlBody(branch.body(), context, depth)))
                    .append('\n');
        }
        if (node.elseBody() != null) {
            script.append("else\n")
                    .append(indent(generateControlBody(node.elseBody(), context, depth)))
                    .append('\n');
        }
        return script.append("fi").toString();
    }

    private String generateLoop(
            ShellProgram.LoopNode node,
            GenerationContext context,
            int depth) {
        if (!Set.of("while", "until").contains(node.mode()) || !isBooleanOperand(node.condition())) {
            throw new IllegalArgumentException("Invalid loop node");
        }
        return node.mode() + " " + generateNode(node.condition(), context, depth + 1) + "; do\n"
                + indent(generateControlBody(node.body(), context, depth)) + "\ndone";
    }

    private String generateFor(
            ShellProgram.ForNode node,
            GenerationContext context,
            int depth) {
        if (!validVariable(node.variable()) || node.values() == null || node.values().isEmpty()
                || node.values().size() > 1000) {
            throw new IllegalArgumentException("Invalid for node");
        }
        List<String> values = new ArrayList<>();
        for (ShellProgram.ShellWord value : node.values()) {
            if (value == null) throw new IllegalArgumentException("Invalid for value");
            validateValue(value.value(), value.valueKind());
            values.add(renderValue(value.value(), value.valueKind()));
        }
        return "for " + node.variable() + " in " + String.join(" ", values) + "; do\n"
                + indent(generateControlBody(node.body(), context, depth)) + "\ndone";
    }

    private String generateCase(
            ShellProgram.CaseNode node,
            GenerationContext context,
            int depth) {
        if (node.word() == null || node.arms() == null || node.arms().isEmpty()
                || node.arms().size() > 128) {
            throw new IllegalArgumentException("Invalid case node");
        }
        validateValue(node.word().value(), node.word().valueKind());
        StringBuilder script = new StringBuilder("case ")
                .append(renderValue(node.word().value(), node.word().valueKind()))
                .append(" in\n");
        for (ShellProgram.CaseArm arm : node.arms()) {
            if (arm == null || arm.patterns() == null || arm.patterns().isEmpty()
                    || arm.patterns().size() > 64) {
                throw new IllegalArgumentException("Invalid case arm");
            }
            List<String> patterns = new ArrayList<>();
            for (ShellProgram.CasePattern pattern : arm.patterns()) {
                if (pattern == null || pattern.value() == null || pattern.value().isEmpty()
                        || pattern.value().length() > 4096 || pattern.value().indexOf('\0') >= 0
                        || !Set.of("literal", "glob").contains(pattern.kind())
                        || pattern.kind().equals("glob") && !validPortableGlob(pattern.value())) {
                    throw new IllegalArgumentException("Invalid case pattern");
                }
                patterns.add(pattern.kind().equals("glob") ? pattern.value() : quote(pattern.value()));
            }
            script.append("  ").append(String.join("|", patterns)).append(")\n")
                    .append(indent(indent(generateControlBody(arm.body(), context, depth))))
                    .append("\n    ;;\n");
        }
        return script.append("esac").toString();
    }

    private String generateControlBody(
            List<ShellProgram.ShellNode> nodes,
            GenerationContext context,
            int depth) {
        if (nodes == null || nodes.isEmpty() || nodes.size() > 1000) {
            throw new IllegalArgumentException("Invalid control-flow body");
        }
        return nodes.stream()
                .map(node -> generateNode(node, context, depth + 1))
                .collect(java.util.stream.Collectors.joining("\n"));
    }

    private static String indent(String value) {
        return value.lines().map(line -> "  " + line)
                .collect(java.util.stream.Collectors.joining("\n"));
    }

    private String generateBody(
            List<ShellProgram.ShellNode> nodes,
            GenerationContext context,
            int depth) {
        if (nodes == null || nodes.isEmpty() || nodes.size() > 1000) {
            throw new IllegalArgumentException("Invalid shell body");
        }
        return nodes.stream()
                .map(node -> generateNode(node, context, depth + 1))
                .collect(java.util.stream.Collectors.joining("; "));
    }

    private String generateRaw(ShellProgram.RawCodeNode node, GenerationContext context) {
        if (node.code() == null || node.code().isEmpty() || node.code().length() > 200_000
                || node.code().indexOf('\0') >= 0 || blank(node.reason()) || node.reason().length() > 1000) {
            throw new IllegalArgumentException("Invalid raw-code node");
        }
        if (context.warnings.size() < 100) {
            context.warnings.add("Raw code preserved without semantic validation: " + node.nodeId());
        }
        return node.code();
    }

    private String generateCommand(
            ShellProgram.CommandNode node,
            GenerationContext context) {
        if (blank(node.commandId()) || node.options() == null || node.arguments() == null
                || node.options().size() > 128 || node.arguments().size() > 128) {
            throw new IllegalArgumentException("Invalid command node");
        }
        CommandSpec command = catalogService.findById(node.commandId())
                .orElseThrow(() -> new IllegalArgumentException("Unknown catalog command"));
        if (!command.compatibility().status().equals("supported")) {
            warn(context, "Target compatibility is " + command.compatibility().status()
                    + " for " + command.executable() + ": " + command.compatibility().note());
        }
        if (!command.availability().equals("installed")) {
            warn(context, "Executable availability is " + command.availability()
                    + " for " + command.executable() + " on this machine.");
        }
        Map<String, CatalogCommand.CommandOption> optionMetadata = new HashMap<>();
        command.options().forEach(option -> optionMetadata.put(option.id(), option));

        Set<String> selectedIds = new HashSet<>();
        StringBuilder combinedFlags = new StringBuilder();
        List<String> optionTokens = new ArrayList<>();
        int combinedCount = 0;
        for (ShellProgram.OptionSelection selected : node.options()) {
            CatalogCommand.CommandOption option = selected == null
                    ? null
                    : optionMetadata.get(selected.optionId());
            if (option == null || !option.flags().contains(selected.spelling())) {
                throw new IllegalArgumentException("Unknown option selection");
            }
            if (!option.repeatable() && !selectedIds.add(option.id())) {
                throw new IllegalArgumentException("Option is not repeatable: " + option.id());
            }
            selectedIds.add(option.id());
            boolean hasValue = selected.value() != null;
            boolean hasValueKind = selected.valueKind() != null;
            if (option.takesValue() != hasValue || hasValue != hasValueKind) {
                throw new IllegalArgumentException("Option value mismatch: " + option.id());
            }
            if (hasValue) validateValue(selected.value(), selected.valueKind());

            boolean combine = command.shortOptionPolicy().equals("combine-boolean")
                    && option.combinable()
                    && isSingleShortFlag(selected.spelling())
                    && !hasValue;
            if (combine) {
                combinedFlags.append(selected.spelling().charAt(1));
                combinedCount++;
            } else {
                optionTokens.add(selected.spelling());
                if (hasValue) optionTokens.add(renderValue(selected.value(), selected.valueKind()));
            }
        }
        for (String selectedId : selectedIds) {
            CatalogCommand.CommandOption option = optionMetadata.get(selectedId);
            if (option.conflictsWith().stream().anyMatch(selectedIds::contains)) {
                throw new IllegalArgumentException("Conflicting options selected");
            }
        }

        Map<String, CatalogCommand.CommandArgument> argumentMetadata = new HashMap<>();
        command.arguments().forEach(argument -> argumentMetadata.put(argument.id(), argument));
        Map<String, List<ShellProgram.ArgumentValue>> argumentValues = new HashMap<>();
        for (ShellProgram.ArgumentValue argument : node.arguments()) {
            CatalogCommand.CommandArgument metadata = argument == null
                    ? null
                    : argumentMetadata.get(argument.argumentId());
            if (metadata == null) throw new IllegalArgumentException("Unknown positional argument");
            validateValue(argument.value(), argument.valueKind());
            if (argument.valueKind().equals("literal") && argument.value().startsWith("-")) {
                throw new IllegalArgumentException("Leading-hyphen arguments require option terminator metadata");
            }
            List<ShellProgram.ArgumentValue> values = argumentValues.computeIfAbsent(
                    metadata.id(), ignored -> new ArrayList<>());
            if (!metadata.repeatable() && !values.isEmpty()) {
                throw new IllegalArgumentException("Argument is not repeatable: " + metadata.id());
            }
            values.add(argument);
        }
        for (CatalogCommand.CommandArgument argument : command.arguments()) {
            if (argument.required() && argumentValues.getOrDefault(argument.id(), List.of()).isEmpty()) {
                throw new IllegalArgumentException("Missing required argument: " + argument.id());
            }
        }

        List<String> tokens = new ArrayList<>();
        tokens.add(command.executable());
        if (!combinedFlags.isEmpty()) tokens.add("-" + combinedFlags);
        tokens.addAll(optionTokens);
        for (CatalogCommand.CommandArgument metadata : command.arguments()) {
            for (ShellProgram.ArgumentValue value : argumentValues.getOrDefault(metadata.id(), List.of())) {
                tokens.add(renderValue(value.value(), value.valueKind()));
            }
        }
        if (combinedCount > 1) context.compacted = true;
        return String.join(" ", tokens);
    }

    private static void validateProgram(ShellProgram program) {
        if (program == null || !"1.4.0".equals(program.schemaVersion())
                || !"bash".equals(program.dialect()) || program.statements() == null
                || program.statements().isEmpty() || program.statements().size() > 1000) {
            throw new IllegalArgumentException("Unsupported ShellProgram");
        }
    }

    public static String quoteLiteral(String value) {
        validateLiteral(value);
        if (value.isEmpty()) return "''";
        if (UNQUOTED_SAFE.matcher(value).matches()) return value;
        return "'" + value.replace("'", "'\"'\"'") + "'";
    }

    static String quote(String value) {
        return quoteLiteral(value);
    }

    private static void validateLiteral(String value) {
        if (value != null && (value.length() > 4096 || value.indexOf('\0') >= 0)) {
            throw new IllegalArgumentException("Invalid shell literal");
        }
    }

    private static void validateValue(String value, String kind) {
        if (value == null || kind == null || !Set.of("literal", "variable").contains(kind)) {
            throw new IllegalArgumentException("Invalid shell value kind");
        }
        validateLiteral(value);
        if (kind.equals("variable") && !validVariable(value)) {
            throw new IllegalArgumentException("Invalid variable reference");
        }
    }

    private static String renderValue(String value, String kind) {
        return kind.equals("variable") ? "\"${" + value + "}\"" : quote(value);
    }

    private static boolean validVariable(String value) {
        return value != null && VARIABLE_NAME.matcher(value).matches();
    }

    private static boolean validPortableGlob(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (!Character.isLetterOrDigit(character)
                    && "_@%+=:,./*?[]!-".indexOf(character) < 0) return false;
        }
        return true;
    }

    private static boolean isSingleShortFlag(String value) {
        return value != null && value.length() == 2 && value.charAt(0) == '-' && value.charAt(1) != '-';
    }

    private static boolean isBooleanOperand(ShellProgram.ShellNode node) {
        return node instanceof ShellProgram.CommandNode
                || node instanceof ShellProgram.RedirectNode
                || node instanceof ShellProgram.PipelineNode
                || node instanceof ShellProgram.BlockNode;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static void warn(GenerationContext context, String warning) {
        if (context.warnings.size() < 100 && !context.warnings.contains(warning)) {
            context.warnings.add(warning);
        }
    }

    private static final class GenerationContext {
        private final Set<String> nodeIds = new HashSet<>();
        private final List<String> warnings = new ArrayList<>();
        private int nodeCount;
        private boolean compacted;
    }
}
