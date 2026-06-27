/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

export type IconGroup =
	| "autopilot"
	| "lights"
	| "cockpit"
	| "readouts"
	| "backgrounds"
	| "buttons"
	| "g1000"
	| "views"
	| "alerts"
	| "emergency"
	| "caution"
	| "advisory";

// One accent color per functional group — keeps the whole set visually calm.
// The group name is also the output subdirectory (out/icons/<group>/).
// `backgrounds` is a non-functional bucket: solid color tiles used as filler
// or visual separators on the deck. Its accent is unused (background icons
// carry their color explicitly per entry); the value here is just a
// placeholder so the Record stays exhaustive.
export const GROUP_ACCENT: Record<IconGroup, string> = {
	autopilot: "#ffeb00", // yellow
	lights: "#22c55e", // green
	cockpit: "#22c55e", // green
	readouts: "#9933CC", // WebSafe purple — all live-value tiles read as one set
	backgrounds: "#000000", // unused — background tiles carry their own color
	buttons: "#000000", // unused — push-button tiles carry their own color
	g1000: "#f59e0b", // orange — Garmin-style amber for G1000 command/knob buttons
	views: "#3b82f6", // blue — saved cockpit view recall buttons
	alerts: "#000000", // unused — alert tiles derive their color from `severity`
	emergency: "#ef4444", // red — EMER / FIRE / FUEL CUT-style buttons (red != always warning in cockpit context)
	caution: "#f59e0b", // orange — caution-level switches (one step below emergency red)
	advisory: "#ffeb00", // yellow — advisory-level switches (master-caution style)
};

type IconBase = {
	name: string;
	label: string;
	group: IconGroup;
};

