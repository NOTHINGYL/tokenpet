import type { QuotaPetBridge } from "./types";

declare global {
  interface Window {
    quotapet: QuotaPetBridge;
  }
}

export {};
