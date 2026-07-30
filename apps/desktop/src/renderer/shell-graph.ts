import type { ProjectLayout, ShellCommandNode, ShellNode, ShellProgram } from "@cmd-ide/contracts";
import type { Translator } from "./i18n";

export type ShellGraphNode = Readonly<{
  id: string;
  kind: ShellNode["type"];
  label: string;
  position: Readonly<{ x: number; y: number }>;
}>;

export type ShellGraphEdge = Readonly<{
  id: string;
  source: string;
  target: string;
  label: string;
}>;

export type ShellGraph = Readonly<{
  nodes: ShellGraphNode[];
  edges: ShellGraphEdge[];
}>;

export function buildShellGraph(
  program: ShellProgram,
  layoutNodes: ProjectLayout["nodes"],
  translator: Pick<Translator, "plural" | "t">
): ShellGraph {
  const { t } = translator;
  const positions = new Map(layoutNodes.map((node) => [node.nodeId, { x: node.x, y: node.y }]));
  const nodes: ShellGraphNode[] = [];
  const edges: ShellGraphEdge[] = [];
  let order = 0;

  const connect = (source: string, target: string, label: string) => {
    edges.push({ id: `edge-${edges.length}-${source}-${target}`, source, target, label });
  };

  const visitList = (items: ShellNode[], parent: string | null, relation: string, depth: number) => {
    let previous: string | null = null;
    for (const item of items) {
      visit(item, parent, relation, depth);
      if (previous !== null) connect(previous, item.nodeId, t("graph.edge.next"));
      previous = item.nodeId;
    }
  };

  const visit = (node: ShellNode, parent: string | null, relation: string, depth: number) => {
    const fallback = { x: depth * 240, y: order * 105 };
    nodes.push({
      id: node.nodeId,
      kind: node.type,
      label: nodeLabel(node, translator),
      position: positions.get(node.nodeId) ?? fallback
    });
    order += 1;
    if (parent !== null) connect(parent, node.nodeId, relation);

    switch (node.type) {
      case "command":
      case "assignment":
      case "comment":
      case "raw-code":
        return;
      case "redirect":
        visit(node.subject, node.nodeId, t("graph.edge.subject"), depth + 1);
        return;
      case "pipeline":
        visitList(node.stages, node.nodeId, t("graph.edge.stage"), depth + 1);
        return;
      case "boolean-chain":
        visit(node.left, node.nodeId, t("graph.edge.left"), depth + 1);
        visit(node.right, node.nodeId, t("graph.edge.right"), depth + 1);
        return;
      case "sequence":
        visitList(node.items, node.nodeId, t("graph.edge.item"), depth + 1);
        return;
      case "block":
        visitList(
          node.statements,
          node.nodeId,
          node.mode === "group" ? t("graph.edge.group") : t("graph.edge.subshell"),
          depth + 1
        );
        return;
      case "function":
        visitList(node.body, node.nodeId, t("graph.edge.body"), depth + 1);
        return;
      case "if":
        node.branches.forEach((branch, index) => {
          visit(
            branch.condition,
            node.nodeId,
            index === 0 ? t("graph.edge.if") : t("graph.edge.elif", { number: index }),
            depth + 1
          );
          visitList(
            branch.body,
            node.nodeId,
            index === 0 ? t("graph.edge.then") : t("graph.edge.thenNumber", { number: index }),
            depth + 1
          );
        });
        if (node.elseBody !== null) {
          visitList(node.elseBody, node.nodeId, t("graph.edge.else"), depth + 1);
        }
        return;
      case "loop":
        visit(node.condition, node.nodeId, t("graph.edge.condition", {
          mode: node.mode === "while" ? t("graph.mode.while") : t("graph.mode.until")
        }), depth + 1);
        visitList(node.body, node.nodeId, t("graph.edge.body"), depth + 1);
        return;
      case "for":
        visitList(node.body, node.nodeId, t("graph.edge.body"), depth + 1);
        return;
      case "case":
        node.arms.forEach((arm, index) => visitList(
          arm.body,
          node.nodeId,
          t("graph.edge.arm", {
            number: index + 1,
            patterns: arm.patterns.map((pattern) => pattern.value).join("|")
          }),
          depth + 1
        ));
    }
  };

  visitList(program.statements, null, "statement", 0);
  return { nodes, edges };
}

