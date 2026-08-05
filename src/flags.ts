import { EVENTS, safeTrack, type TrackFn } from './events.js';
import { getDistinctId } from './distinct-id.js';

/**
 * GrowthBook, wired to whatever analytics client the app already has.
 *
 * GrowthBook decides which variation a visitor sees. It does not measure
 * anything: it has no data source it can query, and Umami is not a supported
 * one. So the exposure event has to come back out through analytics, and the
 * result is read in Umami.
 *
 * One rule this enforces: exposure is logged even when experiments are held to
 * control. That proves the wiring works while a surface still has too little
 * traffic for a split to mean anything.
 */

/** The bits of the GrowthBook SDK this module uses. Injected so tests need no SDK. */
export interface GrowthBookLike {
  init(options?: { streaming?: boolean; timeout?: number }): Promise<unknown>;
  isOn(key: string): boolean;
  getFeatureValue<T>(key: string, fallback: T): T;
  setAttributes(attrs: Record<string, unknown>): unknown;
  destroy?(): void;
}

export interface FlagsOptions {
  /** GrowthBook SDK instance, already constructed. */
  client: GrowthBookLike;
  /** Where exposure events go. */
  track: TrackFn;
  /**
   * Hold every experiment to its control variation while still logging
   * exposure. Use until the surface clears roughly 200 sessions a week.
   */
  holdToControl?: boolean;
  /** How long to wait for the flag payload before giving up. Default 2000ms. */
  timeout?: number;
}

export interface Flags {
  ready(): Promise<void>;
  isOn(key: string): boolean;
  value<T>(key: string, fallback: T): T;
  /** The variation this visitor is in, for stamping onto conversion events. */
  assignments(): Record<string, string>;
  destroy(): void;
}

/**
 * Build the config object for the GrowthBook SDK constructor.
 *
 * Kept separate from the SDK import so this package does not force a dependency
 * on apps that only want autotrack. The caller does:
 *
 *   const gb = new GrowthBook(growthbookConfig({ apiHost, clientKey, track }))
 *   const flags = createFlags({ client: gb, track })
 */
export function growthbookConfig(options: {
  apiHost: string;
  clientKey: string;
  track: TrackFn;
  /** Extra targeting attributes. `id` is always overridden with the distinct id. */
  attributes?: Record<string, unknown>;
  devMode?: boolean;
}): Record<string, unknown> {
  const track = safeTrack(options.track);
  return {
    apiHost: options.apiHost,
    clientKey: options.clientKey,
    enableDevMode: options.devMode ?? false,
    attributes: {
      ...(options.attributes ?? {}),
      // Always last. The auto-attributes plugin mints its own anonymous id, and
      // that one would not match the id Umami identifies the session with.
      id: getDistinctId(),
    },
    trackingCallback: (
      experiment: { key: string },
      result: { key: string | number },
    ) => {
      track(EVENTS.experimentViewed, {
        experiment: experiment.key,
        variation: String(result.key),
      });
    },
  };
}

export function createFlags(options: FlagsOptions): Flags {
  const { client, holdToControl = false } = options;
  const seen: Record<string, string> = {};
  let readyPromise: Promise<void> | null = null;

  return {
    ready() {
      readyPromise ??= client
        .init({ streaming: true, timeout: options.timeout ?? 2000 })
        .then(() => undefined)
        // A flag host that is down must not stop the page. Every lookup then
        // falls back to its default, which is the control experience.
        .catch(() => undefined);
      return readyPromise;
    },

    isOn(key) {
      if (holdToControl) {
        seen[key] = 'control';
        return false;
      }
      try {
        const on = client.isOn(key);
        seen[key] = on ? 'on' : 'off';
        return on;
      } catch {
        return false;
      }
    },

    value(key, fallback) {
      if (holdToControl) {
        seen[key] = 'control';
        return fallback;
      }
      try {
        const v = client.getFeatureValue(key, fallback);
        seen[key] = String(v);
        return v;
      } catch {
        return fallback;
      }
    },

    assignments() {
      return { ...seen };
    },

    destroy() {
      try {
        client.destroy?.();
      } catch {
        // never throw
      }
    },
  };
}

/**
 * Add the current variations to a conversion event's properties as
 * `exp_<key>`, so Umami can segment conversions by bucket with no join.
 */
export function withAssignments(
  flags: Flags,
  props: Record<string, unknown> = {},
): Record<string, unknown> {
  const out = { ...props };
  for (const [key, variation] of Object.entries(flags.assignments())) {
    out[`exp_${key}`] = variation;
  }
  return out;
}
