// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { workflowProgress } from "./workflow-progress";

describe("first-run workflow progress", () => {
  it("starts with catalog selection", () => {
    expect(workflowProgress(false, false)).toEqual(["active", "upcoming", "upcoming", "upcoming"]);
  });

  it("moves from editing to exact-script review only after validation", () => {
    expect(workflowProgress(true, false)).toEqual(["complete", "active", "upcoming", "upcoming"]);
    expect(workflowProgress(true, true)).toEqual(["complete", "complete", "active", "upcoming"]);
  });

  it("makes run active only after review requirements are satisfied", () => {
    expect(workflowProgress(true, true, true, false)).toEqual(["complete", "complete", "complete", "active"]);
    expect(workflowProgress(true, true, true, true)).toEqual(["complete", "complete", "complete", "complete"]);
  });
});