export function replaceCommandNode(
  program: ShellProgram,
  nodeId: string,
  replacement: ShellCommandNode,
  t: Translator["t"]
): ShellProgram {
  let replaced = false;

  const replaceList = (nodes: ShellNode[]): ShellNode[] => nodes.map(replaceNode);
  const replaceNode = (node: ShellNode): ShellNode => {
    if (node.nodeId === nodeId) {
      if (node.type !== "command") throw new Error(t("error.guidedCommandOnly"));
      replaced = true;
      return replacement;
    }
    switch (node.type) {
      case "command":
      case "assignment":
      case "comment":
      case "raw-code":
        return node;
      case "redirect":
        return { ...node, subject: replaceNode(node.subject) as ShellCommandNode };
      case "pipeline":
        return { ...node, stages: node.stages.map((stage) => replaceNode(stage) as typeof stage) };
      case "boolean-chain":
        return {
          ...node,
          left: replaceNode(node.left) as typeof node.left,
          right: replaceNode(node.right) as typeof node.right
        };
      case "sequence":
        return { ...node, items: replaceList(node.items) as typeof node.items };
      case "block":
        return { ...node, statements: replaceList(node.statements) };
      case "function":
        return { ...node, body: replaceList(node.body) };
      case "if":
        return {
          ...node,
          branches: node.branches.map((branch) => ({
            condition: replaceNode(branch.condition) as typeof branch.condition,
            body: replaceList(branch.body)
          })),
          elseBody: node.elseBody === null ? null : replaceList(node.elseBody)
        };
      case "loop":
        return {
          ...node,
          condition: replaceNode(node.condition) as typeof node.condition,
          body: replaceList(node.body)
        };
      case "for":
        return { ...node, body: replaceList(node.body) };
      case "case":
        return {
          ...node,
          arms: node.arms.map((arm) => ({ ...arm, body: replaceList(arm.body) }))
        };
    }
  };

  const statements = replaceList(program.statements);
  if (!replaced) throw new Error(t("error.commandNodeNotFound", { nodeId }));
  return { ...program, statements };
}

function nodeLabel(
  node: ShellNode,
  { plural, t }: Pick<Translator, "plural" | "t">
): string {
  switch (node.type) {
    case "command": {
      const suffix = [
        ...node.options.flatMap((option) => option.value === null
          ? [option.spelling]
          : [option.spelling, option.valueKind === "variable" ? `$${option.value}` : option.value]),
        ...node.arguments.map((argument) => argument.valueKind === "variable" ? `$${argument.value}` : argument.value)
      ].join(" ");
      return trimLabel(`$ ${node.commandId}${suffix.length === 0 ? "" : ` ${suffix}`}`);
    }
    case "redirect": return t("graph.redirect", {
      operators: node.redirections.map((value) => value.operator).join(" ")
    });
    case "pipeline": return t("graph.pipeline", { operator: node.operator });
    case "boolean-chain": return t("graph.boolean", { operator: node.operator });
    case "sequence": return node.separator === ";"
      ? t("graph.sequenceSemicolon")
      : t("graph.sequenceNewline");
    case "assignment": return trimLabel(`${node.exported ? "export " : ""}${node.name}=…`);
    case "block": return node.mode === "group" ? t("graph.groupedBlock") : t("graph.subshell");
    case "function": return t("graph.function", { name: node.name });
    case "if": return plural(
      { one: "graph.if.one", other: "graph.if.other" },
      node.branches.length
    );
    case "loop": return node.mode === "while" ? t("graph.while") : t("graph.until");
    case "for": return plural(
      { one: "graph.for.one", other: "graph.for.other" },
      node.values.length,
      { variable: node.variable }
    );
    case "case": return plural(
      { one: "graph.case.one", other: "graph.case.other" },
      node.arms.length
    );
    case "comment": return trimLabel(t("graph.comment", { text: node.text }));
    case "raw-code": return trimLabel(t("graph.raw", { reason: node.reason }));
  }
}

function trimLabel(value: string): string {
  return value.length <= 90 ? value : `${value.slice(0, 87)}…`;
}
