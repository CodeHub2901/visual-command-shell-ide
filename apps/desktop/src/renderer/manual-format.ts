// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { CommandManual, CommandOption } from "@cmd-ide/contracts";

export type ManualBlock =
  | { kind: "text"; body: string }
  | { kind: "entry"; term: string; description: string };

const FLAG = String.raw`-{1,2}[A-Za-z0-9][\w-]*(?:\[=[^\]]+\])?(?:=[^\s,]+)?(?:\s+<[^>]+>)?`;
const FLAG_TERM = new RegExp(`^(${FLAG}(?:,\\s*${FLAG})*)(?:\\s+|$)(.*)$`);

function leadingSpaces(line: string): number {
  const match = /^( *)/.exec(line);
  return match?.[1]?.length ?? 0;
}

function nextContent(lines: readonly string[], from: number): string | null {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().length > 0) return line;
  }
  return null;
}

export function parseFlagTerm(line: string): { term: string; rest: string } | null {
  const trimmed = line.trim();
  const match = FLAG_TERM.exec(trimmed);
  if (match === null) return null;
  const term = (match[1] ?? "").trim();
  if (term.length === 0) return null;
  return { term, rest: (match[2] ?? "").trim() };
}

function isOptionDefinitionLine(line: string): boolean {
  const indent = leadingSpaces(line);
  if (indent > 12 || line.trim().length === 0) return false;
  return parseFlagTerm(line) !== null;
}

function isNamedTermLine(line: string, following: string | null): boolean {
  const trimmed = line.trim();
  const indent = leadingSpaces(line);
  if (trimmed.length === 0 || indent > 12 || indent < 3) return false;
  if (trimmed.length > 80 || trimmed.endsWith(".")) return false;
  if (parseFlagTerm(line) !== null) return false;
  const followingIndent = following === null ? -1 : leadingSpaces(following);
  return following !== null && followingIndent > indent;
}

function isTermLine(line: string, following: string | null): boolean {
  return isOptionDefinitionLine(line) || isNamedTermLine(line, following);
}

function termFrom(line: string): { term: string; inlineDescription: string } {
  const parsed = parseFlagTerm(line);
  if (parsed !== null) {
    return { term: parsed.term, inlineDescription: parsed.rest };
  }
  return { term: line.trim(), inlineDescription: "" };
}

export function splitManualBlocks(body: string): ManualBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ManualBlock[] = [];
  let index = 0;

  const pushText = (value: string): void => {
    const trimmed = value.replace(/^\n+/, "").replace(/\n+$/, "");
    if (trimmed.length > 0) blocks.push({ kind: "text", body: trimmed });
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }
    if (isTermLine(line, nextContent(lines, index + 1))) {
      const parsed = termFrom(line);
      const termIndent = leadingSpaces(line);
      index += 1;
      const description: string[] = [];
      if (parsed.inlineDescription.length > 0) description.push(parsed.inlineDescription);
      while (index < lines.length) {
        const next = lines[index] ?? "";
        const nextTrim = next.trim();
        if (nextTrim.length === 0) {
          let peek = index + 1;
          while (peek < lines.length && (lines[peek] ?? "").trim().length === 0) peek += 1;
          const following = lines[peek] ?? "";
          if (following.length === 0 || isTermLine(following, nextContent(lines, peek + 1))) break;
          index += 1;
          continue;
        }
        if (isTermLine(next, nextContent(lines, index + 1))) break;
        if (leadingSpaces(next) >= termIndent) {
          description.push(nextTrim);
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({
        kind: "entry",
        term: parsed.term,
        description: description.join(" ").replace(/\s+/g, " ").trim()
      });
      continue;
    }
    const text: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim().length > 0 && isTermLine(current, nextContent(lines, index + 1))) {
        break;
      }
      text.push(current);
      index += 1;
    }
    pushText(text.join("\n"));
  }
  return blocks;
}

function optionIdFromTerm(term: string): string {
  const longFlag = /--([A-Za-z0-9][\w-]*)/.exec(term);
  if (longFlag?.[1] !== undefined) return longFlag[1];
  const shortFlag = /^-([A-Za-z0-9])/.exec(term);
  const fallback = term.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  return shortFlag?.[1] ?? (fallback.length > 0 ? fallback : "option");
}

function flagsFromTerm(term: string): string[] {
  return term
    .split(",")
    .map((part) => part.trim().replace(/\s+<[^>]+>$/, "").replace(/\[=.+\]$/, "").replace(/=[^\s]+$/, ""))
    .filter((flag) => /^--?[A-Za-z0-9][\w-]*$/.test(flag));
}

function valueNameFromTerm(term: string): string | null {
  const named = /<([^>]+)>/.exec(term) ?? /\[=([^\]>]+)\]/.exec(term) ?? /=([^\s,]+)/.exec(term);
  return named?.[1]?.replace(/^<|>$/g, "") ?? null;
}

export function optionsFromManual(sections: CommandManual["sections"]): CommandOption[] {
  const preferred = sections.filter((section) => /^(options|help)$/i.test(section.heading));
  const source = preferred.length > 0 ? preferred : sections;
  const options: CommandOption[] = [];
  const seenFlags = new Set<string>();
  const seenIds = new Set<string>();
  for (const section of source) {
    for (const block of splitManualBlocks(section.body)) {
      if (block.kind !== "entry") continue;
      const flags = flagsFromTerm(block.term);
      if (flags.length === 0) continue;
      if (flags.some((flag) => seenFlags.has(flag))) continue;
      const valueName = valueNameFromTerm(block.term);
      let id = optionIdFromTerm(block.term);
      if (seenIds.has(id)) id = `man-${id}`;
      seenIds.add(id);
      for (const flag of flags) seenFlags.add(flag);
      options.push({
        id,
        flags,
        description: block.description.length > 0 ? block.description : block.term,
        takesValue: valueName !== null,
        valueName,
        repeatable: false,
        combinable: flags.some((flag) => /^-[A-Za-z0-9]$/.test(flag)) && valueName === null,
        conflictsWith: []
      });
    }
  }
  return options;
}

export function formatOptionDescription(description: string): { text: string; values: string[] } {
  const match = /^(.*?)\s*Possible values:\s*(.*)$/isu.exec(description.trim());
  if (match === null) return { text: description, values: [] };
  const values = (match[2] ?? "")
    .split(/•|,/)
    .map((value) => value.trim().replace(/^[•\s]+/, ""))
    .filter((value) => value.length > 0);
  return { text: (match[1] ?? "").trim(), values };
}

export function mergeCommandOptions(
  catalogOptions: readonly CommandOption[],
  manualOptions: readonly CommandOption[]
): CommandOption[] {
  const knownFlags = new Set(catalogOptions.flatMap((option) => option.flags));
  const knownIds = new Set(catalogOptions.map((option) => option.id));
  const extra: CommandOption[] = [];
  for (const option of manualOptions) {
    if (option.flags.some((flag) => knownFlags.has(flag))) continue;
    let id = option.id;
    if (knownIds.has(id)) id = `man-${id}`;
    knownIds.add(id);
    for (const flag of option.flags) knownFlags.add(flag);
    extra.push({ ...option, id });
  }
  return [...catalogOptions, ...extra];
}
