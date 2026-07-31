// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogCommand;
import java.util.List;
import org.junit.jupiter.api.Test;

final class ManualParserTest {
    private final CatalogCommand.CommandManual fallback = new CatalogCommand.CommandManual(
            "sample [OPTION]",
            List.of(new CatalogCommand.ManualSection("Description", "Bundled description.")));

    @Test
    void extractsSemanticManSectionsAndRemovesTerminalControls() {
        String raw = """
                SAMPLE(1)

                SYNOPSIS
                    s\bsa\bam\bmp\bpl\ble [OPTION]

                DESCRIPTION
                    \u001B[31mDescribe\u001B[0m the command.

                SEE ALSO
                    other(1)
                """;

        CatalogCommand.CommandManual manual = ManualParser.parseMan(raw, fallback);

        assertEquals("sample [OPTION]", manual.synopsis());
        assertEquals(List.of("Synopsis", "Description", "See Also"),
                manual.sections().stream().map(CatalogCommand.ManualSection::heading).toList());
        assertFalse(manual.sections().get(1).body().contains("\u001B"));
    }

    @Test
    void keepsMarkupAsLiteralUntrustedText() {
        CatalogCommand.CommandManual manual = ManualParser.parseHelp(
                "Usage: sample\n<script>window.evil()</script>\u0000", fallback);

        assertTrue(manual.sections().get(0).body().contains("<script>"));
        assertFalse(manual.sections().get(0).body().contains("\u0000"));
    }
}
