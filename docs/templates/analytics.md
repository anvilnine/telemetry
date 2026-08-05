# Analytics: <PRODUCT>

Copy this file to `docs/analytics.md` in the product repo and fill it in. Keep only what is local
to this product. The shared contract (event names, attribute vocabulary, flag naming, distinct id,
environment rules) lives in the `anvilnine/telemetry` repo, `docs/contract.md`. Do not restate it
here; it will go stale.

Structure copied from `namescout/docs/deploy/umami-integration.md`, which got this shape right.

## Website ids

Umami is self-hosted at `https://analytics.zonily.cloud`. The tracker script is
`https://analytics.zonily.cloud/script.js`; server events go to
`https://analytics.zonily.cloud/api/send`.

| Environment | Surfaces | Website id |
|---|---|---|
| prod | <hostname> | `<uuid>` |
| dev | <hostname> | `<uuid>` |

Local runs leave the website id blank, which turns tracking off while keeping the host documented
in the template.

## Flag connection

GrowthBook is self-hosted. The SDK endpoint is `https://flags-api.zonily.cloud`, which is a
different hostname from the dashboard at `https://flags.zonily.cloud`.

| Environment | Connection name | Client key |
|---|---|---|
| prod | `<product>-prod` | `<sdk-key>` |
| dev | `<product>-dev` | `<sdk-key>` |

Client keys are public by design; they ship in the browser bundle. In a public repo, list the
environment variable names here and leave the values out.

## Environment variables

| Var | Surface | Notes |
|---|---|---|
| `PUBLIC_UMAMI_HOST` | | `https://analytics.zonily.cloud`. Base URL only, no `/script.js`. |
| `PUBLIC_UMAMI_WEBSITE_ID` | | Website id for this environment. Blank turns tracking off. |
| `PUBLIC_GROWTHBOOK_HOST` | | `https://flags-api.zonily.cloud` |
| `PUBLIC_GROWTHBOOK_KEY` | | Client key for this environment. Blank turns flags off. |
| `APP_ENV` | | `prod` or `dev`. |

Where these are set: <workflow file, Coolify build variables, .env template>.

Public variables are inlined at build time, so changing one needs a rebuild, not a restart.

## What is wired

- <which layout or provider loads the tracker>
- <where autotrack starts>
- <where identify fires, and whether a real user id aliases onto the anonymous one>
- <whether experiments are held to control, and why>

## Events this product sends

The five shared events come from `@anvilnine/telemetry` and are not repeated here. Below are this
product's own event names. They are frozen: Umami reports reference them verbatim, so renaming one
breaks existing funnels.

| Event | Fires from |
|---|---|
| | |

## Tracked elements

| `data-track-id` | Where | Location value |
|---|---|---|
| | | |

| `data-track-form` | Where |
|---|---|
| | |

## Flags

| Flag key | Variations | Success event | Status |
|---|---|---|---|
| | | | held to control / running / concluded |

## Verify

1. Load the surface, click a tracked button, submit a tracked form, scroll to the bottom.
2. In the Umami dashboard, pick the right website. Within a minute you should see the pageview
   plus `button_click`, `form_submit` and four `scroll_depth` rows.
3. With `APP_ENV=dev`, confirm events land on the dev website id and nothing reaches prod.
4. With both env vars blank, confirm the browser makes zero requests to `analytics.zonily.cloud`
   and `flags-api.zonily.cloud`.

## Caveats

- <anything specific to this product that will bite the next person>