// Optional `sublabel` stacks a second line below the main label (used for
// twin-engine pairs like ALT/L, ALT/R, START/L, START/R — keeps the L/R
// designator readable instead of squeezing "START L" into 26px inline).
export type ToggleIcon = IconBase & { kind: "toggle"; sublabel?: string };
export type DisplayIcon = IconBase & { kind: "display" };
// `label` is optional so we can render bare directional arrows (e.g. G1000
// cursor-up) — when absent the triangle centers vertically on the canvas.
export type NudgeIcon = {
	kind: "nudge";
	name: string;
	label?: string;
	group: IconGroup;
	direction: "up" | "down" | "left" | "right";
	double?: boolean;
};
// Single-press text button (no on/off state). Same label DNA as toggle but
// with a thin static accent stripe instead of the toggle's LED bar — signals
// "action ready" rather than "togglable".
export type CommandIcon = IconBase & { kind: "command" };
// Compact directional arrow + label, lower 2/3 reserved for the Stream Deck
// title overlay. Used by the `rotary` action: each button fires a step
// command in one direction while showing the live DataRef value as title.
// Visually a hybrid of `nudge` (small arrow hint) and `display` (empty
// readout area).
export type NudgeDisplayIcon = {
	kind: "nudge-display";
	name: string;
	label: string;
	group: IconGroup;
	direction: "up" | "down" | "left" | "right";
	// When true, the short 64-px accent stripe is omitted — leaves the entire
	// canvas (minus the edge arrow) free for a Stream Deck `setTitle()` overlay.
	noAccentLine?: boolean;
};
// G1000-style dual-concentric rotary knob indicator. `outer` is the big
// outer ring (coarse adjustment), `inner` is the small inner knob (fine
// adjustment). cw/ccw is the rotation direction. `push` is the click-the-
// knob action — concentric ring with a center dot, no rotation arrow.
export type KnobIcon = {
	kind: "knob";
	name: string;
	group: IconGroup;
	variant: "outer-cw" | "outer-ccw" | "inner-cw" | "inner-ccw" | "push";
	// Only honored by the `push` variant; renders a caption above the symbol.
	label?: string;
};
// Solid-color filler tile — no label, no accent, just the fill.
export type BackgroundIcon = {
	kind: "background";
	name: string;
	group: IconGroup;
	color: string;
};
// Same solid fill as `background`, but with a back-arrow (left triangle) at
// the bottom of the tile. Upper area stays free for a user-provided title
// overlay. Used as the "back / previous page" companion to plain bg_* tiles.
export type BackgroundBackIcon = {
	kind: "background-back";
	name: string;
	group: IconGroup;
	color: string;
};
// G1000 GCU keypad button — solid dark tile, oversized bold character
// centered. No accent stripe or border; the character is the icon.
export type GcuKeyIcon = IconBase & { kind: "gcu_key" };
// Cockpit view recall buttons — tiny "COCKPIT VIEW" header, oversized
// number centered (01..20). Single-press command tile with blue accent.
export type ViewIcon = {
	kind: "view";
	name: string;
	number: number;
	group: IconGroup;
};
// Annunciator-style tile: OFF dark with muted gray label, ON flooded with the
// severity color (orange=caution, red=warning) and bold black label. Pairs
// with the existing dataref-toggle action via <name>_on.png / <name>_off.png.
export type AlertIcon = IconBase & {
	kind: "alert";
	severity: "caution" | "warning";
};
// Two-stage button: top hazard stripe signals "guarded" (cockpit cover);
// label + LED-bar follow toggle DNA. Sublabel for twin-engine pairs.
// Pairs with the guarded-command action via <name>_locked.png / <name>_unlocked.png.
export type GuardedIcon = IconBase & { kind: "guarded"; sublabel?: string };
// 3-position toggle/slider switch — labelless, just a slot + offset knob.
// Pairs with the dataref-switch action via <name>_min.png / _mid.png / _max.png.
// Vertical: min=top, max=bottom. Horizontal: min=left, max=right.
export type SwitchIcon = {
	kind: "switch";
	name: string;
	axis: "vertical" | "horizontal";
	group: IconGroup;
};
// Bare accent-coloured dot at canvas centre, no ring, no label. Generic
// "push me" tile reused across many similar physical buttons (e.g. all 7
// AW109 RTU push buttons share one icon).
export type DotIcon = {
	kind: "dot";
	name: string;
	group: IconGroup;
};
// Round push-button tile — like a doorbell or start button. Filled body in the
// chosen color, darker bezel ring, glossy upper highlight for a 3D pressable
// look. No label (a Stream Deck title overlay can sit on top if needed).
export type PushButtonColor = "red" | "green" | "white" | "blue" | "black";
export type PushButtonIcon = {
	kind: "pushbutton";
	name: string;
	color: PushButtonColor;
	group: IconGroup;
};
export type IconDef =
	| ToggleIcon
	| DisplayIcon
	| NudgeIcon
	| NudgeDisplayIcon
	| CommandIcon
	| KnobIcon
	| BackgroundIcon
	| BackgroundBackIcon
	| GcuKeyIcon
	| ViewIcon
	| AlertIcon
	| GuardedIcon
	| SwitchIcon
	| DotIcon
	| PushButtonIcon;

