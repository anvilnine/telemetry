import { describe, expect, it, vi } from 'vitest';
import { EVENTS, clip, safeTrack, UMAMI_STRING_LIMIT } from './events.js';

describe('EVENTS', () => {
  // These strings are the wire format. Umami reports reference them verbatim,
  // so this test exists to make a rename fail loudly instead of silently
  // splitting a funnel's history.
  it('holds the exact five frozen names', () => {
    expect(EVENTS).toEqual({
      buttonClick: 'button_click',
      formSubmit: 'form_submit',
      scrollDepth: 'scroll_depth',
      experimentViewed: 'experiment_viewed',
      outboundClick: 'outbound_click',
    });
  });

  it('has no page_view, which would split Umami native pageviews', () => {
    expect(Object.values(EVENTS)).not.toContain('page_view');
  });
});

describe('clip', () => {
  it('leaves a short string alone', () => {
    expect(clip('hello')).toBe('hello');
  });

  it('cuts at the Umami string limit', () => {
    const long = 'x'.repeat(UMAMI_STRING_LIMIT + 50);
    expect(clip(long)).toHaveLength(UMAMI_STRING_LIMIT);
  });
});

describe('safeTrack', () => {
  it('passes the event and properties through', () => {
    const inner = vi.fn();
    safeTrack(inner)('button_click', { id: 'a', location: 'hero' });
    expect(inner).toHaveBeenCalledWith('button_click', { id: 'a', location: 'hero' });
  });

  it('calls with no properties when none are given', () => {
    const inner = vi.fn();
    safeTrack(inner)('button_click');
    expect(inner).toHaveBeenCalledWith('button_click');
  });

  it('trims long strings so Umami does not reject the whole event', () => {
    const inner = vi.fn();
    safeTrack(inner)('button_click', { label: 'y'.repeat(600) });
    const props = inner.mock.calls[0][1] as Record<string, unknown>;
    expect(props.label).toHaveLength(UMAMI_STRING_LIMIT);
  });

  it('leaves non-string values untouched', () => {
    const inner = vi.fn();
    safeTrack(inner)('scroll_depth', { percent: 50, ok: true });
    expect(inner).toHaveBeenCalledWith('scroll_depth', { percent: 50, ok: true });
  });

  it('swallows an error from the inner function', () => {
    const inner = vi.fn(() => {
      throw new Error('analytics host is down');
    });
    expect(() => safeTrack(inner)('button_click')).not.toThrow();
  });
});
