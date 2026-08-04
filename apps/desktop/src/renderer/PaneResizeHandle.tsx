// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { KeyboardEvent, PointerEvent, RefObject } from "react";

export function PaneResizeHandle({
  label,
  orientation,
  value,
  min,
  max,
  invert = false,
  cssVariable,
  rootRef,
  onCommit
}: {
  label: string;
  orientation: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  invert?: boolean | undefined;
  cssVariable: `--${string}`;
  rootRef: RefObject<HTMLElement | null>;
  onCommit: (value: number) => void;
}) {
  const apply = (nextValue: number) => {
    const next = clamp(nextValue, min, max);
    rootRef.current?.style.setProperty(cssVariable, `${next}px`);
    return next;
  };

  const beginResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startCoordinate = orientation === "vertical" ? event.clientX : event.clientY;
    let latest = value;
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: globalThis.PointerEvent) => {
      const coordinate = orientation === "vertical" ? moveEvent.clientX : moveEvent.clientY;
      const delta = (coordinate - startCoordinate) * (invert ? -1 : 1);
      latest = apply(value + delta);
      handle.setAttribute("aria-valuenow", String(latest));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      onCommit(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let coordinateDelta = 0;
    if (orientation === "vertical") {
      if (event.key === "ArrowLeft") coordinateDelta = -12;
      if (event.key === "ArrowRight") coordinateDelta = 12;
    } else {
      if (event.key === "ArrowUp") coordinateDelta = -12;
      if (event.key === "ArrowDown") coordinateDelta = 12;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onCommit(apply(min));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onCommit(apply(max));
      return;
    }
    if (coordinateDelta === 0) return;
    event.preventDefault();
    onCommit(apply(value + coordinateDelta * (invert ? -1 : 1)));
  };

  return (
    <div
      className={`pane-resize-handle ${orientation}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={beginResize}
      onKeyDown={handleKeyboard}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}
