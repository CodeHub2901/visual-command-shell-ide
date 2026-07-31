// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import dev.commandide.worker.catalog.CatalogCommand;

public record ManualResult(
        String commandId,
        String source,
        boolean truncated,
        CatalogCommand.CommandManual manual,
        TldrSupplement tldr) {}
