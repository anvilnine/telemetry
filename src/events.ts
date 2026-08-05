/**
 * The five event names every Anvil Nine product reports.
 *
 * These strings are the wire format. Umami reports and saved funnels reference
 * them verbatim, so renaming one splits its history and breaks every report
 * built on it. Add new names, never rename an existing one.
 *
 * There is deliberately no `page_view` here. Umami stores pageviews natively
 * when the tracker loads. A custom event with that name creates a second row
 * and splits every pageview report in the dashboard.
 */
export const EVENTS = {
  buttonClick: 'button_click',
  formSubmit: 'form_submit',
  scrollDepth: 'scroll_depth',
  experimentViewed: 'experiment_viewed',
  outboundClick: 'outbound_click',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * How this package sends an event.
 *
 * Every product already has its own analytics client with its own method name
 * (namescout calls it `track`, mobrev calls it `capture`). Rather than force a
 * shared interface on both, this package takes a plain function and calls it.
 * Each app passes whatever its own client already does.
 *
 * That keeps the two working implementations untouched. Nothing here needs a
 * migration to start using it.
 */
export type TrackFn = (event: string, props?: Record<string, unknown>) => void;

/** A sink that drops everything. Used when no analytics client is configured. */
export const noopTrack: TrackFn = () => {};

/**
 * Umami limits: strings to 500 characters, 50 properties per object, numbers to
 * 4 decimal places. Anything longer is rejected, so trim before sending rather
 * than losing the whole event.
 */
export const UMAMI_STRING_LIMIT = 500;

/** Cut a string to what Umami will accept. */
export function clip(value: string): string {
  return value.length > UMAMI_STRING_LIMIT ? value.slice(0, UMAMI_STRING_LIMIT) : value;
}

/**
 * Wrap a track function so it can never throw into the caller and never sends a
 * string Umami would reject. Analytics must not break a page.
 */
export function safeTrack(track: TrackFn): TrackFn {
  return (event, props) => {
    try {
      if (!props) {
        track(event);
        return;
      }
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        clean[key] = typeof value === 'string' ? clip(value) : value;
      }
      track(event, clean);
    } catch {
      // never throw
    }
  };
}
