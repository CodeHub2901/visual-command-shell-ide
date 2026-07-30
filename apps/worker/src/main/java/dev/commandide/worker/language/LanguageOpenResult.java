package dev.commandide.worker.language;

public record LanguageOpenResult(String status, String sessionId, String reason) {
    public static LanguageOpenResult unavailable(String reason) {
        return new LanguageOpenResult("unavailable", null, reason);
    }

    public static LanguageOpenResult opened(String sessionId) {
        return new LanguageOpenResult("opened", sessionId, null);
    }
}
