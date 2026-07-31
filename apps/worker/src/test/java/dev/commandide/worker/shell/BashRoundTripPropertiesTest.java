// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.shell;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.quicktheories.QuickTheory.qt;
import static org.quicktheories.generators.SourceDSL.booleans;
import static org.quicktheories.generators.SourceDSL.strings;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.util.List;
import org.junit.jupiter.api.Test;

final class BashRoundTripPropertiesTest {
    private final CatalogService catalog = new CatalogService(new SystemProfile(
            "linux",
            "x86_64",
            new ShellEnvironment("/bin/bash", "bash"),
            new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
            List.of()));
    private final BashGenerator generator = new BashGenerator(catalog);
    private final BashParser parser = new BashParser(catalog);

    @Test
    void supportedControlFlowHasCanonicalSemanticRoundTrips() {
        qt().withExamples(300)
                .forAll(
                        strings().betweenCodePoints(32, 126).ofLengthBetween(0, 24),
                        booleans().all(),
                        booleans().all(),
                        booleans().all())
                .checkAssert((fragment, untilMode, includeElif, includeElse) -> {
                    ShellProgram program = controlProgram(
                            "/tmp/" + fragment, untilMode, includeElif, includeElse);

                    String generated = generator.generate(program).script();
                    ShellParseResult parsed = parser.parse(generated);

                    assertFalse(parsed.preservedRaw());
                    assertEquals(generated, generator.generate(parsed.program()).script());
                });
    }

    @Test
    void unsupportedRawBlocksArePreservedExactlyForGeneratedInputs() {
        qt().withExamples(200)
                .forAll(strings().betweenCodePoints(32, 126).ofLengthBetween(0, 40))
                .checkAssert(fragment -> {
                    String rawCode = "printf '%s\\n' \"${VALUE:-" + fragment + "}\"";
                    ShellProgram program = new ShellProgram(
                            "1.4.0",
                            "bash",
                            List.of(new ShellProgram.RawCodeNode(
                                    "raw", rawCode, "Parameterized expansion")));

                    String generated = generator.generate(program).script();
                    ShellParseResult parsed = parser.parse(generated);
                    ShellProgram.RawCodeNode raw = assertInstanceOf(
                            ShellProgram.RawCodeNode.class, parsed.program().statements().getFirst());

                    assertEquals(rawCode, raw.code());
                    assertEquals(rawCode, generator.generate(parsed.program()).script());
                });
    }

    @Test
    void casePatternSemanticsHaveCanonicalRoundTrips() {
        qt().withExamples(250)
                .forAll(
                        strings().betweenCodePoints(32, 126).ofLengthBetween(0, 24),
                        booleans().all())
                .checkAssert((fragment, nestedLoop) -> {
                    List<ShellProgram.ShellNode> defaultBody = nestedLoop
                            ? List.of(new ShellProgram.LoopNode(
                                    "case-loop", "while",
                                    command("case-loop-condition", List.of(), List.of()),
                                    List.of(command("case-loop-body", List.of(), List.of()))))
                            : List.of(command("case-default", List.of(), List.of()));
                    ShellProgram program = new ShellProgram(
                            "1.4.0",
                            "bash",
                            List.of(new ShellProgram.CaseNode(
                                    "case",
                                    new ShellProgram.ShellWord("VALUE", "variable"),
                                    List.of(
                                            new ShellProgram.CaseArm(
                                                    List.of(new ShellProgram.CasePattern(
                                                            "value-" + fragment, "literal")),
                                                    List.of(command("case-literal", List.of(), List.of()))),
                                            new ShellProgram.CaseArm(
                                                    List.of(
                                                            new ShellProgram.CasePattern("*.log", "glob"),
                                                            new ShellProgram.CasePattern("*", "glob")),
                                                    defaultBody)))));

                    String generated = generator.generate(program).script();
                    ShellParseResult parsed = parser.parse(generated);

                    assertFalse(parsed.preservedRaw());
                    assertEquals(generated, generator.generate(parsed.program()).script());
                });
    }

    private static ShellProgram controlProgram(
            String path,
            boolean untilMode,
            boolean includeElif,
            boolean includeElse) {
        ShellProgram.ForNode eachFile = new ShellProgram.ForNode(
                "for",
                "FILE",
                List.of(
                        new ShellProgram.ShellWord(path, "literal"),
                        new ShellProgram.ShellWord("ROOT", "variable")),
                List.of(command(
                        "for-body", List.of(),
                        List.of(new ShellProgram.ArgumentValue("files", "FILE", "variable")))));
        List<ShellProgram.IfBranch> branches = new java.util.ArrayList<>();
        branches.add(new ShellProgram.IfBranch(
                command("if-condition", List.of(), List.of()), List.of(eachFile)));
        if (includeElif) {
            branches.add(new ShellProgram.IfBranch(
                    command("elif-condition", List.of(option("all", "-a")), List.of()),
                    List.of(command("elif-body", List.of(option("long", "-l")), List.of()))));
        }
        List<ShellProgram.ShellNode> elseBody = includeElse
                ? List.of(new ShellProgram.LoopNode(
                        "loop",
                        untilMode ? "until" : "while",
                        command("loop-condition", List.of(), List.of()),
                        List.of(command("loop-body", List.of(), List.of()))))
                : null;
        return new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.IfNode("if", List.copyOf(branches), elseBody)));
    }

    private static ShellProgram.CommandNode command(
            String nodeId,
            List<ShellProgram.OptionSelection> options,
            List<ShellProgram.ArgumentValue> arguments) {
        return new ShellProgram.CommandNode(nodeId, "ls", options, arguments);
    }

    private static ShellProgram.OptionSelection option(String id, String spelling) {
        return new ShellProgram.OptionSelection(id, spelling, null, null);
    }
}
