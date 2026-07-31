// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import java.util.List;

public record TldrSupplement(
        List<TldrExample> examples,
        TldrAttribution attribution) {

    public record TldrExample(String description, String command) {}

    public record TldrAttribution(
            String source,
            String pageUrl,
            String sourceRevision,
            String retrievedAt,
            String copyright,
            String license,
            String licenseUrl) {}
}
