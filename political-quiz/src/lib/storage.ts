"use client";

import { useSyncExternalStore } from "react";

// localStorage as a tiny external store. Components read via useStoredString,
// so values are picked up after hydration without setState-in-effect, and
// writes in one component re-render every other reader.

const CHANGE_EVENT = "pytheas-storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (private mode, blocked storage)
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null
  );
}
