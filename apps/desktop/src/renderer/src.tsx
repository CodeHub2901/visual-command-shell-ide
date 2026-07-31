// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "@xyflow/react/dist/style.css";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Renderer root element was not found");
}
const reactRoot = createRoot(root);

async function mountRenderer() {
  const Renderer = new URLSearchParams(window.location.search).get("performanceProbe") === "canvas"
    ? (await import("./CanvasPerformanceProbe")).CanvasPerformanceProbe
    : App;

  reactRoot.render(
    <StrictMode>
      <I18nProvider>
        <Renderer />
      </I18nProvider>
    </StrictMode>
  );
}

void mountRenderer();
