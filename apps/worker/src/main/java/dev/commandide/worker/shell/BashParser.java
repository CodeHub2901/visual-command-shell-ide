// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

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

/**
 * A deliberately conservative parser for the visual AST subset. Any construct
 * whose Bash meaning cannot be represented without loss is retained verbatim.
 */
public final class BashParser {
    private static final int MAX_SOURCE_LENGTH = 1_000_000;
    private static final int MAX_STATEMENTS = 1000;
    private static final Set<String> REDIRECTS = Set.of("<", ">", ">>", "2>", "2>>", "&>");
    private static final Pattern COMPOUND = Pattern.compile(
            "(?m)^\\s*(?:select|function)(?:\\s|$)|"
                    + "(?m)^\\s*(?:\\{|\\()|"
                    + "(?m)^\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(\\s*\\)\\s*\\{");
    private static final Pattern IF_HEADER = Pattern.compile("^if\\s+(.+);\\s*then$");
    private static final Pattern ELIF_HEADER = Pattern.compile("^elif\\s+(.+);\\s*then$");
    private static final Pattern LOOP_HEADER = Pattern.compile("^(while|until)\\s+(.+);\\s*do$");
    private static final Pattern FOR_HEADER = Pattern.compile(
            "^for\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+in\\s+(.+);\\s*do$");
    private static final Pattern CASE_HEADER = Pattern.compile("^case\\s+(.+)\\s+in$");
    private static final Pattern ASSIGNMENT = Pattern.compile(
            "^\\s*(export\\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$");
    private static final Pattern VARIABLE_WORD = Pattern.compile(
            "^(?:\\$([A-Za-z_][A-Za-z0-9_]*)|\\$\\{([A-Za-z_][A-Za-z0-9_]*)}|"
                    + "\"\\$([A-Za-z_][A-Za-z0-9_]*)\"|\"\\$\\{([A-Za-z_][A-Za-z0-9_]*)}\")$");
    private static final Pattern FUNCTION = Pattern.compile(
            "^\\s*(?:(?:function\\s+([A-Za-z_][A-Za-z0-9_]*)(?:\\s*\\(\\s*\\))?)|"
                    + "(?:([A-Za-z_][A-Za-z0-9_]*)\\s*\\(\\s*\\)))\\s*\\{([\\s\\S]*)}\\s*$");

    private final CatalogService catalogService;

