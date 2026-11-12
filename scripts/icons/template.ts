/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

// @ts-expect-error
// @ts-expect-error
import {
	type AlertIcon,
	type BackgroundBackIcon,
	type BackgroundIcon,
	type CommandIcon,
	type DisplayIcon,
	type DotIcon,
	type GcuKeyIcon,
	GROUP_ACCENT,
	type GuardedIcon,
	type KnobIcon,
	type NudgeDisplayIcon,
	type NudgeIcon,
	type PushButtonColor,
	type PushButtonIcon,
	type SwitchIcon,
	type ToggleIcon,
	type ViewIcon,
} from "./catalog.ts";
import { FONT_FAMILY } from "./fonts.ts";

export type IconState = "on" | "off";

const SIZE = 144;
const BG = "#0d0d0d";
const LABEL_COLOR = "#ffffff";
const BAR_OFF = "#1f1f1f";

// generate-icons.ts → renderPng loads only the bundled Inter files and maps
// sans-serif to Inter as well, so both names resolve to the same font.
const FONT_STACK = `'${FONT_FAMILY}', sans-serif`;

// Labels are user-defined strings that get inlined into SVG <text> content,
// so any of `< > &` would break the XML parser. We escape on the way in.
function escapeXml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// === Toggle (on/off button) layout ===
// Labels up to 4 chars (the AP family — VNAV is the design max) render at 44px.
// Longer labels (lights, controls) shrink in a fixed staircase so they stay
// inside the canvas without per-icon hand-tuning. Labels of the same length
// always render at the same size → groups look uniform within themselves.
const TOGGLE_BAR_HEIGHT = 20;
const TOGGLE_BAR_INSET_X = 14;
const TOGGLE_BAR_INSET_BOTTOM = 14;
const TOGGLE_BAR_RADIUS = 4;

const TOGGLE_LABEL_VISUAL_CENTER_Y = 64;
// Two-line layout (used when ToggleIcon has a `sublabel`): main label sits
// in the upper half above the LED bar, sublabel below. Centers chosen to
// leave breathing room above the bar (which starts at y=116).
const TOGGLE_TWO_LINE_MAIN_CENTER_Y = 42;
const TOGGLE_TWO_LINE_SUB_CENTER_Y = 86;
// Cap the main label at 40px in two-line layout so it doesn't crowd the
// sublabel even when short (e.g. "ALT").
const TOGGLE_TWO_LINE_MAIN_MAX = 40;
const TOGGLE_TWO_LINE_SUB_FONT_SIZE = 32;

function toggleFontSize(label: string): number {
	const len = label.length;
	if (len <= 4) return 44;
	if (len === 5) return 36;
	if (len === 6) return 30;
	if (len === 7) return 26;
	if (len === 8) return 22;
	if (len === 9) return 20;
	return 18;
}

function toggleBaselineY(fontSize: number): number {
	return Math.round(TOGGLE_LABEL_VISUAL_CENTER_Y + fontSize * 0.35);
}

function baselineFor(fontSize: number, visualCenterY: number): number {
	return Math.round(visualCenterY + fontSize * 0.35);
}

// === Display (live readout) layout ===
// Caption + accent line live in the top ~⅓ so Stream Deck's title overlay
// (live DataRef value) gets the lower ~⅔ of the key.
const DISPLAY_LABEL_FONT_SIZE = 22;
const DISPLAY_LABEL_BASELINE_Y = 30;
const DISPLAY_ACCENT_LINE_Y = 40;
const DISPLAY_ACCENT_LINE_HEIGHT = 2;
const DISPLAY_ACCENT_LINE_WIDTH = 64;

