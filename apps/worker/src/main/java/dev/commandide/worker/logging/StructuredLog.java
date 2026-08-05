// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.logging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class StructuredLog {
    private static final String PREFIX = "[command-ide-worker] ";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern SENSITIVE_KEY = Pattern.compile(
            "credential|password|token|secret|authorization|reviewedScript|typedConfirmation|input|source|script|commandText|content|payload|data",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern PATH_KEY = Pattern.compile(
            "path|directory|fileName|filePath", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Set<String> SAFE_STRING_KEYS = Set.of(
            "method", "provider", "status", "riskLevel", "level", "format", "interfaceMode",
            "commandId", "projectId", "bookmarkId", "sessionId", "requestId", "protocolVersion",
            "workerVersion", "javaVersion", "version", "signal", "errorName", "errorCode");
    private static final Level THRESHOLD = Level.parse(System.getenv("CMD_IDE_LOG_LEVEL"));

    private StructuredLog() {}

    public static void debug(String event, String correlationId, Map<String, ?> context) {
        write(Level.DEBUG, event, correlationId, context);
    }

    public static void info(String event, String correlationId, Map<String, ?> context) {
        write(Level.INFO, event, correlationId, context);
    }

    public static void warn(String event, String correlationId, Map<String, ?> context) {
        write(Level.WARN, event, correlationId, context);
    }

    public static void error(String event, String correlationId, Map<String, ?> context) {
        write(Level.ERROR, event, correlationId, context);
    }

    public static Map<String, Object> errorContext(Throwable error) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("errorName", error.getClass().getSimpleName());
        context.put("errorMessage", scrubText(error.getMessage()));
        return context;
    }

    private static synchronized void write(
            Level level,
            String event,
            String correlationId,
            Map<String, ?> context) {
        if (level.weight < THRESHOLD.weight) return;
        try {
            ObjectNode record = MAPPER.createObjectNode();
            record.put("timestamp", Instant.now().toString());
            record.put("level", level.serialized);
            record.put("component", "java-worker");
            record.put("event", bounded(event, 96));
            if (correlationId != null && !correlationId.isBlank()) {
                record.put("correlationId", bounded(correlationId, 128));
            }
            if (context != null && !context.isEmpty()) {
                record.set("context", MAPPER.valueToTree(sanitize(context)));
            }
            System.err.println(PREFIX + MAPPER.writeValueAsString(record));
        } catch (RuntimeException | java.io.IOException loggingFailure) {
            System.err.println(PREFIX + "{\"level\":\"error\",\"event\":\"logger.failure\"}");
        }
    }

    static Map<String, Object> sanitize(Map<String, ?> context) {
        Map<String, Object> sanitized = new LinkedHashMap<>();
        context.entrySet().stream().limit(30).forEach(entry -> {
            Object value = entry.getValue();
            String key = entry.getKey();
            if (value == null || value instanceof Number || value instanceof Boolean) {
                sanitized.put(key, value);
            } else if (value instanceof String stringValue) {
                sanitized.put(key, sanitizeString(key, stringValue));
            } else {
                sanitized.put(key, "<" + value.getClass().getSimpleName() + ">");
            }
        });
        return sanitized;
    }

    private static String sanitizeString(String key, String value) {
        if ("errorMessage".equals(key)) return scrubText(value);
        if (SENSITIVE_KEY.matcher(key).find()) return "<redacted:" + value.length() + " chars>";
        if (PATH_KEY.matcher(key).find()) return "<redacted-path>";
        if (SAFE_STRING_KEYS.contains(key)) return bounded(value, 128);
        return "<string:" + value.length() + " chars>";
    }

    private static String scrubText(String value) {
        if (value == null || value.isBlank()) return "Unavailable";
        String home = System.getProperty("user.home", "");
        String scrubbed = home.isBlank() ? value : value.replace(home, "<home>");
        return bounded(scrubbed.replaceAll("[\\r\\n\\t]+", " "), 300);
    }

    private static String bounded(String value, int limit) {
        return value.length() <= limit ? value : value.substring(0, limit);
    }

    private enum Level {
        DEBUG(10, "debug"),
        INFO(20, "info"),
        WARN(30, "warn"),
        ERROR(40, "error");

        private final int weight;
        private final String serialized;

        Level(int weight, String serialized) {
            this.weight = weight;
            this.serialized = serialized;
        }

        private static Level parse(String value) {
            if (value == null) return ERROR;
            return switch (value.toLowerCase(java.util.Locale.ROOT)) {
                case "debug" -> DEBUG;
                case "warn" -> WARN;
                case "error" -> ERROR;
                default -> INFO;
            };
        }
    }
}
