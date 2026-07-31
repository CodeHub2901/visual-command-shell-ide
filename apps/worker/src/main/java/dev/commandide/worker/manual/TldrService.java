// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

final class TldrService {
    private static final String RESOURCE = "/catalog/v1/tldr/pages.json";
    private static final String SCHEMA_VERSION = "1.0.0";
    private static final String LICENSE = "CC-BY 4.0";
    private static final String LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
    private static final Set<LocalDate> RETRIEVAL_DATES = Set.of(
            LocalDate.of(2026, 7, 18),
            LocalDate.of(2026, 7, 29));

    private final Map<String, TldrSupplement> pages;

    TldrService() {
        this.pages = load();
    }

    Optional<TldrSupplement> find(String commandId) {
        return Optional.ofNullable(pages.get(commandId));
    }

    private static Map<String, TldrSupplement> load() {
        TldrCatalog catalog;
        try (InputStream input = TldrService.class.getResourceAsStream(RESOURCE)) {
            if (input == null) throw new IllegalStateException("Bundled TLDR supplement is missing");
            catalog = new ObjectMapper().readValue(input, TldrCatalog.class);
        } catch (IOException exception) {
            throw new IllegalStateException("Bundled TLDR supplement is invalid", exception);
        }
        if (catalog == null || !SCHEMA_VERSION.equals(catalog.schemaVersion())
                || catalog.pages() == null || catalog.pages().size() > 1000) {
            throw new IllegalStateException("Unsupported TLDR supplement schema");
        }
        Map<String, TldrSupplement> result = new HashMap<>();
        Set<String> ids = new HashSet<>();
        for (TldrCatalog.TldrPage page : catalog.pages()) {
            validate(page, ids);
            result.put(page.commandId(), new TldrSupplement(
                    List.copyOf(page.examples()), page.attribution()));
        }
        return Map.copyOf(result);
    }

    private static void validate(TldrCatalog.TldrPage page, Set<String> ids) {
        if (page == null || page.commandId() == null
                || !page.commandId().matches("[a-z0-9][a-z0-9._-]*") || !ids.add(page.commandId())
                || page.examples() == null || page.examples().isEmpty() || page.examples().size() > 20
                || page.attribution() == null) {
            throw new IllegalStateException("Invalid TLDR page");
        }
        for (TldrSupplement.TldrExample example : page.examples()) {
            if (example == null || blank(example.description()) || example.description().length() > 500
                    || blank(example.command()) || example.command().length() > 4096
                    || example.command().indexOf('\0') >= 0) {
                throw new IllegalStateException("Invalid TLDR example");
            }
        }
        TldrSupplement.TldrAttribution attribution = page.attribution();
        if (!"tldr-pages".equals(attribution.source())
                || !validPageUrl(attribution.pageUrl(), page.commandId())
                || attribution.sourceRevision() == null
                || !attribution.sourceRevision().matches("[a-f0-9]{40}")
                || !validRetrievalDate(attribution.retrievedAt())
                || blank(attribution.copyright()) || attribution.copyright().length() > 300
                || !LICENSE.equals(attribution.license())
                || !LICENSE_URL.equals(attribution.licenseUrl())) {
            throw new IllegalStateException("Invalid TLDR attribution");
        }
    }

    private static boolean validPageUrl(String value, String commandId) {
        try {
            URI uri = URI.create(value);
            return uri.getScheme().equals("https")
                    && uri.getHost().equals("github.com")
                    && Set.of(
                            "/tldr-pages/tldr/blob/5ca248e494fba9776274f74362440708849e411f/pages/common/"
                                    + commandId + ".md",
                            "/tldr-pages/tldr/blob/5ca248e494fba9776274f74362440708849e411f/pages/linux/"
                                    + commandId + ".md")
                    .contains(uri.getPath());
        } catch (IllegalArgumentException | NullPointerException exception) {
            return false;
        }
    }

    private static boolean validRetrievalDate(String value) {
        try {
            return value != null && RETRIEVAL_DATES.contains(LocalDate.parse(value));
        } catch (DateTimeParseException exception) {
            return false;
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
