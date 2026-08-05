import { EVENTS, safeTrack, type TrackFn } from './events.js';

/**
 * Clicks, form submissions, scroll depth and outbound links, wired once.
 *
 * Everything is delegated off the document, so markup added after start() is
 * covered without re-binding. Elements opt in with attributes:
 *
 *   <button data-track-id="hero-primary" data-track-location="hero">Start</button>
 *   <form data-track-form="waitlist">...</form>
 *
 * A click on any element inside a tracked element counts as a click on it, so
 * icons and spans inside a button work with no extra markup.
 */

export interface AutotrackOptions {
  /** Where events go. Pass your app's own analytics method. */
  track: TrackFn;
  /** Defaults to the whole document. */
  root?: Document | HTMLElement;
  /** Defaults to 25, 50, 75, 100. */
  scrollDepths?: number[];
  /** Own origin, for deciding what counts as outbound. Defaults to the page's. */
  origin?: string;
  /**
   * Links matching any of these selectors never emit `outbound_click`.
   *
   * This exists because a product event can already own a link. Namescout's
   * claim links emit `claim_clicked`, which is its affiliate funnel. Firing
   * both on one anchor counts the same click twice and inflates outbound.
   */
  outboundIgnore?: string[];
}

export interface Autotrack {
  start(): void;
  stop(): void;
  /** Reset the fired scroll depths. Call on a client-side route change. */
  resetScroll(): void;
}

const DEFAULT_DEPTHS = [25, 50, 75, 100];

function labelFor(el: HTMLElement): string {
  const explicit = el.getAttribute('data-track-label');
  if (explicit) return explicit;
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  return (el.textContent ?? '').trim().replace(/\s+/g, ' ');
}

export function createAutotrack(options: AutotrackOptions): Autotrack {
  const track = safeTrack(options.track);
  const depths = [...(options.scrollDepths ?? DEFAULT_DEPTHS)].sort((a, b) => a - b);
  const ignore = options.outboundIgnore ?? [];

  let root: Document | HTMLElement | null = null;
  let fired = new Set<number>();
  let running = false;

  function onClick(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const tracked = target.closest<HTMLElement>('[data-track-id]');
    if (tracked) {
      track(EVENTS.buttonClick, {
        id: tracked.getAttribute('data-track-id') ?? '',
        label: labelFor(tracked),
        location: tracked.getAttribute('data-track-location') ?? '',
      });
    }

    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (link && isOutbound(link) && !ignore.some((sel) => link.matches(sel))) {
      track(EVENTS.outboundClick, {
        product: link.getAttribute('data-track-product') ?? hostOf(link.href),
        placement: link.getAttribute('data-track-location') ?? '',
      });
    }
  }

  function hostOf(href: string): string {
    try {
      return new URL(href, location.href).hostname;
    } catch {
      return '';
    }
  }

  function isOutbound(link: HTMLAnchorElement): boolean {
    const href = link.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) return false;
    if (/^(mailto|tel):/i.test(href)) return false;
    try {
      const own = options.origin ?? location.origin;
      return new URL(href, location.href).origin !== own;
    } catch {
      return false;
    }
  }

  function onSubmit(event: Event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const name = form.getAttribute('data-track-form');
    if (!name) return;
    track(EVENTS.formSubmit, { form: name, ok: true });
  }

  function onScroll() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    // A page shorter than the viewport has nothing to scroll. Reporting 100%
    // for every such page would drown the real numbers.
    if (scrollable <= 0) return;

    const percent = ((window.scrollY || doc.scrollTop) / scrollable) * 100;
    for (const depth of depths) {
      if (percent >= depth && !fired.has(depth)) {
        fired.add(depth);
        track(EVENTS.scrollDepth, { percent: depth });
      }
    }
  }

  return {
    start() {
      if (running || typeof document === 'undefined') return;
      running = true;
      root = options.root ?? document;
      root.addEventListener('click', onClick, true);
      root.addEventListener('submit', onSubmit, true);
      window.addEventListener('scroll', onScroll, { passive: true });
      // Fire for a page that already starts scrolled, such as a hash link.
      onScroll();
    },
    stop() {
      if (!running || !root) return;
      running = false;
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('scroll', onScroll);
      root = null;
    },
    resetScroll() {
      fired = new Set();
    },
  };
}

/**
 * Report a form result after the request settles, for forms handled in JS.
 *
 * The delegated submit listener fires on submit and always reports ok:true,
 * because at that moment nothing knows whether the request will succeed. A form
 * that posts with fetch should skip the attribute and call this instead.
 */
export function trackFormResult(track: TrackFn, form: string, ok: boolean): void {
  safeTrack(track)(EVENTS.formSubmit, { form, ok });
}
