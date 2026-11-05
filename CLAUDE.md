# xp_streamdeck — Stream Deck Plugin for X-Plane 12

## Goal

A cross-platform Stream Deck plugin (macOS + Windows; Elgato Stream Deck XL) that controls X-Plane 12 via its native Web API — generic enough to drive any DataRef or CommandRef from a button, including state-based images (e.g. Gear UP/DOWN). Replaces the keyboard-shortcut workaround on Mac, where the Windows-only PilotsDeck has no equivalent.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 24+ (required by `@elgato/streamdeck`)
- **SDK:** `@elgato/streamdeck` (official npm package, bundled by Elgato CLI scaffold)
- **Bundler:** Rollup (preconfigured by `streamdeck create`)
- **HTTP client:** native `fetch` (Node 24)
- **WebSocket client:** `ws`
- **Property Inspector:** HTML + vanilla JS, optionally `@elgato/sdpi-components`
- **Target:** macOS 12+ and Windows 10+ (private/sideloaded — no notarization on either OS). Build/dev tooling (`make build`, `make icons`) runs on both; `make export`/`make import` (profile sync via AppleScript) is macOS-only.

## Talking to X-Plane

X-Plane 12.1.1+ exposes a native Web API on `localhost:8086` — both REST and WebSocket. **No custom XPLM C++ plugin required.**

- REST base: `http://localhost:8086/api/v3`
- WebSocket: `ws://localhost:8086/api/v3`
- Capabilities used: read/write DataRefs, activate Commands, subscribe to DataRef changes (~10 Hz)
- Docs: <https://developer.x-plane.com/article/x-plane-web-api/>

### Important runtime details

- DataRef and Command **numeric IDs are session-scoped** — re-resolve on every X-Plane restart.
- Web API is localhost-only by design (fine for our case — Stream Deck and X-Plane on same Mac).
- The Web API was introduced in X-Plane 12.1.1 (Jan 2025). Pin `/api/v3` as a constant to make future version bumps easy.

## Project Structure

```
xp_streamdeck/
├── com.robertw.xplane.sdPlugin/   # Plugin bundle (output)
│   ├── manifest.json
│   ├── bin/plugin.js              # Rollup output
│   ├── ui/                        # Property Inspectors (HTML)
│   └── imgs/                      # Action icons + state images
├── src/
│   ├── plugin.ts                  # Entry; registers actions
│   ├── actions/                   # One file per action type
│   ├── xplane/                    # Web API client + subscriptions
│   └── util/                      # Helpers (formatting, etc.)
├── scripts/                       # tsx-runnable utilities (not bundled into the plugin)
│   ├── smoke-client.ts            # X-Plane Web API smoke test
│   ├── generate-icons.ts          # Button icon generator (entry; outputs out/icons/)
│   └── icons/
│       ├── catalog.ts             # Icon definitions — add a row to add an icon
│       └── template.ts            # Single SVG renderer; all visual style lives here
└── .claude/tasks/                 # Milestone task files (one .md per milestone)
```

## Working Style

- **Walking skeleton first, then layer up.** Always get a thin end-to-end slice working before adding breadth. M01 (one button → X-Plane Pause) is the foundation everything else depends on.
- **One milestone per session.** Each `.md` in `.claude/tasks/` is self-contained: scope, deliverables, acceptance criteria, verification steps. Don't pull from earlier session context — re-read the relevant milestone file.
- **English** in all code, comments, manifest strings, and milestone files. Communication with the user remains German.
- **Default to no comments.** Only add a comment when the *why* is non-obvious.
- **No premature abstractions.** Three similar lines beat a flexible factory.
- **Verification before claiming done.** Each milestone has explicit verification steps — run them before marking complete.
- **Pre-commit gate:** `make check` (Biome lint + `tsc --noEmit`). Must be green before any commit.

## Action Implementation Conventions (locked in during M03)

Patterns every new action under `src/actions/` should follow:

