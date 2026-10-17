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

`planner_weather_history()` returns administrator-only weather/forecast snapshots (last 120 saved revisions) and deduplicated actuals without employee details. The suggestion model accepts only complete days with forecasts and snapshots saved before the business day started; partial-hour opening times and promotional days are excluded. It compares actual/baseline forecast residuals for a single weather exposure against controls, normalized by that exposure's hourly demand weight; combined conditions are excluded rather than attributed twice. Each estimate needs at least seven exposed and seven control days. These are observational suggestions, not causal effects or a validated multivariate forecasting model. They never overwrite active coefficients automatically; applying any estimate requires a separate confirmation. With a new database the expected result is explicitly insufficient history.

## Guided editor (local UX revision)

The admin navigation now separates `schedule` (employee-submitted availability, plus a distinct read-only assigned-shift view) and `schedule-builder` (imports, forecasts, generation, draft save and publication). Availability is the default schedule view and neither its grid nor its Excel export falls back to assigned shifts, or vice versa. Legacy final-shift editing controls are hidden; editing/publishing is done in the builder.

In normal authenticated production mode, changing role presets, individual skills or training status queues a draft save using the existing version-checked planner API. It does not publish a schedule. Save failures stay visible and do not claim persistence. The explicit local read-only mode still uses device-only storage. No new production migration is required for these navigation and draft-persistence changes.

The editor now separates four steps: week inputs, assigned shifts, coverage review, and publication. Employee availability and restaurant settings are secondary views. Revenue forecasts, manually forecast checks, and historical actual sales are explicitly distinct.

The r_keeper importer supports the provided HTML-in-XLS format: seven consecutive Monday–Sunday date columns, each with `Чеков` / `Оплачено`, hour rows, and an `Итого` row. UTF-8 and Windows-1251 are supported. Binary XLS and XLSX are explicitly rejected rather than claimed supported. Parsing runs on the user's device without executing or inserting the uploaded HTML. No uploaded file or real sales data is bundled into the public application or tests.

The preview reconciles daily check counts and paid totals against the hourly rows. Blank pairs stay missing, partial pairs and inconsistent totals reject the import. Administrators explicitly choose whether to use weekday hourly profiles and historical average checks. Applying average checks clears manual forecast check counts, but never changes forecast revenue or the selected week. Historical actuals merge idempotently by date/hour; nothing is saved remotely until the administrator saves the draft. Missing trading-hour observations require explicit acknowledgement before using a profile; history-only import never invents zero records.

Weekly inputs explain check-count versus average-check precedence, SPMH, demand versus labour promotional effects, and weather coefficients. A live base/adjusted forecast table exposes the effect of changes. Optional sections preserve their open state while editing. Skill selection uses checkboxes; settings groups are collapsed. Shift errors translate employee IDs and weekday keys into readable names and ПН–ВС labels.

The publication screen lists blocking errors and shortages, distinguishes saving from publishing, and disables publication of an empty schedule in the interface. Server-side validation and optimistic concurrency remain unchanged. Demo actions cannot save or publish restaurant data. Missing forecast data is displayed as unavailable, not healthy zero coverage.

`node tests/planner_roster.cjs`, `node tests/planner_workflow.cjs`, and `node tests/planner_keeper.cjs` cover weekly layout, dates, read-only availability, empty publication, escaped names/events, the import entry point, localized numeric and encoding handling, reconciliation, missing cells, explicit profile confirmation, immutable application and repeated-import behaviour. This revision is local and requires visual review before release.

### Existing calculation and database checks

### Employee cards and shift-duration update

In the local read-only test, role selections and training flags autosave on this browser/device via `planner-skills.js`, keyed separately for demo and BK8 real-data testing. Only employee IDs, role codes and training flags are stored. They restore across reloads and week changes; clearing selections persists too. This is not cross-device/cloud synchronisation. Normal production mode continues to use the saved week configuration and does not silently override it from a local test cache.

Demand above `normMax` now continues with a non-blocking warning. The lookup uses the last configured band at or below the validated ceiling, without inventing extrapolated staffing rules or truncating forecast sales/checks. Affected slots and coverage carry `normEstimated`; warnings are grouped by hour, shown after generation and before publication, and exported alongside coverage/forecasts. This is an approximate staffing estimate, not evidence that the last band is sufficient at higher loads. Availability, invalid data, overlap and 12-hour safety errors remain blocking.

Employee skill cards have explicit Universal / Kitchen / Cashier presets, selected-state buttons, custom position checkboxes, and a separate training flag. Universal means all currently enabled restaurant positions; it is never assumed automatically. Presets replace the role list and preserve training status.

Newly generated shifts have a hard 720-minute maximum. The heuristic selects a continuous window that covers the most remaining half-hour demand slots, then prefers fewer hours and a stable earlier start. FT remains availability, not a full-day assignment. Missing coverage remains visible. Manual shifts over 12 hours are rejected, and longer locked shifts require correction rather than silent truncation. No weekly-hour limit was added.

`20261017_planner_max_shift.sql` adds a publication trigger that rejects longer shifts and rolls back publication atomically, without editing existing drafts or history. This additive migration has been tested in isolated PostgreSQL but has not been applied to production as part of the local UI revision. Deployment requires the UI, worker and engine cache versions to update together.

`node tests/planner_engine.cjs` covers formula reconciliation, normative boundaries, availability, permanent days off, FT/PT, overnight intervals, locked shifts, skills, determinism, shortage, overlapping shifts, zero denominators, promotion double-counting, weather freshness/timezones and incomplete historical days.

`node tests/planner_database.mjs` runs against isolated PGlite PostgreSQL, checks repeated migration, absent/mismatched roles, stale revisions/fingerprints, partial drafts, explicit publication, invalid shift rollback and availability preservation. Locally uses `.audit-runtime/package/dist/index.js`; CI installs pinned `@electric-sql/pglite` in `.audit-runtime/node_modules` and sets `PGLITE_CI=1`. Tests do not use production credentials or modify restaurant data.
