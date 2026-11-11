import { useSyncExternalStore } from "react";
import type { TranscriptResult } from "@/lib/polyglot-api";
import type { ExportFormat } from "@/lib/transcript-format";

/**
 * Tiny persisted stores for browser-only workspace state. No database: preferences live in
 * localStorage, vocabulary and the last transcript live in sessionStorage (cleared when the tab closes).
 * The server snapshot is always the defaults, so SSR and the first client render match.
 */
function createStore<T extends object>(key: string, kind: "local" | "session", defaults: T) {
  let state: T = defaults;
  let loaded = false;
  const listeners = new Set<() => void>();
  const storage = () => {
    if (typeof window === "undefined") return null;
    try {
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = storage()?.getItem(key);
      if (raw) state = { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      state = defaults;
    }
  }
  function get() {
    load();
    return state;
  }
  function set(update: Partial<T> | ((prev: T) => Partial<T>)) {
    load();
    const patch = typeof update === "function" ? update(state) : update;
    state = { ...state, ...patch };
    try {
      storage()?.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full or blocked — keep in memory */
    }
    listeners.forEach((listener) => listener());
  }
  function reset() {
    state = defaults;
    try {
      storage()?.removeItem(key);
    } catch {
      /* ignore */
    }
    listeners.forEach((listener) => listener());
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function useStore() {
    return useSyncExternalStore(subscribe, get, () => defaults);
  }
  return { get, set, reset, subscribe, useStore, defaults };
}

export type SampleRate = "16 kHz" | "24 kHz" | "48 kHz";

export type Preferences = {
  sampleRate: SampleRate;
  noiseRobustness: boolean;
  contextualRescoring: boolean;
  showTimestamps: boolean;
  showConfidence: boolean;
  exportFormat: ExportFormat;
};

export const DEFAULT_PREFERENCES: Preferences = {
  sampleRate: "16 kHz",
  noiseRobustness: true,
  contextualRescoring: true,
  showTimestamps: true,
  showConfidence: true,
  exportFormat: "txt",
};

export const preferencesStore = createStore<Preferences>(
  "polyglot-asr:preferences",
  "local",
  DEFAULT_PREFERENCES,
);
export const usePreferences = preferencesStore.useStore;

export const STARTER_DOMAINS: Record<string, string[]> = {
  "Computer Science": ["algorithm", "data structure", "runtime", "recursion"],
  Programming: ["Python", "compiler", "function", "debugging"],
  "Machine Learning": ["machine learning", "XLS-R", "fine-tuning", "inference"],
  Databases: ["PostgreSQL", "query", "index", "schema"],
  Networking: ["protocol", "latency", "throughput", "TCP/IP"],
};

export type SessionState = {
  domain: string;
  domains: Record<string, string[]>;
  lastResult: TranscriptResult | null;
};

export const sessionStore = createStore<SessionState>("polyglot-asr:session", "session", {
  domain: "Machine Learning",
  domains: STARTER_DOMAINS,
  lastResult: null,
});
export const useSession = sessionStore.useStore;

/** Adds a term to a domain; ignores blanks and case-insensitive duplicates. Returns the new list. */
export function addTerm(terms: string[], term: string): string[] {
  const clean = term.trim().replace(/\s+/g, " ");
  if (!clean || terms.some((t) => t.toLowerCase() === clean.toLowerCase())) return terms;
  return [...terms, clean];
}

export function activeVocabulary(state: SessionState): string[] {
  return state.domains[state.domain] ?? [];
}
