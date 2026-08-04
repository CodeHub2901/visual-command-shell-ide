// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export const workspaceIconPaths = {
  catalog: [
    "M4.5 5.5A2.5 2.5 0 0 1 7 3h10a2.5 2.5 0 0 1 2.5 2.5v13A2.5 2.5 0 0 0 17 16H7a2.5 2.5 0 0 0-2.5 2.5z",
    "M8 7h7M8 10.5h7M8 14h4"
  ],
  "visual-builder": [
    "M5 4.5h5v5H5zM14 14.5h5v5h-5zM14 4.5h5v5h-5z",
    "M10 7h4M16.5 9.5v5M10 7v10h4"
  ],
  "script-editor": [
    "M8.5 7 4 12l4.5 5M15.5 7 20 12l-4.5 5M13.5 5l-3 14"
  ],
  manual: [
    "M4.5 5.5A2.5 2.5 0 0 1 7 3h5v17H7a2.5 2.5 0 0 0-2.5 2.5z",
    "M19.5 5.5A2.5 2.5 0 0 0 17 3h-5v17h5a2.5 2.5 0 0 1 2.5 2.5z",
    "M7.5 7H10M14 7h2.5M7.5 10H10M14 10h2.5"
  ],
  "ai-assistant": [
    "m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2z",
    "m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8zM6 13l.6 1.4L8 15l-1.4.6L6 17l-.6-1.4L4 15l1.4-.6z"
  ],
  bookmarks: [
    "M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1z"
  ],
  history: [
    "M4.5 8V4.5H8",
    "M5.2 6.1A8 8 0 1 1 4 13",
    "M12 7.5V12l3 2"
  ],
  settings: [
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
    "M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.4-2.5 1a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A8 8 0 0 0 7 6.6l-2.5-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.4 2.5-1a8 8 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8 8 0 0 0 2.6-1.5l2.5 1 2-3.4z"
  ]
} as const;

export type WorkspaceIconName = keyof typeof workspaceIconPaths;
