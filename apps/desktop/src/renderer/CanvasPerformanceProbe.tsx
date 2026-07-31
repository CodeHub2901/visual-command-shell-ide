// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { ProjectLayout, ShellProgram } from "@cmd-ide/contracts";
import { ShellProgramCanvas } from "./ShellProgramCanvas";

const NODE_COUNT = 1_000;
const COLUMNS = 40;

const program: ShellProgram = {
  schemaVersion: "1.4.0",
  dialect: "bash",
  statements: Array.from({ length: NODE_COUNT }, (_, index) => ({
    type: "command" as const,
    nodeId: `canvas-performance-${index}`,
    commandId: index % 2 === 0 ? "printf" : "echo",
    options: [],
    arguments: [{
      argumentId: "values",
      value: `line-${index}`,
      valueKind: "literal" as const
    }]
  }))
};

const layout: ProjectLayout = {
  nodes: program.statements.map((node, index) => ({
    nodeId: node.nodeId,
    x: (index % COLUMNS) * 230,
    y: Math.floor(index / COLUMNS) * 110
  })),
  viewport: { x: 40, y: 40, zoom: 0.5 }
};

export function CanvasPerformanceProbe() {
  return (
    <main className="canvas-performance-probe" data-performance-probe="canvas">
      <ShellProgramCanvas program={program} initialLayout={layout} />
    </main>
  );
}