export const catalog: IconDef[] = [
	// === Autopilot — mode toggles ===
	{ kind: "toggle", name: "ap", label: "AP", group: "autopilot" },
	{ kind: "toggle", name: "fd", label: "FD", group: "autopilot" },
	{ kind: "toggle", name: "yaw", label: "YD", group: "autopilot" },
	{ kind: "toggle", name: "hdg", label: "HDG", group: "autopilot" },
	{ kind: "toggle", name: "nav", label: "NAV", group: "autopilot" },
	{ kind: "toggle", name: "up", label: "UP", group: "autopilot" },
	{ kind: "toggle", name: "dwn", label: "DWN", group: "autopilot" },
	{ kind: "toggle", name: "alt", label: "ALT", group: "autopilot" },
	{ kind: "toggle", name: "vs", label: "V/S", group: "autopilot" },
	{ kind: "toggle", name: "flc", label: "FLC", group: "autopilot" },
	{ kind: "toggle", name: "vnav", label: "VNAV", group: "autopilot" },
	{ kind: "toggle", name: "apr", label: "APR", group: "autopilot" },
	{ kind: "toggle", name: "bc", label: "BC", group: "autopilot" },
	{ kind: "toggle", name: "spd", label: "SPD", group: "autopilot" },
	{ kind: "toggle", name: "csc", label: "CSC", group: "autopilot" },
	{ kind: "toggle", name: "bank", label: "BANK", group: "autopilot" },

	// === Autopilot — setpoint readouts (live values: AP HDG, AP ALT, …) ===
	{ kind: "display", name: "ap_hdg", label: "AP HDG", group: "autopilot" },
	{ kind: "display", name: "ap_alt", label: "AP ALT", group: "autopilot" },
	{ kind: "display", name: "ap_vs", label: "AP V/S", group: "autopilot" },
	{ kind: "display", name: "ap_src", label: "AP SRC", group: "autopilot" },
	{ kind: "display", name: "ap_spd", label: "AP SPD", group: "autopilot" },

	// === Autopilot — nudge buttons (single press → CommandRef) ===
	{ kind: "nudge", name: "hdg_left", label: "HDG", direction: "left", group: "autopilot" },
	{ kind: "nudge", name: "hdg_right", label: "HDG", direction: "right", group: "autopilot" },
	{ kind: "knob", name: "hdg_sync", variant: "push", label: "HDG SYNC", group: "autopilot" },
	{ kind: "knob", name: "hdg_sync_bare", variant: "push", group: "autopilot" },
	{ kind: "nudge", name: "src_left", label: "SRC", direction: "left", group: "autopilot" },
	{ kind: "nudge", name: "src_right", label: "SRC", direction: "right", group: "autopilot" },
	{ kind: "nudge", name: "alt_up", label: "ALT", direction: "up", group: "autopilot" },
	{
		kind: "nudge",
		name: "alt_up_x2",
		label: "ALT",
		direction: "up",
		double: true,
		group: "autopilot",
	},
	{ kind: "nudge", name: "alt_down", label: "ALT", direction: "down", group: "autopilot" },
	{
		kind: "nudge",
		name: "alt_down_x2",
		label: "ALT",
		direction: "down",
		double: true,
		group: "autopilot",
	},
	{ kind: "nudge", name: "vs_up", label: "VS", direction: "up", group: "autopilot" },
	{ kind: "nudge", name: "vs_down", label: "VS", direction: "down", group: "autopilot" },
	{ kind: "nudge", name: "spd_up", label: "SPD", direction: "up", group: "autopilot" },
	{ kind: "nudge", name: "spd_down", label: "SPD", direction: "down", group: "autopilot" },

	// === Autopilot — labelless directional arrows (yellow) ===
	// Bare triangle in the autopilot accent, no label — for generic
	// up/down/left/right nudges where the surrounding deck layout already
	// makes the function obvious.
	{ kind: "nudge", name: "ap_up", direction: "up", group: "autopilot" },
	{ kind: "nudge", name: "ap_down", direction: "down", group: "autopilot" },
	{ kind: "nudge", name: "ap_left", direction: "left", group: "autopilot" },
	{ kind: "nudge", name: "ap_right", direction: "right", group: "autopilot" },

	// === Lights (toggles) — `lt_` prefix avoids clashing with AP "nav" ===
	{ kind: "toggle", name: "lt_bcn", label: "BCN", group: "lights" },
	{ kind: "toggle", name: "lt_land", label: "LAND", group: "lights" },
	{ kind: "toggle", name: "lt_taxi", label: "TAXI", group: "lights" },
	{ kind: "toggle", name: "lt_nav", label: "NAV", group: "lights" },
	{ kind: "toggle", name: "lt_strobe", label: "STROBE", group: "lights" },

	// === Cockpit controls / system switches (toggles) ===
	{ kind: "toggle", name: "nolabel", label: "", group: "cockpit" },
	{ kind: "toggle", name: "parkbrake", label: "PARK BRK", group: "cockpit" },
	{ kind: "toggle", name: "master_bat", label: "MASTER BAT", group: "cockpit" },
	{ kind: "toggle", name: "master_alt", label: "MASTER ALT", group: "cockpit" },
	{ kind: "toggle", name: "efis", label: "EFIS", group: "cockpit" },
	{ kind: "toggle", name: "avionics", label: "AVIONICS", group: "cockpit" },
	{ kind: "toggle", name: "pitot_heat", label: "PITOT HEAT", group: "cockpit" },
	{ kind: "toggle", name: "fuelpump", label: "FUEL PUMP", group: "cockpit" },
	{ kind: "toggle", name: "motor_start", label: "MAGN START", group: "cockpit" },
	// Twin-engine variants: stacked label + L/R designator
	{ kind: "toggle", name: "alt_l", label: "ALT", sublabel: "L", group: "cockpit" },
	{ kind: "toggle", name: "alt_r", label: "ALT", sublabel: "R", group: "cockpit" },
	{ kind: "toggle", name: "start_l", label: "START", sublabel: "L", group: "cockpit" },
	{ kind: "toggle", name: "start_r", label: "START", sublabel: "R", group: "cockpit" },
	// Shark
	{ kind: "toggle", name: "master", label: "MASTER", group: "cockpit" },
	{ kind: "toggle", name: "efis", label: "EFIS", group: "cockpit" },
	{ kind: "toggle", name: "apilot", label: "AUTO PILOT", group: "cockpit" },
	{ kind: "toggle", name: "flaps", label: "FLAPS", group: "cockpit" },
	{ kind: "toggle", name: "trim", label: "TRIM", group: "cockpit" },
	{ kind: "toggle", name: "landg", label: "LANDGEAR", group: "cockpit" },
	{ kind: "toggle", name: "prop", label: "PROP", group: "cockpit" },
	{ kind: "toggle", name: "mag1", label: "MAG 1", group: "cockpit" },
	{ kind: "toggle", name: "mag2", label: "MAG 2", group: "cockpit" },

	// === Guarded switches (short press unlocks the cover; long press triggers
	// the protected command, e.g. PA46 starter, fuel cutoff, emergency gear) ===
	{ kind: "guarded", name: "starter", label: "STARTER", group: "cockpit" },
	{ kind: "guarded", name: "starter_l", label: "START", sublabel: "L", group: "cockpit" },
	{ kind: "guarded", name: "starter_r", label: "START", sublabel: "R", group: "cockpit" },
	{ kind: "guarded", name: "fuel_cut", label: "FUEL CUT", group: "cockpit" },
	{ kind: "guarded", name: "emer_gear", label: "EMER GEAR", group: "cockpit" },

	// === 3-position switches (labelless slot + offset knob) ===
	// Pair with the `dataref-switch` action (imageMin/Mid/Max). Vertical:
	// min = top, max = bottom. Horizontal: min = left, max = right.
	{ kind: "switch", name: "switch_v", axis: "vertical", group: "cockpit" },
	{ kind: "switch", name: "switch_h", axis: "horizontal", group: "cockpit" },
	// Color-suffixed variants — same geometry, different groove accent.
	{ kind: "switch", name: "switch_v_green", axis: "vertical", group: "cockpit" },
	{ kind: "switch", name: "switch_h_green", axis: "horizontal", group: "cockpit" },
	{ kind: "switch", name: "switch_v_red", axis: "vertical", group: "emergency" },
	{ kind: "switch", name: "switch_h_red", axis: "horizontal", group: "emergency" },
	{ kind: "switch", name: "switch_v_blue", axis: "vertical", group: "views" },
	{ kind: "switch", name: "switch_h_blue", axis: "horizontal", group: "views" },

	// === Labelless push buttons (label set dynamically via setTitle, or unused) ===
	// `nolabel` (cockpit/green) already covers the green toggle variant.
	{ kind: "toggle", name: "nolabel_red", label: "", group: "emergency" },
	{ kind: "toggle", name: "nolabel_orange", label: "", group: "caution" },
	{ kind: "toggle", name: "nolabel_yellow", label: "", group: "advisory" },
	{ kind: "command", name: "nolabel_cmd", label: "", group: "cockpit" },
	{ kind: "command", name: "slave", label: "SLAVE", group: "cockpit" },
	{ kind: "command", name: "free", label: "FREE", group: "cockpit" },

	// === Live readouts (display-only, no on/off) ===
	// Layout reserves the lower 2/3 of the key for the Stream Deck title overlay.
	{ kind: "display", name: "cur_hdg", label: "HDG", group: "readouts" },
	{ kind: "display", name: "cur_alt", label: "ALT", group: "readouts" },
	{ kind: "display", name: "cur_ias", label: "IAS", group: "readouts" },
	{ kind: "display", name: "cur_spd", label: "SPD", group: "readouts" },
	{ kind: "display", name: "cur_vs", label: "V/S", group: "readouts" },
	{ kind: "display", name: "cur_baro", label: "W-BARO", group: "readouts" },
	{ kind: "display", name: "wind_dir", label: "W-DIR", group: "readouts" },
	{ kind: "display", name: "wind_spd", label: "W-SPD", group: "readouts" },
	{ kind: "display", name: "wind_temp", label: "W-TEMP", group: "readouts" },

	// === Engine readouts (PT6 turboprop: NG/ITT/TRQ/NP + house keeping) ===
	{ kind: "display", name: "eng_ng", label: "NG", group: "readouts" },
	{ kind: "display", name: "eng_n1", label: "N1", group: "readouts" },
	{ kind: "display", name: "eng_itt", label: "ITT", group: "readouts" },
	{ kind: "display", name: "eng_tot", label: "TOT", group: "readouts" },
	{ kind: "display", name: "eng_trq", label: "TRQ", group: "readouts" },
	{ kind: "display", name: "eng_np", label: "NP", group: "readouts" },
	{ kind: "display", name: "eng_ff", label: "FF", group: "readouts" },
	{ kind: "display", name: "eng_oil_p", label: "OIL P", group: "readouts" },
	{ kind: "display", name: "eng_oil_t", label: "OIL T", group: "readouts" },
	{ kind: "display", name: "hyd", label: "HYD", group: "readouts" },
	{ kind: "display", name: "eng_volt", label: "VOLT", group: "readouts" },
	{ kind: "display", name: "eng_amp", label: "AMP", group: "readouts" },
	{ kind: "display", name: "fuel", label: "FUEL", group: "readouts" },
	{ kind: "display", name: "fuel_l", label: "FUEL L", group: "readouts" },
	{ kind: "display", name: "fuel_r", label: "FUEL R", group: "readouts" },
	{ kind: "display", name: "nr", label: "NR", group: "readouts" },
	{ kind: "display", name: "t4", label: "T4", group: "readouts" },
	{ kind: "display", name: "fli", label: "FLI", group: "readouts" },
	{ kind: "display", name: "oat", label: "OAT", group: "readouts" },
	{ kind: "display", name: "rad_alt", label: "RAD ALT", group: "readouts" },
	{ kind: "display", name: "bat", label: "BAT", group: "readouts" },
	{ kind: "display", name: "rpm", label: "RPM", group: "readouts" },
	{ kind: "display", name: "tr_min", label: "TR/MIN", group: "readouts" },
	{ kind: "display", name: "flaps", label: "FLAPS", group: "readouts" },
	// Label-less display: just the accent line; setTitle() drops the live value below.
	{ kind: "display", name: "eng_blank", label: "", group: "readouts" },

	// === Rotary (small directional arrow + label, lower ⅔ reserved for setTitle) ===
	// Pair these to drive multi-position rotary switches (e.g. magneto OFF/R/L/BOTH/START)
	// or continuous tuners (COM/NAV frequency, FMS cursor). Use them with the `rotary` action.
	{
		kind: "nudge-display",
		name: "magneto_ccw",
		label: "MAG",
		direction: "left",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "magneto_cw",
		label: "MAG",
		direction: "right",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "flaps_up",
		label: "FLAPS",
		direction: "up",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "flaps_down",
		label: "FLAPS",
		direction: "down",
		group: "cockpit",
	},
	{ kind: "nudge-display", name: "freq_mhz_up", label: "MHz", direction: "up", group: "g1000" },
	{
		kind: "nudge-display",
		name: "freq_mhz_down",
		label: "MHz",
		direction: "down",
		group: "g1000",
	},
	{ kind: "nudge-display", name: "freq_khz_up", label: "kHz", direction: "up", group: "g1000" },
	{
		kind: "nudge-display",
		name: "freq_khz_down",
		label: "kHz",
		direction: "down",
		group: "g1000",
	},
	{
		kind: "nudge-display",
		name: "empty_left",
		label: "",
		direction: "left",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "empty_right",
		label: "",
		direction: "right",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "empty_up",
		label: "",
		direction: "up",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "empty_down",
		label: "",
		direction: "down",
		group: "cockpit",
	},

	// === Bare directional arrows (no accent line, no label baked in) ===
	// Edge-mounted triangle only — the whole canvas minus the arrow is free
	// for a Stream Deck setTitle() overlay. Pairs naturally with the rotary
	// action when a dynamic value should sit centered on the key.
	// Semantically these are cockpit controls (rotaries, selectors), but they
	// live in `readouts` so the purple accent matches the live-value overlay.
	{
		kind: "nudge-display",
		name: "bare_left",
		label: "",
		direction: "left",
		group: "readouts",
		noAccentLine: true,
	},
	{
		kind: "nudge-display",
		name: "bare_right",
		label: "",
		direction: "right",
		group: "readouts",
		noAccentLine: true,
	},
	{
		kind: "nudge-display",
		name: "bare_up",
		label: "",
		direction: "up",
		group: "readouts",
		noAccentLine: true,
	},
	{
		kind: "nudge-display",
		name: "bare_down",
		label: "",
		direction: "down",
		group: "readouts",
		noAccentLine: true,
	},
	// Same bare arrows in cockpit green — for selector/rotary controls that
	// belong visually to the cockpit cluster rather than a readout group.
	{
		kind: "nudge-display",
		name: "bare_left_green",
		label: "",
		direction: "left",
		group: "cockpit",
		noAccentLine: true,
	},
	{
		kind: "nudge-display",
		name: "bare_right_green",
		label: "",
		direction: "right",
		group: "cockpit",
		noAccentLine: true,
	},
	{
		kind: "nudge-display",
		name: "bare_up_green",
		label: "",
		direction: "up",
		group: "cockpit",
		noAccentLine: true,
	},
	{
		kind: "nudge-display",
		name: "bare_down_green",
		label: "",
		direction: "down",
		group: "cockpit",
		noAccentLine: true,
	},

	// === Plain-color background tiles (no label, no accent) ===
	// Useful as filler/separators between functional clusters on the deck.
	{ kind: "background", name: "bg_black", color: "#000000", group: "backgrounds" },
	{ kind: "background", name: "bg_white", color: "#ffffff", group: "backgrounds" },
	{ kind: "background", name: "bg_yellow", color: "#ffeb00", group: "backgrounds" },
	{ kind: "background", name: "bg_red", color: "#ef4444", group: "backgrounds" },
	{ kind: "background", name: "bg_green", color: "#22c55e", group: "backgrounds" },
	{ kind: "background", name: "bg_orange", color: "#f59e0b", group: "backgrounds" },
	{ kind: "background", name: "bg_blue", color: "#3b82f6", group: "backgrounds" },
	{ kind: "background", name: "bg_gray", color: "#999EA1", group: "backgrounds" },
	{ kind: "background", name: "bg_lila", color: "#822c9e", group: "backgrounds" },
	{ kind: "background", name: "bg_bown", color: "#915c2d", group: "backgrounds" },

	// === Back-arrow background tiles (same fill as bg_*, left arrow at bottom) ===
	// User writes the label themselves via Stream Deck's title field; the arrow
	// is just the "previous page / back" visual hint. White fill intentionally
	// omitted — arrow + line are always white, so it'd be invisible.
	{ kind: "background-back", name: "bg_back_black", color: "#000000", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_yellow", color: "#ffeb00", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_red", color: "#ef4444", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_green", color: "#22c55e", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_orange", color: "#f59e0b", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_blue", color: "#3b82f6", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_gray", color: "#999EA1", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_lila", color: "#822c9e", group: "backgrounds" },
	{ kind: "background-back", name: "bg_back_bown", color: "#915c2d", group: "backgrounds" },

	// === G1000 — text command buttons (orange accent) ===
	{ kind: "command", name: "g_menu", label: "MENU", group: "g1000" },
	{ kind: "command", name: "g_fpl", label: "FPL", group: "g1000" },
	{ kind: "command", name: "g_clr", label: "CLR", group: "g1000" },
	{ kind: "command", name: "g_ent", label: "ENT", group: "g1000" },
	{ kind: "command", name: "g_cdi", label: "CDI", group: "g1000" },
	{ kind: "command", name: "g_msg", label: "MSG", group: "g1000" },
	{ kind: "command", name: "g_vnav", label: "VNAV", group: "g1000" },
	{ kind: "command", name: "g_obs", label: "OBS", group: "g1000" },
	{ kind: "command", name: "g_proc", label: "PROC", group: "g1000" },
	{ kind: "command", name: "g_direct", label: "-D→", group: "g1000" },
	{ kind: "command", name: "g_navcom", label: "<->", group: "g1000" },

	// === G1000 — labelless directional arrows (cursor / list navigation) ===
	{ kind: "nudge", name: "g_up", direction: "up", group: "g1000" },
	{ kind: "nudge", name: "g_down", direction: "down", group: "g1000" },
	{ kind: "nudge", name: "g_left", direction: "left", group: "g1000" },
	{ kind: "nudge", name: "g_right", direction: "right", group: "g1000" },

	// === G1000 — dual-concentric rotary knob indicators ===
	{ kind: "knob", name: "g_outer_left", variant: "outer-ccw", group: "g1000" },
	{ kind: "knob", name: "g_outer_right", variant: "outer-cw", group: "g1000" },
	{ kind: "knob", name: "g_inner_left", variant: "inner-ccw", group: "g1000" },
	{ kind: "knob", name: "g_inner_right", variant: "inner-cw", group: "g1000" },
	{ kind: "knob", name: "g_push", variant: "push", group: "g1000" },
	{ kind: "dot", name: "p_push", group: "g1000" },

	// === G1000 GCU — keypad buttons (digits, letters, special keys) ===
	{ kind: "gcu_key", name: "gcu_0", label: "0", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_1", label: "1", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_2", label: "2", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_3", label: "3", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_4", label: "4", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_5", label: "5", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_6", label: "6", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_7", label: "7", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_8", label: "8", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_9", label: "9", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_a", label: "A", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_b", label: "B", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_c", label: "C", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_d", label: "D", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_e", label: "E", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_f", label: "F", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_g", label: "G", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_h", label: "H", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_i", label: "I", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_j", label: "J", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_k", label: "K", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_l", label: "L", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_m", label: "M", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_n", label: "N", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_o", label: "O", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_p", label: "P", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_q", label: "Q", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_r", label: "R", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_s", label: "S", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_t", label: "T", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_u", label: "U", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_v", label: "V", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_w", label: "W", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_x", label: "X", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_y", label: "Y", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_z", label: "Z", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_plusminus", label: "+/-", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_dot", label: ".", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_spc", label: "SPC", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_bksp", label: "BKSP", group: "g1000" },

	// === Cockpit view recall (1..20) — blue tiles, big number, "COCKPIT VIEW" header ===
	...Array.from(
		{ length: 20 },
		(_, i): ViewIcon => ({
			kind: "view",
			name: `cockpit_view_${String(i + 1).padStart(2, "0")}`,
			number: i + 1,
			group: "views",
		}),
	),

	// === Alerts (annunciator-style: flooded tile when ON) ===
	{ kind: "alert", name: "caution", label: "CAUTION", severity: "caution", group: "alerts" },
	{ kind: "alert", name: "warning", label: "WARNING", severity: "warning", group: "alerts" },

	// === Push buttons (round 3D button, doorbell / start-button style) ===
	{ kind: "pushbutton", name: "btn_red", color: "red", group: "buttons" },
	{ kind: "pushbutton", name: "btn_green", color: "green", group: "buttons" },
	{ kind: "pushbutton", name: "btn_white", color: "white", group: "buttons" },
	{ kind: "pushbutton", name: "btn_blue", color: "blue", group: "buttons" },
	{ kind: "pushbutton", name: "btn_black", color: "black", group: "buttons" },
];
