// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

final class TldrServiceTest {
    private static final String REVISION = "5ca248e494fba9776274f74362440708849e411f";

    @Test
    void loadsAllRevisionPinnedAttributedPages() {
        TldrService service = new TldrService();
        List<String> commandIds = List.of(
                "ls", "find", "ps", "free", "lsblk", "git",
                "cut", "uniq", "tee", "xargs", "pgrep", "pkill",
                "top", "findmnt", "umount", "wget", "xz", "make");

        for (String commandId : commandIds) {
            TldrSupplement page = service.find(commandId).orElseThrow();
            assertEquals(2, page.examples().size());
            assertEquals("tldr-pages", page.attribution().source());
            assertEquals(REVISION, page.attribution().sourceRevision());
            assertEquals("CC-BY 4.0", page.attribution().license());
            assertEquals("https://creativecommons.org/licenses/by/4.0/",
                    page.attribution().licenseUrl());
            assertTrue(page.attribution().pageUrl().contains(
                    "/tldr-pages/tldr/blob/" + REVISION + "/pages/"));
            assertTrue(Set.of("2026-07-18", "2026-07-29")
                    .contains(page.attribution().retrievedAt()));
        }

        assertFalse(service.find("cat").isPresent());
    }

    @Test
    void preservesExpectedCommonAndLinuxNamespaces() {
        TldrService service = new TldrService();

        assertTrue(service.find("cut").orElseThrow().attribution().pageUrl()
                .contains("/pages/common/cut.md"));
        assertTrue(service.find("pgrep").orElseThrow().attribution().pageUrl()
                .contains("/pages/linux/pgrep.md"));
        assertTrue(service.find("findmnt").orElseThrow().attribution().pageUrl()
                .contains("/pages/linux/findmnt.md"));
        assertTrue(service.find("make").orElseThrow().attribution().pageUrl()
                .contains("/pages/common/make.md"));
    }
}
