// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.shell;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.util.List;
import org.junit.jupiter.api.Test;

final class BashParserTest {
    private final CatalogService catalog = new CatalogService(new SystemProfile(
            "linux",
            "x86_64",
            new ShellEnvironment("/bin/bash", "bash"),
            new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
            List.of()));
    private final BashParser parser = new BashParser(catalog);
    private final BashGenerator generator = new BashGenerator(catalog);

    @Test
    void parsesKnownCommandsOptionsQuotingPipelinesRedirectsAndBooleanChains() {
        String source = "ls -al '/tmp/My Files' | grep -n error > results.txt && tar -c Documents";

        ShellParseResult result = parser.parse(source);

        assertFalse(result.preservedRaw());
        assertTrue(result.diagnostics().isEmpty());
        assertInstanceOf(ShellProgram.BooleanChainNode.class, result.program().statements().getFirst());
        assertEquals(source, generator.generate(result.program()).script());
        assertEquals(6, result.sourceSpans().size());
        assertEquals(0, result.sourceSpans().getLast().startOffset());
        assertEquals(source.length(), result.sourceSpans().getLast().endOffset());
    }

    @Test
    void parsesExpandedCatalogCommandsWithoutFallingBackToRawCode() {
        String source = "findmnt -T /srv/app -o TARGET,SOURCE | cut -d ' ' -f 1";

        ShellParseResult result = parser.parse(source);

        assertFalse(result.preservedRaw());
        assertTrue(result.diagnostics().isEmpty());
        assertInstanceOf(ShellProgram.PipelineNode.class, result.program().statements().getFirst());
        assertEquals(source, generator.generate(result.program()).script());
    }

