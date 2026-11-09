# @anvilnine/telemetry

Shared analytics and feature-flag wiring for Anvil Nine products.

This package holds the code no product had yet: the GrowthBook wrapper, the distinct id, and
autotracking for clicks, forms, scroll depth and outbound links. It does **not** replace the
working Umami adapters in `namescout` and `mobrev`. Both keep theirs.

The contract every product follows lives in [`docs/contract.md`](docs/contract.md). Read that
first. It is the part that has to stay identical across repos.

## Why it takes a function instead of an interface

Every product already has an analytics client, and they disagree on the method name. Namescout
calls it `track`, mobrev calls it `capture`. Namescout's interface is also generic over its own
event map, so it cannot be shared without rewriting it.

So this package takes a plain function:

```ts
type TrackFn = (event: string, props?: Record<string, unknown>) => void
```

Each app passes whatever its own client already does. Nothing needs a migration to start using
this, and the two working implementations stay untouched.

## Install

```bash
npm i @anvilnine/telemetry
```

No runtime dependencies. GrowthBook is optional and stays the caller's dependency, because
`growthbookConfig()` returns a config object rather than constructing a client.

`dropkiln` serves its pages under a `script-src 'self'` policy, so its browser code cannot load a
module from a CDN and it has no bundler to inline one. It vendors the prebuilt bundle from
`npm run build:browser` instead. See `docs/contract.md`.

## Use

```ts
import {
  createAutotrack,
  createFlags,
  growthbookConfig,
  getDistinctId,
  startUmami,
  withAssignments,
} from '@anvilnine/telemetry'
import { GrowthBook } from '@growthbook/growthbook'

// 1. An analytics client. Products that already have one skip this and pass
//    their own method as `track` below.
const umami = startUmami({
  hostUrl: import.meta.env.PUBLIC_UMAMI_HOST,
  websiteId: import.meta.env.PUBLIC_UMAMI_WEBSITE_ID,
})

// 2. Autotracking. Clicks, forms, scroll depth, outbound links.
const auto = createAutotrack({ track: umami.track })
auto.start()

// 3. Flags. GrowthBook assigns; the exposure event comes back through analytics.
const gb = new GrowthBook(
  growthbookConfig({
    apiHost: import.meta.env.PUBLIC_GROWTHBOOK_HOST,
    clientKey: import.meta.env.PUBLIC_GROWTHBOOK_KEY,
    track: umami.track,
  }),
)
const flags = createFlags({ client: gb, track: umami.track, holdToControl: true })
await flags.ready()

if (flags.isOn('web-hero-headline')) {
  // render the variation
}

// 4. Stamp the variation onto a conversion so Umami can segment it.
umami.track('form_submit', withAssignments(flags, { form: 'waitlist', ok: true }))
```

Markup opts in with attributes. No per-element wiring:

```html
<button data-track-id="hero-primary" data-track-location="hero">Start</button>
<form data-track-form="waitlist">...</form>
<a href="https://namescout.app" data-track-product="namescout" data-track-location="card">NameScout</a>
```

## Everything is off by default

With a blank website id and a blank client key, nothing loads and no request is made. That is the
state in local development, in CI, and in any self-hosted install. Turning telemetry on is setting
two environment variables, and turning it off is unsetting them.

Nothing here throws. A dead analytics host loses data and changes nothing else on the page.

## Hold experiments to control

`holdToControl: true` still logs `experiment_viewed`, but every flag returns its default. Use it
until a surface clears roughly 200 sessions a week. It proves the wiring works while a split would
still be meaningless.

Three of the four [Anvil Nine](https://anvilnine.com) surfaces are in that state today: anvilnine.com is noindexed,
mobrev is pre-launch, and dropkiln.com does not exist yet.

## Develop

```bash
npm install
npm test          # vitest, jsdom
npm run type-check
npm run build     # tsc to dist/
```

`src/events.test.ts` asserts the exact five event names. That test is there to make a rename fail
loudly rather than silently split a funnel's history in Umami.
