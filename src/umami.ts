import { safeTrack, type TrackFn } from './events.js';
import { getDistinctId } from './distinct-id.js';

/**
 * A minimal Umami adapter, for the products that have none.
 *
 * `namescout` and `mobrev` already have working adapters and should keep them.
 * This exists for `web` and `dropkiln`, which have nothing.
 *
 * Two things about `window.umami` that are easy to get wrong:
 *
 * 1. `track(object)` REPLACES the whole payload rather than extending it, so
 *    the website id goes missing and the server answers 400. Use the function
 *    form, which hands you the base payload to spread.
 * 2. With `data-auto-track="false"` a missed pageview call is a missed
 *    pageview. The script itself sends nothing.
 */

export interface UmamiGlobal {
  track: {
    (): unknown;
    (eventName: string, eventData?: Record<string, unknown>): unknown;
    (build: (payload: Record<string, unknown>) => Record<string, unknown>): unknown;
  };
  identify(id: string, data?: Record<string, unknown>): unknown;
}

export interface UmamiClient {
  track: TrackFn;
  pageview(path?: string): void;
  identify(id: string, props?: Record<string, unknown>): void;
}

export interface UmamiOptions {
  /** Base URL, no /script.js. For example https://analytics.zonily.cloud */
  hostUrl: string;
  /** The website id for this environment. Blank turns everything off. */
  websiteId: string;
  /** Reads the global. Injected for tests. */
  getGlobal?: () => UmamiGlobal | undefined;
}

/** A client that drops everything, for when no website id is configured. */
export function createNoopUmami(): UmamiClient {
  return { track() {}, pageview() {}, identify() {} };
}

/**
 * Insert the Umami tracker script.
 *
 * Auto-tracking is off, so this module owns every pageview. That is deliberate:
 * a client-side route change is not a document load, and auto-track would miss
 * every one of them.
 */
export function loadUmamiScript(options: {
  hostUrl: string;
  websiteId: string;
  doc?: Document;
}): void {
  const doc = options.doc ?? document;
  if (!options.websiteId || !options.hostUrl) return;
  if (doc.querySelector('script[data-website-id]')) return;

  const script = doc.createElement('script');
  script.async = true;
  script.src = `${options.hostUrl.replace(/\/$/, '')}/script.js`;
  script.setAttribute('data-website-id', options.websiteId);
  script.setAttribute('data-auto-track', 'false');
  // Respect the browser's Do Not Track setting. Supported from Umami 2.17.
  script.setAttribute('data-do-not-track', 'true');
  doc.head.appendChild(script);
}

export function createUmami(options: UmamiOptions): UmamiClient {
  if (!options.websiteId || !options.hostUrl) return createNoopUmami();

  const read = options.getGlobal ?? (() => (globalThis as Record<string, unknown>).umami as UmamiGlobal | undefined);

  const client: UmamiClient = {
    track: safeTrack((event, props) => {
      read()?.track(event, props);
    }),

    pageview(path) {
      try {
        // Function form. An object here replaces the payload and drops the
        // website id, which the server answers with a 400.
        read()?.track((payload) => ({
          ...payload,
          ...(path ? { url: path } : {}),
        }));
      } catch {
        // never throw
      }
    },

    identify(id, props) {
      try {
        read()?.identify(id, props);
      } catch {
        // never throw
      }
    },
  };

  return client;
}

/**
 * Load the script, identify the visitor, and send the first pageview.
 *
 * The pageview is queued behind a microtask so the script has a chance to
 * define the global. If it has not arrived yet the call is dropped, which the
 * caller covers by sending a pageview on its first route render too.
 */
export function startUmami(options: UmamiOptions): UmamiClient {
  const client = createUmami(options);
  if (!options.websiteId) return client;

  loadUmamiScript({ hostUrl: options.hostUrl, websiteId: options.websiteId });

  const did = getDistinctId();
  if (did) client.identify(did);

  return client;
}
