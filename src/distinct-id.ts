/**
 * One id per browser, shared by Umami and GrowthBook.
 *
 * Umami buckets sessions on its own and GrowthBook buckets experiments on
 * whatever `attributes.id` holds. If those two disagree, an experiment bucket
 * and an Umami session refer to different people and no result can be read.
 * So both are handed this value.
 *
 * It is a random uuid with nothing derived from the visitor. No fingerprinting,
 * no cross-site value, and clearing site data resets it.
 */

export const DISTINCT_ID_KEY = 'an_did';

/** Storage shape this module needs. Injected so tests do not need a browser. */
export interface IdStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // RFC 4122 version 4 bits.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort. Only reached on very old browsers, where a weaker id is still
  // better than no bucketing at all.
  return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultStore(): IdStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Safari in private mode has localStorage but throws on write.
    const probe = '__an_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

// Held in memory so a blocked localStorage still gives one stable id for the
// page's lifetime. Bucketing survives a route change, just not a reload.
let memoryId: string | null = null;

/**
 * The id for this browser, creating it on first call.
 *
 * Returns an empty string on the server, where there is no visitor to identify.
 * Callers should skip identify and flag work when they get one.
 */
export function getDistinctId(store: IdStore | null = defaultStore()): string {
  if (typeof window === 'undefined') return '';

  if (store) {
    try {
      const existing = store.getItem(DISTINCT_ID_KEY);
      if (existing) return existing;
      const created = randomId();
      store.setItem(DISTINCT_ID_KEY, created);
      return created;
    } catch {
      // fall through to the memory id
    }
  }

  memoryId ??= randomId();
  return memoryId;
}

/** Test hook. Clears the in-memory fallback id. */
export function resetMemoryId(): void {
  memoryId = null;
}