    @Test
    void preservesAnOptionThatIsUnavailableForTheExactTargetAsRawCode() {
        String source = "lsblk --filter 'NAME == \"sda\"'";
        ShellParseResult ubuntu24 = parser.parse(source);
        CatalogService modernCatalog = new CatalogService(new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "26.04", "Ubuntu 26.04", "ubuntu", true),
                List.of()));
        ShellParseResult ubuntu26 = new BashParser(modernCatalog).parse(source);

        assertTrue(ubuntu24.preservedRaw());
        assertInstanceOf(ShellProgram.RawCodeNode.class, ubuntu24.program().statements().getFirst());
        assertFalse(ubuntu26.preservedRaw());
        assertEquals(source, new BashGenerator(modernCatalog).generate(ubuntu26.program()).script());
    }

    @Test
    void parsesCommentsAndSemicolonSequences() {
        ShellParseResult result = parser.parse("# inventory\nls -a; ps -e");

        assertFalse(result.preservedRaw());
        assertEquals("# inventory\nls -a; ps -e", generator.generate(result.program()).script());
        assertInstanceOf(ShellProgram.CommentNode.class, result.program().statements().getFirst());
        assertInstanceOf(ShellProgram.SequenceNode.class, result.program().statements().getLast());
    }

    @Test
    void preservesCommandSubstitutionExactlyAndRollsBackPartialNodes() {
        String source = "ls -a | custom $(date)";

        ShellParseResult result = parser.parse(source);

        assertTrue(result.preservedRaw());
        ShellProgram.RawCodeNode raw = assertInstanceOf(
                ShellProgram.RawCodeNode.class, result.program().statements().getFirst());
        assertEquals(source, raw.code());
        assertEquals(source, generator.generate(result.program()).script());
        assertEquals(List.of(raw.nodeId()), result.sourceSpans().stream().map(SourceSpan::nodeId).toList());
        assertEquals("bash.unsupported", result.diagnostics().getFirst().code());
    }

    @Test
    void preservesUnquotedWildcardDeletionExactlyForCriticalRiskReview() {
        String source = "rm -f *.log";

        ShellParseResult result = parser.parse(source);

        assertTrue(result.preservedRaw());
        ShellProgram.RawCodeNode raw = assertInstanceOf(
                ShellProgram.RawCodeNode.class, result.program().statements().getFirst());
        assertEquals(source, raw.code());
        assertEquals(source, generator.generate(result.program()).script());
        assertTrue(raw.reason().contains("metacharacter"));
    }

    @Test
    void preservesCompleteHereDocumentExactly() {
        String source = "grep value <<'EOF'\nvalue\nEOF\n";

        ShellParseResult result = parser.parse(source);

        ShellProgram.RawCodeNode raw = assertInstanceOf(
                ShellProgram.RawCodeNode.class, result.program().statements().getFirst());
        assertEquals(source, raw.code());
        assertEquals(source, generator.generate(result.program()).script());
        assertEquals(1, result.sourceSpans().getFirst().startLine());
        assertEquals(4, result.sourceSpans().getFirst().endLine());
    }

    @Test
    void doesNotTreatAQuotedDoubleAngleAsAHereDocument() {
        String source = "ls '/tmp/!!!!!!!!!!!!!!<<'";

        ShellParseResult result = parser.parse(source);

        assertFalse(result.preservedRaw());
        assertInstanceOf(ShellProgram.CommandNode.class, result.program().statements().getFirst());
        assertEquals(source, generator.generate(result.program()).script());
    }

    @Test
    void parsesIfControlFlowIntoAStructuredNode() {
        String source = "if grep error app.log; then\n  ps -e\nfi";

        ShellParseResult result = parser.parse(source);

        ShellProgram.IfNode conditional = assertInstanceOf(
                ShellProgram.IfNode.class, result.program().statements().getFirst());
        assertEquals(1, conditional.branches().size());
        assertEquals(null, conditional.elseBody());
        assertFalse(result.preservedRaw());
        assertEquals(source, generator.generate(result.program()).script());
    }

    @Test
    void parsesAssignmentsExportsAndWholeWordVariableReferences() {
        String source = "export LOG_FILE='/var/log/app.log'\n"
                + "COPY=$LOG_FILE\n"
                + "grep error \"$LOG_FILE\" > \"${OUTPUT}\"";

        ShellParseResult result = parser.parse(source);

        assertFalse(result.preservedRaw());
        ShellProgram.AssignmentNode exported = assertInstanceOf(
                ShellProgram.AssignmentNode.class, result.program().statements().getFirst());
        ShellProgram.AssignmentNode copied = assertInstanceOf(
                ShellProgram.AssignmentNode.class, result.program().statements().get(1));
        ShellProgram.RedirectNode redirect = assertInstanceOf(
                ShellProgram.RedirectNode.class, result.program().statements().getLast());
        assertTrue(exported.exported());
        assertEquals("literal", exported.valueKind());
        assertEquals("variable", copied.valueKind());
        assertEquals("variable", redirect.subject().arguments().get(1).valueKind());
        assertEquals("variable", redirect.redirections().getFirst().targetKind());
        assertEquals(
                "export LOG_FILE=/var/log/app.log\nCOPY=\"${LOG_FILE}\"\n"
                        + "grep error \"${LOG_FILE}\" > \"${OUTPUT}\"",
                generator.generate(result.program()).script());
    }

    @Test
    void preservesParameterizedExpansionThatTheAstCannotRepresent() {
        String source = "ls \"${ROOT:-/tmp}\"";

        ShellParseResult result = parser.parse(source);

        ShellProgram.RawCodeNode raw = assertInstanceOf(
                ShellProgram.RawCodeNode.class, result.program().statements().getFirst());
        assertEquals(source, raw.code());
        assertTrue(result.preservedRaw());
    }

    @Test
    void parsesMultilineSubshellsAndNestedGroups() {
        String source = "(\n  ls -a\n  { grep error app.log; ps -e; }\n)";

        ShellParseResult result = parser.parse(source);

        ShellProgram.BlockNode subshell = assertInstanceOf(
                ShellProgram.BlockNode.class, result.program().statements().getFirst());
        ShellProgram.BlockNode group = assertInstanceOf(
                ShellProgram.BlockNode.class, subshell.statements().get(1));
        assertEquals("subshell", subshell.mode());
        assertEquals("group", group.mode());
        assertFalse(result.preservedRaw());
        assertEquals(
                "( ls -a; { grep error app.log; ps -e; } )",
                generator.generate(result.program()).script());
    }

    @Test
    void parsesFunctionDefinitionsWithAssignmentsAndStructuredBodies() {
        String source = "deploy() {\n  ROOT=/srv/app\n  { ls \"$ROOT\"; ps -e; }\n}";

        ShellParseResult result = parser.parse(source);

        ShellProgram.FunctionNode function = assertInstanceOf(
                ShellProgram.FunctionNode.class, result.program().statements().getFirst());
        assertEquals("deploy", function.name());
        assertInstanceOf(ShellProgram.AssignmentNode.class, function.body().getFirst());
        assertInstanceOf(ShellProgram.BlockNode.class, function.body().getLast());
        assertEquals(
                "deploy() { ROOT=/srv/app; { ls \"${ROOT}\"; ps -e; }; }",
                generator.generate(result.program()).script());
    }

    @Test
    void parsesElifElseAndRecursivelyNestedForWhileLoops() {
        String source = """
                if ls; then
                  ls -a
                elif grep error app.log; then
                  ps -e
                else
                  for FILE in . "${ROOT}"; do
                    while ls "${FILE}"; do
                      ls -l "${FILE}"
                    done
                  done
                fi""";

        ShellParseResult result = parser.parse(source);

        ShellProgram.IfNode conditional = assertInstanceOf(
                ShellProgram.IfNode.class, result.program().statements().getFirst());
        assertEquals(2, conditional.branches().size());
        ShellProgram.ForNode eachFile = assertInstanceOf(
                ShellProgram.ForNode.class, conditional.elseBody().getFirst());
        ShellProgram.LoopNode loop = assertInstanceOf(
                ShellProgram.LoopNode.class, eachFile.body().getFirst());
        assertEquals("while", loop.mode());
        assertEquals("variable", eachFile.values().getLast().valueKind());
        assertFalse(result.preservedRaw());
        assertEquals(source, generator.generate(result.program()).script());
    }

    @Test
    void parsesCaseArmsWithLiteralAndGlobPatterns() {
        String source = """
                case "${VALUE}" in
                  ready|'with space')
                    ls
                    ;;
                  *.log|*)
                    ps -e
                    ;;
                esac""";

        ShellParseResult result = parser.parse(source);

        ShellProgram.CaseNode conditional = assertInstanceOf(
                ShellProgram.CaseNode.class, result.program().statements().getFirst());
        assertEquals("variable", conditional.word().valueKind());
        assertEquals("literal", conditional.arms().getFirst().patterns().getLast().kind());
        assertEquals("glob", conditional.arms().getLast().patterns().getFirst().kind());
        assertFalse(result.preservedRaw());
        assertEquals(source, generator.generate(result.program()).script());
    }

    @Test
    void parsesControlFlowBetweenTopLevelStatements() {
        String source = """
                ROOT=/tmp
                while ls "${ROOT}"; do
                  ls -a "${ROOT}"
                done
                ps -e""";

        ShellParseResult result = parser.parse(source);

        assertEquals(3, result.program().statements().size());
        assertInstanceOf(ShellProgram.AssignmentNode.class, result.program().statements().getFirst());
        assertInstanceOf(ShellProgram.LoopNode.class, result.program().statements().get(1));
        assertInstanceOf(ShellProgram.CommandNode.class, result.program().statements().getLast());
        assertFalse(result.preservedRaw());
        assertEquals(source, generator.generate(result.program()).script());
    }

    @Test
    void parsesRepresentativeFoundationPackCommands() {
        String source = "free -h\nlsblk -fJ\ngit --no-pager status\nmount -r /dev/sdb1 /mnt/data";

        ShellParseResult result = parser.parse(source);

        assertFalse(result.preservedRaw());
        assertEquals(4, result.program().statements().size());
        assertEquals(List.of("free", "lsblk", "git", "mount"),
                result.program().statements().stream()
                        .map(ShellProgram.CommandNode.class::cast)
                        .map(ShellProgram.CommandNode::commandId)
                        .toList());
        assertEquals(source, generator.generate(result.program()).script());
    }
}