    public BashParser(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    public ShellParseResult parse(String source) {
        if (source == null || source.isEmpty() || source.length() > MAX_SOURCE_LENGTH
                || source.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Invalid Bash source");
        }

        ParseContext context = new ParseContext(source);
        Checkpoint containerCheckpoint = context.checkpoint();
        try {
            ShellProgram.ShellNode container = parseContainer(source, 0, context);
            if (container != null) {
                return new ShellParseResult(
                        new ShellProgram("1.4.0", "bash", List.of(container)),
                        List.copyOf(context.spans), List.copyOf(context.diagnostics), context.preservedRaw);
            }
        } catch (UnsupportedSyntax exception) {
            context.rollback(containerCheckpoint);
            return context.rawProgram(source, 0, source.length(), exception.getMessage());
        }
        String globalReason = unsupportedWholeSourceReason(source);
        if (globalReason != null) {
            return context.rawProgram(source, 0, source.length(), globalReason);
        }

        List<ShellProgram.ShellNode> statements = new ArrayList<>();
        int lineStart = 0;
        while (lineStart < source.length()) {
            int newline = source.indexOf('\n', lineStart);
            int lineEnd = newline < 0 ? source.length() : newline;
            String line = source.substring(lineStart, lineEnd);
            if (line.isBlank()) {
                return context.rawProgram(source, 0, source.length(), "Blank-line layout is not represented yet");
            }
            boolean controlLine = startsControl(line.trim());
            Checkpoint checkpoint = context.checkpoint();
            try {
                if (controlLine) {
                    int controlEnd = controlEndOffset(source, lineStart);
                    ShellProgram.ShellNode control = parseContainer(
                            source.substring(lineStart, controlEnd), lineStart, context);
                    if (control == null) throw new UnsupportedSyntax("Unsupported control-flow syntax");
                    statements.add(control);
                    lineEnd = controlEnd;
                    newline = lineEnd < source.length() && source.charAt(lineEnd) == '\n'
                            ? lineEnd : source.indexOf('\n', lineEnd);
                } else {
                    statements.add(parseLine(line, lineStart, context));
                }
            } catch (UnsupportedSyntax exception) {
                context.rollback(checkpoint);
                if (controlLine) {
                    return context.rawProgram(source, 0, source.length(), exception.getMessage());
                }
                statements.add(context.raw(line, lineStart, lineEnd, exception.getMessage()));
            }
            if (statements.size() > MAX_STATEMENTS) {
                return context.rawProgram(source, 0, source.length(), "Script exceeds the structured statement limit");
            }
            if (newline < 0) break;
            lineStart = newline + 1;
        }

        return new ShellParseResult(
                new ShellProgram("1.4.0", "bash", List.copyOf(statements)),
                List.copyOf(context.spans),
                List.copyOf(context.diagnostics),
                context.preservedRaw);
    }

    private ShellProgram.ShellNode parseLine(String line, int baseOffset, ParseContext context) {
        int first = firstNonWhitespace(line);
        if (first >= 0 && line.charAt(first) == '#') {
            String text = line.substring(first + 1);
            if (text.startsWith(" ")) text = text.substring(1);
            String id = context.nextId();
            ShellProgram.CommentNode comment = new ShellProgram.CommentNode(id, text);
            context.span(id, baseOffset + first, baseOffset + line.length());
            return comment;
        }
        ShellProgram.ShellNode container = parseContainer(line, baseOffset, context);
        if (container != null) return container;
        java.util.regex.Matcher assignment = ASSIGNMENT.matcher(line);
        if (assignment.matches()) {
            return parseAssignment(line, baseOffset, assignment, context);
        }
        if (containsInlineComment(line)) {
            throw new UnsupportedSyntax("Inline comments are preserved until comment attachment is represented");
        }

        List<Token> tokens = lex(line, baseOffset);
        if (tokens.isEmpty()) throw new UnsupportedSyntax("Empty command");
        List<List<Token>> sequenceParts = split(tokens, ";");
        if (sequenceParts.size() == 1) return parseBoolean(sequenceParts.getFirst(), context);
        if (sequenceParts.stream().anyMatch(List::isEmpty)) {
            throw new UnsupportedSyntax("Empty sequence item");
        }
        List<ShellProgram.ShellNode> items = sequenceParts.stream()
                .map(part -> parseBoolean(part, context))
                .toList();
        String id = context.nextId();
        ShellProgram.SequenceNode sequence = new ShellProgram.SequenceNode(id, ";", items);
        context.span(id, tokens.getFirst().start(), tokens.getLast().end());
        return sequence;
    }

    private ShellProgram.ShellNode parseContainer(
            String source,
            int baseOffset,
            ParseContext context) {
        int start = firstNonWhitespace(source);
        if (start < 0) return null;
        int end = lastNonWhitespace(source) + 1;
        String trimmed = source.substring(start, end);

        ShellProgram.ShellNode control = parseControl(trimmed, baseOffset + start, context);
        if (control != null) return control;

        java.util.regex.Matcher function = FUNCTION.matcher(trimmed);
        if (function.matches()) {
            String name = function.group(1) == null ? function.group(2) : function.group(1);
            int bodyStart = start + function.start(3);
            int bodyEnd = start + function.end(3);
            BodySlice body = bodySlice(source, bodyStart, bodyEnd, true);
            List<ShellProgram.ShellNode> statements = parseBody(
                    source.substring(body.start(), body.end()), baseOffset + body.start(), context);
            String id = context.nextId();
            ShellProgram.FunctionNode node = new ShellProgram.FunctionNode(id, name, statements);
            context.span(id, baseOffset + start, baseOffset + end);
            return node;
        }

        String mode;
        char close;
        if (trimmed.charAt(0) == '(' && trimmed.charAt(trimmed.length() - 1) == ')') {
            mode = "subshell";
            close = ')';
        } else if (trimmed.charAt(0) == '{' && trimmed.charAt(trimmed.length() - 1) == '}') {
            mode = "group";
            close = '}';
        } else {
            return null;
        }
        if (!outerDelimiterClosesAtEnd(trimmed, trimmed.charAt(0), close)) {
            throw new UnsupportedSyntax("Unbalanced or compound block delimiters require raw preservation");
        }
        int bodyStart = start + 1;
        int bodyEnd = end - 1;
        BodySlice body = bodySlice(source, bodyStart, bodyEnd, mode.equals("group"));
        List<ShellProgram.ShellNode> statements = parseBody(
                source.substring(body.start(), body.end()), baseOffset + body.start(), context);
        String id = context.nextId();
        ShellProgram.BlockNode node = new ShellProgram.BlockNode(id, mode, statements);
        context.span(id, baseOffset + start, baseOffset + end);
        return node;
    }

    private ShellProgram.ShellNode parseControl(
            String source,
            int baseOffset,
            ParseContext context) {
        List<LineSlice> lines = lines(source);
        if (lines.isEmpty()) return null;
        String header = lines.getFirst().text().trim();
        if (IF_HEADER.matcher(header).matches()) return parseIf(source, baseOffset, lines, context);
        if (LOOP_HEADER.matcher(header).matches()) return parseLoop(source, baseOffset, lines, context);
        if (FOR_HEADER.matcher(header).matches()) return parseFor(source, baseOffset, lines, context);
        if (CASE_HEADER.matcher(header).matches()) return parseCase(source, baseOffset, lines, context);
        return null;
    }

    private ShellProgram.IfNode parseIf(
            String source,
            int baseOffset,
            List<LineSlice> lines,
            ParseContext context) {
        java.util.regex.Matcher firstHeader = IF_HEADER.matcher(lines.getFirst().text().trim());
        if (!firstHeader.matches()) throw new UnsupportedSyntax("Invalid if header");
        ShellProgram.ShellNode condition = parseCondition(
                firstHeader.group(1), conditionOffset(lines.getFirst(), firstHeader, 1, baseOffset), context);
        List<ShellProgram.IfBranch> branches = new ArrayList<>();
        List<ShellProgram.ShellNode> elseBody = null;
        int bodyStartLine = 1;
        int depth = 1;
        boolean inElse = false;

        for (int index = 1; index < lines.size(); index++) {
            String trimmed = lines.get(index).text().trim();
            if (startsControl(trimmed)) {
                depth++;
                continue;
            }
            if (isControlEnd(trimmed)) {
                depth--;
                if (depth > 0) continue;
                if (!trimmed.equals("fi") || index != lines.size() - 1) {
                    throw new UnsupportedSyntax("Mismatched or trailing if terminator");
                }
                List<ShellProgram.ShellNode> body = parseBodyLines(
                        source, baseOffset, lines, bodyStartLine, index, context);
                if (inElse) elseBody = body;
                else branches.add(new ShellProgram.IfBranch(condition, body));
                String id = context.nextId();
                ShellProgram.IfNode node = new ShellProgram.IfNode(
                        id, List.copyOf(branches), elseBody == null ? null : List.copyOf(elseBody));
                context.span(id, baseOffset, baseOffset + source.length());
                return node;
            }
            if (depth != 1) continue;
            java.util.regex.Matcher elif = ELIF_HEADER.matcher(trimmed);
            if (elif.matches()) {
                if (inElse) throw new UnsupportedSyntax("elif cannot follow else");
                branches.add(new ShellProgram.IfBranch(condition, parseBodyLines(
                        source, baseOffset, lines, bodyStartLine, index, context)));
                condition = parseCondition(
                        elif.group(1), conditionOffset(lines.get(index), elif, 1, baseOffset), context);
                bodyStartLine = index + 1;
            } else if (trimmed.equals("else")) {
                if (inElse) throw new UnsupportedSyntax("Repeated else branch");
                branches.add(new ShellProgram.IfBranch(condition, parseBodyLines(
                        source, baseOffset, lines, bodyStartLine, index, context)));
                inElse = true;
                bodyStartLine = index + 1;
            }
        }
        throw new UnsupportedSyntax("Unterminated if statement");
    }

    private ShellProgram.LoopNode parseLoop(
            String source,
            int baseOffset,
            List<LineSlice> lines,
            ParseContext context) {
        java.util.regex.Matcher header = LOOP_HEADER.matcher(lines.getFirst().text().trim());
        if (!header.matches()) throw new UnsupportedSyntax("Invalid loop header");
        int close = matchingControlEnd(lines, "done");
        ShellProgram.ShellNode condition = parseCondition(
                header.group(2), conditionOffset(lines.getFirst(), header, 2, baseOffset), context);
        List<ShellProgram.ShellNode> body = parseBodyLines(
                source, baseOffset, lines, 1, close, context);
        String id = context.nextId();
        ShellProgram.LoopNode node = new ShellProgram.LoopNode(
                id, header.group(1), condition, body);
        context.span(id, baseOffset, baseOffset + source.length());
        return node;
    }

    private ShellProgram.ForNode parseFor(
            String source,
            int baseOffset,
            List<LineSlice> lines,
            ParseContext context) {
        java.util.regex.Matcher header = FOR_HEADER.matcher(lines.getFirst().text().trim());
        if (!header.matches()) throw new UnsupportedSyntax("Invalid for header");
        int close = matchingControlEnd(lines, "done");
        int valuesOffset = conditionOffset(lines.getFirst(), header, 2, baseOffset);
        List<Token> tokens = lex(header.group(2), valuesOffset);
        if (tokens.isEmpty() || tokens.stream().anyMatch(Token::operator)) {
            throw new UnsupportedSyntax("Invalid for value list");
        }
        List<ShellProgram.ShellWord> values = tokens.stream()
                .map(token -> new ShellProgram.ShellWord(token.value(), token.valueKind()))
                .toList();
        List<ShellProgram.ShellNode> body = parseBodyLines(
                source, baseOffset, lines, 1, close, context);
        String id = context.nextId();
        ShellProgram.ForNode node = new ShellProgram.ForNode(
                id, header.group(1), values, body);
        context.span(id, baseOffset, baseOffset + source.length());
        return node;
    }

    private ShellProgram.CaseNode parseCase(
            String source,
            int baseOffset,
            List<LineSlice> lines,
            ParseContext context) {
        java.util.regex.Matcher header = CASE_HEADER.matcher(lines.getFirst().text().trim());
        if (!header.matches()) throw new UnsupportedSyntax("Invalid case header");
        int wordOffset = conditionOffset(lines.getFirst(), header, 1, baseOffset);
        List<Token> words = lex(header.group(1), wordOffset);
        if (words.size() != 1 || words.getFirst().operator()) {
            throw new UnsupportedSyntax("Case expressions must be one literal or variable word");
        }
        ShellProgram.ShellWord word = new ShellProgram.ShellWord(
                words.getFirst().value(), words.getFirst().valueKind());
        List<ShellProgram.CaseArm> arms = new ArrayList<>();
        List<ShellProgram.CasePattern> patterns = null;
        int bodyStartLine = -1;
        int depth = 1;

        for (int index = 1; index < lines.size(); index++) {
            String trimmed = lines.get(index).text().trim();
            if (startsControl(trimmed)) {
                depth++;
                continue;
            }
            if (isControlEnd(trimmed)) {
                depth--;
                if (depth > 0) continue;
                if (!trimmed.equals("esac") || index != lines.size() - 1 || patterns != null
                        || arms.isEmpty()) {
                    throw new UnsupportedSyntax("Mismatched, empty, or trailing case terminator");
                }
                String id = context.nextId();
                ShellProgram.CaseNode node = new ShellProgram.CaseNode(
                        id, word, List.copyOf(arms));
                context.span(id, baseOffset, baseOffset + source.length());
                return node;
            }
            if (depth != 1) continue;
            if (trimmed.equals(";;")) {
                if (patterns == null) throw new UnsupportedSyntax("Case terminator without an arm");
                arms.add(new ShellProgram.CaseArm(
                        List.copyOf(patterns), parseBodyLines(
                                source, baseOffset, lines, bodyStartLine, index, context)));
                patterns = null;
                bodyStartLine = -1;
            } else if (patterns == null) {
                if (!trimmed.endsWith(")") || trimmed.length() == 1) {
                    throw new UnsupportedSyntax("Invalid case arm header");
                }
                int first = firstNonWhitespace(lines.get(index).text());
                String rawPatterns = trimmed.substring(0, trimmed.length() - 1);
                patterns = parseCasePatterns(
                        rawPatterns, baseOffset + lines.get(index).start() + first);
                bodyStartLine = index + 1;
            }
        }
        throw new UnsupportedSyntax("Unterminated case statement");
    }

    private static List<ShellProgram.CasePattern> parseCasePatterns(
            String source,
            int baseOffset) {
        List<PatternSlice> slices = splitCasePatterns(source);
        if (slices.isEmpty() || slices.size() > 64) {
            throw new UnsupportedSyntax("Invalid case pattern list");
        }
        List<ShellProgram.CasePattern> patterns = new ArrayList<>();
        for (PatternSlice slice : slices) {
            String value = slice.text().trim();
            if (value.isEmpty()) throw new UnsupportedSyntax("Empty case pattern");
            if (containsUnquotedGlob(value)) {
                if (!validPortableGlob(value)) {
                    throw new UnsupportedSyntax("Unsupported case glob pattern");
                }
                patterns.add(new ShellProgram.CasePattern(value, "glob"));
            } else {
                int leading = firstNonWhitespace(slice.text());
                List<Token> tokens = lex(value, baseOffset + slice.start() + Math.max(leading, 0));
                if (tokens.size() != 1 || tokens.getFirst().operator()) {
                    throw new UnsupportedSyntax("Invalid literal case pattern");
                }
                patterns.add(new ShellProgram.CasePattern(tokens.getFirst().value(), "literal"));
            }
        }
        return List.copyOf(patterns);
    }

    private ShellProgram.ShellNode parseCondition(
            String source,
            int baseOffset,
            ParseContext context) {
        ShellProgram.ShellNode condition = parseLine(source, baseOffset, context);
        if (!isBooleanOperand(condition)) {
            throw new UnsupportedSyntax("Control-flow conditions must be commands, pipelines, or Boolean chains");
        }
        return condition;
    }

    private List<ShellProgram.ShellNode> parseBodyLines(
            String source,
            int baseOffset,
            List<LineSlice> lines,
            int startLine,
            int endLine,
            ParseContext context) {
        if (startLine >= endLine) throw new UnsupportedSyntax("Empty control-flow body");
        int start = lines.get(startLine).start();
        int end = lines.get(endLine - 1).end();
        return parseBody(source.substring(start, end), baseOffset + start, context);
    }

    private static int conditionOffset(
            LineSlice line,
            java.util.regex.Matcher header,
            int group,
            int baseOffset) {
        return baseOffset + line.start() + firstNonWhitespace(line.text()) + header.start(group);
    }

    private static int matchingControlEnd(List<LineSlice> lines, String expected) {
        int depth = 1;
        for (int index = 1; index < lines.size(); index++) {
            String trimmed = lines.get(index).text().trim();
            if (startsControl(trimmed)) depth++;
            else if (isControlEnd(trimmed) && --depth == 0) {
                if (!trimmed.equals(expected) || index != lines.size() - 1) {
                    throw new UnsupportedSyntax("Mismatched or trailing control-flow terminator");
                }
                return index;
            }
        }
        throw new UnsupportedSyntax("Unterminated control-flow statement");
    }

    private static boolean isBooleanOperand(ShellProgram.ShellNode node) {
        return node instanceof ShellProgram.CommandNode
                || node instanceof ShellProgram.RedirectNode
                || node instanceof ShellProgram.PipelineNode
                || node instanceof ShellProgram.BooleanChainNode
                || node instanceof ShellProgram.BlockNode;
    }

    private List<ShellProgram.ShellNode> parseBody(
            String body,
            int baseOffset,
            ParseContext context) {
        if (body.isBlank()) throw new UnsupportedSyntax("Empty shell bodies require raw preservation");
        if (containsUnquoted(body, "<<") || body.contains("\\\n")) {
            throw new UnsupportedSyntax("Unsupported compound syntax inside a block requires raw preservation");
        }
        ShellProgram.ShellNode wholeContainer = parseContainer(body, baseOffset, context);
        if (wholeContainer != null) return List.of(wholeContainer);

        List<ShellProgram.ShellNode> statements = new ArrayList<>();
        int lineStart = 0;
        while (lineStart < body.length()) {
            int newline = body.indexOf('\n', lineStart);
            int lineEnd = newline < 0 ? body.length() : newline;
            String line = body.substring(lineStart, lineEnd);
            if (line.isBlank()) throw new UnsupportedSyntax("Blank lines inside blocks require raw preservation");
            if (startsControl(line.trim())) {
                int controlEnd = controlEndOffset(body, lineStart);
                ShellProgram.ShellNode control = parseContainer(
                        body.substring(lineStart, controlEnd), baseOffset + lineStart, context);
                if (control == null) throw new UnsupportedSyntax("Unsupported control-flow syntax");
                statements.add(control);
                lineEnd = controlEnd;
                newline = lineEnd < body.length() && body.charAt(lineEnd) == '\n'
                        ? lineEnd : body.indexOf('\n', lineEnd);
            } else {
                statements.add(parseLine(line, baseOffset + lineStart, context));
            }
            if (newline < 0) break;
            lineStart = newline + 1;
        }
        return List.copyOf(statements);
    }

    private static BodySlice bodySlice(
            String source,
            int rawStart,
            int rawEnd,
            boolean removeTerminatingSemicolon) {
        int start = rawStart;
        int end = rawEnd;
        while (start < end && Character.isWhitespace(source.charAt(start))) start++;
        while (end > start && Character.isWhitespace(source.charAt(end - 1))) end--;
        if (removeTerminatingSemicolon && end > start && source.charAt(end - 1) == ';') {
            end--;
            while (end > start && Character.isWhitespace(source.charAt(end - 1))) end--;
        }
        if (start >= end) throw new UnsupportedSyntax("Empty shell bodies require raw preservation");
        return new BodySlice(start, end);
    }

    private static boolean outerDelimiterClosesAtEnd(String value, char open, char close) {
        int depth = 0;
        boolean single = false;
        boolean doubly = false;
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '\'' && !doubly) single = !single;
            else if (character == '"' && !single) doubly = !doubly;
            else if (!single && !doubly && character == open) depth++;
            else if (!single && !doubly && character == close && --depth == 0) {
                return index == value.length() - 1;
            }
        }
        return false;
    }

    private ShellProgram.AssignmentNode parseAssignment(
            String line,
            int baseOffset,
            java.util.regex.Matcher matcher,
            ParseContext context) {
        String rawValue = matcher.group(3);
        String value;
        String valueKind;
        if (rawValue.isEmpty()) {
            value = "";
            valueKind = "literal";
        } else {
            int valueOffset = matcher.start(3);
            List<Token> tokens = lex(rawValue, baseOffset + valueOffset);
            if (tokens.size() != 1 || tokens.getFirst().operator()) {
                throw new UnsupportedSyntax("Assignment expressions with multiple words require raw preservation");
            }
            value = tokens.getFirst().value();
            valueKind = tokens.getFirst().valueKind();
        }
        String id = context.nextId();
        ShellProgram.AssignmentNode node = new ShellProgram.AssignmentNode(
                id, matcher.group(2), value, valueKind, matcher.group(1) != null);
        context.span(id, baseOffset + firstNonWhitespace(line), baseOffset + line.length());
        return node;
    }

    private ShellProgram.ShellNode parseBoolean(List<Token> tokens, ParseContext context) {
        int operatorIndex = -1;
        String operator = null;
        for (int index = 0; index < tokens.size(); index++) {
            String value = tokens.get(index).value();
            if (value.equals("&&") || value.equals("||")) {
                if (operatorIndex >= 0) throw new UnsupportedSyntax("Nested Boolean chains are not represented yet");
                operatorIndex = index;
                operator = value;
            }
        }
        if (operatorIndex < 0) return parsePipeline(tokens, context);
        if (operatorIndex == 0 || operatorIndex == tokens.size() - 1) {
            throw new UnsupportedSyntax("Incomplete Boolean chain");
        }
        ShellProgram.ShellNode left = parsePipeline(tokens.subList(0, operatorIndex), context);
        ShellProgram.ShellNode right = parsePipeline(tokens.subList(operatorIndex + 1, tokens.size()), context);
        String id = context.nextId();
        ShellProgram.BooleanChainNode chain = new ShellProgram.BooleanChainNode(id, operator, left, right);
        context.span(id, tokens.getFirst().start(), tokens.getLast().end());
        return chain;
    }

    private ShellProgram.ShellNode parsePipeline(List<Token> tokens, ParseContext context) {
        String operator = null;
        List<List<Token>> stages = new ArrayList<>();
        List<Token> current = new ArrayList<>();
        for (Token token : tokens) {
            if (token.value().equals("|") || token.value().equals("|&")) {
                if (current.isEmpty()) throw new UnsupportedSyntax("Incomplete pipeline");
                if (operator != null && !operator.equals(token.value())) {
                    throw new UnsupportedSyntax("Mixed pipeline operators are not represented yet");
                }
                operator = token.value();
                stages.add(List.copyOf(current));
                current.clear();
            } else {
                current.add(token);
            }
        }
        if (current.isEmpty()) throw new UnsupportedSyntax("Incomplete pipeline");
        stages.add(List.copyOf(current));
        if (operator == null) return parseCommand(tokens, context);
        List<ShellProgram.ShellNode> nodes = stages.stream()
                .map(stage -> parseCommand(stage, context))
                .toList();
        String id = context.nextId();
        ShellProgram.PipelineNode pipeline = new ShellProgram.PipelineNode(id, operator, nodes);
        context.span(id, tokens.getFirst().start(), tokens.getLast().end());
        return pipeline;
    }

    private ShellProgram.ShellNode parseCommand(List<Token> tokens, ParseContext context) {
        List<Token> commandTokens = new ArrayList<>();
        List<ShellProgram.Redirection> redirections = new ArrayList<>();
        for (int index = 0; index < tokens.size(); index++) {
            Token token = tokens.get(index);
            if (REDIRECTS.contains(token.value())) {
                if (index + 1 >= tokens.size() || tokens.get(index + 1).operator()) {
                    throw new UnsupportedSyntax("Incomplete redirection");
                }
                Token target = tokens.get(++index);
                redirections.add(new ShellProgram.Redirection(
                        token.value(), target.value(), target.valueKind()));
            } else if (token.operator()) {
                throw new UnsupportedSyntax("Unsupported shell operator: " + token.value());
            } else {
                commandTokens.add(token);
            }
        }
        if (commandTokens.isEmpty()) throw new UnsupportedSyntax("Redirection without a command");

        Token executable = commandTokens.getFirst();
        if (!executable.valueKind().equals("literal")) {
            throw new UnsupportedSyntax("Variable command names require raw preservation");
        }
        CommandSpec command = catalogService.findByExecutable(executable.value())
                .orElseThrow(() -> new UnsupportedSyntax("Unknown catalog command: " + executable.value()));
        List<ShellProgram.OptionSelection> options = new ArrayList<>();
        List<Token> positionals = new ArrayList<>();
        parseArguments(command, commandTokens.subList(1, commandTokens.size()), options, positionals);
        List<ShellProgram.ArgumentValue> arguments = mapPositionals(command, positionals);

        String commandId = context.nextId();
        ShellProgram.CommandNode commandNode = new ShellProgram.CommandNode(
                commandId, command.id(), List.copyOf(options), arguments);
        context.span(commandId, executable.start(), commandTokens.getLast().end());
        if (redirections.isEmpty()) return commandNode;

        String redirectId = context.nextId();
        ShellProgram.RedirectNode redirect = new ShellProgram.RedirectNode(
                redirectId, commandNode, List.copyOf(redirections));
        context.span(redirectId, tokens.getFirst().start(), tokens.getLast().end());
        return redirect;
    }

    private void parseArguments(
            CommandSpec command,
            List<Token> tokens,
            List<ShellProgram.OptionSelection> selections,
            List<Token> positionals) {
        Map<String, CatalogCommand.CommandOption> flags = new HashMap<>();
        command.options().forEach(option -> option.flags().forEach(flag -> flags.put(flag, option)));
        Set<String> selected = new HashSet<>();
        for (int index = 0; index < tokens.size(); index++) {
            Token token = tokens.get(index);
            String value = token.value();
            if (!value.startsWith("-") || value.equals("-")) {
                positionals.add(token);
                continue;
            }
            if (!token.valueKind().equals("literal")) {
                positionals.add(token);
                continue;
            }
            if (value.equals("--")) throw new UnsupportedSyntax("Option terminators are not represented yet");
            CatalogCommand.CommandOption option = flags.get(value);
            String spelling = value;
            String optionValue = null;
            String optionValueKind = null;
            if (option == null && value.startsWith("--") && value.contains("=")) {
                spelling = value.substring(0, value.indexOf('='));
                option = flags.get(spelling);
                optionValue = value.substring(value.indexOf('=') + 1);
                optionValueKind = "literal";
            }
            if (option == null && isCombinedShort(value, command)) {
                for (int character = 1; character < value.length(); character++) {
                    String shortFlag = "-" + value.charAt(character);
                    CatalogCommand.CommandOption combined = flags.get(shortFlag);
                    validateCombinedSelection(combined, shortFlag, selected);
                    selections.add(new ShellProgram.OptionSelection(combined.id(), shortFlag, null, null));
                }
                continue;
            }
            if (option == null) throw new UnsupportedSyntax("Unknown option: " + value);
            if (option.takesValue() && optionValue == null) {
                if (++index >= tokens.size() || tokens.get(index).operator()) {
                    throw new UnsupportedSyntax("Missing value for option: " + spelling);
                }
                optionValue = tokens.get(index).value();
                optionValueKind = tokens.get(index).valueKind();
            } else if (!option.takesValue() && optionValue != null) {
                throw new UnsupportedSyntax("Unexpected value for option: " + spelling);
            }
            if (!option.repeatable() && !selected.add(option.id())) {
                throw new UnsupportedSyntax("Repeated non-repeatable option: " + spelling);
            }
            selected.add(option.id());
            selections.add(new ShellProgram.OptionSelection(
                    option.id(), spelling, optionValue, optionValueKind));
        }
        for (CatalogCommand.CommandOption option : command.options()) {
            if (selected.contains(option.id())
                    && option.conflictsWith().stream().anyMatch(selected::contains)) {
                throw new UnsupportedSyntax("Conflicting options");
            }
        }
    }

    private static void validateCombinedSelection(
            CatalogCommand.CommandOption option,
            String spelling,
            Set<String> selected) {
        if (option == null || option.takesValue() || !option.flags().contains(spelling)) {
            throw new UnsupportedSyntax("Invalid combined option: " + spelling);
        }
        if (!option.repeatable() && !selected.add(option.id())) {
            throw new UnsupportedSyntax("Repeated non-repeatable option: " + spelling);
        }
        selected.add(option.id());
    }

    private static List<ShellProgram.ArgumentValue> mapPositionals(
            CommandSpec command,
            List<Token> values) {
        List<CatalogCommand.CommandArgument> metadata = command.arguments();
        List<ShellProgram.ArgumentValue> result = new ArrayList<>();
        int valueIndex = 0;
        for (int argumentIndex = 0; argumentIndex < metadata.size(); argumentIndex++) {
            CatalogCommand.CommandArgument argument = metadata.get(argumentIndex);
            int remaining = values.size() - valueIndex;
            if (argument.repeatable()) {
                if (argumentIndex < metadata.size() - 1 && remaining > 1) {
                    throw new UnsupportedSyntax("Ambiguous repeatable positional arguments");
                }
                int take = argumentIndex == metadata.size() - 1 ? remaining : Math.min(1, remaining);
                for (int count = 0; count < take; count++) {
                    Token value = values.get(valueIndex++);
                    result.add(new ShellProgram.ArgumentValue(
                            argument.id(), value.value(), value.valueKind()));
                }
            } else if (remaining > 0) {
                Token value = values.get(valueIndex++);
                result.add(new ShellProgram.ArgumentValue(
                        argument.id(), value.value(), value.valueKind()));
            } else if (argument.required()) {
                throw new UnsupportedSyntax("Missing required argument: " + argument.id());
            }
        }
        if (valueIndex != values.size()) throw new UnsupportedSyntax("Too many positional arguments");
        return List.copyOf(result);
    }

    private static boolean isCombinedShort(String value, CommandSpec command) {
        return command.shortOptionPolicy().equals("combine-boolean")
                && value.length() > 2 && value.charAt(0) == '-' && value.charAt(1) != '-';
    }

    private static List<List<Token>> split(List<Token> tokens, String operator) {
        List<List<Token>> parts = new ArrayList<>();
        List<Token> current = new ArrayList<>();
        for (Token token : tokens) {
            if (token.value().equals(operator)) {
                parts.add(List.copyOf(current));
                current.clear();
            } else {
                current.add(token);
            }
        }
        parts.add(List.copyOf(current));
        return parts;
    }

    private static List<Token> lex(String line, int baseOffset) {
        List<Token> tokens = new ArrayList<>();
        int index = 0;
        while (index < line.length()) {
            if (Character.isWhitespace(line.charAt(index))) {
                index++;
                continue;
            }
            int start = index;
            String operator = readOperator(line, index);
            if (operator != null) {
                tokens.add(new Token(operator, null, baseOffset + start, baseOffset + start + operator.length(), true));
                index += operator.length();
                continue;
            }
            int wordEnd = wordEnd(line, index);
            String rawWord = line.substring(index, wordEnd);
            String variable = variableName(rawWord);
            if (variable != null) {
                tokens.add(new Token(variable, "variable", baseOffset + start, baseOffset + wordEnd, false));
                index = wordEnd;
                continue;
            }
            StringBuilder value = new StringBuilder();
            while (index < line.length() && !Character.isWhitespace(line.charAt(index))
                    && readOperator(line, index) == null) {
                char character = line.charAt(index);
                if (character == '\\' || character == '$' || character == '`'
                        || character == '*' || character == '?' || character == '['
                        || character == ']' || character == '{' || character == '}'
                        || character == '(' || character == ')' || character == '#') {
                    throw new UnsupportedSyntax("Expansion or shell metacharacter requires raw preservation");
                }
                if (character == '\'' || character == '"') {
                    char quote = character;
                    index++;
                    boolean closed = false;
                    while (index < line.length()) {
                        character = line.charAt(index++);
                        if (character == quote) {
                            closed = true;
                            break;
                        }
                        if (quote == '"' && (character == '$' || character == '`' || character == '\\')) {
                            throw new UnsupportedSyntax("Expansion in double quotes requires raw preservation");
                        }
                        value.append(character);
                    }
                    if (!closed) throw new UnsupportedSyntax("Unterminated quoted string");
                } else {
                    if (character == '&') throw new UnsupportedSyntax("Background execution is not represented yet");
                    value.append(character);
                    index++;
                }
            }
            if (value.isEmpty() && index == start) throw new UnsupportedSyntax("Unsupported token");
            tokens.add(new Token(value.toString(), "literal", baseOffset + start, baseOffset + index, false));
        }
        return List.copyOf(tokens);
    }

    private static int wordEnd(String line, int start) {
        int index = start;
        boolean single = false;
        boolean doubly = false;
        while (index < line.length()) {
            char character = line.charAt(index);
            if (character == '\'' && !doubly) single = !single;
            else if (character == '"' && !single) doubly = !doubly;
            if (!single && !doubly && (Character.isWhitespace(character)
                    || readOperator(line, index) != null)) break;
            index++;
        }
        return index;
    }

    private static String variableName(String rawWord) {
        java.util.regex.Matcher matcher = VARIABLE_WORD.matcher(rawWord);
        if (!matcher.matches()) return null;
        for (int group = 1; group <= 4; group++) {
            if (matcher.group(group) != null) return matcher.group(group);
        }
        return null;
    }

    private static String readOperator(String line, int index) {
        for (String candidate : List.of("2>>", "&&", "||", "|&", ">>", "2>", "&>", "|", ";", "<", ">")) {
            if (line.startsWith(candidate, index)) return candidate;
        }
        return null;
    }

    private static boolean containsInlineComment(String line) {
        boolean single = false;
        boolean doubly = false;
        for (int index = 0; index < line.length(); index++) {
            char character = line.charAt(index);
            if (character == '\'' && !doubly) single = !single;
            else if (character == '"' && !single) doubly = !doubly;
            else if (character == '#' && !single && !doubly
                    && (index == 0 || Character.isWhitespace(line.charAt(index - 1)))) return true;
        }
        return false;
    }

    private static int firstNonWhitespace(String value) {
        for (int index = 0; index < value.length(); index++) {
            if (!Character.isWhitespace(value.charAt(index))) return index;
        }
        return -1;
    }

    private static int lastNonWhitespace(String value) {
        for (int index = value.length() - 1; index >= 0; index--) {
            if (!Character.isWhitespace(value.charAt(index))) return index;
        }
        return -1;
    }

    private static boolean startsControl(String line) {
        return IF_HEADER.matcher(line).matches()
                || LOOP_HEADER.matcher(line).matches()
                || FOR_HEADER.matcher(line).matches()
                || CASE_HEADER.matcher(line).matches();
    }

    private static boolean isControlEnd(String line) {
        return line.equals("fi") || line.equals("done") || line.equals("esac");
    }

    private static List<PatternSlice> splitCasePatterns(String source) {
        List<PatternSlice> parts = new ArrayList<>();
        boolean single = false;
        boolean doubly = false;
        int start = 0;
        for (int index = 0; index < source.length(); index++) {
            char character = source.charAt(index);
            if (character == '\'' && !doubly) single = !single;
            else if (character == '"' && !single) doubly = !doubly;
            else if (character == '|' && !single && !doubly) {
                parts.add(new PatternSlice(source.substring(start, index), start));
                start = index + 1;
            }
        }
        if (single || doubly) throw new UnsupportedSyntax("Unterminated quoted case pattern");
        parts.add(new PatternSlice(source.substring(start), start));
        return List.copyOf(parts);
    }

    private static boolean containsUnquotedGlob(String source) {
        boolean single = false;
        boolean doubly = false;
        for (int index = 0; index < source.length(); index++) {
            char character = source.charAt(index);
            if (character == '\'' && !doubly) single = !single;
            else if (character == '"' && !single) doubly = !doubly;
            else if (!single && !doubly && (character == '*' || character == '?'
                    || character == '[' || character == ']')) return true;
        }
        return false;
    }

    private static boolean validPortableGlob(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (!Character.isLetterOrDigit(character)
                    && "_@%+=:,./*?[]!-".indexOf(character) < 0) return false;
        }
        return true;
    }

    private static int controlEndOffset(String source, int start) {
        List<LineSlice> slices = lines(source.substring(start));
        int depth = 0;
        for (LineSlice line : slices) {
            String trimmed = line.text().trim();
            if (startsControl(trimmed)) depth++;
            else if (isControlEnd(trimmed) && --depth == 0) return start + line.end();
        }
        throw new UnsupportedSyntax("Unterminated control-flow statement");
    }

    private static List<LineSlice> lines(String source) {
        List<LineSlice> lines = new ArrayList<>();
        int start = 0;
        while (start < source.length()) {
            int newline = source.indexOf('\n', start);
            int end = newline < 0 ? source.length() : newline;
            lines.add(new LineSlice(source.substring(start, end), start, end));
            if (newline < 0) break;
            start = newline + 1;
        }
        return List.copyOf(lines);
    }

    private static String unsupportedWholeSourceReason(String source) {
        if (source.indexOf('\r') >= 0) return "CRLF layout is preserved until newline metadata is represented";
        if (source.contains("\\\n")) return "Line continuations require raw preservation";
        if (containsUnquoted(source, "<<")) return "Here-documents require raw preservation";
        if (COMPOUND.matcher(source).find()) return "Compound Bash syntax requires raw preservation";
        return null;
    }

    private static boolean containsUnquoted(String source, String candidate) {
        boolean single = false;
        boolean doubly = false;
        for (int index = 0; index < source.length(); index++) {
            char character = source.charAt(index);
            if (character == '\'' && !doubly) single = !single;
            else if (character == '"' && !single) doubly = !doubly;
            else if (!single && !doubly && source.startsWith(candidate, index)) return true;
        }
        return false;
    }

    private record Token(String value, String valueKind, int start, int end, boolean operator) {}

    private static final class UnsupportedSyntax extends RuntimeException {
        private UnsupportedSyntax(String message) {
            super(message);
        }
    }

    private static final class ParseContext {
        private final String source;
        private final List<SourceSpan> spans = new ArrayList<>();
        private final List<ShellDiagnostic> diagnostics = new ArrayList<>();
        private int nodeCounter;
        private boolean preservedRaw;

        private ParseContext(String source) {
            this.source = source;
        }

        private String nextId() {
            return "node-" + ++nodeCounter;
        }

        private Checkpoint checkpoint() {
            return new Checkpoint(spans.size(), diagnostics.size(), nodeCounter, preservedRaw);
        }

        private void rollback(Checkpoint checkpoint) {
            spans.subList(checkpoint.spanCount(), spans.size()).clear();
            diagnostics.subList(checkpoint.diagnosticCount(), diagnostics.size()).clear();
            nodeCounter = checkpoint.nodeCounter();
            preservedRaw = checkpoint.preservedRaw();
        }

        private ShellProgram.RawCodeNode raw(String code, int start, int end, String reason) {
            preservedRaw = true;
            String id = nextId();
            ShellProgram.RawCodeNode node = new ShellProgram.RawCodeNode(id, code, reason);
            span(id, start, end);
            if (diagnostics.size() < 1000) {
                diagnostics.add(new ShellDiagnostic(
                        "warning", "bash.unsupported", reason + ". Preserved as raw code.", start, end));
            }
            return node;
        }

        private ShellParseResult rawProgram(String code, int start, int end, String reason) {
            ShellProgram.RawCodeNode raw = raw(code, start, end, reason);
            return new ShellParseResult(
                    new ShellProgram("1.4.0", "bash", List.of(raw)),
                    List.copyOf(spans),
                    List.copyOf(diagnostics),
                    true);
        }

        private void span(String id, int start, int end) {
            Position from = position(start);
            Position to = position(end);
            spans.add(new SourceSpan(
                    id, start, end, from.line(), from.column(), to.line(), to.column()));
        }

        private Position position(int offset) {
            int line = 1;
            int column = 1;
            for (int index = 0; index < offset; index++) {
                if (source.charAt(index) == '\n') {
                    line++;
                    column = 1;
                } else {
                    column++;
                }
            }
            return new Position(line, column);
        }
    }

    private record Position(int line, int column) {}

    private record BodySlice(int start, int end) {}

    private record LineSlice(String text, int start, int end) {}

    private record PatternSlice(String text, int start) {}

    private record Checkpoint(
            int spanCount,
            int diagnosticCount,
            int nodeCounter,
            boolean preservedRaw) {}
}