- **Settings type:** `type FooSettings = JsonObject & { /* keys */ }`. `JsonObject` is exported from `@elgato/utils` (NOT from `@elgato/streamdeck`) — it's required to satisfy the `SingletonAction<T extends JsonObject>` constraint.
- **Visual feedback on `keyDown`:** call `ev.action.showOk()` on success (optionally gated by an opt-out setting), `ev.action.showAlert()` on every failure path including empty/invalid config. Errors must always be visible — never gate `showAlert()` behind a setting.
- **sdpi-checkbox defaults are unreliable.** `default="true"` on `<sdpi-checkbox>` does not round-trip cleanly when the user unchecks (we hit this with `showConfirmation`). **Always design checkboxes so unchecked = baseline behavior, checked = opt-in to a deviation.** In code use `=== true` (not `!== false`) so a missing setting maps to the baseline.
- **Property Inspector** lives in `com.robertw.xplane.sdPlugin/ui/<action>.html` and loads sdpi-components v4 from CDN (`https://sdpi-components.dev/releases/v4/sdpi-components.js`).
- **No floating promises.** Biome's `noFloatingPromises` will fail the build. Wrap fire-and-forget async with `.catch((err) => streamDeck.logger.error(...))` or `await` it.
- **Read settings via `ev.payload.settings`** in `onKeyDown`/`onKeyUp`/`onWillAppear`. Trim string inputs.

## Shared Helpers (use these — don't reinvent)

Cross-cutting utilities live under `src/util/` and `src/const.ts`. New actions should import from these instead of redefining locally:

- **`src/util/coerce.ts`** — value coercion. `toFiniteNumber(v: unknown)` for settings inputs (string/number from PI), `coerceNumber(v: DataRefValue)` for live X-Plane values (handles `number | string | boolean | number[]`, filters NaN), `describeValue(v)` for log lines.
- **`src/util/settings.ts`** — string normalization. `trimString(v)` returns `""` for missing/empty (paths, optional labels); `trimStringOr(v, fallback)` for labels with defaults; `normalizeFormat(v)` for printf format strings (defaults to `"%s"`).
- **`src/util/error-tile.ts`** — action-specific (NOT a pure util — depends on the Stream Deck SDK). `setOffline`/`clearOffline`/`setNotFound`/`combineTitle`/`NOT_FOUND_SUFFIX`/`OFFLINE_IMAGE`.
- **`src/util/dataref-path.ts`** — `parseDataRefPath` for `name[index]` syntax + `applyIndex` to slice an array value.
- **`src/util/format.ts`** — `formatDataRefValue` for printf-style display.
- **`src/util/condition.ts`** — optional press condition (`ConditionSettings`, `parseCondition`, `pressBlocked`). Reads the DataRef via REST at press time, no subscription; fails closed and shows the alert. `hideConditionAlert` only silences a regular "not met", never a failure.
- **`src/const.ts`** — `TIMINGS.LONG_PRESS_THRESHOLD_MS / REPEAT_INTERVAL_MS / REPEAT_INITIAL_DELAY_MS`; `TOLERANCE_FLOAT = 1e-6` for value-equality checks.

### Naming conventions for state machines

- **`STATE_DIRTY = -1`** in actions that gate `setState()` on value changes (`dataref-toggle`, `guarded-command`). Setting `state.currentState = STATE_DIRTY` forces the next render to push `setState()` + `setImage()` even if the value didn't change — used in `onDidReceiveSettings`, after offline recovery, and on path re-subscription.
- **`STATE_OFF / STATE_ON`** in toggles, **`STATE_LOCKED / STATE_UNLOCKED`** in guarded — these stay action-local, not centralized (different semantics).

## Button Icon Pipeline

