// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type NodeChange,
  type Viewport
} from "@xyflow/react";
import type { ProjectLayout, ShellProgram } from "@cmd-ide/contracts";
import { buildShellGraph } from "./shell-graph";
import {
  appendComment,
  connectTopLevelNodes,
  deleteShellNode,
  type VisualConnection
} from "./shell-mutations";
import { useI18n } from "./i18n";

export function ShellProgramCanvas({
  program,
  initialLayout,
  onLayoutChange,
  onProgramChange,
  onEditError
}: {
  program: ShellProgram;
  initialLayout?: ProjectLayout | undefined;
  onLayoutChange?: ((layout: ProjectLayout) => void) | undefined;
  onProgramChange?: ((program: ShellProgram) => void) | undefined;
  onEditError?: ((message: string) => void) | undefined;
}) {
  const i18n = useI18n();
  const { plural, t } = i18n;
  const initialLayoutRef = useRef(initialLayout);
  const editable = onProgramChange !== undefined;
  const graph = useMemo(
    () => buildShellGraph(program, initialLayoutRef.current?.nodes ?? [], i18n),
    [i18n, program]
  );
  const [nodes, setNodes] = useState<Node[]>(() => flowNodes(graph));
  const [viewport, setViewport] = useState<Viewport>(
    initialLayoutRef.current?.viewport ?? { x: 0, y: 0, zoom: 1 }
  );
  const [connection, setConnection] = useState<VisualConnection>("sequence");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  useEffect(() => {
    setNodes(flowNodes(
      graph,
      new Set(program.statements.map((node) => node.nodeId)),
      editable
    ));
  }, [editable, graph, program.statements]);

  useEffect(() => {
    onLayoutChange?.({
      nodes: nodes.map((node) => ({ nodeId: node.id, x: node.position.x, y: node.position.y })),
      viewport
    });
  }, [nodes, onLayoutChange, viewport]);

  const handleNodesChange = (changes: NodeChange<Node>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  };

  const handleSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    const nextIds = selected.map((node) => node.id);
    setSelectedNodeIds((current) =>
      current.length === nextIds.length && current.every((nodeId, index) => nodeId === nextIds[index])
        ? current
        : nextIds
    );
  }, []);

  const applyEdit = (edit: () => ShellProgram) => {
    try {
      onProgramChange?.(edit());
    } catch (error: unknown) {
      onEditError?.(error instanceof Error ? error.message : t("canvas.editFailed"));
    }
  };

  return (
    <section className="shell-canvas" aria-label={t("canvas.label")}>
      <div className="shell-canvas-heading">
        <strong>{t("canvas.title")}</strong>
        <span>{plural(
          { one: "canvas.nodes.one", other: "canvas.nodes.other" },
          nodes.length
        )}</span>
      </div>
      {editable && (
        <div className="shell-canvas-toolbar">
          <label>
            {t("canvas.connectAs")}
            <select value={connection} onChange={(event) => setConnection(event.currentTarget.value as VisualConnection)}>
              <option value="sequence">{t("canvas.nextLine")}</option>
              <option value="pipeline">{t("canvas.pipeline")}</option>
              <option value="and">{t("canvas.onSuccess")}</option>
              <option value="or">{t("canvas.onFailure")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => applyEdit(() => appendComment(
              program,
              `comment-${crypto.randomUUID()}`,
              t("canvas.commentText"),
              t
            ))}
          >
            {t("canvas.addComment")}
          </button>
          <button
            type="button"
            disabled={selectedNodeIds.length !== 1}
            onClick={() => {
              const nodeId = selectedNodeIds[0];
              if (nodeId !== undefined) applyEdit(() => deleteShellNode(program, nodeId, t));
            }}
          >
            {t("canvas.deleteSelected")}
          </button>
          <span>{t("canvas.connectionHelp")}</span>
        </div>
      )}
      <div className="shell-canvas-surface">
        <ReactFlow
          nodes={nodes}
          edges={graph.edges.map((edge) => ({ ...edge, type: "smoothstep" }))}
          onNodesChange={handleNodesChange}
          onSelectionChange={handleSelectionChange}
          onConnect={({ source, target }) => {
            if (source === null || target === null) return;
            applyEdit(() => connectTopLevelNodes(
              program,
              source,
              target,
              connection,
              `${connection}-${crypto.randomUUID()}`,
              t
            ));
          }}
          onMoveEnd={(_event, nextViewport) => setViewport(nextViewport)}
          defaultViewport={viewport}
          fitView={initialLayoutRef.current === undefined}
          fitViewOptions={{ padding: 0.25 }}
          nodesConnectable={editable}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background color="#35445d" gap={18} size={1} />
          <MiniMap pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}

function flowNodes(
  graph: ReturnType<typeof buildShellGraph>,
  topLevelIds = new Set<string>(),
  editable = false
): Node[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: { label: node.label },
    className: `shell-flow-node ${node.kind}`,
    draggable: true,
    selectable: true,
    connectable: editable && topLevelIds.has(node.id)
  }));
}
