// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("manual text rendering", () => {
  it("escapes hostile markup instead of activating it", () => {
    const hostile = '<script>window.evil()</script><a href="https://evil.invalid">open</a>';

    const rendered = renderToStaticMarkup(createElement("p", null, hostile));

    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("<a href");
    expect(rendered).toContain("&lt;script&gt;");
    expect(rendered).toContain("&lt;a href=&quot;https://evil.invalid&quot;&gt;");
  });
});
