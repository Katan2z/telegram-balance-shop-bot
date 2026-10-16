# BK8 planning workspace

## Deployment

1. Run Python tests, `node tests/planner_engine.cjs`, and the PostgreSQL test below.
2. Apply `docs/migrations/20261016_schedule_planner.sql` in the project's SQL editor. The migration is additive and can be rerun. It does not create or modify live schedules. Do not publish a week as a migration check.
3. Deploy `docs/` through the existing GitHub Pages process. Open `/control/planner-preview.html` for an isolated demonstration, or the Schedule section after administrator sign-in.
4. Configure the hours, SPMH, skills and normative settings. Mark them reviewed. Enter the daily forecast. Generate and inspect a draft, save it, then publish separately.

Rollback: remove the three planner script tags and stylesheet from `control/index.html` to restore the old editor. Leave the additive database tables and versions intact; no destructive rollback is needed. Published weeks remain in the existing bot tables.

## Storage and API

`planner_weeks` stores the current version of a weekly document; `planner_versions` stores every saved version. The document contains config (hours, forecasts, normative bands, profiles, skills, training flags, events, actuals, weather snapshot), plus shifts with business-day minute intervals and a role per half-hour. Data is restaurant-specific to BK8 in this release, not a multi-restaurant tenancy model.

RPCs `planner_get_week(date)`, `planner_save_week(date, integer, text, jsonb)`, and `planner_publish_week(date, integer, boolean)` require `auth.uid()` and server-controlled administrator app metadata. Ordinary authenticated employees and anonymous clients cannot call them. Neither caller-supplied Telegram IDs nor localStorage role flags authorize these RPCs.

The read operation returns employees, an availability fingerprint, version, saved document, and previous week's settings for a new week. New-week forecasts and events start empty. Saving rejects stale versions or changed availability and records a historical version. Partial drafts can be saved. Publication verifies current employees, intervals, permanent days off, PT boundaries, permitted positions, duplicate/overlapping shifts, and writes only `final_schedule`; availability is preserved. Publication requires acknowledgement of coverage/SPMH review. It is not triggered by generation, export, opening a week or saving.

## Model and limitations

Reference: `Расписание с 27.04.2026.xlsm`, read without macro execution or modification. Daily hourly weights are the counts from `Чеки!I5:I22`, O, U, AA, AG, AM, AS (hours 06–23), normalized within configured trading hours. No historical revenue totals or employee identities are copied. Normative breakpoints come from `Чеки!BP5:BQ145`; kitchen/cashier use each `ROUND(norm / 2, 0)` as in the legacy formulas. Preparation/closing uses one person per enabled kitchen/cashier position per half-hour. Optional hall/delivery/receiving staffing and time windows are explicit configurable values, not inferred forecasts. The initial legacy-hour suggestions require administrator review; they are not current operating-hour assertions.

The generator is deterministic and greedy, not an optimal solver. It schedules one continuous shift per employee/day, maintains availability/skills, keeps locked shifts, and exposes unfilled coverage. It may produce long shifts when unconstrained FT availability and continuous demand permit them; no employment-hours or break policy is inferred. Training staff count as one person but are explicitly flagged for manager review. Skills must be set by the administrator.

The source normative table covers up to 140 checks/hour. Higher loads stop generation until the administrator extends the normative settings and their supported maximum; the last band is not silently extrapolated. Specialists are allocated before multi-skilled employees, with stable employee IDs breaking ties.

Percent adjustments add against baseline; already-included promotions have no second demand impact. Labor percentages apply separately. Hourly checks inferred from average check remain fractional during planning; headcounts round up. No planned hours means SPMH/GSPH are unavailable. The target SPMH is advisory; coverage takes priority.

Weather: MET Norway Locationforecast, https://api.met.no/doc/TermsOfService , attribution CC BY 4.0. The API is called by the browser with its Origin, no private API key. Public restaurant point: 53.9463, 27.6882. The forecast is about nine days, with sparser intervals later; missing hourly precipitation is null, never interpolated or treated as dry weather. Snapshots older than 12 hours do not apply automatic coefficients. Configured coefficient defaults are zero; automatic adjustment is off until explicitly enabled. Network failure preserves the prior snapshot and manual adjustment remains available. Automatic forecast fetching on a timer is intentionally avoided; the button obtains an updated snapshot.

CSV actuals: exact header `date,hour,revenue,checks`, ISO date, integer hour 0–23, nonnegative revenue and integer checks, unique date/hour per upload, max 2 MB. Imported rows are previewed before merging; repeated date/hour keys replace the prior value only after confirmation. New hourly templates use only complete business-hour days; missing hours do not become zero observations. Weather coefficient learning is not enabled automatically: historical forecasts, snapshots and actuals are retained in document versions for analysis, and no causal claim is made from uncalibrated correlations.

## Verification

`node tests/planner_engine.cjs` covers formula reconciliation, normative boundaries, availability, permanent days off, FT/PT, overnight intervals, locked shifts, skills, determinism, shortage, overlapping shifts, zero denominators, promotion double-counting, weather freshness/timezones and incomplete historical days.

`node tests/planner_database.mjs` runs against isolated PGlite PostgreSQL, checks repeated migration, absent/mismatched roles, stale revisions/fingerprints, partial drafts, explicit publication, invalid shift rollback and availability preservation. Locally uses `.audit-runtime/package/dist/index.js`; CI installs pinned `@electric-sql/pglite` in `.audit-runtime/node_modules` and sets `PGLITE_CI=1`. Tests do not use production credentials or modify restaurant data.
