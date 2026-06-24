import type { TokenPetBridge } from "./types";

declare global {
  interface Window {
    tokenpet: TokenPetBridge;
  }
}

export {};
