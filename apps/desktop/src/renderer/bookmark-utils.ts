// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { ProjectParameter, ShellProgram } from "@cmd-ide/contracts";

const SENSITIVE_NAME = /(api_?key|access_?token|token|password|passwd|secret)/i;

export function mergeBookmarkParameters(
  program: ShellProgram,
  existing: ProjectParameter[]
): ProjectParameter[] {
  const parameters = new Map(existing.map((parameter) => [parameter.name, parameter]));
  for (const name of collectVariablePlaceholders(program)) {
    if (parameters.has(name)) continue;
    parameters.set(name, {
      name,
      description: "",
      required: true,
      sensitive: SENSITIVE_NAME.test(name),
      defaultValue: null
    });
  }
  return [...parameters.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function collectVariablePlaceholders(value: unknown): Set<string> {
  const names = new Set<string>();
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (candidate === null || typeof candidate !== "object") return;
    const record = candidate as Record<string, unknown>;
    if (record.valueKind === "variable" && typeof record.value === "string") {
      names.add(record.value);
    }
    if (record.targetKind === "variable" && typeof record.target === "string") {
      names.add(record.target);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return names;
}
