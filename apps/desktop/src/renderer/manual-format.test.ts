// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { formatOptionDescription, mergeCommandOptions, optionsFromManual, splitManualBlocks } from "./manual-format";
import type { CommandOption } from "@cmd-ide/contracts";

describe("manual section formatting", () => {
  it("keeps short bundled paragraphs as a single text block", () => {
    expect(splitManualBlocks("Provides an interactive command-line interface.")).toEqual([
      { kind: "text", body: "Provides an interactive command-line interface." }
    ]);
  });

  it("splits man-style commands and flags into readable entries", () => {
    const body = `
       apt provides a high-level commandline interface.

       update (apt-get(8))
           update is used to download package information.

       -h, --help
           Show a short usage summary.
       -v, --version
           Show the program version.
`;
    expect(splitManualBlocks(body)).toEqual([
      { kind: "text", body: "       apt provides a high-level commandline interface." },
      {
        kind: "entry",
        term: "update (apt-get(8))",
        description: "update is used to download package information."
      },
      { kind: "entry", term: "-h, --help", description: "Show a short usage summary." },
      { kind: "entry", term: "-v, --version", description: "Show the program version." }
    ]);
  });

  it("splits same-line flag descriptions and later flags after a stripped first line", () => {
    const body = `--help Print help information.

       --format
              Set the display format.

       -C     Display the files in columns.

       -l, --long
              Display detailed information.

       -T, --tabsize <COLS>
              Assume tab stops at each COLS instead of 8
`;
    const entries = splitManualBlocks(body).filter((block) => block.kind === "entry");
    expect(entries).toEqual([
      { kind: "entry", term: "--help", description: "Print help information." },
      { kind: "entry", term: "--format", description: "Set the display format." },
      { kind: "entry", term: "-C", description: "Display the files in columns." },
      { kind: "entry", term: "-l, --long", description: "Display detailed information." },
      { kind: "entry", term: "-T, --tabsize <COLS>", description: "Assume tab stops at each COLS instead of 8" }
    ]);
  });

  it("extracts manual flags for Guided without duplicating catalog options", () => {
    const catalog: CommandOption[] = [{
      id: "all",
      flags: ["-a", "--all"],
      description: "Include hidden entries.",
      takesValue: false,
      valueName: null,
      repeatable: false,
      combinable: true,
      conflictsWith: []
    }];
    const extracted = optionsFromManual([{
      heading: "Options",
      body: `--help Print help information.

       -a, --all
              Do not ignore hidden files.

       --format
              Set the display format.

       -T, --tabsize <COLS>
              Assume tab stops at each COLS instead of 8
`
    }]);
    const merged = mergeCommandOptions(catalog, extracted);
    expect(merged.map((option) => option.id)).toEqual(["all", "help", "format", "tabsize"]);
    expect(merged.find((option) => option.id === "tabsize")).toMatchObject({
      flags: ["-T", "--tabsize"],
      takesValue: true,
      valueName: "COLS"
    });
  });

  it("splits inline possible-value lists out of option descriptions", () => {
    expect(formatOptionDescription(
      "[default: never] hyperlink file names WHEN Possible values: • always • auto • never"
    )).toEqual({
      text: "[default: never] hyperlink file names WHEN",
      values: ["always", "auto", "never"]
    });
  });
});
