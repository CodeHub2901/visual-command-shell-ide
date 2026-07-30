import type { LanguageDiagnostic } from "@cmd-ide/contracts";

export function deduplicateLanguageDiagnostics(
  diagnostics: LanguageDiagnostic[]
): LanguageDiagnostic[] {
  const unique = new Map<string, LanguageDiagnostic>();
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.range.start.line,
      diagnostic.range.start.character,
      diagnostic.range.end.line,
      diagnostic.range.end.character,
      diagnostic.code ?? "",
      diagnostic.message
    ].join(":");
    const existing = unique.get(key);
    if (existing === undefined || sourcePriority(diagnostic.source) > sourcePriority(existing.source)) {
      unique.set(key, diagnostic);
    }
  }
  return [...unique.values()];
}

function sourcePriority(source: string | null): number {
  return source?.toLowerCase() === "shellcheck" ? 2 : 1;
}
