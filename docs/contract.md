# The Anvil Nine analytics contract

This is the part that has to stay identical across `web`, `mobrev`, `namescout` and `dropkiln`.
Anything a single product decides for itself belongs in that product's own `docs/analytics.md`,
built from [`templates/analytics.md`](templates/analytics.md).

## Hosts

| Thing | URL |
|---|---|
| Umami dashboard and tracker script | `https://analytics.zonily.cloud` |
| GrowthBook dashboard | `https://flags.zonily.cloud` |
| GrowthBook SDK endpoint | `https://flags-api.zonily.cloud` |

The GrowthBook SDK host is a different hostname from its dashboard. Pointing an SDK at
`flags.zonily.cloud` fails.

## Events

Five names. They are the wire format, so Umami reports and saved funnels reference them verbatim.

| Event | Properties | Fires when |
|---|---|---|
| `button_click` | `id`, `label`, `location` | any element with `data-track-id` is clicked |
| `form_submit` | `form`, `ok` | a form with `data-track-form` submits |
| `scroll_depth` | `percent` (25, 50, 75, 100) | the visitor passes a depth, once per pageview |
| `experiment_viewed` | `experiment`, `variation` | GrowthBook assigns a variation |
| `outbound_click` | `product`, `placement` | a link leaving the origin is clicked |

**There is no `page_view`.** Umami stores pageviews natively when the tracker loads. A custom
event with that name creates a second row and splits every pageview report.

**Never rename an existing event.** A rename splits its history and breaks every report built on
it. Products that already have their own events (`search_performed`, `claim_clicked`,
`console_snapshot:*`) keep them exactly as they are. The five above are added alongside.

**Never fire two events for one action.** Where a product event already owns a link, exclude that
link from `outbound_click` with the `outboundIgnore` option. Namescout's claim links emit
`claim_clicked`, which is its affiliate funnel; firing both counts one click twice.

Umami rejects values over its limits, so `safeTrack` cuts strings at 500 characters. Objects are
capped at 50 properties and numbers at 4 decimal places.

## Attribute vocabulary

| Attribute | On | Meaning |
|---|---|---|
| `data-track-id` | any clickable element | stable id, kebab-case, never renamed once live |
| `data-track-label` | any clickable element | overrides the visible text as the label |
| `data-track-location` | any clickable element or link | where on the page it sits |
| `data-track-form` | a form | the form's name, one per form across all its placements |
| `data-track-product` | an outbound link | which product it points at |

`location` uses a shared vocabulary so reports compare across products: `hero`, `nav`, `card`,
`table`, `close`, `pricing`, `footer`, `pointer`, `firstrun`, `empty`.

One form name per form, not per page. Placement stays a separate dimension, otherwise the same
form on three pages looks like three different conversions.

## Flag keys

`<product>-<surface>-<thing>`.

One GrowthBook project holds every flag, so the prefix is the namespace. Examples:
`web-hero-headline`, `mobrev-pricing-headline`, `namescout-results-cta`, `dropkiln-hero-copy`.

## Distinct id

One random uuid per browser under the `an_did` key in localStorage. It goes to both
`umami.identify()` and GrowthBook `attributes.id`.

Both have to hold the same value. Umami buckets sessions on its own and GrowthBook buckets
experiments on `attributes.id`. If those disagree, an experiment bucket and an Umami session refer
to different people and no result can be read. GrowthBook's auto-attributes plugin mints its own
anonymous id, so `growthbookConfig()` always overwrites `id` after spreading the caller's
attributes.

Where a real user id exists (the namescout hub, the mobrev console), alias it onto the anonymous
id after sign-in, never before.

## Environment split

Every product reads `APP_ENV`, one of `prod` or `dev`. That selects the Umami website id and the
GrowthBook client key.

Both blank means everything is off and no request is made. That is the default in local
development, in CI, and in any self-hosted install.

Vite, Astro and Next inline their public variables at build time. Changing one needs a rebuild,
not a restart. Restarting a container with a new value leaves the old value in the JavaScript that
browsers download.

## Measurement, and what it cannot do

GrowthBook assigns variations. Umami records the exposure and the conversion. Umami v3 has native
Funnels, Goals, Journeys, Segments and Attribution, so the analysis surface is good.

GrowthBook computes no lift and no significance. It has no data source it can query, and Umami is
not a supported one. Reading a result is a judgement call.

Hold every experiment to control until its surface clears roughly 200 sessions a week, while still
logging `experiment_viewed`. That proves the wiring before the split means anything.

Stamp the active variations onto every conversion event as `exp_<key>` with `withAssignments()`,
so Umami can segment conversions by bucket without a join.

## Cross-site funnel

anvilnine.com links out to the product sites. A seventh Umami website, "anvilnine funnel (prod)",
loads as a **second** tracker on anvilnine.com and on each product's landing page, so one dataset
spans both sides of the hop and Umami's own funnel report works end to end. The per-product
dashboards stay uncontaminated.

Outbound links carry `?utm_source=anvilnine.com&utm_medium=referral&utm_campaign=<placement>`.
Umami parses UTM parameters natively.

The `web` preview deploy is served from `artifacts.zonily.cloud/a/anvilnine/`, so it reports a
different hostname. Exclude that hostname from the rollup or it double-counts.

## Public repos

`dropkiln` is public and MIT. Three rules apply there and nowhere else.

1. **Zero telemetry by default, provably.** With `UMAMI_WEBSITE_ID` unset, the served HTML must
   match the committed file byte for byte, `/telemetry.js` must 404, and the CSP header must be
   unchanged. That check belongs in the public smoke suite, because a promise anyone can verify
   beats a promise in prose.
2. **Never track user content.** Nothing is injected into published artifacts or tenant sites on
   `dropkiln.app`, in any configuration. To measure the loop from published pages, use a plain
   link back to `dropkiln.com/?ref=frame` and read the referrer. No script, no beacon.
3. **Env var names only in public docs.** Website ids and client keys are not secrets, they ship
   in the browser bundle. But publishing the org's internal website-id map in a public repo
   exposes infrastructure layout for no benefit.

`dropkiln` also has no build step, so it cannot install this package. It vendors the prebuilt
browser bundle and serves it from its own origin, which also keeps `script-src 'self'` intact.

## Per-product docs

Each product keeps a `docs/analytics.md` from [`templates/analytics.md`](templates/analytics.md)
holding only its own website ids, env values, events, flags and verify steps. Everything shared
points back here.
