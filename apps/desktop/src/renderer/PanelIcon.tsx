// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export function PanelIcon({ side }: { side: "left" | "right" }) {
  if (side === "left") {
    return (
      <svg className="panel-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
        <path d="M9 4v16" />
        <path d="M11.5 8h6M11.5 12h6M11.5 16h4" />
      </svg>
    );
  }
  return (
    <svg className="panel-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M15 4v16" />
      <circle cx="9" cy="9" r="1.1" />
      <path d="M9 12.5v4" />
    </svg>
  );
}
