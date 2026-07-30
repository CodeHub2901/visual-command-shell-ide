import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiConnectionResult,
  AiModel,
  AiModelsResult,
  AiOperation,
  AiProposal,
  AiProvider,
  CredentialStatus
} from "@cmd-ide/contracts";
import { isRemoteAiEndpoint } from "./ai-utils";
import { useI18n, type MessageId, type Translator } from "./i18n";

type ModelsState =
  | { status: "loading" }
  | { status: "ready"; result: AiModelsResult }
  | { status: "error"; message: string };

type ProposalState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "proposed"; proposal: AiProposal }
  | { status: "message"; kind: "refused" | "failed"; message: string };

type CredentialState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: CredentialStatus }
  | { status: "error"; message: string };

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const OPENAI_ENDPOINT = "https://api.openai.com/v1";

const operations: ReadonlyArray<{ value: AiOperation; messageId: MessageId }> = [
  { value: "generateExample", messageId: "ai.operation.generateExample" },
  { value: "explain", messageId: "ai.operation.explain" },
  { value: "completeScript", messageId: "ai.operation.complete" },
  { value: "improveScript", messageId: "ai.operation.improve" },
  { value: "explainFailure", messageId: "ai.operation.explainFailure" }
];

export function AiAssistantView({
  currentSource,
  onApply
}: {
  currentSource: string | null;
  onApply: (proposal: AiProposal) => void;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<AiProvider>("ollama");
  const [endpoint, setEndpoint] = useState(OLLAMA_ENDPOINT);
  const [remoteConfirmed, setRemoteConfirmed] = useState(false);
  const [models, setModels] = useState<ModelsState>({ status: "loading" });
  const [model, setModel] = useState("");
  const [operation, setOperation] = useState<AiOperation>("generateExample");
  const [instruction, setInstruction] = useState(() => t("ai.defaultInstruction"));
  const [source, setSource] = useState(currentSource ?? "");
  const [failureMessage, setFailureMessage] = useState("");
  const [connection, setConnection] = useState<AiConnectionResult | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [proposal, setProposal] = useState<ProposalState>({ status: "idle" });
  const [credentials, setCredentials] = useState<CredentialState>({ status: "idle" });
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const credentialInput = useRef<HTMLInputElement>(null);

  const effectiveEndpoint = provider === "openai" ? OPENAI_ENDPOINT : endpoint;
  const remote = useMemo(
    () => provider === "ollama" && isRemoteAiEndpoint(endpoint),
    [endpoint, provider]
  );
  const endpointConfirmed = provider === "openai" || (remote && remoteConfirmed);
  const credentialConfigured = provider !== "openai"
    || (credentials.status === "ready" && credentials.result.configured);
  const credentialDeletionAvailable = provider === "openai"
    && credentials.status === "ready"
    && (credentials.result.configured || credentials.result.storage === "unavailable");

  useEffect(() => {
    if (currentSource !== null) setSource(currentSource);
  }, [currentSource]);

  const loadModels = () => {
    setModels({ status: "loading" });
    setConnection(null);
    void window.commandIde.ai.models({
      provider,
      endpoint: effectiveEndpoint,
      remoteEndpointConfirmed: endpointConfirmed
    }).then((result) => {
      setModels({ status: "ready", result });
      setModel((selected) => result.models.some((candidate) => candidate.id === selected)
        ? selected
        : (result.models[0]?.id ?? ""));
    }, (error: unknown) => {
      setModels({
        status: "error",
        message: messageFrom(error, t("ai.modelsFailed", { provider: providerName(provider) }))
      });
      setModel("");
    });
  };

  useEffect(() => {
    loadModels();
    setProposal({ status: "idle" });
    // Provider changes intentionally trigger a fresh provider-specific model list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const refreshCredentialStatus = () => {
    setCredentials({ status: "loading" });
    setCredentialMessage(null);
    void window.commandIde.credentials.status().then(
      (result) => setCredentials({ status: "ready", result }),
      (error: unknown) => setCredentials({
        status: "error",
        message: messageFrom(error, t("ai.credentialInspectFailed"))
      })
    );
  };

  useEffect(() => {
    if (provider === "openai") refreshCredentialStatus();
  }, [provider]);

  const storeCredential = () => {
    const input = credentialInput.current;
    if (input === null || input.value.length === 0 || credentialBusy) return;
    const credential = input.value;
    input.value = "";
    setCredentialBusy(true);
    setCredentialMessage(null);
    void window.commandIde.credentials.store(credential).then((result) => {
      setCredentials({ status: "ready", result });
      setCredentialMessage(result.storage === "session"
        ? t("ai.keySession")
        : t("ai.keyVault"));
    }, (error: unknown) => {
      setCredentialMessage(messageFrom(error, t("ai.keyStoreFailed")));
    }).finally(() => {
      if (credentialInput.current !== null) credentialInput.current.value = "";
      setCredentialBusy(false);
    });
  };

  const deleteCredential = () => {
    if (credentialBusy) return;
    setCredentialBusy(true);
    setCredentialMessage(null);
    void window.commandIde.credentials.delete().then((result) => {
      setCredentials({ status: "ready", result });
      setCredentialMessage(t("ai.keyRemoved"));
    }, (error: unknown) => {
      setCredentialMessage(messageFrom(error, t("ai.keyRemoveFailed")));
    }).finally(() => setCredentialBusy(false));
  };

  const check = (kind: "test" | "probe") => {
    setConnectionBusy(true);
    setConnection(null);
    const action = kind === "probe"
      ? window.commandIde.ai.probe({
          provider,
          endpoint: effectiveEndpoint,
          model,
          remoteEndpointConfirmed: endpointConfirmed
        })
      : window.commandIde.ai.test({
          provider,
          endpoint: effectiveEndpoint,
          remoteEndpointConfirmed: endpointConfirmed
        });
    void action.then(setConnection, (error: unknown) => {
      setConnection({
        status: "failed",
        reason: messageFrom(error, t("ai.checkFailed", { provider: providerName(provider) }))
      });
    }).finally(() => setConnectionBusy(false));
  };

  const needsSource = operation !== "generateExample";
  const canSubmit = model.length > 0
    && instruction.trim().length > 0
    && (!needsSource || source.trim().length > 0)
    && (operation !== "explainFailure" || failureMessage.trim().length > 0)
    && (!remote || remoteConfirmed)
    && credentialConfigured;

  const propose = () => {
    if (!canSubmit) return;
    setProposal({ status: "loading" });
    void window.commandIde.ai.propose({
      provider,
      endpoint: effectiveEndpoint,
      model,
      remoteEndpointConfirmed: endpointConfirmed,
      operation,
      instruction: instruction.trim(),
      source: source.trim().length === 0 ? null : source,
      failureMessage: failureMessage.trim().length === 0 ? null : failureMessage
    }).then((result) => {
      if (result.status === "proposed" && result.proposal !== null) {
        setProposal({ status: "proposed", proposal: result.proposal });
      } else {
        setProposal({
          status: "message",
          kind: result.status === "refused" ? "refused" : "failed",
          message: result.reason ?? t("ai.noProposal")
        });
      }
    }, (error: unknown) => {
      setProposal({
        status: "message",
        kind: "failed",
        message: messageFrom(error, t("ai.proposalFailed"))
      });
    });
  };

  return (
    <article className="ai-view">
      <p className="eyebrow">{t("ai.optional")}</p>
      <h2>{t("ai.title")}</h2>
      <p className="lede">{t("ai.description")}</p>

      <section className="ai-configuration">
        <label>
          {t("ai.provider")}
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.currentTarget.value as AiProvider);
              setConnection(null);
              setModel("");
            }}
          >
            <option value="ollama">{t("ai.ollamaOption")}</option>
            <option value="openai">{t("ai.openaiOption")}</option>
          </select>
        </label>

        {provider === "ollama" ? (
          <>
            <label className="ai-endpoint">
              {t("ai.ollamaEndpoint")}
              <input
                value={endpoint}
                maxLength={2000}
                spellCheck={false}
                onChange={(event) => {
                  setEndpoint(event.currentTarget.value);
                  setRemoteConfirmed(false);
                  setConnection(null);
                }}
              />
            </label>
            {remote && (
              <label className="ai-remote-confirmation">
                <input
                  type="checkbox"
                  checked={remoteConfirmed}
                  onChange={(event) => setRemoteConfirmed(event.currentTarget.checked)}
                />
                {t("ai.remoteConfirmation")}
              </label>
            )}
          </>
        ) : (
          <section className="ai-credentials">
            <p>{t("ai.credentialDescription", { endpoint: OPENAI_ENDPOINT })}</p>
            <label>
              {t("ai.apiKey")}
              <input
                ref={credentialInput}
                type="password"
                autoComplete="off"
                maxLength={4096}
                spellCheck={false}
                placeholder={t("ai.keyPlaceholder")}
              />
            </label>
            <div className="ai-buttons">
              <button type="button" disabled={credentialBusy} onClick={storeCredential}>
                {t("ai.storeKey")}
              </button>
              <button
                type="button"
                disabled={credentialBusy || !credentialDeletionAvailable}
                onClick={deleteCredential}
              >
                {t("ai.deleteKey")}
              </button>
              <button type="button" disabled={credentialBusy} onClick={refreshCredentialStatus}>
                {t("ai.refreshStatus")}
              </button>
            </div>
            <CredentialSummary state={credentials} />
            {credentialMessage !== null && <span className="ai-status">{credentialMessage}</span>}
          </section>
        )}

        <div className="ai-buttons">
          <button type="button" onClick={loadModels}>
            {provider === "ollama" ? t("ai.refreshInstalled") : t("ai.refreshCurated")}
          </button>
          <button
            type="button"
            disabled={connectionBusy || (remote && !remoteConfirmed) || !credentialConfigured}
            onClick={() => check("test")}
          >
            {t("ai.testConnection")}
          </button>
        </div>
        <ModelPicker provider={provider} state={models} value={model} onChange={setModel} />
        <button
          className="ai-probe"
          type="button"
          disabled={model.length === 0
            || connectionBusy
            || (remote && !remoteConfirmed)
            || !credentialConfigured}
          onClick={() => check("probe")}
        >
          {t("ai.probe")}
        </button>
        {connectionBusy && <span className="ai-status">{t("ai.checkingCapability")}</span>}
        {connection !== null && (
          <span className={`ai-status ${connection.status}`}>
            {connection.status}: {connection.reason ?? t("ai.checkPassed")}
          </span>
        )}
      </section>

      <section className="ai-request">
        <label>
          {t("ai.task")}
          <select value={operation} onChange={(event) => setOperation(event.currentTarget.value as AiOperation)}>
            {operations.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>{t(candidate.messageId)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("ai.instructions")}
          <textarea
            value={instruction}
            maxLength={10_000}
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
        </label>
        {needsSource && (
          <label>
            {t("ai.bashSource")}
            <textarea
              className="ai-code-input"
              value={source}
              maxLength={1_000_000}
              spellCheck={false}
              placeholder={t("ai.sourcePlaceholder")}
              onChange={(event) => setSource(event.currentTarget.value)}
            />
          </label>
        )}
        {operation === "explainFailure" && (
          <label>
            {t("ai.failureOutput")}
            <textarea
              value={failureMessage}
              maxLength={20_000}
              onChange={(event) => setFailureMessage(event.currentTarget.value)}
            />
          </label>
        )}
        <button type="button" disabled={!canSubmit || proposal.status === "loading"} onClick={propose}>
          {proposal.status === "loading" ? t("ai.validating") : t("ai.generateProposal")}
        </button>
      </section>

      {proposal.status === "message" && (
        <section className={`ai-result-message ${proposal.kind}`} role="status">
          <strong>{proposal.kind === "refused" ? t("ai.refused") : t("ai.unavailable")}</strong>
          <p>{proposal.message}</p>
        </section>
      )}
      {proposal.status === "proposed" && (
        <ProposalReview proposal={proposal.proposal} onApply={() => onApply(proposal.proposal)} />
      )}
    </article>
  );
}

