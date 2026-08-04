// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

const INSTALL_MARKER = "__commandIdeFrameResizeObserverInstalled";

type ResizeWindow = Window & typeof globalThis & {
  [INSTALL_MARKER]?: boolean;
};

export function installFrameBoundedResizeObserver(target: ResizeWindow): void {
  if (target[INSTALL_MARKER] === true || typeof target.ResizeObserver === "undefined") return;
  const NativeResizeObserver = target.ResizeObserver;

  class FrameBoundedResizeObserver implements ResizeObserver {
    private readonly nativeObserver: ResizeObserver;
    private frame: number | null = null;
    private pendingEntries: ResizeObserverEntry[] = [];

    constructor(callback: ResizeObserverCallback) {
      this.nativeObserver = new NativeResizeObserver((entries) => {
        this.pendingEntries = entries;
        if (this.frame !== null) return;
        this.frame = target.requestAnimationFrame(() => {
          this.frame = null;
          const pending = this.pendingEntries;
          this.pendingEntries = [];
          if (pending.length > 0) callback(pending, this);
        });
      });
    }

    observe(targetElement: Element, options?: ResizeObserverOptions): void {
      this.nativeObserver.observe(targetElement, options);
    }

    unobserve(targetElement: Element): void {
      this.nativeObserver.unobserve(targetElement);
    }

    disconnect(): void {
      if (this.frame !== null) target.cancelAnimationFrame(this.frame);
      this.frame = null;
      this.pendingEntries = [];
      this.nativeObserver.disconnect();
    }
  }

  Object.defineProperty(target, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: FrameBoundedResizeObserver
  });
  target[INSTALL_MARKER] = true;
}