To keep buttons visually consistent (one of M01's pain points was inconsistent purchased icon packs), button images are generated locally instead of curated by hand.

- **Entry:** `make icons` → `npm run icons` → `tsx scripts/generate-icons.ts`.
- **Output:** `out/icons/<group>/*.png` (144×144, gitignored, wiped by `make clean`). One subdirectory per group.
- **Four icon kinds, one catalog (discriminated union on `kind`):**
  - **`toggle`** — for buttons that flip a state. Produces `<name>_on.png` + `<name>_off.png`. Bold label + LED bar at bottom (lit/dark by state).
  - **`display`** — for the `dataref-display` action. Produces a single `<name>.png`. Caption + accent line in the top third; the lower ⅔ is intentionally empty so Stream Deck's `setTitle()` overlay (the live value) sits cleanly underneath.
  - **`nudge`** — single-press command button (heading bug ±, altitude bug ±, etc.). Produces a single `<name>.png`. Bold label at top, big filled triangle in the accent color in the lower portion (single triangle for normal step, two stacked for `double: true` coarse step).
  - **`background`** — solid-color filler tile (no label, no accent line). Produces a single `<name>.png` painted edge-to-edge in the entry's `color`. Used for visual separators between functional clusters; lives in the `backgrounds` group.
- **Groups drive both color and output directory.** One accent per group, declared once in `GROUP_ACCENT` at the top of `scripts/icons/catalog.ts`:
  - `autopilot` → yellow (`#eab308`) — AP/FD mode toggles, AP setpoint readouts, AP nudges
  - `lights` → green (`#22c55e`) — BCN, LAND, TAXI, NAV, STROBE
  - `cockpit` → green (`#22c55e`) — PARK BRK, FUEL PUMP, MASTER BAT, AVIONICS, PITOT HEAT
  - `readouts` → white (`#ffffff`) — live values (HDG, ALT, IAS, BARO, WIND, …)
  - `backgrounds` → no group accent — solid-color filler tiles only; each entry carries its own `color`
- **Adding an icon = one catalog row.** In `scripts/icons/catalog.ts`:
  ```ts
  { kind: 'toggle',  name: 'apu',     label: 'APU', group: 'cockpit' },
  { kind: 'display', name: 'cur_oat', label: 'OAT', group: 'readouts' },
  { kind: 'nudge',   name: 'crs_left', label: 'CRS', direction: 'left', group: 'autopilot' },
  { kind: 'background', name: 'bg_orange', color: '#f59e0b', group: 'backgrounds' },
  ```
  No template change needed unless you want a new visual *kind*. To add a new color category, extend the `IconGroup` type + `GROUP_ACCENT` map.
- **Visual style is centralized** in `scripts/icons/template.ts` — three render functions (`renderToggleIcon`, `renderDisplayIcon`, `renderNudgeIcon`), all layout/color constants at the top of each block. The accent color is resolved via `GROUP_ACCENT[def.group]` — never per-icon. Change once, re-run `make icons`, every icon of that kind updates identically. **Do not** branch per-icon style inside a renderer; if a new visual shape is needed (e.g. two-line text), add a fourth `kind` to the union plus a fourth render function.
- **Label sizing.**
  - **Toggle:** ≤4 chars at 44px; longer labels auto-shrink in fixed steps (5→36, 6→30, 7→26, 8→22, 9→20, 10+→18) via `toggleFontSize()`. Labels of the same length always render at the same size — groups stay uniform within themselves.
  - **Display:** fixed 22px (designed for 6-character max — `AP HDG`, `W SPD`).
  - **Nudge:** fixed 36px label (≤4 chars expected — the arrow is the visual focus, not the label).
- **Cross-platform reproducible.** `scripts/icons/fonts/InterVariable.ttf` (OFL-1.1) is base64-embedded into every generated SVG via `scripts/icons/fonts.ts` → `withEmbeddedFont()`, applied centrally in `generate-icons.ts:renderPng`. The `font-family` (`XPSDInter`) is deliberately unique so a system-installed Inter never overrides the embedded one. Rendering is identical on macOS, Linux CI, and Windows. Runtime-rendered tiles (`src/util/*-svg.ts`) keep the system-font stack with `Segoe UI` added for Windows fallback — those values are dynamic and a small per-OS font difference is acceptable.

## Test Environment Reality

- The **dev laptop has no Stream Deck connected.** Stream Deck app + plugin sideloading reach ~90% of testing surface; final hardware verification happens on the flight-sim Mac.
- X-Plane runs on the same Mac as Stream Deck — both default to localhost.
- **No Windows test machine available locally.** Windows is officially supported (manifest declares it; OFL Inter is embedded so build-time icons render identically), but runtime verification on Windows relies on community user reports. A community user did the original port and validated against the AW109 profile — flag suspected Windows-specific issues to be confirmed there before assuming they reproduce on real hardware.
- Smoke-test the X-Plane Web API with `curl` first whenever debugging suspect plugin behavior:
  ```
  curl 'http://localhost:8086/api/v3/datarefs?filter[name]=sim/cockpit2/controls/gear_handle_down'
  ```

## Reference Implementations (study, don't copy)

- **PilotsDeck** (Windows-only, .NET) — overall feature scope target: <https://github.com/Fragtality/PilotsDeck>
- **Cockpitdecks** (Python, macOS-friendly, Web API based) — architectural reference: <https://github.com/devleaks/cockpitdecks>
- **Elgato plugin samples** — TypeScript SDK patterns: <https://github.com/elgatosf/streamdeck-plugin-samples>

## Where Things Live

- Approved feasibility plan: `/Users/robertw/.claude/plans/wie-schwierig-w-re-es-merry-pumpkin.md`
- Milestone task files: `.claude/tasks/M01..M08-*.md`
- Stream Deck plugin logs (after install): `~/Library/Logs/ElgatoStreamDeck/`
