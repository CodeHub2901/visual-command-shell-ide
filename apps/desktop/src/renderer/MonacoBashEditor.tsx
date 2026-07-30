import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker&inline";
import type {
  CommandSpec,
  LanguageDiagnostic,
  LanguageDiagnosticsEvent,
  ShellDiagnostic
} from "@cmd-ide/contracts";
import { completionCandidates, hoverDetails } from "./bash-language";
import { deduplicateLanguageDiagnostics } from "./language-diagnostics";
import { useI18n } from "./i18n";

type WorkerScope = typeof globalThis & {
  MonacoEnvironment?: { getWorker: () => Worker };
};

(globalThis as WorkerScope).MonacoEnvironment = {
  getWorker: () => new EditorWorker()
};
loader.config({ monaco });

export function MonacoBashEditor({ value, onChange, commands, diagnostics }: {
  value: string;
  onChange: (value: string) => void;
  commands: CommandSpec[];
  diagnostics: ShellDiagnostic[];
}) {
  const { plural, t } = useI18n();
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const languageSessionRef = useRef<string | null>(null);
  const languageVersionRef = useRef(1);
  const sourceRef = useRef(value);
  const lastSentSourceRef = useRef(value);
  const [languageDiagnostics, setLanguageDiagnostics] = useState<LanguageDiagnostic[]>([]);
  const [shellCheckDiagnostics, setShellCheckDiagnostics] = useState<LanguageDiagnostic[]>([]);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [formattedPreview, setFormattedPreview] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState<"shellcheck" | "shfmt" | null>(null);
  const [languageStatus, setLanguageStatus] = useState<"connecting" | "connected" | "fallback">(
    "connecting"
  );
  sourceRef.current = value;

  useEffect(() => {
    let active = true;
    const unsubscribe = window.commandIde.language.onDiagnostics(
      (event: LanguageDiagnosticsEvent) => {
        if (active && event.sessionId === languageSessionRef.current
          && (event.version === null || event.version >= languageVersionRef.current)) {
          setLanguageDiagnostics(event.diagnostics);
        }
      }
    );
    void window.commandIde.language.open(sourceRef.current).then(async (result) => {
      if (result.status === "unavailable") {
        if (active) setLanguageStatus("fallback");
        return;
      }
      if (!active) {
        await window.commandIde.language.close(result.sessionId).catch(() => undefined);
        return;
      }
      languageSessionRef.current = result.sessionId;
      languageVersionRef.current = 1;
      lastSentSourceRef.current = sourceRef.current;
      setLanguageStatus("connected");
      if (sourceRef.current !== value) {
        languageVersionRef.current += 1;
        await window.commandIde.language.change(
          result.sessionId,
          sourceRef.current,
          languageVersionRef.current
        ).catch(() => setLanguageStatus("fallback"));
      }
    }, () => {
      if (active) setLanguageStatus("fallback");
    });
    return () => {
      active = false;
      unsubscribe();
      const sessionId = languageSessionRef.current;
      languageSessionRef.current = null;
      if (sessionId !== null) {
        void window.commandIde.language.close(sessionId).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const sessionId = languageSessionRef.current;
    if (sessionId === null || value === lastSentSourceRef.current) return;
    const timer = window.setTimeout(() => {
      const currentSessionId = languageSessionRef.current;
      if (currentSessionId === null || sourceRef.current === lastSentSourceRef.current) return;
      languageVersionRef.current += 1;
      const version = languageVersionRef.current;
      const source = sourceRef.current;
      lastSentSourceRef.current = source;
      void window.commandIde.language.change(currentSessionId, source, version).catch(() => {
        if (languageSessionRef.current === currentSessionId) {
          languageSessionRef.current = null;
          setLanguageStatus("fallback");
          setLanguageDiagnostics([]);
        }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    setShellCheckDiagnostics([]);
    setFormattedPreview(null);
    setToolMessage(null);
  }, [value]);

  useEffect(() => {
    const completion = monaco.languages.registerCompletionItemProvider("shell", {
      triggerCharacters: ["-"],
      provideCompletionItems: async (model, position) => {
        const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };
        const catalogSuggestions: monaco.languages.CompletionItem[] =
          completionCandidates(linePrefix, commands, { t }).map((candidate) => ({
            label: candidate.label,
            kind: candidate.kind === "command"
              ? monaco.languages.CompletionItemKind.Function
              : monaco.languages.CompletionItemKind.Property,
            insertText: candidate.insertText,
            ...(candidate.insertText.includes("${") ? {
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            } : {}),
            detail: candidate.detail,
            documentation: { value: candidate.documentation },
            range
          }));
        const sessionId = languageSessionRef.current;
        if (sessionId === null) return { suggestions: catalogSuggestions };
        try {
          const result = await window.commandIde.language.completion(
            sessionId,
            position.lineNumber - 1,
            position.column - 1
          );
          const serverSuggestions: monaco.languages.CompletionItem[] = result.items.map((item) => ({
            label: item.label,
            kind: Math.max(0, item.kind - 1) as monaco.languages.CompletionItemKind,
            insertText: item.insertText,
            ...(item.snippet ? {
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            } : {}),
            ...(item.detail === null ? {} : { detail: item.detail }),
            ...(item.documentation === null
              ? {}
              : { documentation: { value: item.documentation } }),
            range
          }));
          return { suggestions: [...serverSuggestions, ...catalogSuggestions] };
        } catch {
          return { suggestions: catalogSuggestions };
        }
      }
    });
    const hover = monaco.languages.registerHoverProvider("shell", {
      provideHover: async (model, position) => {
        const sessionId = languageSessionRef.current;
        if (sessionId !== null) {
          try {
            const result = await window.commandIde.language.hover(
              sessionId,
              position.lineNumber - 1,
              position.column - 1
            );
            if (result.contents !== null) {
              return { contents: [{ value: result.contents }] };
            }
          } catch {
            // The curated catalog remains available when the optional server fails.
          }
        }
        const word = model.getWordAtPosition(position);
        if (word === null) return null;
        const details = hoverDetails(word.word, commands, { t });
        if (details === null) return null;
        return {
          range: new monaco.Range(
            position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [
            { value: `**${details.title}** — ${details.summary}` },
            { value: t("editor.riskTags", { risk: details.risk }) },
            { value: t("editor.compatibility", { compatibility: details.compatibility }) }
          ]
        };
      }
    });
    const symbols = monaco.languages.registerDocumentSymbolProvider("shell", {
      displayName: t("editor.languageServerName"),
      provideDocumentSymbols: async () => {
        const sessionId = languageSessionRef.current;
        if (sessionId === null) return [];
        try {
          const result = await window.commandIde.language.symbols(sessionId);
          return result.symbols.map((symbol): monaco.languages.DocumentSymbol => ({
            name: symbol.name,
            detail: symbol.detail ?? "",
            kind: Math.max(0, symbol.kind - 1) as monaco.languages.SymbolKind,
            tags: [],
            ...(symbol.containerName === null ? {} : { containerName: symbol.containerName }),
            range: toMonacoRange(symbol.range),
            selectionRange: toMonacoRange(symbol.selectionRange)
          }));
        } catch {
          return [];
        }
      }
    });
    const references = monaco.languages.registerReferenceProvider("shell", {
      provideReferences: async (model, position) => {
        const sessionId = languageSessionRef.current;
        if (sessionId === null) return [];
        try {
          const result = await window.commandIde.language.references(
            sessionId,
            position.lineNumber - 1,
            position.column - 1
          );
          return result.references.map((reference) => ({
            uri: model.uri,
            range: toMonacoRange(reference.range)
          }));
        } catch {
          return [];
        }
      }
    });
    return () => {
      completion.dispose();
      hover.dispose();
      symbols.dispose();
      references.dispose();
    };
  }, [commands, t]);

  useEffect(() => {
    const model = modelRef.current;
    if (model === null) return;
    applyDiagnosticMarkers(model, diagnostics, t("editor.parserSource"));
  }, [diagnostics, t, value]);

  useEffect(() => {
    const model = modelRef.current;
    if (model === null) return;
    applyExternalDiagnosticMarkers(
      model,
      "command-ide-analysis",
      deduplicateLanguageDiagnostics([...languageDiagnostics, ...shellCheckDiagnostics])
    );
  }, [languageDiagnostics, shellCheckDiagnostics, value]);

  const runShellCheck = async () => {
    const checkedSource = sourceRef.current;
    setToolBusy("shellcheck");
    setToolMessage(null);
    try {
      const result = await window.commandIde.tooling.shellcheck(checkedSource);
      if (checkedSource !== sourceRef.current) return;
      if (result.status === "completed") {
        setShellCheckDiagnostics(result.diagnostics);
        setToolMessage(plural(
          { one: "editor.shellcheckCount.one", other: "editor.shellcheckCount.other" },
          result.diagnostics.length
        ));
      } else {
        setShellCheckDiagnostics([]);
        setToolMessage(result.reason);
      }
    } catch {
      if (checkedSource === sourceRef.current) setToolMessage(t("editor.shellcheckFailed"));
    } finally {
      setToolBusy(null);
    }
  };

  const previewShfmt = async () => {
    const checkedSource = sourceRef.current;
    setToolBusy("shfmt");
    setToolMessage(null);
    try {
      const result = await window.commandIde.tooling.shfmt(checkedSource);
      if (checkedSource !== sourceRef.current) return;
      if (result.status === "formatted") {
        setFormattedPreview(result.changed ? result.source : null);
        setToolMessage(result.changed ? t("editor.shfmtReview") : t("editor.alreadyFormatted"));
      } else {
        setFormattedPreview(null);
        setToolMessage(result.reason);
      }
    } catch {
      if (checkedSource === sourceRef.current) setToolMessage(t("editor.shfmtFailed"));
    } finally {
      setToolBusy(null);
    }
  };

  return (
    <div className="monaco-editor-shell">
      <div className="monaco-bash-editor" aria-label={t("editor.label")}>
        <div className="editor-tool-actions">
          <button type="button" disabled={toolBusy !== null} onClick={() => void runShellCheck()}>
            {toolBusy === "shellcheck" ? t("editor.checking") : t("editor.runShellcheck")}
          </button>
          <button type="button" disabled={toolBusy !== null} onClick={() => void previewShfmt()}>
            {toolBusy === "shfmt" ? t("editor.formatting") : t("editor.previewShfmt")}
          </button>
          {toolMessage !== null && <span role="status">{toolMessage}</span>}
        </div>
        <Editor
        height="220px"
        language="shell"
        theme="vs-dark"
        value={value}
        onMount={(editor) => {
          modelRef.current = editor.getModel();
          if (modelRef.current !== null) {
            applyDiagnosticMarkers(modelRef.current, diagnostics, t("editor.parserSource"));
            applyExternalDiagnosticMarkers(
              modelRef.current,
              "command-ide-analysis",
              deduplicateLanguageDiagnostics([...languageDiagnostics, ...shellCheckDiagnostics])
            );
          }
        }}
        onChange={(nextValue) => onChange((nextValue ?? "").slice(0, 1_000_000))}
        loading={<span>{t("editor.loading")}</span>}
        options={{
          accessibilitySupport: "auto",
          automaticLayout: true,
          contextmenu: false,
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize: 12,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          padding: { top: 10, bottom: 10 },
          quickSuggestions: { comments: false, other: true, strings: false },
          renderValidationDecorations: "on",
          scrollBeyondLastLine: false,
          suggestOnTriggerCharacters: true,
          tabSize: 2,
          wordWrap: "on"
        }}
        />
        <span className={`language-server-status ${languageStatus}`} role="status">
          {languageStatus === "connected"
            ? t("editor.languageConnected")
            : languageStatus === "connecting"
              ? t("editor.languageConnecting")
              : t("editor.catalogAssistance")}
        </span>
      </div>
      {formattedPreview !== null && (
        <section className="shfmt-preview" aria-label={t("editor.shfmtPreviewLabel")}>
          <div>
            <strong>{t("editor.shfmtPreview")}</strong>
            <button type="button" onClick={() => onChange(formattedPreview)}>{t("editor.applyFormatting")}</button>
            <button type="button" onClick={() => setFormattedPreview(null)}>{t("editor.discard")}</button>
          </div>
          <textarea readOnly value={formattedPreview} aria-label={t("editor.formattedPreview")} />
        </section>
      )}
    </div>
  );
}

function toMonacoRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}

function applyExternalDiagnosticMarkers(
  model: monaco.editor.ITextModel,
  owner: string,
  diagnostics: LanguageDiagnostic[]
) {
  monaco.editor.setModelMarkers(model, owner, diagnostics.map((diagnostic) => {
    const startLine = Math.min(model.getLineCount(), diagnostic.range.start.line + 1);
    const endLine = Math.min(model.getLineCount(), diagnostic.range.end.line + 1);
    return {
      severity: diagnostic.severity === "error"
        ? monaco.MarkerSeverity.Error
        : diagnostic.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : diagnostic.severity === "hint"
            ? monaco.MarkerSeverity.Hint
            : monaco.MarkerSeverity.Info,
      message: diagnostic.message,
      startLineNumber: startLine,
      startColumn: Math.min(model.getLineMaxColumn(startLine), diagnostic.range.start.character + 1),
      endLineNumber: endLine,
      endColumn: Math.min(model.getLineMaxColumn(endLine), Math.max(1, diagnostic.range.end.character + 1)),
      ...(diagnostic.code === null ? {} : { code: diagnostic.code }),
      source: diagnostic.source ?? owner
    };
  }));
}

function applyDiagnosticMarkers(
  model: monaco.editor.ITextModel,
  diagnostics: ShellDiagnostic[],
  source: string
) {
  monaco.editor.setModelMarkers(model, "command-ide-parser", diagnostics.map((diagnostic) => {
    const start = model.getPositionAt(diagnostic.startOffset);
    const end = model.getPositionAt(Math.max(diagnostic.startOffset + 1, diagnostic.endOffset));
    return {
      severity: diagnostic.severity === "error"
        ? monaco.MarkerSeverity.Error
        : diagnostic.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
      message: `${diagnostic.code}: ${diagnostic.message}`,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      code: diagnostic.code,
      source
    };
  }));
}
