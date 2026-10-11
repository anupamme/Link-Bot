# Administration layout and broadcast audience verification

The cabinet administration and dedicated administration share `admin-layout.css`.
Settings are limited to 960px; wide data tables retain their own width. Controls
use a 40px minimum height (44px on narrow screens), consistent gaps and compact
action widths. Help text is rendered below inputs in the React adapter.
Administration backgrounds, nested decorative frames and pill-shaped action
docks are removed. Customer pages retain their appearance settings.

## Broadcast counting

Unscoped all/paid/trial-used audiences count distinct recipients directly in SQL.
Sending uses the same local eligibility conditions. Panel-dependent categories,
tags and squads still resolve current panel users before sending. Runtime trial
settings are copied once per resolution, instead of once for every customer.
Migration 56 adds a partial index for paid subscription lookups.

The editor displays its pending state and a persistent error with retry. Existing
zero-recipient and draft-version checks still protect the send confirmation.

## Checks

- `go test ./internal/... ./cmd/... ./utils/...`
- `node --test internal/miniapp/*test.mjs` (196 tests)
- `npm run build` in `admin-ui`
- Database integration test with `BROADCAST_AUDIENCE_TEST_DATABASE_URL` pointing
  at an isolated PostgreSQL-compatible test database. Covers eligible channels,
  blocked/synthetic accounts, sender exclusion, language, paid/trial filters,
  secondary subscriptions and stale/running draft guards.
- Browser audit: 26 sections in each shell, at 1440px and 390px. Top and bottom
  screenshots for scrolling pages; clipped controls and invalid nested controls
  checked using rendered bounds. The visual layout editor intentionally displays
  the customer preview it edits.
- Interaction audit: both broadcast channels, pending/failed/successful counting,
  retry, disabling repeated clicks and saving settings. Payment field coordinates
  compared within 1px at 768px/1920px, with single-column controls at 320px.

Browser checks use local preview fixtures and intercepted API responses. They do
not send broadcasts or change a production service. The database suite separately
executes the actual recipient queries. Production panel latency is not measured
by the preview checks.

## Reproduce browser checks

Serve `internal/miniapp/static` at `/mini-app/` on a loopback HTTP server. Set
`QA_BASE_URL` if the server is not `http://127.0.0.1:8790`. Install Playwright with
Chrome available, or set `PLAYWRIGHT_MODULE` to an existing Playwright module.

Run `node scripts/admin-redesign-qa.cjs` and
`node scripts/admin-redesign-interactions.cjs`. Screenshots and the layout report
are saved in `tmp/admin-redesign` (override with `QA_OUTPUT`).

The whole-checkout command `go test ./...` also enters any locally unpacked Go
toolchain under `tmp/`; use the project package paths above in such a checkout.
