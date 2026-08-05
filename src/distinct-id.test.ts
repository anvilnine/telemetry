import { describe, expect, it } from 'vitest';
import { DISTINCT_ID_KEY, getDistinctId, type IdStore } from './distinct-id.js';

function memoryStore(initial: Record<string, string> = {}): IdStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('getDistinctId', () => {
  it('creates an id on first call and stores it', () => {
    const store = memoryStore();
    const id = getDistinctId(store);
    expect(id).toBeTruthy();
    expect(store.data[DISTINCT_ID_KEY]).toBe(id);
  });

  it('returns the same id on the next call', () => {
    const store = memoryStore();
    expect(getDistinctId(store)).toBe(getDistinctId(store));
  });

  it('reuses an id that is already stored', () => {
    const store = memoryStore({ [DISTINCT_ID_KEY]: 'existing-id' });
    expect(getDistinctId(store)).toBe('existing-id');
  });

  it('still returns a stable id when storage throws on write', () => {
    // Safari in private mode has localStorage and throws when you use it.
    const broken: IdStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const first = getDistinctId(broken);
    expect(first).toBeTruthy();
    expect(getDistinctId(broken)).toBe(first);
  });

  it('gives two different browsers different ids', () => {
    expect(getDistinctId(memoryStore())).not.toBe(getDistinctId(memoryStore()));
  });
});
