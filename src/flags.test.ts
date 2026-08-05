import { describe, expect, it, vi } from 'vitest';
import {
  createFlags,
  growthbookConfig,
  withAssignments,
  type GrowthBookLike,
} from './flags.js';

function fakeClient(over: Partial<GrowthBookLike> = {}): GrowthBookLike {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    isOn: vi.fn().mockReturnValue(true),
    getFeatureValue: vi.fn((_k: string, fb: unknown) => fb),
    setAttributes: vi.fn(),
    destroy: vi.fn(),
    ...over,
  };
}

describe('growthbookConfig', () => {
  it('emits experiment_viewed through the given track function', () => {
    const track = vi.fn();
    const config = growthbookConfig({
      apiHost: 'https://flags-api.zonily.cloud',
      clientKey: 'sdk-test',
      track,
    });

    const cb = config.trackingCallback as (e: { key: string }, r: { key: string }) => void;
    cb({ key: 'web-hero-headline' }, { key: '1' });

    expect(track).toHaveBeenCalledWith('experiment_viewed', {
      experiment: 'web-hero-headline',
      variation: '1',
    });
  });

  it('keeps caller attributes but always owns id', () => {
    const config = growthbookConfig({
      apiHost: 'https://flags-api.zonily.cloud',
      clientKey: 'sdk-test',
      track: vi.fn(),
      attributes: { country: 'PH', id: 'someone-elses-id' },
    });
    const attrs = config.attributes as Record<string, unknown>;
    expect(attrs.country).toBe('PH');
    // Server-side there is no visitor, so the distinct id is blank. The point
    // is that the caller's id does not survive.
    expect(attrs.id).not.toBe('someone-elses-id');
  });
});

describe('createFlags', () => {
  it('returns the client value when running normally', () => {
    const flags = createFlags({ client: fakeClient(), track: vi.fn() });
    expect(flags.isOn('web-hero-headline')).toBe(true);
  });

  it('holds every experiment to control when asked', () => {
    const client = fakeClient();
    const flags = createFlags({ client, track: vi.fn(), holdToControl: true });

    expect(flags.isOn('web-hero-headline')).toBe(false);
    expect(flags.value('web-hero-copy', 'fallback')).toBe('fallback');
    // The whole point of the hold: the SDK is never consulted, but exposure is
    // still recorded, so the wiring is proven before the split matters.
    expect(client.isOn).not.toHaveBeenCalled();
    expect(flags.assignments()).toEqual({
      'web-hero-headline': 'control',
      'web-hero-copy': 'control',
    });
  });

  it('falls back to control when the client throws', () => {
    const client = fakeClient({
      isOn: vi.fn(() => {
        throw new Error('flag host is down');
      }),
    });
    const flags = createFlags({ client, track: vi.fn() });
    expect(flags.isOn('web-hero-headline')).toBe(false);
  });

  it('does not reject when init fails', async () => {
    const client = fakeClient({ init: vi.fn().mockRejectedValue(new Error('offline')) });
    const flags = createFlags({ client, track: vi.fn() });
    await expect(flags.ready()).resolves.toBeUndefined();
  });

  it('initialises once however often ready is called', async () => {
    const client = fakeClient();
    const flags = createFlags({ client, track: vi.fn() });
    await Promise.all([flags.ready(), flags.ready(), flags.ready()]);
    expect(client.init).toHaveBeenCalledTimes(1);
  });
});

describe('withAssignments', () => {
  it('stamps each variation onto a conversion event', () => {
    const flags = createFlags({ client: fakeClient(), track: vi.fn() });
    flags.isOn('web-hero-headline');

    expect(withAssignments(flags, { form: 'waitlist', ok: true })).toEqual({
      form: 'waitlist',
      ok: true,
      'exp_web-hero-headline': 'on',
    });
  });

  it('returns the properties unchanged when nothing was assigned', () => {
    const flags = createFlags({ client: fakeClient(), track: vi.fn() });
    expect(withAssignments(flags, { form: 'waitlist' })).toEqual({ form: 'waitlist' });
  });
});
