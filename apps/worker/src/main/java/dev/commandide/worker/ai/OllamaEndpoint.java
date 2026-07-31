// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

final class OllamaEndpoint {
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "::1");

    private OllamaEndpoint() {}

    static URI validate(String value, boolean remoteConfirmed) {
        if (value == null || value.isBlank() || value.length() > 2000) {
            throw new IllegalArgumentException("Ollama endpoint is required");
        }
        URI uri;
        try {
            uri = URI.create(value.strip());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Ollama endpoint is invalid");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if ((!scheme.equals("http") && !scheme.equals("https"))
                || host.isBlank()
                || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null
                || (uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))
                || uri.getPort() == 0
                || uri.getPort() < -1) {
            throw new IllegalArgumentException("Ollama endpoint must be an HTTP(S) origin");
        }
        boolean loopback = LOOPBACK_HOSTS.contains(host);
        if (!loopback && !scheme.equals("https")) {
            throw new IllegalArgumentException("Remote Ollama endpoints must use HTTPS");
        }
        if (!loopback && !remoteConfirmed) {
            throw new IllegalArgumentException("Remote Ollama endpoint requires explicit confirmation");
        }
        String normalized = uri.toString();
        if (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        return URI.create(normalized);
    }

    static URI api(URI endpoint, String path) {
        return URI.create(endpoint.toString() + path);
    }
}
