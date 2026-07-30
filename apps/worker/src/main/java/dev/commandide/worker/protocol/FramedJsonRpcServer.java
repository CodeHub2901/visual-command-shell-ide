package dev.commandide.worker.protocol;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.commandide.worker.ai.AiRequest;
import dev.commandide.worker.ai.AiService;
import dev.commandide.worker.ai.SafetyIdentifierService;
import dev.commandide.worker.bookmark.BookmarkSaveRequest;
import dev.commandide.worker.bookmark.BookmarkService;
import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.catalog.PathDiscoveryService;
import dev.commandide.worker.catalog.VersionProbeService;
import dev.commandide.worker.credential.CredentialService;
import dev.commandide.worker.credential.CredentialStores;
import dev.commandide.worker.export.ExportService;
import dev.commandide.worker.export.BashSyntaxChecker;
import dev.commandide.worker.export.LocalBashSyntaxChecker;
import dev.commandide.worker.execution.ExecutionRequest;
import dev.commandide.worker.execution.ExecutionService;
import dev.commandide.worker.manual.ManualService;
import dev.commandide.worker.language.BashLanguageService;
import dev.commandide.worker.language.LanguageDiagnosticsEvent;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.persistence.BookmarkRepository;
import dev.commandide.worker.persistence.ExecutionHistoryRepository;
import dev.commandide.worker.persistence.ProjectRepository;
import dev.commandide.worker.process.BoundedProcessRunner;
import dev.commandide.worker.project.ProjectService;
import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.risk.RiskAssessmentService;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.BashParser;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.system.SystemDetectionService;
import dev.commandide.worker.system.SystemProfile;
import dev.commandide.worker.tooling.ToolingDetectionService;
import dev.commandide.worker.tooling.ToolExecutionService;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public final class FramedJsonRpcServer {
    private static final String JSON_RPC_VERSION = "2.0";
    private static final String PROTOCOL_VERSION = "1.0";
    private static final String WORKER_VERSION = "0.1.0";
    private static final String CANCEL_REQUEST_METHOD = "v1.request.cancel";

    private final InputStream input;
    private final OutputStream output;
    private final ObjectMapper mapper;
    private final SystemDetectionService systemDetectionService;
    private final CatalogService catalogService;
    private final PathDiscoveryService pathDiscoveryService;
    private final ManualService manualService;
    private final BashGenerator bashGenerator;
    private final BashParser bashParser;
    private final VersionProbeService versionProbeService;
    private final RiskAssessmentService riskAssessmentService;
    private final ProjectService projectService;
    private final BookmarkService bookmarkService;
    private final ExportService exportService;
    private final ExecutionService executionService;
    private final ToolingDetectionService toolingDetectionService;
    private final ToolExecutionService toolExecutionService;
    private final BashLanguageService bashLanguageService;
    private final AiService aiService;
    private final CredentialService credentialService;
    private final Object outputLock = new Object();

    public FramedJsonRpcServer(InputStream input, OutputStream output) {
        this(input, output, null);
    }

    public FramedJsonRpcServer(InputStream input, OutputStream output, DatabaseManager database) {
        this.input = input;
        this.output = output;
        this.mapper = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.systemDetectionService = new SystemDetectionService();
        SystemProfile systemProfile = systemDetectionService.detect();
        this.catalogService = new CatalogService(systemProfile);
        this.pathDiscoveryService = new PathDiscoveryService(
                catalogService, systemProfile.operatingSystem(), systemProfile.pathEntries());
        this.manualService = new ManualService(catalogService, systemProfile);
        this.bashGenerator = new BashGenerator(catalogService);
        this.bashParser = new BashParser(catalogService);
        this.versionProbeService = new VersionProbeService(catalogService);
        this.toolingDetectionService = new ToolingDetectionService(systemProfile);
        this.toolExecutionService = new ToolExecutionService(systemProfile);
        this.bashLanguageService = new BashLanguageService(systemProfile, this::sendLanguageDiagnostics);
        this.riskAssessmentService = new RiskAssessmentService(catalogService, bashGenerator);
        BashSyntaxChecker bashSyntaxChecker = new LocalBashSyntaxChecker(
                systemProfile, new BoundedProcessRunner());
        this.credentialService = CredentialStores.create(systemProfile);
        this.aiService = new AiService(
                systemProfile,
                bashParser,
                bashGenerator,
                riskAssessmentService,
                bashSyntaxChecker,
                credentialService,
                SafetyIdentifierService.loadOrCreate(database));
        this.projectService = database == null
                ? null
                : new ProjectService(new ProjectRepository(database), bashGenerator);
        this.bookmarkService = database == null
                ? null
                : new BookmarkService(new BookmarkRepository(database), bashGenerator);
        this.exportService = projectService == null
                ? null
                : new ExportService(
                        bashGenerator,
                        projectService,
                        bashSyntaxChecker);
        this.executionService = database == null
                ? null
                : new ExecutionService(
                        systemProfile,
                        riskAssessmentService,
                        new ExecutionHistoryRepository(database),
                        this::sendExecutionEvent);
    }

    public void run() throws IOException {
        byte[] payload;
        try {
            while ((payload = FrameCodec.readFrame(input)) != null) {
                ObjectNode response;
                try {
                    JsonNode request = mapper.readTree(payload);
                    response = dispatch(request);
                } catch (JsonProcessingException exception) {
                    response = error(null, -32700, "Parse error");
                } catch (RuntimeException exception) {
                    System.err.println("Worker request failed: " + exception.getMessage());
                    response = error(null, -32603, "Internal error");
                }
                if (response != null) writeMessage(response);
            }
        } finally {
            if (executionService != null) executionService.close();
            credentialService.close();
            bashLanguageService.close();
        }
    }

    private ObjectNode dispatch(JsonNode request) {
        if (isValidCancellationNotification(request)) {
            return null;
        }

        JsonNode requestId = request.path("id");
        if (!request.isObject()
                || !JSON_RPC_VERSION.equals(request.path("jsonrpc").asText())
                || !request.hasNonNull("id")
                || !validId(requestId)
                || !request.path("method").isTextual()
                || hasUnknownRequestField(request)) {
            return error(validId(requestId) ? requestId : null, -32600, "Invalid Request");
        }

        JsonNode id = request.get("id");
        String method = request.get("method").asText();
        JsonNode params = request.path("params");

        if (method.equals("v1.health.check")) {
            if (!hasEmptyParams(params)) return error(id, -32602, "Invalid params");
            ObjectNode result = mapper.createObjectNode();
            result.put("protocolVersion", PROTOCOL_VERSION);
            result.put("workerVersion", WORKER_VERSION);
            result.put("javaVersion", System.getProperty("java.version"));
            result.put("pid", ProcessHandle.current().pid());
            return success(id, result);
        }
        if (method.equals("v1.system.detect")) {
            if (!hasEmptyParams(params)) return error(id, -32602, "Invalid params");
            return success(id, mapper.valueToTree(systemDetectionService.detect()));
        }
        if (method.equals("v1.tooling.detect")) {
            if (!hasEmptyParams(params)) return error(id, -32602, "Invalid params");
            return success(id, mapper.valueToTree(toolingDetectionService.detect()));
        }
        if (method.equals("v1.tooling.shellcheck")) {
            if (!validLanguageOpenParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(
                        toolExecutionService.shellCheck(params.path("source").asText())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.tooling.shfmt")) {
            if (!validLanguageOpenParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(
                        toolExecutionService.shfmt(params.path("source").asText())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.language.open")) {
            if (!validLanguageOpenParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(
                        bashLanguageService.open(params.path("source").asText())));
            } catch (IllegalArgumentException | IllegalStateException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.language.change")) {
            if (!validLanguageChangeParams(params)) return error(id, -32602, "Invalid params");
            try {
                bashLanguageService.change(
                        params.path("sessionId").asText(),
                        params.path("source").asText(),
                        params.path("version").asInt());
                return success(id, acknowledgement());
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            } catch (IOException exception) {
                return error(id, -32603, "Bash Language Server is unavailable");
            }
        }
        if (method.equals("v1.language.close")) {
            if (!validSessionParams(params)) return error(id, -32602, "Invalid params");
            try {
                bashLanguageService.close(params.path("sessionId").asText());
                return success(id, acknowledgement());
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            } catch (IOException exception) {
                return error(id, -32603, "Bash Language Server is unavailable");
            }
        }
        if (method.equals("v1.language.completion")) {
            if (!validLanguagePositionParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(bashLanguageService.completion(
                        params.path("sessionId").asText(),
                        params.path("line").asInt(),
                        params.path("character").asInt())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            } catch (IOException exception) {
                return error(id, -32603, "Bash Language Server is unavailable");
            }
        }
        if (method.equals("v1.language.hover")) {
            if (!validLanguagePositionParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(bashLanguageService.hover(
                        params.path("sessionId").asText(),
                        params.path("line").asInt(),
                        params.path("character").asInt())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            } catch (IOException exception) {
                return error(id, -32603, "Bash Language Server is unavailable");
            }
        }
        if (method.equals("v1.language.symbols")) {
            if (!validSessionParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(
                        bashLanguageService.symbols(params.path("sessionId").asText())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            } catch (IOException exception) {
                return error(id, -32603, "Bash Language Server is unavailable");
            }
        }
        if (method.equals("v1.language.references")) {
            if (!validLanguagePositionParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(bashLanguageService.references(
                        params.path("sessionId").asText(),
                        params.path("line").asInt(),
                        params.path("character").asInt())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            } catch (IOException exception) {
                return error(id, -32603, "Bash Language Server is unavailable");
            }
        }
        if (method.equals("v1.ai.models")) {
            if (!validAiEndpointParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(aiService.listModels(
                        params.path("provider").asText(),
                        params.path("endpoint").asText(),
                        params.path("remoteEndpointConfirmed").asBoolean())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.credentials.status")) {
            if (!validCredentialProviderParams(params)) return error(id, -32602, "Invalid params");
            return success(id, mapper.valueToTree(
                    credentialService.status(params.path("provider").asText())));
        }
        if (method.equals("v1.credentials.store")) {
            if (!validCredentialStoreParams(params)) return error(id, -32602, "Invalid params");
            char[] credential = params.path("credential").asText().toCharArray();
            try {
                return success(id, mapper.valueToTree(credentialService.store(
                        params.path("provider").asText(), credential)));
            } finally {
                java.util.Arrays.fill(credential, '\0');
            }
        }
        if (method.equals("v1.credentials.delete")) {
            if (!validCredentialProviderParams(params)) return error(id, -32602, "Invalid params");
            return success(id, mapper.valueToTree(
                    credentialService.delete(params.path("provider").asText())));
        }
        if (method.equals("v1.ai.test")) {
            if (!validAiEndpointParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(aiService.testConnection(
                        params.path("provider").asText(),
                        params.path("endpoint").asText(),
                        params.path("remoteEndpointConfirmed").asBoolean())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.ai.probe")) {
            if (!validAiModelParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(aiService.probeModel(
                        params.path("provider").asText(),
                        params.path("endpoint").asText(),
                        params.path("model").asText(),
                        params.path("remoteEndpointConfirmed").asBoolean())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.ai.propose")) {
            if (!validAiRequestParams(params)) return error(id, -32602, "Invalid params");
            try {
                AiRequest aiRequest = mapper.treeToValue(params, AiRequest.class);
                return success(id, mapper.valueToTree(aiService.propose(aiRequest)));
            } catch (JsonProcessingException | IllegalArgumentException exception) {
                return error(id, -32602, exception.getMessage());
            }
        }
        if (method.equals("v1.catalog.search")) {
            if (!validCatalogSearchParams(params)) return error(id, -32602, "Invalid params");
            String query = params.path("query").asText();
            int limit = params.path("limit").asInt();
            return success(id, mapper.valueToTree(catalogService.search(query, limit)));
        }
        if (method.equals("v1.catalog.discover")) {
            if (!validCatalogDiscoverParams(params)) return error(id, -32602, "Invalid params");
            return success(id, mapper.valueToTree(pathDiscoveryService.discover(
                    params.path("limit").asInt(), params.path("refresh").asBoolean())));
        }
        if (method.equals("v1.manual.get")) {
            if (!validManualGetParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(manualService.get(params.path("commandId").asText())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, "Unknown catalog command");
            }
        }
        if (method.equals("v1.shell.generate")) {
            if (!params.isObject() || params.size() != 1 || !params.path("program").isObject()) {
                return error(id, -32602, "Invalid params");
            }
            try {
                ShellProgram program = mapper.treeToValue(params.path("program"), ShellProgram.class);
                return success(id, mapper.valueToTree(bashGenerator.generate(program)));
            } catch (JsonProcessingException | IllegalArgumentException exception) {
                return error(id, -32602, "Invalid ShellProgram");
            }
        }
        if (method.equals("v1.shell.parse")) {
            if (!validShellParseParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(bashParser.parse(params.path("source").asText())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, "Invalid Bash source");
            }
        }
        if (method.equals("v1.catalog.probeVersion")) {
            if (!validVersionProbeParams(params)) return error(id, -32602, "Invalid params");
            try {
                return success(id, mapper.valueToTree(versionProbeService.probe(
                        params.path("commandId").asText(), params.path("force").asBoolean())));
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, "Unknown catalog command");
            }
        }
        if (method.equals("v1.risk.assess")) {
            if (!params.isObject() || params.size() != 1 || !params.path("program").isObject()) {
                return error(id, -32602, "Invalid params");
            }
            try {
                ShellProgram program = mapper.treeToValue(params.path("program"), ShellProgram.class);
                return success(id, mapper.valueToTree(riskAssessmentService.assess(program)));
            } catch (JsonProcessingException | IllegalArgumentException exception) {
                return error(id, -32602, "Invalid ShellProgram");
            }
        }
        if (method.equals("v1.projects.save")) {
            if (projectService == null) return error(id, -32603, "Project storage unavailable");
            if (!params.isObject() || params.size() != 1 || !params.path("project").isObject()) {
                return error(id, -32602, "Invalid params");
            }
            try {
                ScriptProject project = mapper.treeToValue(params.path("project"), ScriptProject.class);
                ObjectNode result = mapper.createObjectNode();
                result.set("project", mapper.valueToTree(projectService.save(project)));
                return success(id, result);
            } catch (IllegalArgumentException | JsonProcessingException exception) {
                return error(id, -32602, "Invalid project");
            } catch (Exception exception) {
                throw new IllegalStateException("Project save failed", exception);
            }
        }
        if (method.equals("v1.projects.get")) {
            if (projectService == null) return error(id, -32603, "Project storage unavailable");
            if (!validProjectGetParams(params)) return error(id, -32602, "Invalid params");
            try {
                ObjectNode result = mapper.createObjectNode();
                var project = projectService.get(params.path("projectId").asText());
                if (project.isPresent()) result.set("project", mapper.valueToTree(project.get()));
                else result.putNull("project");
                return success(id, result);
            } catch (IllegalArgumentException exception) {
                return error(id, -32602, "Invalid project id");
            } catch (Exception exception) {
                throw new IllegalStateException("Project read failed", exception);
            }
        }
        if (method.equals("v1.projects.list")) {
            if (projectService == null) return error(id, -32603, "Project storage unavailable");
            if (!validProjectListParams(params)) return error(id, -32602, "Invalid params");
            try {
                ObjectNode result = mapper.createObjectNode();
                result.set("projects", mapper.valueToTree(projectService.recent(params.path("limit").asInt())));
                return success(id, result);
            } catch (Exception exception) {
                throw new IllegalStateException("Project list failed", exception);
            }
        }
        if (method.equals("v1.projects.import")) {
            if (projectService == null) return error(id, -32603, "Project storage unavailable");
            if (!validProjectImportParams(params)) return error(id, -32602, "Invalid params");
            try {
                ObjectNode result = mapper.createObjectNode();
                result.set("project", mapper.valueToTree(projectService.importJson(
                        params.path("content").asText())));
                return success(id, result);
            } catch (Exception exception) {
                return error(id, -32602, "Invalid project import");
            }
        }
        if (method.equals("v1.bookmarks.save")) {
            if (bookmarkService == null) return error(id, -32603, "Bookmark storage unavailable");
            if (!validBookmarkSaveParams(params)) return error(id, -32602, "Invalid params");
            try {
                BookmarkSaveRequest bookmark = mapper.treeToValue(params, BookmarkSaveRequest.class);
                ObjectNode result = mapper.createObjectNode();
                result.set("bookmark", mapper.valueToTree(bookmarkService.save(bookmark)));
                return success(id, result);
            } catch (Exception exception) {
                return error(id, -32602, "Invalid bookmark");
            }
        }
        if (method.equals("v1.bookmarks.list")) {
            if (bookmarkService == null) return error(id, -32603, "Bookmark storage unavailable");
            if (!validProjectListParams(params)) return error(id, -32602, "Invalid params");
            try {
                ObjectNode result = mapper.createObjectNode();
                result.set("bookmarks", mapper.valueToTree(
                        bookmarkService.recent(params.path("limit").asInt())));
                return success(id, result);
            } catch (Exception exception) {
                throw new IllegalStateException("Bookmark list failed", exception);
            }
        }
        if (method.equals("v1.bookmarks.delete")) {
            if (bookmarkService == null) return error(id, -32603, "Bookmark storage unavailable");
            if (!validBookmarkDeleteParams(params)) return error(id, -32602, "Invalid params");
            try {
                ObjectNode result = mapper.createObjectNode();
                result.put("deleted", bookmarkService.delete(params.path("bookmarkId").asText()));
                return success(id, result);
            } catch (Exception exception) {
                return error(id, -32602, "Invalid bookmark id");
            }
        }
        if (method.equals("v1.export.create")) {
            if (exportService == null) return error(id, -32603, "Export unavailable");
            if (!validExportCreateParams(params)) return error(id, -32602, "Invalid params");
            try {
                ScriptProject project = mapper.treeToValue(params.path("project"), ScriptProject.class);
                return success(id, mapper.valueToTree(exportService.create(
                        project,
                        params.path("format").asText(),
                        params.path("strictMode").asBoolean(),
                        params.path("includeSourceComments").asBoolean())));
            } catch (Exception exception) {
                return error(id, -32602, "Export validation failed");
            }
        }
        if (method.equals("v1.execution.start")) {
            if (executionService == null) return error(id, -32603, "Execution unavailable");
            if (!validExecutionStartParams(params)) return error(id, -32602, "Invalid params");
            try {
                ExecutionRequest execution = mapper.treeToValue(params, ExecutionRequest.class);
                return success(id, mapper.valueToTree(executionService.start(execution)));
            } catch (Exception exception) {
                return error(id, -32602, "Execution rejected");
            }
        }
        if (method.equals("v1.execution.input")) {
            if (executionService == null) return error(id, -32603, "Execution unavailable");
            if (!validExecutionInputParams(params)) return error(id, -32602, "Invalid params");
            try {
                executionService.input(params.path("sessionId").asText(), params.path("data").asText());
                return success(id, acknowledgement());
            } catch (Exception exception) {
                return error(id, -32602, "Terminal input rejected");
            }
        }
        if (method.equals("v1.execution.resize")) {
            if (executionService == null) return error(id, -32603, "Execution unavailable");
            if (!validExecutionResizeParams(params)) return error(id, -32602, "Invalid params");
            try {
                executionService.resize(
                        params.path("sessionId").asText(),
                        params.path("columns").asInt(),
                        params.path("rows").asInt());
                return success(id, acknowledgement());
            } catch (Exception exception) {
                return error(id, -32602, "Terminal resize rejected");
            }
        }
        if (method.equals("v1.execution.cancel")) {
            if (executionService == null) return error(id, -32603, "Execution unavailable");
            if (!validSessionParams(params)) return error(id, -32602, "Invalid params");
            try {
                executionService.cancel(params.path("sessionId").asText());
                return success(id, acknowledgement());
            } catch (Exception exception) {
                return error(id, -32602, "Terminal cancellation rejected");
            }
        }
        if (method.equals("v1.history.list")) {
            if (executionService == null) return error(id, -32603, "History unavailable");
            if (!validProjectListParams(params)) return error(id, -32602, "Invalid params");
            try {
                ObjectNode result = mapper.createObjectNode();
                result.set("entries", mapper.valueToTree(
                        executionService.recentHistory(params.path("limit").asInt())));
                return success(id, result);
            } catch (Exception exception) {
                throw new IllegalStateException("Execution history read failed", exception);
            }
        }
        return error(id, -32601, "Method not found");
    }

    private boolean hasEmptyParams(JsonNode params) {
        return params.isMissingNode() || (params.isObject() && params.size() == 0);
    }

    private boolean validCatalogSearchParams(JsonNode params) {
        return params.isObject()
                && params.size() == 2
                && params.path("query").isTextual()
                && params.path("query").asText().length() <= 200
                && params.path("limit").isIntegralNumber()
                && params.path("limit").canConvertToInt()
                && params.path("limit").asInt() >= 1
                && params.path("limit").asInt() <= 100;
    }

    private boolean validAiEndpointParams(JsonNode params) {
        return params.isObject()
                && params.size() == 3
                && validAiProvider(params.path("provider"))
                && validAiEndpoint(params.path("endpoint"))
                && params.path("remoteEndpointConfirmed").isBoolean();
    }

    private boolean validCredentialProviderParams(JsonNode params) {
        return params.isObject()
                && params.size() == 1
                && params.path("provider").isTextual()
                && params.path("provider").asText().equals("openai");
    }

    private boolean validCredentialStoreParams(JsonNode params) {
        if (!params.isObject()
                || params.size() != 2
                || !validCredentialProviderParamsWithoutSize(params)
                || !validBoundedText(params.path("credential"), 1, 4096)) {
            return false;
        }
        return params.path("credential").asText().codePoints()
                .noneMatch(Character::isISOControl);
    }

    private boolean validCredentialProviderParamsWithoutSize(JsonNode params) {
        return params.path("provider").isTextual()
                && params.path("provider").asText().equals("openai");
    }

    private boolean validAiModelParams(JsonNode params) {
        return params.isObject()
                && params.size() == 4
                && validAiProvider(params.path("provider"))
                && validAiEndpoint(params.path("endpoint"))
                && validBoundedText(params.path("model"), 1, 500)
                && params.path("remoteEndpointConfirmed").isBoolean();
    }

    private boolean validAiRequestParams(JsonNode params) {
        if (!params.isObject()
                || params.size() != 8
                || !validAiProvider(params.path("provider"))
                || !validAiEndpoint(params.path("endpoint"))
                || !validBoundedText(params.path("model"), 1, 500)
                || !params.path("remoteEndpointConfirmed").isBoolean()
                || !params.path("operation").isTextual()
                || !java.util.Set.of(
                        "generateExample", "explain", "completeScript",
                        "improveScript", "explainFailure")
                        .contains(params.path("operation").asText())
                || !validBoundedText(params.path("instruction"), 1, 10_000)
                || !validNullableText(params.path("source"), 1_000_000)
                || !validNullableText(params.path("failureMessage"), 20_000)) {
            return false;
        }
        String operation = params.path("operation").asText();
        if (!operation.equals("generateExample")
                && (params.path("source").isNull() || params.path("source").asText().isBlank())) {
            return false;
        }
        return !operation.equals("explainFailure")
                || (!params.path("failureMessage").isNull()
                    && !params.path("failureMessage").asText().isBlank());
    }

    private boolean validAiProvider(JsonNode provider) {
        return provider.isTextual()
                && java.util.Set.of("ollama", "openai").contains(provider.asText());
    }

    private boolean validAiEndpoint(JsonNode endpoint) {
        return validBoundedText(endpoint, 1, 2000);
    }

    private boolean validNullableText(JsonNode value, int maximum) {
        return value.isNull() || (value.isTextual() && value.asText().length() <= maximum);
    }

    private boolean validBoundedText(JsonNode value, int minimum, int maximum) {
        return value.isTextual()
                && value.asText().length() >= minimum
                && value.asText().length() <= maximum;
    }

    private boolean validCatalogDiscoverParams(JsonNode params) {
        return params.isObject()
                && params.size() == 2
                && params.path("limit").isIntegralNumber()
                && params.path("limit").canConvertToInt()
                && params.path("limit").asInt() >= 1
                && params.path("limit").asInt() <= 5_000
                && params.path("refresh").isBoolean();
    }

    private boolean validManualGetParams(JsonNode params) {
        return params.isObject()
                && params.size() == 1
                && params.path("commandId").isTextual()
                && params.path("commandId").asText().matches("[a-z0-9][a-z0-9._-]*");
    }

    private boolean validVersionProbeParams(JsonNode params) {
        return params.isObject()
                && params.size() == 2
                && params.path("commandId").isTextual()
                && params.path("commandId").asText().matches("[a-z0-9][a-z0-9._-]*")
                && params.path("force").isBoolean();
    }

    private boolean validShellParseParams(JsonNode params) {
        return params.isObject()
                && params.size() == 1
                && params.path("source").isTextual()
                && !params.path("source").asText().isEmpty()
                && params.path("source").asText().length() <= 1_000_000;
    }

    private boolean validLanguageOpenParams(JsonNode params) {
        return params.isObject()
                && params.size() == 1
                && validLanguageSource(params.path("source"));
    }

    private boolean validLanguageChangeParams(JsonNode params) {
        return params.isObject()
                && params.size() == 3
                && validSessionId(params.path("sessionId"))
                && validLanguageSource(params.path("source"))
                && params.path("version").isIntegralNumber()
                && params.path("version").canConvertToInt()
                && params.path("version").asInt() >= 2;
    }

    private boolean validLanguagePositionParams(JsonNode params) {
        return params.isObject()
                && params.size() == 3
                && validSessionId(params.path("sessionId"))
                && validLanguagePosition(params.path("line"))
                && validLanguagePosition(params.path("character"));
    }

    private boolean validLanguageSource(JsonNode source) {
        return source.isTextual()
                && source.asText().length() <= 1_000_000;
    }

    private boolean validLanguagePosition(JsonNode value) {
        return value.isIntegralNumber()
                && value.canConvertToInt()
                && value.asInt() >= 0
                && value.asInt() <= 1_000_000;
    }

    private boolean validProjectGetParams(JsonNode params) {
        if (!params.isObject() || params.size() != 1 || !params.path("projectId").isTextual()) return false;
        try {
            java.util.UUID.fromString(params.path("projectId").asText());
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean validProjectListParams(JsonNode params) {
        return params.isObject()
                && params.size() == 1
                && params.path("limit").isIntegralNumber()
                && params.path("limit").canConvertToInt()
                && params.path("limit").asInt() >= 1
                && params.path("limit").asInt() <= 100;
    }

    private boolean validProjectImportParams(JsonNode params) {
        return params.isObject()
                && params.size() == 1
                && params.path("content").isTextual()
                && !params.path("content").asText().isBlank()
                && params.path("content").asText().length() <= 2_000_000;
    }

    private boolean validBookmarkSaveParams(JsonNode params) {
        if (!params.isObject()
                || params.size() != 4
                || !(params.path("bookmarkId").isNull() || params.path("bookmarkId").isTextual())
                || !params.path("name").isTextual()
                || params.path("name").asText().isBlank()
                || params.path("name").asText().strip().length() > 120
                || !params.path("program").isObject()
                || !params.path("parameters").isArray()
                || params.path("parameters").size() > 200) {
            return false;
        }
        if (params.path("bookmarkId").isTextual()) {
            try {
                java.util.UUID.fromString(params.path("bookmarkId").asText());
            } catch (IllegalArgumentException exception) {
                return false;
            }
        }
        return true;
    }

    private boolean validBookmarkDeleteParams(JsonNode params) {
        if (!params.isObject() || params.size() != 1 || !params.path("bookmarkId").isTextual()) {
            return false;
        }
        try {
            java.util.UUID.fromString(params.path("bookmarkId").asText());
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean validExportCreateParams(JsonNode params) {
        return params.isObject()
                && params.size() == 4
                && params.path("project").isObject()
                && params.path("format").isTextual()
                && java.util.Set.of("project", "bash", "markdown")
                        .contains(params.path("format").asText())
                && params.path("strictMode").isBoolean()
                && params.path("includeSourceComments").isBoolean();
    }

    private boolean validExecutionStartParams(JsonNode params) {
        return params.isObject()
                && params.size() == 9
                && params.path("program").isObject()
                && params.path("reviewedScript").isTextual()
                && !params.path("reviewedScript").asText().isEmpty()
                && params.path("reviewedScript").asText().length() <= 1_000_000
                && params.path("reviewHash").isTextual()
                && params.path("reviewHash").asText().matches("[a-f0-9]{64}")
                && params.path("interfaceMode").isTextual()
                && java.util.Set.of("guided", "compact").contains(params.path("interfaceMode").asText())
                && params.path("confirmed").isBoolean()
                && (params.path("typedConfirmation").isNull()
                    || params.path("typedConfirmation").isTextual()
                    && params.path("typedConfirmation").asText().length() <= 100)
                && params.path("workingDirectory").isTextual()
                && params.path("workingDirectory").asText().length() <= 4096
                && validDimension(params.path("columns"), 2, 500)
                && validDimension(params.path("rows"), 2, 200);
    }

    private boolean validExecutionInputParams(JsonNode params) {
        return params.isObject()
                && params.size() == 2
                && validSessionId(params.path("sessionId"))
                && params.path("data").isTextual()
                && !params.path("data").asText().isEmpty()
                && params.path("data").asText().length() <= 65_536;
    }

    private boolean validExecutionResizeParams(JsonNode params) {
        return params.isObject()
                && params.size() == 3
                && validSessionId(params.path("sessionId"))
                && validDimension(params.path("columns"), 2, 500)
                && validDimension(params.path("rows"), 2, 200);
    }

    private boolean validSessionParams(JsonNode params) {
        return params.isObject() && params.size() == 1 && validSessionId(params.path("sessionId"));
    }

    private boolean validSessionId(JsonNode value) {
        if (!value.isTextual()) return false;
        try {
            java.util.UUID.fromString(value.asText());
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean validDimension(JsonNode value, int minimum, int maximum) {
        return value.isIntegralNumber()
                && value.canConvertToInt()
                && value.asInt() >= minimum
                && value.asInt() <= maximum;
    }

    private ObjectNode acknowledgement() {
        ObjectNode result = mapper.createObjectNode();
        result.put("accepted", true);
        return result;
    }

    private void sendExecutionEvent(dev.commandide.worker.execution.ExecutionEvent event) throws IOException {
        ObjectNode notification = mapper.createObjectNode();
        notification.put("jsonrpc", JSON_RPC_VERSION);
        notification.put("method", "v1.execution.event");
        notification.set("params", mapper.valueToTree(event));
        writeMessage(notification);
    }

    private void sendLanguageDiagnostics(LanguageDiagnosticsEvent event) {
        ObjectNode notification = mapper.createObjectNode();
        notification.put("jsonrpc", JSON_RPC_VERSION);
        notification.put("method", "v1.language.diagnostics");
        notification.set("params", mapper.valueToTree(event));
        try {
            writeMessage(notification);
        } catch (IOException exception) {
            System.err.println("Could not deliver language diagnostics: " + exception.getMessage());
        }
    }

    private void writeMessage(ObjectNode message) throws IOException {
        synchronized (outputLock) {
            FrameCodec.writeFrame(output, mapper.writeValueAsBytes(message));
        }
    }

    private boolean isValidCancellationNotification(JsonNode request) {
        if (!request.isObject()
                || request.has("id")
                || !JSON_RPC_VERSION.equals(request.path("jsonrpc").asText())
                || !CANCEL_REQUEST_METHOD.equals(request.path("method").asText())
                || request.size() != 3) {
            return false;
        }
        JsonNode params = request.path("params");
        return params.isObject()
                && params.size() == 1
                && params.hasNonNull("requestId")
                && validId(params.path("requestId"));
    }

    private boolean validId(JsonNode id) {
        return (id.isTextual() && !id.asText().isBlank()) || id.isIntegralNumber();
    }

    private boolean hasUnknownRequestField(JsonNode request) {
        var fields = request.fieldNames();
        while (fields.hasNext()) {
            String field = fields.next();
            if (!field.equals("jsonrpc")
                    && !field.equals("id")
                    && !field.equals("method")
                    && !field.equals("params")) {
                return true;
            }
        }
        return false;
    }

    private ObjectNode success(JsonNode id, JsonNode result) {
        ObjectNode response = mapper.createObjectNode();
        response.put("jsonrpc", JSON_RPC_VERSION);
        response.set("id", id);
        response.set("result", result);
        return response;
    }

    private ObjectNode error(JsonNode id, int code, String message) {
        ObjectNode response = mapper.createObjectNode();
        response.put("jsonrpc", JSON_RPC_VERSION);
        if (id == null || id.isMissingNode() || id.isNull()) {
            response.putNull("id");
        } else {
            response.set("id", id);
        }
        ObjectNode error = response.putObject("error");
        error.put("code", code);
        error.put("message", message);
        return response;
    }
}
