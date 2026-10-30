import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom has <dialog> but not its modal methods; browsers have had them since 2022.
// This stand-in gives the same open/close behaviour and close event the app relies on.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom has no matchMedia; shadcn's sidebar asks it whether the screen is a phone. Tests run
// at jsdom's 1024px width, a computer screen, where no media query here matches.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    // The type still lists the old listener methods; a stand-in must provide them.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    addListener: () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// jsdom has no ResizeObserver; Radix positions tooltips and menus with it. Tests never need
// the measurements, only for opening one not to crash the screen.
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
