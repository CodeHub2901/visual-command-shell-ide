// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.shell;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;

public record ShellProgram(
        String schemaVersion,
        String dialect,
        List<ShellNode> statements) {

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = CommandNode.class, name = "command"),
        @JsonSubTypes.Type(value = RedirectNode.class, name = "redirect"),
        @JsonSubTypes.Type(value = PipelineNode.class, name = "pipeline"),
        @JsonSubTypes.Type(value = BooleanChainNode.class, name = "boolean-chain"),
        @JsonSubTypes.Type(value = SequenceNode.class, name = "sequence"),
        @JsonSubTypes.Type(value = AssignmentNode.class, name = "assignment"),
        @JsonSubTypes.Type(value = BlockNode.class, name = "block"),
        @JsonSubTypes.Type(value = FunctionNode.class, name = "function"),
        @JsonSubTypes.Type(value = IfNode.class, name = "if"),
        @JsonSubTypes.Type(value = LoopNode.class, name = "loop"),
        @JsonSubTypes.Type(value = ForNode.class, name = "for"),
        @JsonSubTypes.Type(value = CaseNode.class, name = "case"),
        @JsonSubTypes.Type(value = CommentNode.class, name = "comment"),
        @JsonSubTypes.Type(value = RawCodeNode.class, name = "raw-code")
    })
    public sealed interface ShellNode permits
            CommandNode,
            RedirectNode,
            PipelineNode,
            BooleanChainNode,
            SequenceNode,
            AssignmentNode,
            BlockNode,
            FunctionNode,
            IfNode,
            LoopNode,
            ForNode,
            CaseNode,
            CommentNode,
            RawCodeNode {
        String nodeId();
    }

    public record CommandNode(
            String nodeId,
            String commandId,
            List<OptionSelection> options,
            List<ArgumentValue> arguments) implements ShellNode {}

    public record RedirectNode(
            String nodeId,
            CommandNode subject,
            List<Redirection> redirections) implements ShellNode {}

    public record PipelineNode(
            String nodeId,
            String operator,
            List<ShellNode> stages) implements ShellNode {}

    public record BooleanChainNode(
            String nodeId,
            String operator,
            ShellNode left,
            ShellNode right) implements ShellNode {}

    public record SequenceNode(
            String nodeId,
            String separator,
            List<ShellNode> items) implements ShellNode {}

    public record AssignmentNode(
            String nodeId,
            String name,
            String value,
            String valueKind,
            boolean exported) implements ShellNode {}

    public record BlockNode(
            String nodeId,
            String mode,
            List<ShellNode> statements) implements ShellNode {}

    public record FunctionNode(
            String nodeId,
            String name,
            List<ShellNode> body) implements ShellNode {}

    public record IfNode(
            String nodeId,
            List<IfBranch> branches,
            List<ShellNode> elseBody) implements ShellNode {}

    public record IfBranch(
            ShellNode condition,
            List<ShellNode> body) {}

    public record LoopNode(
            String nodeId,
            String mode,
            ShellNode condition,
            List<ShellNode> body) implements ShellNode {}

    public record ForNode(
            String nodeId,
            String variable,
            List<ShellWord> values,
            List<ShellNode> body) implements ShellNode {}

    public record ShellWord(String value, String valueKind) {}

    public record CaseNode(
            String nodeId,
            ShellWord word,
            List<CaseArm> arms) implements ShellNode {}

    public record CaseArm(
            List<CasePattern> patterns,
            List<ShellNode> body) {}

    public record CasePattern(String value, String kind) {}

    public record CommentNode(String nodeId, String text) implements ShellNode {}

    public record RawCodeNode(String nodeId, String code, String reason) implements ShellNode {}

    public record OptionSelection(String optionId, String spelling, String value, String valueKind) {
        public OptionSelection(String optionId, String spelling, String value) {
            this(optionId, spelling, value, value == null ? null : "literal");
        }
    }

    public record ArgumentValue(String argumentId, String value, String valueKind) {
        public ArgumentValue(String argumentId, String value) {
            this(argumentId, value, "literal");
        }
    }

    public record Redirection(String operator, String target, String targetKind) {
        public Redirection(String operator, String target) {
            this(operator, target, "literal");
        }
    }
}
