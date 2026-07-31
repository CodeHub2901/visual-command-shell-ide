// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.shell;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.util.List;
import org.junit.jupiter.api.Test;

final class BashGeneratorTest {
    private final BashGenerator generator = new BashGenerator(new CatalogService(new SystemProfile(
            "linux",
            "x86_64",
            new ShellEnvironment("/bin/bash", "bash"),
            new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
            List.of())));

    @Test
    void compactsSafeBooleanLsFlagsAndQuotesThePath() {
        ShellProgram program = program("ls",
                List.of(option("all", "-a", null), option("long", "-l", null)),
                List.of(argument("files", "/tmp/My Files")));

        ShellGenerateResult result = generator.generate(program);

        assertEquals("ls -al '/tmp/My Files'", result.script());
        assertTrue(result.compacted());
    }

    @Test
    void leavesLongOptionsAndValueTakingOptionsSeparate() {
        ShellGenerateResult longOption = generator.generate(program(
                "ls", List.of(option("all", "--all", null), option("long", "-l", null)), List.of()));
        ShellGenerateResult archive = generator.generate(program(
                "tar", List.of(option("create", "-c", null), option("file", "-f", "My Archive.tar")),
                List.of(argument("files", "Documents"))));

        assertEquals("ls -l --all", longOption.script());
        assertFalse(longOption.compacted());
        assertEquals("tar -c -f 'My Archive.tar' Documents", archive.script());
    }

    @Test
    void rejectsConflictingTarModes() {
        ShellProgram program = program(
                "tar",
                List.of(option("create", "-c", null), option("extract", "-x", null)),
                List.of());

        assertThrows(IllegalArgumentException.class, () -> generator.generate(program));
    }

    @Test
    void quotesCommandSubstitutionAndApostrophesAsLiteralData() {
        ShellProgram program = program(
                "ls", List.of(), List.of(argument("files", "$(touch /tmp/pwned)'file")));

        assertEquals("ls '$(touch /tmp/pwned)'\"'\"'file'", generator.generate(program).script());
    }

    @Test
    void generatesPipelinesRedirectsBooleanChainsAndSequences() {
        ShellProgram.CommandNode list = command("list", "ls", List.of(option("all", "-a", null)), List.of());
        ShellProgram.CommandNode search = command(
                "search", "grep", List.of(), List.of(argument("pattern", "error")));
        ShellProgram.PipelineNode pipeline = new ShellProgram.PipelineNode(
                "pipeline", "|", List.of(list, search));
        ShellProgram.RedirectNode redirect = new ShellProgram.RedirectNode(
                "redirect", command("archive", "tar", List.of(option("create", "-c", null)), List.of()),
                List.of(new ShellProgram.Redirection(">", "My Archive.bin")));
        ShellProgram.BooleanChainNode chain = new ShellProgram.BooleanChainNode(
                "chain", "&&", pipeline, redirect);
        ShellProgram.SequenceNode sequence = new ShellProgram.SequenceNode(
                "sequence", "newline", List.of(
                        new ShellProgram.CommentNode("comment", "Generated recipe"),
                        chain,
                        new ShellProgram.RawCodeNode("raw", "printf '%s\\n' \"$CUSTOM\"", "Unusual expansion")));

        ShellGenerateResult result = generator.generate(new ShellProgram("1.4.0", "bash", List.of(sequence)));

        assertEquals("# Generated recipe\nls -a | grep error && tar -c > 'My Archive.bin'\nprintf '%s\\n' \"$CUSTOM\"", result.script());
        assertEquals(List.of(
                "Executable availability is missing for ls on this machine.",
                "Executable availability is missing for grep on this machine.",
                "Executable availability is missing for tar on this machine.",
                "Raw code preserved without semantic validation: raw"), result.warnings());
    }

    @Test
    void generatesAssignmentsAndQuotedVariableValuesWithoutTreatingThemAsLiterals() {
        ShellProgram program = new ShellProgram(
                "1.4.0",
                "bash",
                List.of(
                        new ShellProgram.AssignmentNode(
                                "assign", "ARCHIVE", "backup.tar", "literal", true),
                        command(
                                "archive", "tar",
                                List.of(new ShellProgram.OptionSelection(
                                        "file", "-f", "ARCHIVE", "variable")),
                                List.of(new ShellProgram.ArgumentValue(
                                        "files", "SOURCE", "variable")))));

        assertEquals(
                "export ARCHIVE=backup.tar\ntar -f \"${ARCHIVE}\" \"${SOURCE}\"",
                generator.generate(program).script());
    }

    @Test
    void generatesNestedBlocksFunctionsAndBlockPipelineStages() {
        ShellProgram.BlockNode subshell = new ShellProgram.BlockNode(
                "subshell", "subshell",
                List.of(command("list", "ls", List.of(option("all", "-a", null)), List.of())));
        ShellProgram.PipelineNode pipeline = new ShellProgram.PipelineNode(
                "pipeline", "|", List.of(
                        subshell,
                        command("search", "grep", List.of(), List.of(argument("pattern", "error")))));
        ShellProgram.FunctionNode function = new ShellProgram.FunctionNode(
                "function", "inspect", List.of(pipeline));

        assertEquals(
                "inspect() { ( ls -a ) | grep error; }",
                generator.generate(new ShellProgram("1.4.0", "bash", List.of(function))).script());
    }

