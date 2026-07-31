// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import java.util.List;

record TldrCatalog(String schemaVersion, List<TldrPage> pages) {
    record TldrPage(
            String commandId,
            List<TldrSupplement.TldrExample> examples,
            TldrSupplement.TldrAttribution attribution) {}
}
