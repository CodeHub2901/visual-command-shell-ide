// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.shell;

import java.util.ArrayList;
import java.util.List;

public final class ShellPrograms {
    private ShellPrograms() {}

    public static List<ShellProgram.ShellNode> depthFirst(ShellProgram program) {
        List<ShellProgram.ShellNode> nodes = new ArrayList<>();
        for (ShellProgram.ShellNode statement : program.statements()) collect(statement, nodes);
        return List.copyOf(nodes);
    }

    public static List<ShellProgram.CommandNode> commands(ShellProgram program) {
        return depthFirst(program).stream()
                .filter(ShellProgram.CommandNode.class::isInstance)
                .map(ShellProgram.CommandNode.class::cast)
                .toList();
    }

    private static void collect(ShellProgram.ShellNode node, List<ShellProgram.ShellNode> nodes) {
        nodes.add(node);
        switch (node) {
            case ShellProgram.RedirectNode redirect -> collect(redirect.subject(), nodes);
            case ShellProgram.PipelineNode pipeline -> pipeline.stages().forEach(stage -> collect(stage, nodes));
            case ShellProgram.BooleanChainNode chain -> {
                collect(chain.left(), nodes);
                collect(chain.right(), nodes);
            }
            case ShellProgram.SequenceNode sequence -> sequence.items().forEach(item -> collect(item, nodes));
            case ShellProgram.BlockNode block -> block.statements().forEach(item -> collect(item, nodes));
            case ShellProgram.FunctionNode function -> function.body().forEach(item -> collect(item, nodes));
            case ShellProgram.IfNode conditional -> {
                conditional.branches().forEach(branch -> {
                    collect(branch.condition(), nodes);
                    branch.body().forEach(item -> collect(item, nodes));
                });
                if (conditional.elseBody() != null) {
                    conditional.elseBody().forEach(item -> collect(item, nodes));
                }
            }
            case ShellProgram.LoopNode loop -> {
                collect(loop.condition(), nodes);
                loop.body().forEach(item -> collect(item, nodes));
            }
            case ShellProgram.ForNode loop -> loop.body().forEach(item -> collect(item, nodes));
            case ShellProgram.CaseNode conditional -> conditional.arms().forEach(
                    arm -> arm.body().forEach(item -> collect(item, nodes)));
            default -> { }
        }
    }
}