    @Test
    void generatesNestedIfForAndUntilControlFlow() {
        ShellProgram.ForNode eachFile = new ShellProgram.ForNode(
                "for", "FILE",
                List.of(
                        new ShellProgram.ShellWord(".", "literal"),
                        new ShellProgram.ShellWord("ROOT", "variable")),
                List.of(command(
                        "for-body", "ls", List.of(),
                        List.of(new ShellProgram.ArgumentValue("files", "FILE", "variable")))));
        ShellProgram.LoopNode until = new ShellProgram.LoopNode(
                "until", "until", command("until-condition", "ls", List.of(), List.of()),
                List.of(command("until-body", "ls", List.of(), List.of())));
        ShellProgram.IfNode conditional = new ShellProgram.IfNode(
                "if",
                List.of(
                        new ShellProgram.IfBranch(
                                command("if-condition", "ls", List.of(), List.of()),
                                List.of(eachFile)),
                        new ShellProgram.IfBranch(
                                command("elif-condition", "ls", List.of(option("all", "-a", null)), List.of()),
                                List.of(command("elif-body", "ls", List.of(option("long", "-l", null)), List.of())))),
                List.of(until));

        assertEquals(
                """
                if ls; then
                  for FILE in . "${ROOT}"; do
                    ls "${FILE}"
                  done
                elif ls -a; then
                  ls -l
                else
                  until ls; do
                    ls
                  done
                fi""",
                generator.generate(new ShellProgram("1.4.0", "bash", List.of(conditional))).script());
    }

    @Test
    void generatesCaseArmsWithLiteralAndGlobSemantics() {
        ShellProgram.CaseNode conditional = new ShellProgram.CaseNode(
                "case",
                new ShellProgram.ShellWord("VALUE", "variable"),
                List.of(
                        new ShellProgram.CaseArm(
                                List.of(
                                        new ShellProgram.CasePattern("ready", "literal"),
                                        new ShellProgram.CasePattern("with space", "literal")),
                                List.of(command("ready-body", "ls", List.of(), List.of()))),
                        new ShellProgram.CaseArm(
                                List.of(
                                        new ShellProgram.CasePattern("*.log", "glob"),
                                        new ShellProgram.CasePattern("*", "glob")),
                                List.of(command(
                                        "log-body", "ps",
                                        List.of(option("all-users", "-e", null)), List.of())))));

        assertEquals(
                """
                case "${VALUE}" in
                  ready|'with space')
                    ls
                    ;;
                  *.log|*)
                    ps -e
                    ;;
                esac""",
                generator.generate(new ShellProgram("1.4.0", "bash", List.of(conditional))).script());
    }

    @Test
    void generatesRepresentativeFoundationPackCommands() {
        ShellProgram program = new ShellProgram(
                "1.4.0",
                "bash",
                List.of(
                        command("memory", "free",
                                List.of(option("human-readable", "-h", null)), List.of()),
                        command("storage", "lsblk",
                                List.of(
                                        option("filesystems", "-f", null),
                                        option("json", "-J", null)), List.of()),
                        command("repository", "git",
                                List.of(option("no-pager", "--no-pager", null)),
                                List.of(argument("command", "status"))),
                        command("filesystem", "mount",
                                List.of(option("read-only", "-r", null)),
                                List.of(
                                        argument("source", "/dev/sdb1"),
                                        argument("directory", "/mnt/data")))));

        ShellGenerateResult result = generator.generate(program);

        assertEquals(
                "free -h\nlsblk -fJ\ngit --no-pager status\nmount -r /dev/sdb1 /mnt/data",
                result.script());
        assertTrue(result.compacted());
    }

    @Test
    void enforcesExactTargetOptionAvailabilityFromTheOverlay() {
        ShellProgram filtered = program(
                "lsblk",
                List.of(option("filter", "--filter", "NAME == \"sda\"")),
                List.of());
        BashGenerator ubuntu26 = new BashGenerator(new CatalogService(new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "26.04", "Ubuntu 26.04", "ubuntu", true),
                List.of())));

        assertThrows(IllegalArgumentException.class, () -> generator.generate(filtered));
        assertEquals("lsblk --filter 'NAME == \"sda\"'", ubuntu26.generate(filtered).script());
    }

    @Test
    void compactsExpandedCatalogBooleanFlagsButKeepsValuesSeparate() {
        ShellGenerateResult uniq = generator.generate(program(
                "uniq",
                List.of(option("count", "-c", null), option("ignore-case", "-i", null)),
                List.of(argument("input", "events.sorted"))));
        ShellGenerateResult cut = generator.generate(program(
                "cut",
                List.of(option("delimiter", "-d", ":"), option("fields", "-f", "1,5")),
                List.of(argument("files", "/etc/passwd"))));

        assertEquals("uniq -ci events.sorted", uniq.script());
        assertTrue(uniq.compacted());
        assertEquals("cut -d : -f 1,5 /etc/passwd", cut.script());
        assertFalse(cut.compacted());
    }

    private ShellProgram program(
            String commandId,
            List<ShellProgram.OptionSelection> options,
            List<ShellProgram.ArgumentValue> arguments) {
        return new ShellProgram(
                "1.4.0",
                "bash",
                List.of(command("node-1", commandId, options, arguments)));
    }

    private ShellProgram.CommandNode command(
            String nodeId,
            String commandId,
            List<ShellProgram.OptionSelection> options,
            List<ShellProgram.ArgumentValue> arguments) {
        return new ShellProgram.CommandNode(nodeId, commandId, options, arguments);
    }

    private ShellProgram.OptionSelection option(String id, String spelling, String value) {
        return new ShellProgram.OptionSelection(id, spelling, value);
    }

    private ShellProgram.ArgumentValue argument(String id, String value) {
        return new ShellProgram.ArgumentValue(id, value);
    }
}
