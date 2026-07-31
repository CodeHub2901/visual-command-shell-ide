// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type {
  ShellBooleanOperand,
  ShellNode,
  ShellPipelineStage,
  ShellProgram,
  ShellSequenceItem
} from "@cmd-ide/contracts";
import type { Translator } from "./i18n";

export type VisualConnection = "sequence" | "pipeline" | "and" | "or";

export function appendProgram(
  program: ShellProgram,
  addition: ShellProgram,
  createNodeId: (originalId: string) => string,
  t: Translator["t"]
): ShellProgram {
  const added = addition.statements.map((node) => cloneWithFreshIds(node, createNodeId));
  if (program.statements.length + added.length > 1000) {
    throw new Error(t("error.visualProgramLimit"));
  }
  return { ...program, statements: [...program.statements, ...added] };
}

export function appendComment(
  program: ShellProgram,
  nodeId: string,
  text: string,
  t: Translator["t"]
): ShellProgram {
  if (program.statements.length >= 1000) {
    throw new Error(t("error.visualProgramLimit"));
  }
  return {
    ...program,
    statements: [...program.statements, { type: "comment", nodeId, text }]
  };
}

export function connectTopLevelNodes(
  program: ShellProgram,
  sourceId: string,
  targetId: string,
  connection: VisualConnection,
  nodeId: string,
  t: Translator["t"]
): ShellProgram {
  if (sourceId === targetId) throw new Error(t("error.selfConnection"));
  const sourceIndex = program.statements.findIndex((node) => node.nodeId === sourceId);
  const targetIndex = program.statements.findIndex((node) => node.nodeId === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw new Error(t("error.topLevelConnection"));
  }
  const source = program.statements[sourceIndex]!;
  const target = program.statements[targetIndex]!;
  const combined = createConnection(source, target, connection, nodeId, t);
  const insertionIndex = Math.min(sourceIndex, targetIndex);
  const remaining = program.statements.filter((_, index) => index !== sourceIndex && index !== targetIndex);
  remaining.splice(insertionIndex, 0, combined);
  return { ...program, statements: remaining };
}

export function deleteShellNode(
  program: ShellProgram,
  nodeId: string,
  t: Translator["t"]
): ShellProgram {
  let found = false;
  const statements = program.statements.flatMap((node) => {
    const updated = removeNode(node, nodeId, () => { found = true; });
    return updated === null ? [] : [updated];
  });
  if (!found) throw new Error(t("error.visualNodeNotFound", { nodeId }));
  if (statements.length === 0) {
    throw new Error(t("error.programNeedsStatement"));
  }
  return { ...program, statements };
}

function createConnection(
  source: ShellNode,
  target: ShellNode,
  connection: VisualConnection,
  nodeId: string,
  t: Translator["t"]
): ShellNode {
  if (connection === "sequence") {
    const items = [...sequenceItems(source), ...sequenceItems(target)];
    if (items.length > 1000) throw new Error(t("error.sequenceLimit"));
    return { type: "sequence", nodeId, separator: "newline", items };
  }
  if (connection === "pipeline") {
    if (!isPipelineStage(source) || !isPipelineStage(target)) {
      throw new Error(t("error.pipelineNodeTypes"));
    }
    return { type: "pipeline", nodeId, operator: "|", stages: [source, target] };
  }
  if (!isBooleanOperand(source) || !isBooleanOperand(target)) {
    throw new Error(t("error.booleanNodeTypes"));
  }
  return {
    type: "boolean-chain",
    nodeId,
    operator: connection === "and" ? "&&" : "||",
    left: source,
    right: target
  };
}

function sequenceItems(node: ShellNode): ShellSequenceItem[] {
  return node.type === "sequence" ? node.items : [node];
}

