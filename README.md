# xp_streamdeck

![X-Plane 12 cockpit with Stream Deck XL configurator showing autopilot controls](StreamDeck_cockpit.jpg)

Native Stream Deck plugin for X-Plane 12 — runs on macOS and Windows, talking to the X-Plane Web API on `localhost:8086`.

## Contents

- [Platform support](#platform-support)
- [Prerequisites](#prerequisites)
- [X-Plane Web API setup](#x-plane-web-api-setup)
- [Build & install (development)](#build--install-development)
- [Features](#features)
- [Actions](#actions)
- [Button icons](#button-icons)
- [Included aircraft & helicopter profiles](#included-aircraft--helicopter-profiles)
- [Aircraft/Helicopter profiles (sync)](#aircrafthelicopter-profiles)
- [Common Make targets](#common-make-targets)

## Features

- Native Stream Deck XL plugin for X-Plane 12 — no XPLM C++ side required.
- Cross-platform: macOS 12+ and Windows 10+ (build & runtime).
- Talks to the X-Plane Web API on `localhost:8086` — REST + WebSocket, ~10 Hz live DataRef updates.
- Drives any DataRef or CommandRef from a button, including array-indexed DataRefs via `name[N]` (see [Array DataRefs](#array-datarefs)).
- [Display Selector](#display-selector): one set of buttons drives multiple identical panels (e.g. AW109 `EDU1..EDU4`) via `{KEY}` placeholders in every DataRef / Command path.
- 16 button action types — fire commands, write DataRefs, render live values, two-stage guarded covers, multi-position switches, scripted multi-action macros, wind arrow, …
- Locally generated, visually consistent button icons (5 kinds, color-coded by group) — see [Button icons](#button-icons).
- macOS profile sync via `make export` / `make import` — preserves folder UUIDs so parent-profile cross-links survive across machines.

### Action types

| Action | Purpose |
| --- | --- |
| [Command](#command) | Fire a CommandRef on press (with optional hold-to-repeat). |
| [Command + Display](#command--display) | CommandRef on press + live DataRef title. |
| [Rotary](#rotary) | Rotary-knob step command + live DataRef title (numeric or enum, with optional starter HOLD). |
| [Rotary DataRef](#rotary-dataref) | Increment / decrement a writable DataRef by a fixed step (with optional coarse step on long press). |
| [DataRef Display](#dataref-display) | Pure read-only live DataRef value as button title. |
| [Multi DataRef Display](#multi-dataref-display) | Up to 3 live DataRefs stacked on one button. |
| [Wind Display](#wind-display) | Rotating wind arrow + speed (and optional OAT). |
| [DataRef Toggle](#dataref-toggle) | Two-state DataRef/Command toggle with OFF/ON images (and optional momentary hold mode). |
| [DataRef Lamp](#dataref-lamp) | Read-only colored cockpit-annunciator lamp. |
| [DataRef Switch](#dataref-switch) | N-position switch with short-press / long-press stepping. |
| [Guarded Command](#guarded-command) | Two-stage cover button — short press = flip cover, long press = protected CommandRef. |
| [Guarded DataRef](#guarded-dataref) | Same cover pattern, but both stages toggle DataRefs. |
| [DataRef Write](#dataref-write) | Single-press write of a fixed value (with optional momentary hold mode). |
| [Multi-Action / Macro](#multi-action--macro) | Run an ordered list of commands / DataRef writes / delays on press (and optional release); optional toggle with state-DataRef image. |
| [Display Selector](#display-selector) | Cycles a named index `1..N` shared across actions via `{KEY}` placeholders. |
| [Background Tile](#background-tile) | Decorative filler tile — no action. |

## Included aircraft & helicopter profiles

Ready-made Stream Deck XL, Stream Deck MK2 and Stream Deck 3 profiles ship under [`streamdeck-profiles/`](streamdeck-profiles/README.md). Each profile expects this plugin installed and the matching aircraft loaded in X-Plane. See the [sync section](#aircrafthelicopter-profiles) below for `make export` / `make import` usage.

> [!NOTE]  
> Stream Deck MK2 and Stream Deck 3 profiles are still under development, you can [check profiles compatibility here](streamdeck-profiles/README.md).

| Profile | File | Min. plugin version |
| --- | --- | --- |
| X-Plane parent menu (links all profiles together) | `xp_stream_parent.streamDeckProfile` | — |
| Default X1000 (G1000) | `xp_stream_g1000.streamDeckProfile` | 1.3.0.0 |
| Cessna 172 SP | `xp_stream_c172sp.streamDeckProfile` | 1.3.0.0 |
| Cirrus SR22 | `xp_stream_sr22.streamDeckProfile` | 1.4.3.0 |
| Lancair Evolution (Austin Meyer) | `xp_stream_lancair.streamDeckProfile` | 1.3.0.0 |
| Piper PA-46 M500 | `xp_stream_pa46.streamDeckProfile` | 1.3.0.0 |
| Diamond DA42 / DA62 | `xp_stream_da42.streamDeckProfile` | 1.3.0.0 |
| Diamond DA20 / DV20 by Aerobask | `xp_stream_dv20.streamDeckProfile` | 1.4.1.0 |
| UL Shark | `xp_stream_shark.streamDeckProfile` | 1.3.1.0 |
| Phenom 300 | `xp_stream_ph300.streamDeckProfile` | 1.3.0.0 |
| Pilatus PC12 by Thranda (G1000) | `xp_stream_pc12.streamDeckProfile` | 1.3.0.0 |
| EuroCopter EC130 (Garmin 430) | `xp_stream_ec130.streamDeckProfile` | 1.3.0.0 |
| AW-109 SP 2.0 | `xp_stream_aw109.streamDeckProfile` | 1.4.3.0 |
| Guimbal Cabri G2 | `xp_stream_gabri_g2.streamDeckProfile` | 1.4.3.0 |

Per-aircraft feature notes and first-time setup live in [`streamdeck-profiles/README.md`](streamdeck-profiles/README.md).

## Platform support

- **Plugin runtime:** macOS 12+ and Windows 10+. Sideload from a Release tarball or build from this repo.
- **Build & dev tooling:** `npm install`, `npm run build`, and `npm run icons` work on both OS. The `make` targets are convenience wrappers for macOS/Linux shells — Windows users should call the underlying `npm` scripts directly.
- **`make export` / `make import`** (Stream Deck profile sync) is **macOS-only** because it drives the Stream Deck app via AppleScript and reads `~/Library/...`. Windows users manage profiles via the Stream Deck app's built-in import/export UI.
- Initial Windows port and AW109-profile validation were contributed by a community user.

## Prerequisites

- **X-Plane 12.1.1 or newer** — the built-in Web API was introduced in 12.1.1 and is enabled by default.
- Node.js 24 (pinned via `.nvmrc`). macOS/Linux: `nvm use`. Windows: install [`nvm-windows`](https://github.com/coreybutler/nvm-windows) and run `nvm use 24`.
- The Elgato Stream Deck CLI ships as a devDependency, so no global install is needed; invoke it via `npx streamdeck …` (or install globally with `npm i -g @elgato/cli` if you prefer the bare `streamdeck` command).

## X-Plane Web API setup

X-Plane 12.1.1+ runs the Web API automatically on `http://localhost:8086/api/v3` — **no menu toggle is needed to turn it on**. The toggles in *Settings → Network* labelled *"iPhone, iPad and External Apps"* are unrelated to the Web API; they control the legacy UDP interfaces.

The only relevant setting is opt-out:

- *Settings → Network → **Disable Incoming Traffic*** — must remain **unchecked**, otherwise every Web API call returns `403 Forbidden`.

If you launched X-Plane from the command line with `--no_web_server`, the API is off; restart without that flag. To use a non-default port, use `--web_server_port=<N>` — but note this plugin currently hard-codes `8086` (will be configurable in M03+).

### Quick API smoke test

Before debugging the plugin, verify the API responds:

```bash
curl -i 'http://localhost:8086/api/v3/datarefs/count'
```

| Response | Meaning |
| --- | --- |
| `HTTP/1.1 200 OK` + JSON | API healthy → if the plugin still fails, look at plugin logs |
| `HTTP/1.1 403 Forbidden` | *Disable Incoming Traffic* is checked — uncheck and restart X-Plane |
| `Connection refused` | Web API not running — check X-Plane version and that it wasn't started with `--no_web_server` |

X-Plane's own log usually shows a line like `Web server listening on port 8086` at startup; check `Log.txt` if in doubt:

```bash
grep -i "web" "$HOME/X-Plane 12/Log.txt"
# Mac App Store install instead:
# grep -i "web" "$HOME/Library/Containers/com.laminarresearch.X-Plane/Data/Log.txt"
```

### Plugin-side logs

Once the API is up, plugin activity goes to:

```bash
# macOS
tail -f ~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log

# Windows (PowerShell)
Get-Content "$env:APPDATA\Elgato\StreamDeck\logs\Plugins\com.robertw.xplane*.log" -Wait -Tail 50
```

Each press should produce `Resolved sim/operation/pause_toggle -> id=…` and `Activated …`. If nothing appears on press, the plugin isn't loaded — re-run `npx streamdeck restart com.robertw.xplane`.

## Build & install (development)

```bash
# macOS / Linux
make setup                                    # npm install
make build                                    # rollup → bin/plugin.js
npx streamdeck link com.robertw.xplane.sdPlugin
npx streamdeck restart com.robertw.xplane

# Windows — the make targets are convenience wrappers; call npm directly:
npm install
npm run build
npx streamdeck link com.robertw.xplane.sdPlugin
npx streamdeck restart com.robertw.xplane
```

After this, the **X-Plane → Pause** action appears in the Stream Deck app's action list. Drop it onto a key, press it, and X-Plane toggles pause (`sim/operation/pause_toggle`).

## Actions

### Command

Triggers any X-Plane CommandRef on key press. Optional **Hold Mode** routes the press through the WebSocket `command_set_is_active` begin/end pair instead of a one-shot activate — useful for things that should keep firing while the key is held (e.g. spinning the heading bug).

Property Inspector fields:

- **Command Path** — the X-Plane CommandRef, e.g. `sim/operation/pause_toggle`.
- **Hold Mode** — when checked, sends begin on `keyDown` and end on `keyUp`.
- **Hide green confirmation icon** — opt-out of the `showOk()` flash on success. Errors still always show the alert icon.

#### Example: toggle pause

| Field | Value |
| --- | --- |
| Command Path | `sim/operation/pause_toggle` |
| Hold Mode | *(unchecked)* |

Press → X-Plane pauses; press again → resumes.

#### Example: spin the heading bug while held

| Field | Value |
| --- | --- |
| Command Path | `sim/autopilot/heading_up` |
| Hold Mode | *(checked)* |

Press and hold → heading bug rotates continuously; release → stops. Pair with `sim/autopilot/heading_down` on a second key for the opposite direction.

### Command + Display

Fires a CommandRef on key press while showing a live DataRef value as the button title. Designed for buttons that both trigger and report state — e.g. G1000 softkeys, autopilot mode buttons.

Property Inspector fields:

- **Command Path** — the CommandRef fired on `keyDown`, e.g. `sim/GPS/g1000n1_softkey1`.
- **Hide green confirmation icon** — opt-out of the `showOk()` flash on success. Errors still always show the alert icon.
- **DataRef Path** — optional DataRef rendered as the live title. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview while editing the path.
- **Label** — optional caption rendered above the live value.
- **Format** / **Unit Scale** / **Precision** — printf-style formatting; see [DataRef Display](#dataref-display) for details.

#### Example: G1000 softkey 1 with live FMS frequency

| Field | Value |
| --- | --- |
| Command Path | `sim/GPS/g1000n1_softkey1` |
| DataRef Path | `sim/cockpit2/radios/actuators/com1_frequency_hz_833` |
| Label | `SK1` |
| Format | `%.3f` |
| Unit Scale | `0.001` |

### Rotary

Fires a CommandRef on press and shows a live DataRef as the title — for rotary-knob-style controls driven by step commands. Works in two **Format Modes**:

- **Numeric** — for continuous setpoints (COM/NAV/FMS frequencies, heading bug, altitude target). Renders the live value via printf with an optional unit suffix.
- **Enum** — for discrete enums (magneto positions, flap detents). Renders the value as a label from an `index=label` map, e.g. `OFF/R/L/BOTH/START`.

Optional **HOLD on last position** (enum mode only): when the DataRef sits one step before the last enum index and the user presses the key, the press fires a separate **HOLD Command** via the WebSocket begin/end pair instead of the regular step command. Designed for the Cessna starter: advancing `BOTH → START` should hold the starter engaged until the key is released, not click past it.

Property Inspector fields:

- **Command Path** — the step command (e.g. `sim/magnetos/magnetos_up`).
- **Hide green confirmation icon** — opt-out of the `showOk()` flash on success.
- **Direction** — visual hint only (rendered as part of the title): `Right (CW)`, `Left (CCW)`, `Up`, `Down`.
- **DataRef Path** — the live value displayed on the button. Supports array indexing.
- **Live Value** — read-only preview while editing the path.
- **Label** — optional caption rendered above the live value.
- **Format Mode** — `Numeric` or `Enum`.
- **Unit Scale** — multiplier applied to the raw DataRef value before formatting (numeric) or before rounding to an enum index (enum). Useful for ratio DataRefs like `flap_handle_request_ratio`: scale by the number of detents.
- **Numeric mode:** **Format** (printf) / **Unit** (suffix like `MHz`, `ft`, `kt`) / **Precision**.
- **Enum mode:** **Enum Map** — comma-separated `index=label` pairs, e.g. `0=OFF,1=R,2=L,3=BOTH,4=START`.
- **HOLD on last position** *(enum only)* — checkbox to enable the begin/end behaviour described above.
- **HOLD Command** — the separate CommandRef used during the hold (e.g. `sim/starters/engage_starter`).

#### Example: Cessna magneto switch (enum + HOLD)

| Field | Value |
| --- | --- |
| Command Path | `sim/magnetos/magnetos_up` |
| Direction | `Right (CW)` |
| DataRef Path | `sim/cockpit2/engine/actuators/ignition_key` |
| Format Mode | `Enum` |
| Enum Map | `0=OFF,1=R,2=L,3=BOTH,4=START` |
| HOLD on last position | *(checked)* |
| HOLD Command | `sim/starters/engage_starter` |

Pressing the key cycles OFF → R → L → BOTH; pressing at BOTH instead holds the starter engaged (`engage_starter` begin) until release.

#### Example: COM1 frequency tuning (numeric)

| Field | Value |
| --- | --- |
| Command Path | `sim/COM1/coarse_up` |
| Direction | `Right (CW)` |
| DataRef Path | `sim/cockpit2/radios/actuators/com1_frequency_hz_833` |
| Format Mode | `Numeric` |
| Format | `%.3f` |
| Unit | `MHz` |
| Unit Scale | `0.001` |

### Rotary DataRef

Increment / decrement a writable DataRef by a fixed step on each press — for setpoints (HDG / ALT bug, BARO, AP airspeed, …) where the aircraft exposes only a writable DataRef and no matching `*_up` / `*_down` CommandRef pair. Pair two or four keys on the deck (LEFT/RIGHT, optionally plus UP/DOWN) to drive one setpoint up and down.

Property Inspector fields:

- **DataRef Path** — the writable DataRef, e.g. `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot`. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview while editing the path.
- **Delta** — positive step size (e.g. `1`, `10`, `0.01`).
- **Direction** — sign per key: `Right (+ delta)` / `Up (+ delta)` add, `Left (− delta)` / `Down (− delta)` subtract.
- **Min Value** / **Max Value** — optional clamp. Leave empty for unbounded setpoints; when both are set the value clamps at the endstops.
- **Feedback** — opt-out of the `showOk()` flash on success.
- **Endstop** — opt-out of the alert flash when already at Min / Max (silent no-op instead).
- **Long-press (coarse step)** *(collapsible)* — **Coarse Delta**: optional larger step fired on hold ≥ 500 ms. Useful for fine/coarse on the same button (e.g. HDG bug ±1 short / ±10 long).
- **Title display** *(collapsible)* — same numeric / enum formatting pipeline as [Rotary](#rotary): Label, Format Mode, Unit Scale, Format, Unit, Precision, Enum Map.

#### Example: HDG bug ±1 (fine) / ±10 (long press, coarse)

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/autopilot/heading_dial_deg_mag_pilot` |
| Delta | `1` |
| Direction | `Right (+ delta)` |
| Coarse Delta | `10` |
| Min Value | `0` |
| Max Value | `360` |
| Label | `HDG` |
| Format Mode | `Numeric` |
| Format | `%.0f` |
| Unit | `°` |

Pair with a second key on the same DataRef, `Direction = Left (− delta)`, same Delta / Coarse Delta.

### DataRef Display

Shows a live X-Plane DataRef value as the button title. Pure read-only — no click action.

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef, e.g. `sim/cockpit/autopilot/heading_mag`. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path. Without `[N]` an array DataRef shows its full contents (handy for picking the right index); with `[N]` only the indexed element is shown.
- **Label** — optional caption rendered above the value (e.g. `ALT`).
- **Format** — printf-style template (`%s`, `%d`, `%f`, `%.Nf`, `%%`). Default `%s`.
- **Unit Scale** — optional multiplier applied before formatting (e.g. radians→degrees, m/s→kt, Pa→inHg).
- **Precision** — optional decimals; only used when the format token has no explicit precision.

#### Example: QNH in inHg

X-Plane exposes `sim/weather/aircraft/qnh_pas` as a float in **Pascal**. To show it as `29.92 inHg` on a button:

| Field | Value |
| --- | --- |
| DataRef Path | `sim/weather/aircraft/qnh_pas` |
| Format | `%.2f inHg` |
| Unit Scale | `0.0002953` |
| Precision | *(leave empty)* |

Background: 1 inHg = 3386.389 Pa, so the conversion factor is `1 / 3386.389 ≈ 0.0002953`. Standard QNH 101325 Pa × 0.0002953 = **29.9213** → with `%.2f` → `29.92 inHg`.

For **hPa/mb** (1013) instead:

| Field | Value |
| --- | --- |
| Format | `%.0f hPa` |
| Unit Scale | `0.01` |

### Multi DataRef Display

Shows up to **three** live DataRef values stacked on one button — for things like COM A/S (active + standby frequency), wind DIR/SPD/TEMP, or any other grouped readout that needs to share one key. Pure read-only — no click action.

Property Inspector fields:

- **Title** — optional top-line caption rendered above all slots (e.g. `COM1`).
- **Slot 1 / Slot 2 / Slot 3** — each slot is collapsible and has its own:
  - **Label** — optional prefix (e.g. `A:`, `S:`).
  - **DataRef Path** — the DataRef to subscribe to. Supports array indexing.
  - **Live Value** — read-only preview while editing.
  - **Format** / **Unit Scale** / **Precision** — printf-style formatting per slot (see [DataRef Display](#dataref-display)).
- Slot 1 is required; slots 2 and 3 render only if their DataRef Path is set.

#### Example: COM1 active + standby

| Field | Value |
| --- | --- |
| Title | `COM1` |
| Slot 1 Label | `A:` |
| Slot 1 DataRef Path | `sim/cockpit2/radios/actuators/com1_frequency_hz_833` |
| Slot 1 Format | `%.3f` |
| Slot 1 Unit Scale | `0.001` |
| Slot 2 Label | `S:` |
| Slot 2 DataRef Path | `sim/cockpit2/radios/actuators/com1_standby_frequency_hz_833` |
| Slot 2 Format | `%.3f` |
| Slot 2 Unit Scale | `0.001` |

### Wind Display

Specialised readout: renders wind direction as a **rotating arrow icon** plus the wind speed (and optionally OAT) underneath. Reads the direction and speed DataRefs continuously and rotates a built-in arrow image to match the wind heading.

Property Inspector fields:

- **Label** — optional top-line caption; defaults to `WIND`.
- **Direction DataRef** — wind heading in degrees, e.g. `sim/cockpit2/gauges/indicators/wind_heading_deg_mag`.
- **Speed DataRef** — wind speed in the desired unit, e.g. `sim/cockpit2/gauges/indicators/wind_speed_kts`.
- **OAT DataRef** *(optional)* — outside air temperature, e.g. `sim/cockpit2/temperature/outside_air_temp_degc`. Rendered as a third line if set.
- **Speed Unit** — suffix appended to the speed value; defaults to `kt`.
- **Arrow Convention** —
  - `Points where wind goes (PFD style)` *(default)* — rotates the arrow 180° from the X-Plane heading, matching most glass cockpit PFDs.
  - `Points where wind comes from (weather chart)` — matches METAR / weather chart convention.

X-Plane's `wind_heading_deg_mag` reports the direction the wind **comes from**; the default convention flips this so the arrow points downwind.

### DataRef Toggle

Two-state action that flips a DataRef value (or activates a CommandRef) on key press, and reflects the live state on the button by switching between two images. Use it for binary or near-binary controls (gear, flaps detents, lights, fuel pumps, …). Optional **Hold Mode** turns it into a momentary press/release write (test/reset-style buttons with visible state).

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef to read for the visible state. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path.
- **Value OFF** / **Value ON** — the two values that map to the OFF / ON image. Defaults to `0` / `1`. The visible state is chosen by closest distance to either value (or `≥ 0.5` for the default 0/1 case).
- **Strict ON Match** — when checked, only `value === Value ON` (with float tolerance) counts as ON; everything else is OFF. Useful for multi-state enums where a single index is the "ON" state.
- **Trigger Mode** —
  - `Write DataRef` writes the opposite value on each press.
  - `Activate Command` fires a single CommandRef on press; the visible state still comes from the DataRef. Useful when the aircraft exposes a "toggle" command but the DataRef is the actual state.
  - `On/Off Command` fires one of **two** CommandRefs depending on the current DataRef state: at OFF the ON command fires, at ON the OFF command fires. For aircraft that expose separate `…_on` / `…_off` commands instead of a single toggle.
- **Command Path** — only used when *Trigger Mode* is `Activate Command`.
- **Command Path ON** / **Command Path OFF** — only used when *Trigger Mode* is `On/Off Command`.
- **Hold Mode** — when checked, the action becomes momentary: `keyDown` writes `Value ON`, `keyUp` writes `Value OFF`. Trigger Mode, Strict ON Match, and the Command Path fields are ignored and hidden. Use this for press-and-hold controls (e.g. EC130 hydraulic test, master-caution test) where you also want the OFF/ON image to flip with the live DataRef.
- **Image OFF** / **Image ON** — optional custom 144×144 PNG/JPG/SVG per state. Uploads accept **drag & drop** onto the thumbnail, **paste from clipboard** (Cmd/Ctrl+V), or **click** to open the file picker. Files are downscaled to 144 px and persisted to disk so multi-state image switching stays reliable. Leave empty to use the default `imgs/states/{off,on}` images.

The Property Inspector hides the command-path fields that don't apply to the selected trigger mode, so only the relevant inputs are visible.

#### Example: gear handle

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/controls/gear_handle_down` |
| Value OFF | `0` |
| Value ON | `1` |
| Trigger Mode | `Write DataRef` |

Press → toggles gear up/down; the button flips between OFF/ON image as the DataRef actually changes.

#### Example: gear via command, state via DataRef

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/controls/gear_handle_down` |
| Trigger Mode | `Activate Command` |
| Command Path | `sim/flight_controls/landing_gear_toggle` |

Useful for aircraft where the gear command runs an animation/sound but the simple DataRef write would skip it.

#### Example: autopilot servos with separate On/Off commands

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/autopilot/servos_on` |
| Value OFF | `0` |
| Value ON | `1` |
| Trigger Mode | `On/Off Command` |
| Command Path ON | `sim/autopilot/servos_on` |
| Command Path OFF | `sim/autopilot/servos_off` |

Press while OFF → fires `servos_on`; press while ON → fires `servos_off`. The button image follows the live DataRef.

#### Example: EC130 hydraulic test (momentary)

| Field | Value |
| --- | --- |
| DataRef Path | `HSF/ec130/CollectiveHydSwitch` |
| Value OFF | `0` |
| Value ON | `1` |
| Hold Mode | *(checked)* |

Press and hold → writes `1`, button switches to ON image; release → writes `0`, button returns to OFF. Trigger Mode and command fields stay hidden while Hold Mode is on.

### DataRef Lamp

Read-only indicator: renders a colored lamp (lit) or a dark lamp depending on a DataRef value. Use it for cockpit annunciators where you just want to *see* a state — GEAR DOWN, BCN ON, AP engaged, low-fuel warning — without a click action. The lamp lights up only when the DataRef value matches **Value On** exactly (with float tolerance); every other value, including **Value Off**, leaves it dark.

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef to read. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path.
- **Value On** — the value that lights the lamp. Default `1`.
- **Value Off** — the expected off value. Default `0`. *Functionally unused* — the lamp is lit only on exact match with **Value On**, everything else (including **Value Off**) is dark. The field documents the binary character of the DataRef for clarity.
- **Color** — `Green` *(default)*, `Blue`, `Yellow`, `Orange`, `Red`.
- **Label** — optional caption baked into the tile (e.g. `GEAR`, `BCN`).
- **Label Position** — `Top` *(default)* or `Bottom`.

When X-Plane goes offline the tile swaps to the standard offline placeholder; when the DataRef path is invalid the title gets a `?` not-found suffix — same behaviour as every other subscribe-based action.

#### Example: gear DOWN indicator

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/controls/gear_handle_down` |
| Value On | `1` |
| Color | `Green` |
| Label | `GEAR` |
| Label Position | `Top` |

#### Example: beacon light annunciator

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/switches/beacon_on` |
| Value On | `1` |
| Color | `Red` |
| Label | `BCN` |

#### Example: AP engaged lamp

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/autopilot/servos_on` |
| Value On | `1` |
| Color | `Blue` |
| Label | `AP` |
| Label Position | `Bottom` |

### DataRef Switch

N-position switch driven by a single writable DataRef. **Short press** steps toward Max (`current + Step`); **long press** (≥ 500 ms) steps toward Min. The value clamps at the configured Min / Max ends. Renders as a 3-position lever tile (up / mid / down) by default — for a 2-pos switch use `Min=-1 / Max=1 / Step=2`; for a 3-pos use `Step=1`.

Property Inspector fields:

- **DataRef Path** — the writable DataRef. Supports array indexing.
- **Live Value** — read-only preview while editing the path.
- **Min Value** / **Max Value** — endstops. Defaults `-1` / `1`.
- **Step** — positive step size. Use the full Min-to-Max delta for a 2-pos switch (skips the mid position), `1` for a 3-pos switch.
- **Orientation** — `Vertical (Up / Down)` *(default)* or `Horizontal (Left / Right)`. Vertical pairs with UP/DOWN keys; horizontal with LEFT/RIGHT. With horizontal the action always renders the tile itself (the bundled default state images are vertical).
- **Invert Direction** — flip **both** the write direction and the tile image. Use when the aircraft wires the DataRef inverted (e.g. AW109 `aw109/cockpit/switch/fuel/xfeed`: `+1` sits visually up, `−1` visually down — opposite to most switches). Short press then steps toward Min, long press toward Max, and the tile shows Min on the bottom / Max on the top (or right / left in horizontal).
- **Labels (dynamic)** — optional `value=label` map (e.g. `-1=UP, 0=MID, 1=DN`) rendered as the live title.
- **Static Label** — short caption baked into the rendered switch image (e.g. `BAT`); persists across positions.
- **Static Label Position** — `Top` or `Bottom`.
- **Hide Confirmation** — opt-out of the `showOk()` flash on every successful press.
- **Hide Endstop Alert** — suppress the alert when pressing past Min / Max (silent no-op).

State images come from the bundled `imgs/states/switch_{up,mid,down}.png` by default; assign custom per-position images via the Stream Deck state pickers. Setting a Static Label, switching to horizontal orientation, or enabling Invert Direction makes the action render the tile at runtime — those settings override the state image.

#### Example: 2-position BAT switch

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit/electrical/battery_on` |
| Min Value | `0` |
| Max Value | `1` |
| Step | `1` |
| Static Label | `BAT` |
| Labels (dynamic) | `0=OFF, 1=ON` |

#### Example: AW109 fuel cross-feed (inverted wiring)

| Field | Value |
| --- | --- |
| DataRef Path | `aw109/cockpit/switch/fuel/xfeed` |
| Min Value | `-1` |
| Max Value | `1` |
| Step | `1` |
| Invert Direction | *(checked)* |
| Static Label | `XFEED` |

Short press writes toward `-1` (switch goes down in the cockpit); long press toward `+1` (switch goes up). The tile image follows visually — at `-1` the switch points down, at `+1` up — matching the cockpit orientation despite the inverted DataRef wiring.

#### Example: 3-position cargo light (horizontal)

| Field | Value |
| --- | --- |
| DataRef Path | `aw109/cockpit/switch/cargo_light` |
| Min Value | `-1` |
| Max Value | `1` |
| Step | `1` |
| Orientation | `Horizontal (Left / Right)` |
| Static Label | `CARGO` |

Pair with two physical keys (assigned LEFT and RIGHT positions on the deck). Short press steps toward Max (right), long press toward Min (left); the mid position is reached by stepping through.

### Guarded Command

Two-stage button modeled on cockpit covers that protect dangerous switches. **Short press** fires `shortPressCommand` (e.g. flip the cover open); **long press** (≥ 500 ms) fires the protected `longPressCommand` (e.g. engage the starter). Optionally subscribes to a `Guard DataRef` and renders one of two images — `locked` (cover closed) or `unlocked` (cover open) — so the button reflects the actual cockpit state.

Designed primarily for the [Piper PA-46 M500 by X-Aerodynamics](https://www.x-aerodynamics.com/copy-of-about-x-aero) — the Property Inspector placeholders use M500 DataRefs (`sim/PA46/cover/starter_open`, `sim/PA46/cover/starter_toggle`) — but works with any aircraft that exposes a guard DataRef plus open/close commands.

Property Inspector fields:

- **Short press → Command Path** — CommandRef fired on quick release, e.g. the cover toggle.
- **Hide green OK after short press** — opt-out of the `showOk()` flash on short press. Errors still always show the alert icon.
- **Long press → Command Path** — CommandRef used when the key is held for at least 500 ms (e.g. engage starter).
- **Long press → Mode** —
  - `Hold (begin / end while held)` *(default)* — sends WebSocket `command_set_is_active` begin at the 500 ms threshold and end on release. Use for sustained actions like cranking a starter.
  - `Auto-repeat 5 Hz while held` — fires `activate` every 200 ms while held. Use for things that need repeated discrete activations.
  - `Activate once at threshold` — fires a single `activate` at 500 ms and ignores the rest of the hold.
- **Guard DataRef** — optional DataRef that reports the cover/guard state; drives the visible locked/unlocked image. Leave blank to skip state display (the action still fires both commands).
- **Value Locked** / **Value Unlocked** — numeric thresholds; default `0` / `1`. Closest-distance match selects the image (or `≥ 0.5` for the default 0/1 case).
- **Strict Unlocked Match** — when checked, only `value === Value Unlocked` (with float tolerance) counts as unlocked; everything else is locked. Useful for multi-state guards where one specific index is "open".
- **Image Locked** / **Image Unlocked** — optional custom 144×144 PNG/JPG/SVG per state. Upload UX matches [DataRef Toggle](#dataref-toggle) — drag, paste, or click. Leave empty to use the bundled `guarded` icons (see [Button icons](#button-icons)).

#### Example: PA-46 M500 starter with cover

| Field | Value |
| --- | --- |
| Short press → Command Path | `sim/PA46/cover/starter_toggle` |
| Long press → Command Path | `sim/starters/engage_starter_1` |
| Long press → Mode | `Hold (begin / end while held)` |
| Guard DataRef | `sim/PA46/cover/starter_open` |
| Value Locked | `0` |
| Value Unlocked | `1` |

Press once → cover flips open; the button image switches to unlocked. Press and hold → starter engages via begin/end and stays engaged until release. Press once again → cover flips closed.

### Guarded DataRef

Same two-stage cover pattern as [Guarded Command](#guarded-command), but **both short press and long press toggle DataRefs** (read the current value, write the opposite) instead of activating CommandRefs. Use it when the aircraft exposes only DataRefs for the protected control — e.g. the EC130 helicopter's `HSF/ec130/...` DataRefs, which have no matching CommandRefs.

Property Inspector fields:

- **Short press → DataRef Path** — toggled on quick release, e.g. the cover state.
- **Short press → Value Off** / **Value On** — defaults to `0` / `1`. Closest-distance match decides which is "current"; the opposite is written.
- **Hide green OK after short press** — opt-out of the `showOk()` flash. Errors still always show the alert icon.
- **Long press → DataRef Path** — toggled when the key is held for at least 500 ms (e.g. the switch behind the cover).
- **Long press → Value Off** / **Value On** — defaults to `0` / `1`, same toggle logic.
- **Guard DataRef** — optional DataRef that drives the locked/unlocked image. **Leave empty to use the short DataRef** — the most common setup (cover state = image state).
- **Value Locked** / **Value Unlocked** — numeric thresholds for the image mapping. **Default to the short Value Off / Value On** when empty, so a single-DataRef setup needs no extra wiring.
- **Strict Unlocked Match** — when checked, only `value === Value Unlocked` (with float tolerance) counts as unlocked.
- **Image Locked** / **Image Unlocked** — optional custom 144×144 PNG/JPG/SVG per state. Upload UX matches [DataRef Toggle](#dataref-toggle) — drag, paste, or click. Leave empty to use the bundled `guarded` icons.

#### Example: EC130 collective hydraulic cover + switch

| Field | Value |
| --- | --- |
| Short press → DataRef Path | `HSF/ec130/CollectiveHydCover` |
| Short Value Off | `0` |
| Short Value On | `1` |
| Long press → DataRef Path | `HSF/ec130/CollectiveHydSwitch` |
| Long Value Off | `0` |
| Long Value On | `1` |
| Guard DataRef | *(empty — falls back to the short DataRef)* |

Press once → cover DataRef toggles (image follows). Press and hold (≥ 500 ms) → switch DataRef toggles. Releasing the long press does not write anything else.

### DataRef Write

Single-press action that writes a fixed numeric value to a DataRef. Use it when you want a button that *sets* a specific value (e.g. flaps to detent 2, parking brake to 1) rather than toggling. Optional **Hold Mode** turns it into a momentary write — `keyUp` writes a separate **Release Value** (test/reset-style buttons without a visible state change; for visible press feedback use [DataRef Toggle](#dataref-toggle) with Hold Mode instead).

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef to write. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path.
- **Value** — the numeric value written on press.
- **Hold Mode** — when checked, the action becomes momentary: `keyDown` writes *Value*, `keyUp` writes *Release Value*. The success checkmark is suppressed in hold mode so it doesn't blink under your thumb.
- **Release Value** — written on `keyUp` when *Hold Mode* is on. Defaults to `0` if empty.
- **Label** — optional caption rendered above the live value (only used when *Show current value* is checked).
- **Show current value** — when checked, subscribes to the DataRef and renders its live value on the button title (same formatting pipeline as DataRef Display).
- **Format** / **Unit Scale** / **Precision** — printf formatting, only used when *Show current value* is checked. See [DataRef Display](#dataref-display) for details.
- **Hide green confirmation icon** — opt-out of the `showOk()` flash on success. Errors still always show the alert icon.

#### Example: parking brake on

| Field | Value |
| --- | --- |
| DataRef Path | `sim/flightmodel/controls/parkbrake` |
| Value | `1` |

#### Example: flaps to detent 2

| Field | Value |
| --- | --- |
| DataRef Path | `sim/flightmodel/controls/flaprqst` |
| Value | `0.5` |
| Show current value | *(checked)* |
| Format | `FLP %.0f%%` |
| Unit Scale | `100` |

#### Example: EC130 collective hydraulic test (momentary, no state image)

| Field | Value |
| --- | --- |
| DataRef Path | `HSF/ec130/CollectiveHydSwitch` |
| Value | `1` |
| Hold Mode | *(checked)* |
| Release Value | `0` |

Press and hold → writes `1`; release → writes `0`. The icon stays single-state — for a visible press indication, use [DataRef Toggle](#dataref-toggle) with Hold Mode and Image OFF/ON.

### Multi-Action / Macro

Runs an ordered list of commands and/or DataRef writes from a single key. Built for study-level aircraft (Zibo B737-800X, ToLiss) where one cockpit switch is split across several DataRefs and/or commands, so a single write only does half the job — it moves the lever animation but doesn't trigger the system logic, or vice versa. Guiding principle: **Command = actuate, DataRef = display.**

Steps are written one per line in a text field. Blank lines and `#` comments are ignored. Grammar:

- `cmd <commandPath>` — activate a CommandRef once.
- `begin <commandPath>` / `end <commandPath>` — WebSocket begin/end hold (e.g. `begin` in the press list, `end` in the release list).
- `write <datarefPath>[idx] = <value>` — write a numeric value. Array indexing via `[N]` (see [Array DataRefs](#array-datarefs)).
- `delay <ms>` — pause before the next step (milliseconds).

Paths support `{KEY}` selector placeholders (see [Display Selector](#display-selector)) and are resolved fresh on every press.

Property Inspector fields:

- **Label** — optional caption shown on the key.
- **Press steps** — the list run on `keyDown`.
- **Release steps** *(optional)* — the list run on `keyUp`; pair with the press list for momentary switches (e.g. write `1` on press, `0` on release).
- **Toggle Mode** — when checked, the action alternates between **On** and **Off** lists instead of press/release. Release does nothing in toggle mode.
- **When turning ON** / **When turning OFF** — the two toggle lists.
- **State DataRef Path** — drives the button image (OFF/ON) and, in toggle mode, the direction — the single source of truth. Supports array indexing. When empty, toggle direction is tracked internally.
- **Live Value** — read-only preview while editing the state path.
- **Value Off** / **Value On** — values mapping to the OFF / ON image. Default `0` / `1`. Same matching logic as [DataRef Toggle](#dataref-toggle).
- **Strict On Match** — when checked, only `value === Value On` (with float tolerance) counts as ON.
- **Stop On Error** — abort the remaining steps after the first failure. Unchecked (default) = best-effort: continues past failures.
- **Hide Confirmation** — opt-out of the `showOk()` flash on success. Errors always show the alert icon.

#### Example: Zibo 737 GPU (toggle via DataRef writes, state from `gpu_on`)

The Zibo GPU lever is spring-loaded: `laminar/B738/electrical/gpu_pos` moves the animation, `sim/cockpit/electrical/gpu_on` carries the electrical logic. The macro pulses the lever while setting the logic, and the button image follows the real `gpu_on` state.

Toggle Mode *(checked)*, State DataRef Path `sim/cockpit/electrical/gpu_on`.

When turning ON:

```
write laminar/B738/electrical/gpu_pos = 1
write sim/cockpit/electrical/gpu_on = 1
delay 5
write laminar/B738/electrical/gpu_pos = 0
```

When turning OFF:

```
write laminar/B738/electrical/gpu_pos = -1
write sim/cockpit/electrical/gpu_on = 0
delay 5
write laminar/B738/electrical/gpu_pos = 0
```

#### Example: momentary fire-test switch

Press steps:

```
write sim/cockpit2/engine/actuators/fire_test[0] = 1
```

Release steps:

```
write sim/cockpit2/engine/actuators/fire_test[0] = 0
```

Press and hold → writes `1`; release → writes `0`. For more than one step, separate the two lists; the press list and release list each run top to bottom.

### Display Selector

A single button that holds a named index `1..N` and lets every other action reuse one configuration across multiple identical panels. The motivating case is aircraft like the **AW109**, which exposes **physically duplicated panels** — `EDU1..EDU4`, `RFU1..RFU2`, etc. — each with its own DataRef and CommandRef tree (`aw109/cockpit/button/edu1/...`, `.../edu2/...`, ...). Putting every duplicate on its own button blows past the deck's key budget; routing them all through a selector collapses the duplicates into one set of buttons that re-target the chosen panel.

The selector value is persisted via Stream Deck's global plugin settings — it survives restarts and is shared across all selector instances with the same key (so a duplicate "EDU" selector on a second page mirrors the first).

Property Inspector fields:

- **Selector Key** — short identifier used in placeholders, e.g. `EDU`, `RFU`, `COM`. Required. Allowed characters: `A-Z`, `a-z`, `0-9`, `_`; must start with a letter.
- **Option Count** — number of positions the selector cycles through. Default `4`.
- **Default Value** — initial position used when the selector hasn't been set yet (first appearance, or after Stream Deck global settings are cleared). Default `1`. Useful e.g. for the AW109 where the pilot sits on the right and the `2` positions are the primary ones — set Default to `2` so a fresh deck targets the right-seat panels first.
- **Label** *(optional)* — small caption rendered below the number. Leave empty to show only the number + position dots.

Press behaviour:

- **Short press** — cycles forward `1 → 2 → 3 → 4 → 1`.
- **Long press** (≥ 500 ms) — cycles backward `4 → 3 → 2 → 1 → 4`.

#### Using `{KEY}` placeholders in any action

**Every DataRef Path and Command Path on every action** accepts `{KEY}` markers. At runtime, `{KEY}` is replaced with the current value of the matching selector before the path is sent to X-Plane:

- `aw109/cockpit/button/edu{EDU}/knob_push` → `aw109/cockpit/button/edu2/knob_push` (when `EDU = 2`)
- `aw109/cockpit/knob/pdf{PDF}/brt` → `aw109/cockpit/knob/pdf3/brt` (when `PDF = 3`)

Use **curly braces** `{...}` for selector placeholders — square brackets `[...]` remain reserved for X-Plane array indices (see [Array DataRefs](#array-datarefs)), and the two compose freely (`sim/cockpit/foo[{IDX}]` works). Unknown keys (no matching selector defined) are left literal, so the standard `?` not-found suffix surfaces the misconfiguration on the tile.

When the selector value changes, every action that **subscribes** to a path containing the affected key automatically drops and re-subscribes to the new path — live displays jump to the newly-selected panel within one update cycle. One-shot writes and commands substitute fresh on each press, so there is no state to invalidate.

The Property Inspector's **Live Value** preview and **DataRef / Command autocomplete** both substitute the current selector value while you edit, so you see the actual X-Plane value (and get useful suggestions) instead of "X-Plane unreachable" for the literal `{KEY}` string.

#### Example: AW109 EDU panel (1 selector + 3 reused buttons covers 4 panels)

| Action | Key fields |
| --- | --- |
| Display Selector | Key `EDU`, Count `4`, Label `EDU` |
| Command | Command Path `aw109/cockpit/button/edu{EDU}/knob_push` |
| DataRef Display | DataRef Path `aw109/cockpit/knob/edu{EDU}/brt`, Label `BRT` |
| Rotary DataRef | DataRef Path `aw109/cockpit/knob/edu{EDU}/crs`, Label `CRS` |

Three function-specific buttons + one selector instead of twelve fixed buttons. Press the selector to cycle to EDU2 — all three buttons retarget the EDU2 panel automatically.

### Background Tile

Decorative filler tile with **no action** — pressing it does nothing. Useful as a visual separator between functional clusters on the deck (e.g. a black or colored stripe between autopilot and lights groups).

There are no Property Inspector fields; set the image via Stream Deck's standard *Icon* field on the right-hand side. The bundled icon catalog produces solid-color tiles (`bg_black`, `bg_white`, `bg_yellow`, `bg_red`) via `make icons` — see [Button icons](#button-icons).

### Array DataRefs

Some X-Plane DataRefs are arrays — one value per engine, per cylinder, per aerodynamic surface, etc. Examples:

- `sim/cockpit/engine/fuel_pump_on` — `int[16]`, one slot per engine.
- `sim/flightmodel/engine/ENGN_running` — `int[16]`, one per engine.
- `sim/cockpit2/switches/landing_lights_on` — `int[10]`.

Append `[N]` to the DataRef path in any action that takes a DataRef path (Display, Toggle, Switch, Write, Command + Display, Rotary, Rotary DataRef, Multi DataRef Display) to address a single element. Without `[N]`, Display-style actions fall back to element `[0]` (legacy behaviour); Toggle, Switch, and Write target the DataRef as a whole, which is fine for scalar DataRefs but unreliable for arrays — always use `[N]` when the DataRef is an array.

#### Example: fuel pump for engine 1

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit/engine/fuel_pump_on[0]` |
| Value OFF | `0` |
| Value ON | `1` |

The Toggle action reads only `fuel_pump_on[0]` for the visible state and writes only that index on press (via `PATCH …/value?index=0`); engines 2–16 stay untouched. To put each engine on its own key, drop the same action four times and change the index to `[0]` / `[1]` / `[2]` / `[3]`. All four share a single WebSocket subscription under the hood.

#### Live Value behaviour

In the Property Inspector's *Live Value* row:

- Path **without** `[N]` on an array DataRef → shows the entire array (e.g. `[0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0]`). Useful for figuring out which index does what before committing to one.
- Path **with** `[N]` → shows only that scalar.
- Path with `[N]` but DataRef is not an array → shows `not an array`.
- Path with `[N]` but `N` is out of range → shows `index N out of bounds (length M)`.

In all error cases the action tile shows the standard `?` not-found suffix at runtime, and Toggle/Write trigger `showAlert()` on press.

## Button icons

Button images shown on the Stream Deck are generated locally by a small TypeScript pipeline so the whole set stays visually consistent (same font size, same baseline, same LED-bar geometry across every icon).

```bash
make icons
```

Five kinds of icons are produced from a single catalog (`scripts/icons/catalog.ts`):

- **`toggle`** — for action buttons that flip a state (AP HDG mode, FD on/off, …). Generates an `_on` + `_off` pair: bold uppercase label centered, colored LED bar at the bottom (lit in the accent color when ON, dark grey when OFF, with a soft glow).
- **`display`** — for the **`dataref-display`** action (live X-Plane readouts: current altitude, wind, AP setpoints, …). Generates a single PNG: small caption + thin accent line in the top third, rest of the key left empty so Stream Deck's title overlay can render the live value cleanly underneath.
- **`nudge`** — for single-press command buttons that increment/decrement an AP setpoint (heading bug, altitude target, V/S, source). Generates a single PNG: bold label at the top, big filled triangle in the accent color pointing in the action direction. Pair with the `command` action (with `Hold Mode` for continuous spin).
- **`background`** — solid-color filler tile (no label, no accent). Generates a single PNG with the entire 144×144 painted in the entry's `color`. Useful as visual separators between functional clusters on the deck. Bundled set: black, white, yellow, red.
- **`guarded`** — pairs with the **`guarded-command`** action. Generates a `_locked` + `_unlocked` pair: yellow-and-black hazard stripe at the top (signals "guarded"), bold label centered, LED bar at the bottom (lit in the group's accent color when unlocked, dark when locked). Bundled set lives in the `cockpit` group: `starter`, `starter_l` / `starter_r` (twin-engine), `fuel_cut`, `emer_gear`.

### Groups & color palette

Each catalog entry belongs to exactly one group. The group decides **both** the accent color **and** the output subdirectory — one color per group keeps the whole set visually calm and makes related buttons easy to find on disk.

Non-cockpit-green switches get their own groups so they stay visually distinct on the deck — `emergency` (red), `caution` (orange), and `advisory` (yellow) for the standard cockpit severity tiers.

| Group       | Accent  | Hex       | Contents                                                              |
| ----------- | ------- | --------- | --------------------------------------------------------------------- |
| `autopilot` | yellow  | `#eab308` | AP/FD/YD mode toggles, AP setpoint readouts, HDG/ALT/VS/SRC nudges    |
| `lights`    | green   | `#22c55e` | BCN, LAND, TAXI, NAV, STROBE                                          |
| `cockpit`   | green   | `#22c55e` | PARK BRK, FUEL PUMP, MASTER BAT, AVIONICS, PITOT HEAT                 |
| `readouts`  | white   | `#ffffff` | Live values: HDG, ALT, IAS, V/S, BARO, WIND, W SPD                    |
| `caution`   | orange  | `#f59e0b` | Caution-level switches (one step below emergency red) — e.g. `nolabel_orange` |
| `advisory`  | yellow  | `#ffeb00` | Advisory-level switches (master-caution style) — e.g. `nolabel_yellow` |
| `backgrounds` | n/a   | per entry | Solid-color filler tiles (`bg_black`, `bg_white`, `bg_yellow`, `bg_red`) |

The mapping lives in `GROUP_ACCENT` at the top of `scripts/icons/catalog.ts` — change a hex there and every icon in that group updates after the next `make icons`.

Output goes into one subdirectory per group:

```
out/icons/
├── autopilot/   # ap, fd, hdg, …, ap_hdg, ap_alt, …, hdg_left, hdg_right, alt_up, …
├── lights/      # lt_bcn_on/off, lt_land_on/off, …
├── cockpit/     # parkbrake_on/off, fuelpump_on/off, …
└── readouts/    # cur_hdg, cur_alt, cur_ias, …
```

Toggles produce `<name>_on.png` + `<name>_off.png`; displays and nudges produce a single `<name>.png`. All 144×144. The `out/` folder is gitignored and wiped by `make clean`.

### Adding a new icon

1. Open `scripts/icons/catalog.ts`.
2. Append a single entry to the `catalog` array, picking the `kind` and the `group`:

   ```ts
   // toggle button — color and output dir come from the group
   { kind: 'toggle',  name: 'apu',     label: 'APU', group: 'cockpit' },

   // live readout (header for the dataref-display action)
   { kind: 'display', name: 'cur_oat', label: 'OAT', group: 'readouts' },

   // nudge button (single press → CommandRef; arrow indicates direction)
   { kind: 'nudge',   name: 'crs_left', label: 'CRS', direction: 'left',  group: 'autopilot' },
   { kind: 'nudge',   name: 'crs_x2',   label: 'CRS', direction: 'right', double: true, group: 'autopilot' },

   // solid-color filler tile (no label, no accent — color comes from `color`)
   { kind: 'background', name: 'bg_orange', color: '#f59e0b', group: 'backgrounds' },
   ```

   - `kind` — `'toggle'` for on/off buttons, `'display'` for live-readout headers, `'nudge'` for single-press arrow buttons, `'background'` for plain-color filler tiles, `'guarded'` for two-stage cover-protected buttons.
   - `name` — file-name stem; must be unique within its group. Output: `apu_on.png` + `apu_off.png` (toggle) or `cur_oat.png` / `crs_left.png` (display, nudge), inside the group's subdirectory.
   - `label` — text shown on the icon. **Toggle:** ≤ 4 chars renders at 44px; longer labels auto-shrink in fixed steps (5→36, 6→30, 7→26, 8→22, 9→20, 10+→18). **Display:** ≤ 6 characters comfortably (`AP HDG`, `W SPD`). **Nudge:** ≤ 4 characters (`HDG`, `SRC`, `ALT`, `VS`); the arrow is the visual focus.
   - `group` — one of `'autopilot'` / `'lights'` / `'cockpit'` / `'readouts'`. Drives **both** the accent color (see the table above) and the output subdirectory. To add a new group, extend the `IconGroup` type and `GROUP_ACCENT` map at the top of `catalog.ts`.
   - `direction` *(nudge only)* — `'up'` / `'down'` / `'left'` / `'right'`. Arrow points this way.
   - `double` *(nudge only, optional)* — `true` renders two stacked triangles for "coarse step" semantics (e.g. ALT ↑↑ for big increments).
   - `color` *(background only)* — hex fill for the entire tile. The group's accent is ignored for this kind.
3. Run `make icons`. The new files appear in `out/icons/<group>/`.
4. In the Stream Deck app: drag the PNG onto a key. For a `display` icon, configure the `dataref-display` action (DataRef path + format) on that key — the live value renders as the title in the empty zone of the icon.

To rename an icon, edit the catalog entry and re-run; the old PNGs stay until you run `make clean`.

### Where to change the look

All visual decisions live in `scripts/icons/template.ts` (a single SVG renderer):

- `LABEL_FONT_SIZE`, `LABEL_BASELINE_Y` — text size and vertical position.
- `BAR_HEIGHT`, `BAR_INSET_X`, `BAR_INSET_BOTTOM`, `BAR_RADIUS` — LED bar geometry.
- `BG`, `BAR_OFF`, `LABEL_COLOR` — base palette.
- The `<filter id="glow">` block — strength of the lit-bar glow.

Change once → re-run `make icons` → every icon updates with identical proportions.

## Aircraft/Helicopter profiles

Ready-made Stream Deck XL, Stream Deck MK2 and Stream Deck 3 profiles for several aircraft live in [`streamdeck-profiles/`](streamdeck-profiles/README.md). The bundled set covers the X-Plane default Cessna 172 SP and G1000, Aerobask Diamond DA42 / DA62 / DV20, UL Shark, Aerobask Phenom 300, Pilatus PC12 by Thranda (G1000 version), Toliss Airbus family, X-Plane default A330 & Aerogenesis A330 and the **Piper PA-46 M500 by [X-Aerodynamics](https://www.x-aerodynamics.com/copy-of-about-x-aero)**. Also new supported are Helicopters. Special the EC130 and high detailed AW-109 V2.

Each profile expects this plugin installed and the matching aircraft loaded in X-Plane.

### Syncing profiles via `make`

> **macOS-only.** `make export` and `make import` drive the Stream Deck app via AppleScript and read `~/Library/Application Support/...`. Windows users should manage profiles through the Stream Deck app's built-in import/export UI; the bundled `.streamDeckProfile` archives under `streamdeck-profiles/` are platform-agnostic.

Profiles are versioned in this repo and synced with two targets that bypass the Stream Deck UI (which always creates "Copy" duplicates with fresh UUIDs and breaks the parent `X-Plane` profile's cross-links):

- `make export` — interactive picker; choose which live profiles to snapshot back into `streamdeck-profiles/`. Use after editing a profile in the Stream Deck app on the dev Mac.
- `make import` — restore every archive in `streamdeck-profiles/` into the Stream Deck app, patching the hardware-bound `Device.UUID` to the local machine. Additive: non-`xp_stream_*` profiles stay untouched.

Both targets quit and relaunch the Stream Deck app automatically. Folder UUIDs are preserved across machines, so the parent profile's child links keep working when you `git pull && make import` on the flight-sim Mac.

See [`streamdeck-profiles/README.md`](streamdeck-profiles/README.md) for the first-time setup procedure (delete the existing profiles once, then `make import`) and per-aircraft feature notes.

### Converting a PilotsDeck profile

If you already have a [PilotsDeck](https://github.com/Fragtality/PilotsDeck) profile, you can adapt it to this plugin. Unlike `make export`/`make import`, this converter is **cross-platform** (pure-JS ZIP, no AppleScript) and runs on Windows and macOS:

```
make convert IN="SR2x G1000 - X-Plane12.streamDeckProfile"
# or directly:
npx tsx scripts/convert-pilotsdeck.ts <input.streamDeckProfile> [output.streamDeckProfile]
```

Both plugins share the same `.streamDeckProfile` container, so layout, titles, images and folder navigation carry over. Each button's PilotsDeck action is remapped to the closest action here: `command`, `dataref-toggle`, or `dataref-display`. The output profile is hardware/OS-neutral and imports on any Stream Deck — including a Mac.

The converter prints a report of everything that needs manual rework. Known limitations:

- **Graphical gauges** (PilotsDeck `display.gauge`) become a plain text readout — this plugin has no bar/arc action.
- **Korry combo buttons** (command + lamp overlay in one action) map to a toggle; the layered top/bottom image rendering is not reproduced.
- **FlyWithLua / Lvar addresses** cannot be reached over the Web API — those fields are cleared and listed in the report for manual replacement with real `sim/…` paths.

## Common Make targets

Run `make help` for the full list. Most-used: `make build`, `make icons`, `make clean`, `make distclean`, `make setup`, `make package`.