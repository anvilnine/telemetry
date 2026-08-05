import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutotrack, trackFormResult } from './autotrack.js';

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe('createAutotrack clicks', () => {
  beforeEach(() => setBody(''));

  it('reports a click on a tracked element', () => {
    const track = vi.fn();
    setBody('<button data-track-id="hero-primary" data-track-location="hero">Start now</button>');
    const auto = createAutotrack({ track });
    auto.start();

    document.querySelector('button')!.click();

    expect(track).toHaveBeenCalledWith('button_click', {
      id: 'hero-primary',
      label: 'Start now',
      location: 'hero',
    });
    auto.stop();
  });

  it('counts a click on a child as a click on the tracked element', () => {
    const track = vi.fn();
    setBody('<button data-track-id="cta"><span id="inner">Go</span></button>');
    const auto = createAutotrack({ track });
    auto.start();

    document.getElementById('inner')!.click();

    expect(track).toHaveBeenCalledWith('button_click', expect.objectContaining({ id: 'cta' }));
    auto.stop();
  });

  it('prefers an explicit label over the text', () => {
    const track = vi.fn();
    setBody('<button data-track-id="x" data-track-label="Explicit">Visible text</button>');
    const auto = createAutotrack({ track });
    auto.start();

    document.querySelector('button')!.click();

    expect(track).toHaveBeenCalledWith('button_click', expect.objectContaining({ label: 'Explicit' }));
    auto.stop();
  });

  it('ignores an untracked element', () => {
    const track = vi.fn();
    setBody('<button>Plain</button>');
    const auto = createAutotrack({ track });
    auto.start();

    document.querySelector('button')!.click();

    expect(track).not.toHaveBeenCalled();
    auto.stop();
  });

  it('stops listening after stop', () => {
    const track = vi.fn();
    setBody('<button data-track-id="x">Go</button>');
    const auto = createAutotrack({ track });
    auto.start();
    auto.stop();

    document.querySelector('button')!.click();

    expect(track).not.toHaveBeenCalled();
  });
});

describe('createAutotrack outbound links', () => {
  beforeEach(() => setBody(''));

  it('reports a link leaving the origin', () => {
    const track = vi.fn();
    setBody('<a href="https://namescout.app/" data-track-product="namescout" data-track-location="card">NameScout</a>');
    const auto = createAutotrack({ track, origin: 'https://anvilnine.com' });
    auto.start();

    document.querySelector('a')!.click();

    expect(track).toHaveBeenCalledWith('outbound_click', {
      product: 'namescout',
      placement: 'card',
    });
    auto.stop();
  });

  it('ignores a same-origin link', () => {
    const track = vi.fn();
    setBody('<a href="/about">About</a>');
    const auto = createAutotrack({ track, origin: location.origin });
    auto.start();

    document.querySelector('a')!.click();

    expect(track).not.toHaveBeenCalledWith('outbound_click', expect.anything());
    auto.stop();
  });

  it('ignores mailto and anchor links', () => {
    const track = vi.fn();
    setBody('<a id="m" href="mailto:a@b.c">Mail</a><a id="h" href="#top">Top</a>');
    const auto = createAutotrack({ track, origin: location.origin });
    auto.start();

    document.getElementById('m')!.click();
    document.getElementById('h')!.click();

    expect(track).not.toHaveBeenCalledWith('outbound_click', expect.anything());
    auto.stop();
  });

  it('skips links an existing product event already owns', () => {
    // Namescout's claim links emit claim_clicked, which is the affiliate
    // funnel. Firing outbound_click too would count the same click twice.
    const track = vi.fn();
    setBody('<a class="claim" href="https://registrar.example/x">Register</a>');
    const auto = createAutotrack({
      track,
      origin: 'https://namescout.app',
      outboundIgnore: ['.claim'],
    });
    auto.start();

    document.querySelector('a')!.click();

    expect(track).not.toHaveBeenCalledWith('outbound_click', expect.anything());
    auto.stop();
  });
});

describe('createAutotrack forms', () => {
  beforeEach(() => setBody(''));

  it('reports a submit on a tracked form', () => {
    const track = vi.fn();
    setBody('<form data-track-form="waitlist"><button type="submit">Join</button></form>');
    const auto = createAutotrack({ track });
    auto.start();

    document.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(track).toHaveBeenCalledWith('form_submit', { form: 'waitlist', ok: true });
    auto.stop();
  });

  it('ignores an untagged form', () => {
    const track = vi.fn();
    setBody('<form><button type="submit">Go</button></form>');
    const auto = createAutotrack({ track });
    auto.start();

    document.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(track).not.toHaveBeenCalled();
    auto.stop();
  });
});

describe('trackFormResult', () => {
  it('reports a failure for a form handled in JS', () => {
    const track = vi.fn();
    trackFormResult(track, 'waitlist', false);
    expect(track).toHaveBeenCalledWith('form_submit', { form: 'waitlist', ok: false });
  });
});

describe('createAutotrack scroll depth', () => {
  beforeEach(() => {
    setBody('');
    // start() fires once to catch a page that begins scrolled, so a leftover
    // scrollY from the previous test would fire every depth immediately.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  function sizePage(scrollHeight: number, innerHeight: number) {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: scrollHeight,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  }

  function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
  }

  it('reports each depth once, in order', () => {
    const track = vi.fn();
    sizePage(2000, 1000); // 1000px of scroll available
    const auto = createAutotrack({ track });
    auto.start();

    scrollTo(250);
    scrollTo(500);
    scrollTo(1000);

    const depths = track.mock.calls
      .filter(([name]) => name === 'scroll_depth')
      .map(([, props]) => (props as { percent: number }).percent);
    expect(depths).toEqual([25, 50, 75, 100]);
    auto.stop();
  });

  it('does not report the same depth twice', () => {
    const track = vi.fn();
    sizePage(2000, 1000);
    const auto = createAutotrack({ track });
    auto.start();

    scrollTo(250);
    scrollTo(260);
    scrollTo(250);

    const count = track.mock.calls.filter(([name]) => name === 'scroll_depth').length;
    expect(count).toBe(1);
    auto.stop();
  });

  it('reports nothing on a page shorter than the viewport', () => {
    // Otherwise every short page reports 100% and drowns the real numbers.
    const track = vi.fn();
    sizePage(600, 1000);
    const auto = createAutotrack({ track });
    auto.start();

    scrollTo(0);

    expect(track).not.toHaveBeenCalled();
    auto.stop();
  });

  it('reports again after a client-side route change', () => {
    const track = vi.fn();
    sizePage(2000, 1000);
    const auto = createAutotrack({ track });
    auto.start();

    scrollTo(250);
    auto.resetScroll();
    scrollTo(250);

    const count = track.mock.calls.filter(([name]) => name === 'scroll_depth').length;
    expect(count).toBe(2);
    auto.stop();
  });
});