function removeNode(
  node: ShellNode,
  nodeId: string,
  markFound: () => void
): ShellNode | null {
  if (node.nodeId === nodeId) {
    markFound();
    return null;
  }
  const removeList = (nodes: ShellNode[]): ShellNode[] =>
    nodes.flatMap((item) => {
      const updated = removeNode(item, nodeId, markFound);
      return updated === null ? [] : [updated];
    });

  switch (node.type) {
    case "command":
    case "assignment":
    case "comment":
    case "raw-code":
      return node;
    case "redirect": {
      const subject = removeNode(node.subject, nodeId, markFound);
      return subject?.type === "command" ? { ...node, subject } : null;
    }
    case "pipeline": {
      const stages = node.stages.flatMap((stage) => {
        const updated = removeNode(stage, nodeId, markFound);
        return updated !== null && isPipelineStage(updated) ? [updated] : [];
      });
      if (stages.length === 0) return null;
      if (stages.length === 1) return stages[0]!;
      return { ...node, stages };
    }
    case "boolean-chain": {
      const left = removeNode(node.left, nodeId, markFound);
      const right = removeNode(node.right, nodeId, markFound);
      if (left === null && right === null) return null;
      if (left === null) return right !== null && isBooleanOperand(right) ? right : null;
      if (right === null) return isBooleanOperand(left) ? left : null;
      return isBooleanOperand(left) && isBooleanOperand(right) ? { ...node, left, right } : null;
    }
    case "sequence": {
      const items = removeList(node.items).flatMap((item) =>
        item.type === "sequence" ? item.items : [item]
      );
      if (items.length === 0) return null;
      if (items.length === 1) return items[0]!;
      return { ...node, items };
    }
    case "block": {
      const statements = removeList(node.statements);
      return statements.length === 0 ? null : { ...node, statements };
    }
    case "function": {
      const body = removeList(node.body);
      return body.length === 0 ? null : { ...node, body };
    }
    case "if": {
      const branches = node.branches.flatMap((branch) => {
        const condition = removeNode(branch.condition, nodeId, markFound);
        const body = removeList(branch.body);
        return condition !== null && isBooleanOperand(condition) && body.length > 0
          ? [{ condition, body }]
          : [];
      });
      const elseBody = node.elseBody === null ? null : removeList(node.elseBody);
      if (branches.length > 0) {
        return { ...node, branches, elseBody: elseBody?.length === 0 ? null : elseBody };
      }
      if (elseBody === null || elseBody.length === 0) return null;
      return { type: "block", nodeId: node.nodeId, mode: "group", statements: elseBody };
    }
    case "loop": {
      const condition = removeNode(node.condition, nodeId, markFound);
      const body = removeList(node.body);
      return condition !== null && isBooleanOperand(condition) && body.length > 0
        ? { ...node, condition, body }
        : null;
    }
    case "for": {
      const body = removeList(node.body);
      return body.length === 0 ? null : { ...node, body };
    }
    case "case": {
      const arms = node.arms.flatMap((arm) => {
        const body = removeList(arm.body);
        return body.length === 0 ? [] : [{ ...arm, body }];
      });
      return arms.length === 0 ? null : { ...node, arms };
    }
  }
}

function cloneWithFreshIds(
  node: ShellNode,
  createNodeId: (originalId: string) => string
): ShellNode {
  const nodeId = createNodeId(node.nodeId);
  const cloneList = (nodes: ShellNode[]) => nodes.map((item) => cloneWithFreshIds(item, createNodeId));
  switch (node.type) {
    case "command":
      return { ...node, nodeId, options: node.options.map((option) => ({ ...option })), arguments: node.arguments.map((argument) => ({ ...argument })) };
    case "assignment":
    case "comment":
    case "raw-code":
      return { ...node, nodeId };
    case "redirect":
      return {
        ...node,
        nodeId,
        subject: cloneWithFreshIds(node.subject, createNodeId) as typeof node.subject,
        redirections: node.redirections.map((redirection) => ({ ...redirection }))
      };
    case "pipeline":
      return {
        ...node,
        nodeId,
        stages: node.stages.map((stage) => cloneWithFreshIds(stage, createNodeId) as ShellPipelineStage)
      };
    case "boolean-chain":
      return {
        ...node,
        nodeId,
        left: cloneWithFreshIds(node.left, createNodeId) as ShellBooleanOperand,
        right: cloneWithFreshIds(node.right, createNodeId) as ShellBooleanOperand
      };
    case "sequence":
      return { ...node, nodeId, items: cloneList(node.items) as ShellSequenceItem[] };
    case "block":
      return { ...node, nodeId, statements: cloneList(node.statements) };
    case "function":
      return { ...node, nodeId, body: cloneList(node.body) };
    case "if":
      return {
        ...node,
        nodeId,
        branches: node.branches.map((branch) => ({
          condition: cloneWithFreshIds(branch.condition, createNodeId) as ShellBooleanOperand,
          body: cloneList(branch.body)
        })),
        elseBody: node.elseBody === null ? null : cloneList(node.elseBody)
      };
    case "loop":
      return {
        ...node,
        nodeId,
        condition: cloneWithFreshIds(node.condition, createNodeId) as ShellBooleanOperand,
        body: cloneList(node.body)
      };
    case "for":
      return { ...node, nodeId, values: node.values.map((value) => ({ ...value })), body: cloneList(node.body) };
    case "case":
      return {
        ...node,
        nodeId,
        word: { ...node.word },
        arms: node.arms.map((arm) => ({
          patterns: arm.patterns.map((pattern) => ({ ...pattern })),
          body: cloneList(arm.body)
        }))
      };
  }
}

function isPipelineStage(node: ShellNode): node is ShellPipelineStage {
  return node.type === "command" || node.type === "redirect" || node.type === "block";
}

function isBooleanOperand(node: ShellNode): node is ShellBooleanOperand {
  return isPipelineStage(node) || node.type === "pipeline";
}
