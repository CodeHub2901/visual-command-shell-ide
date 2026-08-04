// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { workspaceIconPaths, type WorkspaceIconName } from "./workspace-icons";

export function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  return (
    <svg
      className="workspace-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {workspaceIconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
