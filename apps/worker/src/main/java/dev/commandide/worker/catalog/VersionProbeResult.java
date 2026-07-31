// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

public record VersionProbeResult(
        String commandId,
        String status,
        String version,
        boolean cached,
        boolean truncated) {
    VersionProbeResult asCached() {
        return new VersionProbeResult(commandId, status, version, true, truncated);
    }
}