export function renderToggleIcon(def: ToggleIcon, state: IconState): string {
	const accent = GROUP_ACCENT[def.group];
	const barFill = state === "on" ? accent : BAR_OFF;
	const barWidth = SIZE - TOGGLE_BAR_INSET_X * 2;
	const barY = SIZE - TOGGLE_BAR_INSET_BOTTOM - TOGGLE_BAR_HEIGHT;

	const glow =
		state === "on"
			? `<rect x="${TOGGLE_BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${TOGGLE_BAR_HEIGHT}" rx="${TOGGLE_BAR_RADIUS}" fill="${accent}" filter="url(#glow)" opacity="0.55"/>`
			: "";

	const hasSublabel = typeof def.sublabel === "string" && def.sublabel.length > 0;
	let labelEls: string;
	if (hasSublabel) {
		const mainSize = Math.min(toggleFontSize(def.label), TOGGLE_TWO_LINE_MAIN_MAX);
		const mainY = baselineFor(mainSize, TOGGLE_TWO_LINE_MAIN_CENTER_Y);
		const subY = baselineFor(TOGGLE_TWO_LINE_SUB_FONT_SIZE, TOGGLE_TWO_LINE_SUB_CENTER_Y);
		labelEls =
			`<text x="${SIZE / 2}" y="${mainY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${mainSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>` +
			`<text x="${SIZE / 2}" y="${subY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${TOGGLE_TWO_LINE_SUB_FONT_SIZE}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.sublabel as string)}</text>`;
	} else {
		const fontSize = toggleFontSize(def.label);
		const baselineY = toggleBaselineY(fontSize);
		labelEls = `<text x="${SIZE / 2}" y="${baselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>`;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  ${labelEls}
  ${glow}
  <rect x="${TOGGLE_BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${TOGGLE_BAR_HEIGHT}" rx="${TOGGLE_BAR_RADIUS}" fill="${barFill}"/>
</svg>`;
}

// === Nudge (single-press action button: label + filled triangle) layout ===
// Same visual DNA as the toggle (label top, accent at bottom), but the LED bar
// is replaced by a big filled triangle pointing in the action direction.
const NUDGE_LABEL_FONT_SIZE = 36;
const NUDGE_LABEL_BASELINE_Y = 50;
const NUDGE_ARROW_CENTER_Y = 102;
const NUDGE_SINGLE_W = 60;
const NUDGE_SINGLE_H = 50;
const NUDGE_DOUBLE_W = 50;
const NUDGE_DOUBLE_H = 28;
const NUDGE_DOUBLE_GAP = 6;

type Direction = "up" | "down" | "left" | "right";

function trianglePath(dir: Direction, cx: number, cy: number, w: number, h: number): string {
	const halfW = w / 2;
	const halfH = h / 2;
	switch (dir) {
		case "up":
			return `M${cx},${cy - halfH} L${cx - halfW},${cy + halfH} L${cx + halfW},${cy + halfH} Z`;
		case "down":
			return `M${cx},${cy + halfH} L${cx - halfW},${cy - halfH} L${cx + halfW},${cy - halfH} Z`;
		case "left":
			return `M${cx - halfW},${cy} L${cx + halfW},${cy - halfH} L${cx + halfW},${cy + halfH} Z`;
		case "right":
			return `M${cx + halfW},${cy} L${cx - halfW},${cy - halfH} L${cx - halfW},${cy + halfH} Z`;
	}
}

export function renderNudgeIcon(def: NudgeIcon): string {
	const accent = GROUP_ACCENT[def.group];
	const cx = SIZE / 2;
	const hasLabel = typeof def.label === "string" && def.label.length > 0;
	const cy = hasLabel ? NUDGE_ARROW_CENTER_Y : SIZE / 2;

	let arrows: string;
	if (def.double) {
		const isVertical = def.direction === "up" || def.direction === "down";
		const w = isVertical ? NUDGE_DOUBLE_W : NUDGE_DOUBLE_H;
		const h = isVertical ? NUDGE_DOUBLE_H : NUDGE_DOUBLE_W;
		const offset = (isVertical ? h : w) / 2 + NUDGE_DOUBLE_GAP / 2;
		const c1 = isVertical ? { cx, cy: cy - offset } : { cx: cx - offset, cy };
		const c2 = isVertical ? { cx, cy: cy + offset } : { cx: cx + offset, cy };
		arrows =
			`<path d="${trianglePath(def.direction, c1.cx, c1.cy, w, h)}" fill="${accent}"/>` +
			`<path d="${trianglePath(def.direction, c2.cx, c2.cy, w, h)}" fill="${accent}"/>`;
	} else {
		const isVertical = def.direction === "up" || def.direction === "down";
		const w = isVertical ? NUDGE_SINGLE_W : NUDGE_SINGLE_H;
		const h = isVertical ? NUDGE_SINGLE_H : NUDGE_SINGLE_W;
		arrows = `<path d="${trianglePath(def.direction, cx, cy, w, h)}" fill="${accent}"/>`;
	}

	const labelEl = hasLabel
		? `<text x="${cx}" y="${NUDGE_LABEL_BASELINE_Y}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${NUDGE_LABEL_FONT_SIZE}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>`
		: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  ${labelEl}
  ${arrows}
</svg>`;
}

// === Nudge-Display (rotary button: edge-arrow + label, mid-area for title) ===
// One long slender triangle pinned to the edge that matches the rotary's
// direction (left → left edge, up → top edge, …). Label + accent line live
// on the *opposite* edge so Stream Deck's centered title overlay (the live
// DataRef value) never gets overdrawn:
//   direction down/left/right → label TOP, accent below label, arrow on its
//                                native edge, title overlay sits middle.
//   direction up              → label BOTTOM, accent above label, arrow top,
//                                title overlay sits middle.
const NUDGE_DISPLAY_LABEL_FONT_SIZE = 20;
const NUDGE_DISPLAY_LABEL_BASELINE_Y_TOP = 24;
const NUDGE_DISPLAY_LABEL_BASELINE_Y_BOTTOM = 132;
const NUDGE_DISPLAY_ACCENT_LINE_HEIGHT = 2;
const NUDGE_DISPLAY_ACCENT_LINE_WIDTH = 64;
const NUDGE_DISPLAY_ACCENT_LINE_Y_TOP = 36;
const NUDGE_DISPLAY_ACCENT_LINE_Y_BOTTOM = 108;
const NUDGE_DISPLAY_ARROW_THICKNESS = 22;
const NUDGE_DISPLAY_ARROW_LENGTH = 100;
const NUDGE_DISPLAY_ARROW_EDGE_MARGIN = 8;

export function renderNudgeDisplayIcon(def: NudgeDisplayIcon): string {
	const accent = GROUP_ACCENT[def.group];

	const isVertical = def.direction === "up" || def.direction === "down";
	const arrowW = isVertical ? NUDGE_DISPLAY_ARROW_LENGTH : NUDGE_DISPLAY_ARROW_THICKNESS;
	const arrowH = isVertical ? NUDGE_DISPLAY_ARROW_THICKNESS : NUDGE_DISPLAY_ARROW_LENGTH;

	let arrowCx = SIZE / 2;
	let arrowCy = SIZE / 2;
	switch (def.direction) {
		case "left":
			arrowCx = NUDGE_DISPLAY_ARROW_EDGE_MARGIN + arrowW / 2;
			break;
		case "right":
			arrowCx = SIZE - NUDGE_DISPLAY_ARROW_EDGE_MARGIN - arrowW / 2;
			break;
		case "up":
			arrowCy = NUDGE_DISPLAY_ARROW_EDGE_MARGIN + arrowH / 2;
			break;
		case "down":
			arrowCy = SIZE - NUDGE_DISPLAY_ARROW_EDGE_MARGIN - arrowH / 2;
			break;
	}
	const arrowPath = trianglePath(def.direction, arrowCx, arrowCy, arrowW, arrowH);

	const isUp = def.direction === "up";
	const labelBaselineY = isUp
		? NUDGE_DISPLAY_LABEL_BASELINE_Y_BOTTOM
		: NUDGE_DISPLAY_LABEL_BASELINE_Y_TOP;
	const accentLineY = isUp ? NUDGE_DISPLAY_ACCENT_LINE_Y_BOTTOM : NUDGE_DISPLAY_ACCENT_LINE_Y_TOP;
	const lineX = (SIZE - NUDGE_DISPLAY_ACCENT_LINE_WIDTH) / 2;

	const accentLineRect = def.noAccentLine
		? ""
		: `<rect x="${lineX}" y="${accentLineY}" width="${NUDGE_DISPLAY_ACCENT_LINE_WIDTH}" height="${NUDGE_DISPLAY_ACCENT_LINE_HEIGHT}" fill="${accent}"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${labelBaselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${NUDGE_DISPLAY_LABEL_FONT_SIZE}" font-weight="700"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>
  ${accentLineRect}
  <path d="${arrowPath}" fill="${accent}"/>
</svg>`;
}

export function renderDisplayIcon(def: DisplayIcon): string {
	const accent = GROUP_ACCENT[def.group];
	const lineX = (SIZE - DISPLAY_ACCENT_LINE_WIDTH) / 2;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${DISPLAY_LABEL_BASELINE_Y}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${DISPLAY_LABEL_FONT_SIZE}" font-weight="700"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>
  <rect x="${lineX}" y="${DISPLAY_ACCENT_LINE_Y}" width="${DISPLAY_ACCENT_LINE_WIDTH}" height="${DISPLAY_ACCENT_LINE_HEIGHT}" fill="${accent}"/>
</svg>`;
}

// === Command (single-press text button) layout ===
// Reuses the toggle's label-sizing staircase so commands and toggles look
// uniform side-by-side. The bottom accent is a thin static stripe (no
// on/off, no glow) to visually distinguish "action" from "state".
const COMMAND_ACCENT_LINE_HEIGHT = 4;
const COMMAND_ACCENT_LINE_INSET_X = 14;
const COMMAND_ACCENT_LINE_INSET_BOTTOM = 18;

export function renderCommandIcon(def: CommandIcon): string {
	const accent = GROUP_ACCENT[def.group];
	const fontSize = toggleFontSize(def.label);
	const baselineY = toggleBaselineY(fontSize);
	const lineWidth = SIZE - COMMAND_ACCENT_LINE_INSET_X * 2;
	const lineY = SIZE - COMMAND_ACCENT_LINE_INSET_BOTTOM - COMMAND_ACCENT_LINE_HEIGHT;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${baselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>
  <rect x="${COMMAND_ACCENT_LINE_INSET_X}" y="${lineY}" width="${lineWidth}" height="${COMMAND_ACCENT_LINE_HEIGHT}" fill="${accent}"/>
</svg>`;
}

// === GCU keypad key (G1000 keypad button) layout ===
// Pure character display — no stripe, no border. The label gets the entire
// canvas so single-character keys (0-9, A-Z) are readable at a glance from
// the cockpit. Special keys (BKSP, SPC, +/-) shrink to fit.
const GCU_KEY_VISUAL_CENTER_Y = 72;

function gcuKeyFontSize(label: string): number {
	const len = label.length;
	if (len === 1) return 104;
	if (len <= 3) return 48;
	return 40;
}

export function renderGcuKeyIcon(def: GcuKeyIcon): string {
	const fontSize = gcuKeyFontSize(def.label);
	const baselineY = Math.round(GCU_KEY_VISUAL_CENTER_Y + fontSize * 0.35);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${baselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="900"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>
</svg>`;
}

// === Knob (G1000 dual-concentric rotary) layout ===
// Big arc + arrowhead = outer knob; small arc + arrowhead = inner knob.
// CW = right-rotate, CCW = left-rotate. The 90° gap at the top makes
// rotation direction unambiguous (the arrow points "into" the gap,
// continuing the motion).
// `push` is the click-the-knob action: outline ring + filled center dot.
const KNOB_CENTER = SIZE / 2;
const KNOB_OUTER_RADIUS = 50;
const KNOB_OUTER_STROKE = 10;
const KNOB_OUTER_ARROW = 22;
const KNOB_INNER_RADIUS = 28;
const KNOB_INNER_STROKE = 6;
const KNOB_INNER_ARROW = 14;
const KNOB_PUSH_RING_RADIUS = 42;
const KNOB_PUSH_RING_STROKE = 6;
const KNOB_PUSH_DOT_RADIUS = 14;
// Labeled push variant: caption sits in the top third (display-style, no
// accent stripe — the ring/dot is the accent), symbol shrinks and shifts
// down so it stays visually balanced under the label.
const KNOB_PUSH_LABELED_LABEL_BASELINE_Y = 32;
const KNOB_PUSH_LABELED_CY = 94;
const KNOB_PUSH_LABELED_RING_RADIUS = 32;
const KNOB_PUSH_LABELED_DOT_RADIUS = 11;
// Arc spans 270° with a 90° gap at the top centered on -90° (straight up).
// Right side of the gap = -45°, left side = -135°.
const KNOB_GAP_START_DEG = -45;
const KNOB_GAP_END_DEG = -135;

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function renderKnobIcon(def: KnobIcon): string {
	const accent = GROUP_ACCENT[def.group];
	const cx = KNOB_CENTER;
	const cy = KNOB_CENTER;

	if (def.variant === "push") {
		const hasLabel = typeof def.label === "string" && def.label.length > 0;
		if (hasLabel) {
			const fontSize = toggleFontSize(def.label as string);
			const symbolCy = KNOB_PUSH_LABELED_CY;
			return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${cx}" y="${KNOB_PUSH_LABELED_LABEL_BASELINE_Y}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label as string)}</text>
  <circle cx="${cx}" cy="${symbolCy}" r="${KNOB_PUSH_LABELED_RING_RADIUS}" stroke="${accent}" stroke-width="${KNOB_PUSH_RING_STROKE}" fill="none"/>
  <circle cx="${cx}" cy="${symbolCy}" r="${KNOB_PUSH_LABELED_DOT_RADIUS}" fill="${accent}"/>
</svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${KNOB_PUSH_RING_RADIUS}" stroke="${accent}" stroke-width="${KNOB_PUSH_RING_STROKE}" fill="none"/>
  <circle cx="${cx}" cy="${cy}" r="${KNOB_PUSH_DOT_RADIUS}" fill="${accent}"/>
</svg>`;
	}

	const isOuter = def.variant === "outer-cw" || def.variant === "outer-ccw";
	const isCw = def.variant === "outer-cw" || def.variant === "inner-cw";
	const r = isOuter ? KNOB_OUTER_RADIUS : KNOB_INNER_RADIUS;
	const stroke = isOuter ? KNOB_OUTER_STROKE : KNOB_INNER_STROKE;
	const arrowSize = isOuter ? KNOB_OUTER_ARROW : KNOB_INNER_ARROW;

	// CW arc sweeps from gap-start (-45°, upper-right) clockwise the long way
	// around to gap-end (-135°, upper-left). CCW is the mirror.
	const startAngle = isCw ? KNOB_GAP_START_DEG : KNOB_GAP_END_DEG;
	const endAngle = isCw ? KNOB_GAP_END_DEG : KNOB_GAP_START_DEG;
	const sweepFlag = isCw ? 1 : 0;
	const start = pointOnCircle(cx, cy, r, startAngle);
	const end = pointOnCircle(cx, cy, r, endAngle);

	// Tangent at the end of the arc, in the direction of motion. In screen
	// coords the CW tangent at angle θ is (-sin θ, cos θ); CCW negates it.
	const endRad = (endAngle * Math.PI) / 180;
	const sign = isCw ? 1 : -1;
	const tx = sign * -Math.sin(endRad);
	const ty = sign * Math.cos(endRad);
	// Perpendicular to tangent (used for the arrowhead's base).
	const px = -ty;
	const py = tx;
	const tipX = end.x + tx * arrowSize;
	const tipY = end.y + ty * arrowSize;
	const baseLX = end.x + (px * arrowSize) / 2;
	const baseLY = end.y + (py * arrowSize) / 2;
	const baseRX = end.x - (px * arrowSize) / 2;
	const baseRY = end.y - (py * arrowSize) / 2;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <path d="M${start.x},${start.y} A${r},${r} 0 1 ${sweepFlag} ${end.x},${end.y}"
        stroke="${accent}" stroke-width="${stroke}" fill="none" stroke-linecap="round"/>
  <polygon points="${tipX},${tipY} ${baseLX},${baseLY} ${baseRX},${baseRY}" fill="${accent}"/>
</svg>`;
}

// === View (cockpit-view recall) layout ===
// Tiny "COCKPIT VIEW" header at the top, oversized two-digit number centered,
// blue accent stripe at the bottom (same DNA as the command kind but the
// number is the focal element). Used for X-Plane's 20 saved cockpit views.
const VIEW_HEADER_TEXT = "COCKPIT VIEW";
const VIEW_HEADER_FONT_SIZE = 14;
const VIEW_HEADER_BASELINE_Y = 24;
const VIEW_NUMBER_FONT_SIZE = 72;
const VIEW_NUMBER_VISUAL_CENTER_Y = 84;
const VIEW_ACCENT_LINE_HEIGHT = 4;
const VIEW_ACCENT_LINE_INSET_X = 14;
const VIEW_ACCENT_LINE_INSET_BOTTOM = 18;

export function renderViewIcon(def: ViewIcon): string {
	const accent = GROUP_ACCENT[def.group];
	const numberText = String(def.number).padStart(2, "0");
	const numberY = Math.round(VIEW_NUMBER_VISUAL_CENTER_Y + VIEW_NUMBER_FONT_SIZE * 0.35);
	const lineWidth = SIZE - VIEW_ACCENT_LINE_INSET_X * 2;
	const lineY = SIZE - VIEW_ACCENT_LINE_INSET_BOTTOM - VIEW_ACCENT_LINE_HEIGHT;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${VIEW_HEADER_BASELINE_Y}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${VIEW_HEADER_FONT_SIZE}" font-weight="600"
        fill="${LABEL_COLOR}" letter-spacing="2">${VIEW_HEADER_TEXT}</text>
  <text x="${SIZE / 2}" y="${numberY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${VIEW_NUMBER_FONT_SIZE}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${numberText}</text>
  <rect x="${VIEW_ACCENT_LINE_INSET_X}" y="${lineY}" width="${lineWidth}" height="${VIEW_ACCENT_LINE_HEIGHT}" fill="${accent}"/>
</svg>`;
}

// === Dot (bare push) ===
// Single accent-coloured filled circle at canvas centre, same radius as the
// knob-push dot. No ring, no label — minimal "press here" affordance reused
// across many functionally-similar physical buttons (AW109 RTU push set, …).
const DOT_RADIUS = KNOB_PUSH_DOT_RADIUS;

export function renderDotIcon(def: DotIcon): string {
	const accent = GROUP_ACCENT[def.group];
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${DOT_RADIUS}" fill="${accent}"/>
</svg>`;
}

// === Push button (round 3D button, doorbell / start-button style) ===
// Chrome bezel ring around a colored face — reads as a physical button sitting
// in a metal frame, not a lit lamp. The hard inner-shadow line and tight upper
// glint are what kill the "lamp" impression. No label.
const PUSHBUTTON_BEZEL_OUTER_R = 64;
const PUSHBUTTON_BEZEL_INNER_R = 56;
const PUSHBUTTON_FACE_R = 52;
const PUSHBUTTON_CHROME_OUTER = "#9ca3af";
const PUSHBUTTON_CHROME_INNER = "#4b5563";
const PUSHBUTTON_INSET_SHADOW = "#000000";

const PUSHBUTTON_PALETTE: Record<PushButtonColor, { face: string; glint: string }> = {
	red: { face: "#dc2626", glint: "#fecaca" },
	green: { face: "#16a34a", glint: "#bbf7d0" },
	blue: { face: "#2563eb", glint: "#bfdbfe" },
	// Off-white face so it doesn't glare; near-pure-white glint keeps the
	// glossy plastic cue.
	white: { face: "#d4d4d8", glint: "#ffffff" },
	// Inactive/unlit button: dark matte face that still clears the bezel inner
	// ring (#4b5563) and tile BG (#0d0d0d); muted glint reads as "off".
	black: { face: "#27272a", glint: "#52525b" },
};

export function renderPushButtonIcon(def: PushButtonIcon): string {
	const palette = PUSHBUTTON_PALETTE[def.color];
	const cx = SIZE / 2;
	const cy = SIZE / 2;
	// Tight upper glint: positioned high on the face, narrow + opaque. Reads
	// as a hard plastic reflection, not a diffuse halo.
	const glintCy = cy - 26;
	const glintRx = PUSHBUTTON_FACE_R * 0.48;
	const glintRy = PUSHBUTTON_FACE_R * 0.16;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${PUSHBUTTON_BEZEL_OUTER_R}" fill="${PUSHBUTTON_CHROME_OUTER}"/>
  <circle cx="${cx}" cy="${cy}" r="${PUSHBUTTON_BEZEL_INNER_R}" fill="${PUSHBUTTON_CHROME_INNER}"/>
  <circle cx="${cx}" cy="${cy}" r="${PUSHBUTTON_FACE_R}" fill="${palette.face}" stroke="${PUSHBUTTON_INSET_SHADOW}" stroke-width="1.5"/>
  <ellipse cx="${cx}" cy="${glintCy}" rx="${glintRx}" ry="${glintRy}" fill="${palette.glint}" opacity="0.85"/>
</svg>`;
}

// === Background (solid-color filler tile) ===
// Pure flat fill, no border, no text. Edge-to-edge.
export function renderBackgroundIcon(def: BackgroundIcon): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${def.color}"/>
</svg>`;
}

// === Background with back arrow (solid fill + bottom-centered "<--" arrow) ===
// Top edge gets a slender accent line that frames the user-provided title
// overlay ("this is a page title"). Bottom edge gets a left-pointing arrow
// with a stem (visually "<--" rather than a bare triangle) to signal "back".
// Arrow + line are always white to match the user's white title overlays —
// the white-bg variant is intentionally absent from the catalog.
const BG_BACK_TOP_LINE_Y = 26;
const BG_BACK_TOP_LINE_WIDTH = 96;
const BG_BACK_TOP_LINE_HEIGHT = 3;
const BG_BACK_ARROW_CY = 116;
const BG_BACK_ARROW_HEAD_W = 24;
const BG_BACK_ARROW_HEAD_H = 32;
const BG_BACK_ARROW_STEM_W = 32;
const BG_BACK_ARROW_STEM_H = 8;

export function renderBackgroundBackIcon(def: BackgroundBackIcon): string {
	const ink = "#ffffff";

	const lineX = (SIZE - BG_BACK_TOP_LINE_WIDTH) / 2;
	const topLine = `<rect x="${lineX}" y="${BG_BACK_TOP_LINE_Y}" width="${BG_BACK_TOP_LINE_WIDTH}" height="${BG_BACK_TOP_LINE_HEIGHT}" rx="1.5" fill="${ink}"/>`;

	// Total arrow length = head width + stem width, centered on SIZE/2.
	const totalW = BG_BACK_ARROW_HEAD_W + BG_BACK_ARROW_STEM_W;
	const cy = BG_BACK_ARROW_CY;
	const leftEdge = (SIZE - totalW) / 2;
	const tipX = leftEdge;
	const baseX = leftEdge + BG_BACK_ARROW_HEAD_W;
	const halfHead = BG_BACK_ARROW_HEAD_H / 2;
	const halfStem = BG_BACK_ARROW_STEM_H / 2;
	const head = `<polygon points="${tipX},${cy} ${baseX},${cy - halfHead} ${baseX},${cy + halfHead}" fill="${ink}"/>`;
	const stem = `<rect x="${baseX}" y="${cy - halfStem}" width="${BG_BACK_ARROW_STEM_W}" height="${BG_BACK_ARROW_STEM_H}" fill="${ink}"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${def.color}"/>
  ${topLine}
  ${head}
  ${stem}
</svg>`;
}

// === Alert (annunciator-style: flooded tile when ON) layout ===
// OFF: dark BG with muted gray label — "lamp test off", barely readable.
// ON: entire tile floods with severity color, bold black label centered —
// designed to grab attention across the deck (real Master Caution / Master
// Warning behavior). Color is derived from `severity` rather than the group
// accent so the semantic (orange=caution, red=warning) stays locked in.
const ALERT_CAUTION_COLOR = "#f59e0b";
const ALERT_WARNING_COLOR = "#ef4444";
const ALERT_OFF_LABEL_COLOR = "#3a3a3a";
const ALERT_ON_LABEL_COLOR = "#000000";
const ALERT_LABEL_FONT_SIZE = 26;
const ALERT_LABEL_VISUAL_CENTER_Y = 72;

export function renderAlertIcon(def: AlertIcon, state: IconState): string {
	const onColor = def.severity === "warning" ? ALERT_WARNING_COLOR : ALERT_CAUTION_COLOR;
	const bgFill = state === "on" ? onColor : BG;
	const labelColor = state === "on" ? ALERT_ON_LABEL_COLOR : ALERT_OFF_LABEL_COLOR;
	const baselineY = baselineFor(ALERT_LABEL_FONT_SIZE, ALERT_LABEL_VISUAL_CENTER_Y);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${bgFill}"/>
  <text x="${SIZE / 2}" y="${baselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${ALERT_LABEL_FONT_SIZE}" font-weight="900"
        fill="${labelColor}" letter-spacing="2">${escapeXml(def.label)}</text>
</svg>`;
}

// === Guarded (two-stage button with hazard-stripe cover) layout ===
// Top stripe = amber/black diagonal hatching that mimics real cockpit guard
// covers. State "locked" = hatching at full opacity (cover closed); "unlocked"
// = hatching dimmed (cover flipped up). Label + LED-bar follow toggle DNA so
// the family reads as a coherent set.
const GUARDED_HAZARD_HEIGHT = 18;
const GUARDED_HAZARD_STRIPE_W = 8;
const GUARDED_HAZARD_COLOR = "#fbbf24";
const GUARDED_HAZARD_OPACITY_LOCKED = 1.0;
const GUARDED_HAZARD_OPACITY_UNLOCKED = 0.35;
// Push the label down to leave the top 18px free for the hazard band.
const GUARDED_LABEL_VISUAL_CENTER_Y = 75;
const GUARDED_TWO_LINE_MAIN_CENTER_Y = 52;
const GUARDED_TWO_LINE_SUB_CENTER_Y = 96;

// "locked"       — hazard at full opacity, LED bar off (guard closed).
// "unlocked_off" — hazard dimmed, LED bar off (guard open, function still off).
// "unlocked_on"  — hazard dimmed, LED bar on + glow (guard open, function on).
export type GuardedState = "locked" | "unlocked_off" | "unlocked_on";

export function renderGuardedIcon(def: GuardedIcon, state: GuardedState): string {
	const accent = GROUP_ACCENT[def.group];
	const barFill = state === "unlocked_on" ? accent : BAR_OFF;
	const barWidth = SIZE - TOGGLE_BAR_INSET_X * 2;
	const barY = SIZE - TOGGLE_BAR_INSET_BOTTOM - TOGGLE_BAR_HEIGHT;
	const hazardOpacity =
		state === "locked" ? GUARDED_HAZARD_OPACITY_LOCKED : GUARDED_HAZARD_OPACITY_UNLOCKED;

	const glow =
		state === "unlocked_on"
			? `<rect x="${TOGGLE_BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${TOGGLE_BAR_HEIGHT}" rx="${TOGGLE_BAR_RADIUS}" fill="${accent}" filter="url(#glow)" opacity="0.55"/>`
			: "";

	const hasSublabel = typeof def.sublabel === "string" && def.sublabel.length > 0;
	let labelEls: string;
	if (hasSublabel) {
		const mainSize = Math.min(toggleFontSize(def.label), TOGGLE_TWO_LINE_MAIN_MAX);
		const mainY = baselineFor(mainSize, GUARDED_TWO_LINE_MAIN_CENTER_Y);
		const subY = baselineFor(TOGGLE_TWO_LINE_SUB_FONT_SIZE, GUARDED_TWO_LINE_SUB_CENTER_Y);
		labelEls =
			`<text x="${SIZE / 2}" y="${mainY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${mainSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>` +
			`<text x="${SIZE / 2}" y="${subY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${TOGGLE_TWO_LINE_SUB_FONT_SIZE}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.sublabel as string)}</text>`;
	} else {
		const fontSize = toggleFontSize(def.label);
		const baselineY = baselineFor(fontSize, GUARDED_LABEL_VISUAL_CENTER_Y);
		labelEls = `<text x="${SIZE / 2}" y="${baselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${escapeXml(def.label)}</text>`;
	}

	// Diagonal hazard hatching: a pattern of alternating amber + black stripes
	// rotated -45°. The pattern tile is 2×stripe-width so amber and black each
	// take one stripe slot.
	const patternId = `guardHazard_${state}`;
	const tile = GUARDED_HAZARD_STRIPE_W * 2;
	const hazardDefs = `
    <pattern id="${patternId}" patternUnits="userSpaceOnUse"
             width="${tile}" height="${tile}"
             patternTransform="rotate(-45)">
      <rect width="${tile}" height="${tile}" fill="#000000"/>
      <rect width="${GUARDED_HAZARD_STRIPE_W}" height="${tile}" fill="${GUARDED_HAZARD_COLOR}"/>
    </pattern>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>${hazardDefs}
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <rect x="0" y="0" width="${SIZE}" height="${GUARDED_HAZARD_HEIGHT}" fill="url(#${patternId})" opacity="${hazardOpacity}"/>
  ${labelEls}
  ${glow}
  <rect x="${TOGGLE_BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${TOGGLE_BAR_HEIGHT}" rx="${TOGGLE_BAR_RADIUS}" fill="${barFill}"/>
</svg>`;
}

// === 3-position switch (labelless slot + offset knob) layout ===
// Visual: a dark recessed track running along the chosen axis, with a lighter
// rectangular knob that sits at one of three positions. The knob is slightly
// wider on the cross-axis than the track so it reads as "sitting on top" of
// the slot. A thin accent stripe across the short side of the knob acts as a
// visual groove indicator — and is the only group-accent-colored element so
// the same SVG works across cockpit/lights/advisory/etc. without redesign.
const SWITCH_TRACK_LONG = 100;
const SWITCH_TRACK_SHORT = 28;
const SWITCH_TRACK_COLOR = "#1f1f1f";
const SWITCH_TRACK_BORDER = "#444444";
const SWITCH_KNOB_LONG = 40;
const SWITCH_KNOB_SHORT = 50;
const SWITCH_KNOB_COLOR = "#e0e0e0";
const SWITCH_KNOB_BORDER = "#7a7a7a";
const SWITCH_KNOB_RADIUS = 8;
const SWITCH_GROOVE_THICKNESS = 3;

export type SwitchPosition = "min" | "mid" | "max";

export function renderSwitchIcon(def: SwitchIcon, position: SwitchPosition): string {
	const accent = GROUP_ACCENT[def.group];
	const isVertical = def.axis === "vertical";

	const trackW = isVertical ? SWITCH_TRACK_SHORT : SWITCH_TRACK_LONG;
	const trackH = isVertical ? SWITCH_TRACK_LONG : SWITCH_TRACK_SHORT;
	const trackX = (SIZE - trackW) / 2;
	const trackY = (SIZE - trackH) / 2;
	const trackRx = Math.min(trackW, trackH) / 2;

	const knobW = isVertical ? SWITCH_KNOB_SHORT : SWITCH_KNOB_LONG;
	const knobH = isVertical ? SWITCH_KNOB_LONG : SWITCH_KNOB_SHORT;

	// Position the knob along the long axis. min = top/left, max = bottom/right.
	// Inset the knob center by half its own length so the knob never extends
	// past the rounded track end-cap.
	const trackStart = isVertical ? trackY : trackX;
	const trackEnd = isVertical ? trackY + trackH : trackX + trackW;
	const knobHalfLong = (isVertical ? knobH : knobW) / 2;
	let longCenter: number;
	if (position === "min") longCenter = trackStart + knobHalfLong;
	else if (position === "max") longCenter = trackEnd - knobHalfLong;
	else longCenter = SIZE / 2;

	const knobCx = isVertical ? SIZE / 2 : longCenter;
	const knobCy = isVertical ? longCenter : SIZE / 2;
	const knobX = knobCx - knobW / 2;
	const knobY = knobCy - knobH / 2;

	// Accent groove across the short axis of the knob.
	const grooveLen = (isVertical ? knobW : knobH) * 0.55;
	const grooveW = isVertical ? grooveLen : SWITCH_GROOVE_THICKNESS;
	const grooveH = isVertical ? SWITCH_GROOVE_THICKNESS : grooveLen;
	const grooveX = knobCx - grooveW / 2;
	const grooveY = knobCy - grooveH / 2;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <rect x="${trackX}" y="${trackY}" width="${trackW}" height="${trackH}" rx="${trackRx}"
        fill="${SWITCH_TRACK_COLOR}" stroke="${SWITCH_TRACK_BORDER}" stroke-width="2"/>
  <rect x="${knobX}" y="${knobY}" width="${knobW}" height="${knobH}" rx="${SWITCH_KNOB_RADIUS}"
        fill="${SWITCH_KNOB_COLOR}" stroke="${SWITCH_KNOB_BORDER}" stroke-width="2"/>
  <rect x="${grooveX}" y="${grooveY}" width="${grooveW}" height="${grooveH}" rx="1" fill="${accent}"/>
</svg>`;
}

// === Action-Icons (Stream Deck library sidebar + button default-image) ===
// One glyph per action UUID, rendered at multiple sizes by `make icons` into
// com.robertw.xplane.sdPlugin/imgs/actions/<name>/{icon,key}{,@2x}.png. The
// glyphs are deliberately uniform (white on transparent, 20-unit viewBox) so
// the X-Plane category in the Stream Deck library reads as a coherent set.
const ACTION_GLYPH_VIEWBOX = "0 0 20 20";

const ACTION_GLYPHS: Record<string, string> = {
	// Lightning bolt — "fire a command".
	command: `<path d="M11.5,2 L5.5,11 L9.5,11 L8.5,18 L14.5,9 L10.5,9 L11.5,2 Z" fill="#ffffff"/>`,

	// Bolt + display strip — "fire a command and show a value".
	"command-display": `<path d="M9,1.5 L4,9 L7.5,9 L6.5,14 L11,7 L8,7 L9,1.5 Z" fill="#ffffff"/>
    <rect x="2.5" y="14.5" width="15" height="3.5" rx="0.5" fill="none" stroke="#ffffff" stroke-width="1.2"/>`,

	// Circular arrow — "rotate, step through positions".
	rotary: `<path d="M16.5,10 A6.5,6.5 0 1 1 10,3.5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <polygon points="16.8,10 14.5,7.5 14.5,12.5" fill="#ffffff"/>`,

	// Screen / readout — "live DataRef value".
	"dataref-display": `<rect x="2.5" y="5" width="15" height="10" rx="1" fill="none" stroke="#ffffff" stroke-width="1.5"/>
    <line x1="5" y1="10" x2="15" y2="10" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>`,

	// Toggle switch — "two-state DataRef".
	"dataref-toggle": `<rect x="2.5" y="7" width="15" height="6" rx="3" fill="none" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="13" cy="10" r="2" fill="#ffffff"/>`,

	// Pen — "write a value to a DataRef".
	"dataref-write": `<path d="M3,17 L4.5,12.5 L13,4 L16,7 L7.5,15.5 L3,17 Z" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="11" y1="6" x2="14" y2="9" stroke="#ffffff" stroke-width="1.5"/>`,

	// `background` deliberately omitted — its Stream Deck library tile keeps
	// the original `+` placeholder so a fresh Background Tile button doesn't
	// paint the whole key bright white. Users assign one of the colored
	// `bg_*.png` files from out/icons/backgrounds/ after dropping the action.

	// Three stacked lines — "multiple values at once".
	"multi-dataref-display": `<line x1="3" y1="6" x2="17" y2="6" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="3" y1="10" x2="17" y2="10" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="3" y1="14" x2="17" y2="14" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>`,

	// Compass arrow — "wind direction + speed".
	"wind-display": `<g transform="translate(10,10) rotate(35)">
      <line x1="0" y1="6" x2="0" y2="-3" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
      <polygon points="0,-7 3.2,-2.8 -3.2,-2.8" fill="#ffffff"/>
    </g>`,

	// Padlock — "guarded button" (short press unlocks cover, long press fires).
	"guarded-command": `<path d="M6,9 V6.5 a4,4 0 0 1 8,0 V9" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="4.5" y="9" width="11" height="8" rx="1.2" fill="none" stroke="#ffffff" stroke-width="1.4"/>
    <circle cx="10" cy="12.5" r="1.2" fill="#ffffff"/>
    <line x1="10" y1="13" x2="10" y2="15.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>`,
};

export const ACTION_ICON_NAMES = Object.keys(ACTION_GLYPHS);

export function renderActionGlyph(name: string): string {
	const inner = ACTION_GLYPHS[name];
	if (!inner) throw new Error(`No action glyph defined for: ${name}`);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="${ACTION_GLYPH_VIEWBOX}">${inner}</svg>`;
}

// === Sim-offline placeholder (plugin-internal status icon) ===
// Rendered into the plugin bundle so every action can swap to it via
// setImage("imgs/sim_offline") whenever X-Plane is unreachable. The look is
// deliberately distinct from the action icons: muted background, "SIM" word
// in muted gray, "OFFLINE" word large in red — instantly readable as "no
// connection" across the whole deck without per-button context.
const OFFLINE_BG = "#1a1a1a";
const OFFLINE_BORDER = "#7f1d1d";
const OFFLINE_SIM_COLOR = "#94a3b8";
const OFFLINE_TEXT_COLOR = "#ef4444";

export function renderSimOfflineIcon(): string {
	const borderInset = 4;
	const borderSize = SIZE - borderInset * 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${OFFLINE_BG}"/>
  <rect x="${borderInset}" y="${borderInset}" width="${borderSize}" height="${borderSize}"
        fill="none" stroke="${OFFLINE_BORDER}" stroke-width="3" rx="6"/>
  <text x="${SIZE / 2}" y="58" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="22" font-weight="700"
        fill="${OFFLINE_SIM_COLOR}" letter-spacing="3">SIM</text>
  <text x="${SIZE / 2}" y="100" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="26" font-weight="800"
        fill="${OFFLINE_TEXT_COLOR}" letter-spacing="2">OFFLINE</text>
</svg>`;
}

// === Toggle state defaults (DataRef Toggle off/on placeholder tiles) ===
// Used as manifest States[].Image for the DataRef Toggle action. Both states
// share the same dark background; only the handle position differs (left for
// off, right for on). The user typically overrides these per-button via the
// PI's image upload, so the defaults stay deliberately neutral.
const TOGGLE_STATE_BG = "#0d0d0d";
const TOGGLE_STATE_TRACK = "#2d2d2d";
const TOGGLE_STATE_HANDLE = "#e0e0e0";

export function renderToggleStateIcon(state: IconState): string {
	const trackWidth = 100;
	const trackHeight = 36;
	const trackX = (SIZE - trackWidth) / 2;
	const trackY = 30;
	const trackCy = trackY + trackHeight / 2;
	const handleRadius = trackHeight / 2 - 3;
	const handleCx =
		state === "off" ? trackX + handleRadius + 4 : trackX + trackWidth - handleRadius - 4;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${TOGGLE_STATE_BG}"/>
  <rect x="${trackX}" y="${trackY}" width="${trackWidth}" height="${trackHeight}" rx="${trackHeight / 2}" fill="${TOGGLE_STATE_TRACK}"/>
  <circle cx="${handleCx}" cy="${trackCy}" r="${handleRadius}" fill="${TOGGLE_STATE_HANDLE}"/>
</svg>`;
}

// === Default key (neutral fallback for view-style actions) ===
// Used as States[].Image for actions whose action-picker icon is too busy to
// double as a default button tile (DataRef Display, Multi DataRef Display,
// etc.). Plain dark tile with a subtle blue frame — clearly "an empty
// placeholder" without competing with whatever icon the user picks later.
const DEFAULT_KEY_BG = "#0d0d0d";
const DEFAULT_KEY_BORDER = "#1d4ed8";

export function renderDefaultKeyIcon(): string {
	const borderInset = 4;
	const borderSize = SIZE - borderInset * 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${DEFAULT_KEY_BG}"/>
  <rect x="${borderInset}" y="${borderInset}" width="${borderSize}" height="${borderSize}"
        fill="none" stroke="${DEFAULT_KEY_BORDER}" stroke-width="3" rx="6"/>
</svg>`;
}
