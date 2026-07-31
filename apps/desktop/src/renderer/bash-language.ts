// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { CommandSpec } from "@cmd-ide/contracts";
import type { Translator } from "./i18n";

export type BashCompletionCandidate = {
  kind: "command" | "option";
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
};

export type BashHoverDetails = {
  title: string;
  summary: string;
  risk: string;
  compatibility: string;
};

export function completionCandidates(
  linePrefix: string,
  commands: CommandSpec[],
  { t }: Pick<Translator, "t">
): BashCompletionCandidate[] {
  const segment = currentCommandSegment(linePrefix);
  const tokens = segment.trimStart().split(/\s+/).filter(Boolean);
  const endsWithSpace = /\s$/.test(segment);
  if (tokens.length === 0 || tokens.length === 1 && !endsWithSpace) {
    const query = tokens[0]?.toLowerCase() ?? "";
    return commands
      .filter((command) =>
        command.executable.toLowerCase().startsWith(query)
        || command.displayName.toLowerCase().startsWith(query))
      .slice(0, 100)
      .map((command) => ({
        kind: "command",
        label: command.executable,
        insertText: command.executable,
        detail: `${command.category} · ${command.availability}`,
        documentation: `${command.summary}\n\n${t("editor.compatibility", {
          compatibility: command.compatibility.status
        })}`
      }));
  }

  const command = commands.find((candidate) =>
    candidate.executable === tokens[0] || candidate.id === tokens[0]);
  if (command === undefined) return [];
  const activeToken = endsWithSpace ? "" : tokens.at(-1) ?? "";
  const used = new Set(tokens.slice(1));
  return command.options
    .flatMap((option) => option.flags.map((flag) => ({ option, flag })))
    .filter(({ flag }) => !used.has(flag) && (activeToken === "" || flag.startsWith(activeToken)))
    .slice(0, 100)
    .map(({ option, flag }) => ({
      kind: "option",
      label: flag,
      insertText: option.takesValue ? `${flag} \${1:${option.valueName}}` : flag,
      detail: t("editor.optionDetail", {
        command: command.executable,
        value: option.takesValue ? ` · ${option.valueName}` : ""
      }),
      documentation: option.description
    }));
}

export function hoverDetails(
  word: string,
  commands: CommandSpec[],
  { t }: Pick<Translator, "t">
): BashHoverDetails | null {
  const command = commands.find((candidate) =>
    candidate.executable === word || candidate.id === word);
  if (command === undefined) return null;
  return {
    title: command.displayName,
    summary: command.summary,
    risk: command.riskTags.join(", ") || t("common.none"),
    compatibility: `${command.compatibility.status}: ${command.compatibility.note}`
  };
}

function currentCommandSegment(linePrefix: string): string {
  let start = 0;
  for (let index = 0; index < linePrefix.length; index += 1) {
    const character = linePrefix[index];
    if (character === "|" || character === ";" || character === "&") start = index + 1;
  }
  return linePrefix.slice(start);
}