function ModelPicker({
  provider,
  state,
  value,
  onChange
}: {
  provider: AiProvider;
  state: ModelsState;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  if (state.status === "loading") {
    return (
      <span className="ai-status">
        {provider === "ollama" ? t("ai.modelsLoading.ollama") : t("ai.modelsLoading.openai")}
      </span>
    );
  }
  if (state.status === "error") return <span className="ai-status failed">{state.message}</span>;
  if (state.result.status !== "available") {
    return <span className={`ai-status ${state.result.status}`}>{state.result.reason}</span>;
  }
  if (state.result.models.length === 0) {
    return (
      <span className="ai-status unavailable">
        {provider === "ollama"
          ? t("ai.noModels.ollama")
          : t("ai.noModels.openai")}
      </span>
    );
  }
  return (
    <label>
      {provider === "ollama" ? t("ai.installedModel") : t("ai.model")}
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {state.result.models.map((candidate: AiModel) => (
          <option value={candidate.id} key={candidate.id}>
            {candidate.displayName}{candidate.parameterSize === null ? "" : ` · ${candidate.parameterSize}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function CredentialSummary({ state }: { state: CredentialState }) {
  const { t } = useI18n();
  if (state.status === "idle" || state.status === "loading") {
    return <span className="ai-status">{t("ai.credentialChecking")}</span>;
  }
  if (state.status === "error") {
    return <span className="ai-status failed">{state.message}</span>;
  }
  const result = state.result;
  if (result.storage === "unavailable") {
    return (
      <span className="ai-status unavailable">
        {t("ai.credentialUnavailable")}
        {result.reason === null ? "" : ` · ${result.reason}`}
      </span>
    );
  }
  return (
    <span className={`ai-status ${result.configured ? "connected" : "unavailable"}`}>
      {result.configured ? t("ai.keyConfigured") : t("ai.noKeyConfigured")}
      {` · ${credentialStorageLabel(result, t)}`}
      {result.reason === null ? "" : ` · ${result.reason}`}
    </span>
  );
}

function ProposalReview({ proposal, onApply }: { proposal: AiProposal; onApply: () => void }) {
  const { t } = useI18n();
  return (
    <section className="ai-proposal">
      <header>
        <div>
          <p className="eyebrow">{t("ai.validatedProposal")}</p>
          <h3>{proposal.model}</h3>
        </div>
        <span className={`risk-badge ${proposal.assessment.level}`}>
          {t("common.risk", { level: proposal.assessment.level })}
        </span>
      </header>
      <pre>{proposal.proposedCode}</pre>
      <p>{proposal.explanation}</p>
      {proposal.assumptions.length > 0 && <ProposalList title={t("ai.assumptions")} values={proposal.assumptions} />}
      {proposal.warnings.length > 0 && <ProposalList title={t("ai.warnings")} values={proposal.warnings} />}
      {proposal.riskHints.length > 0 && <ProposalList title={t("ai.providerRiskHints")} values={proposal.riskHints} />}
      <ProposalList
        title={t("ai.deterministicEvidence")}
        values={proposal.assessment.evidence.map((evidence) => evidence.message)}
      />
      {proposal.preservedRaw && (
        <p className="ai-raw-warning">{t("ai.rawWarning")}</p>
      )}
      <button type="button" onClick={onApply}>{t("ai.useProposal")}</button>
    </section>
  );
}

function ProposalList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="ai-proposal-list">
      <strong>{title}</strong>
      <ul>{values.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul>
    </div>
  );
}

function credentialStorageLabel(status: CredentialStatus, t: Translator["t"]): string {
  if (status.storage === "secure") return t("ai.storageSecure", { backend: status.backend });
  if (status.storage === "session") return t("ai.storageSession");
  return t("ai.storageUnavailable");
}

function providerName(provider: AiProvider): string {
  return provider === "ollama" ? "Ollama" : "OpenAI";
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}
