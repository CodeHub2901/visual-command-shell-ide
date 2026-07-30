package dev.commandide.worker.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.commandide.worker.persistence.DatabaseManager;
import dev.commandide.worker.persistence.SettingsRepository;
import java.security.SecureRandom;
import java.util.HexFormat;

public final class SafetyIdentifierService {
    private static final String SETTING_KEY = "openai.safety-identifier.v1";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SafetyIdentifierService() {}

    public static String loadOrCreate(DatabaseManager database) {
        if (database == null) return generate();
        SettingsRepository settings = new SettingsRepository(database);
        try {
            var stored = settings.getJson(SETTING_KEY);
            if (stored.isPresent()) {
                String value = MAPPER.readValue(stored.get(), String.class);
                if (value.matches("cmdide_[a-f0-9]{32}")) return value;
            }
            String generated = generate();
            settings.putJson(SETTING_KEY, MAPPER.writeValueAsString(generated));
            return generated;
        } catch (Exception ignored) {
            return generate();
        }
    }

    private static String generate() {
        byte[] random = new byte[16];
        new SecureRandom().nextBytes(random);
        return "cmdide_" + HexFormat.of().formatHex(random);
    }
}

