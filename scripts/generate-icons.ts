/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { renderSwitchStateSvg, type SwitchTilePosition } from "../src/util/switch-image.ts";
import type { GuardedIcon } from "./icons/catalog.ts";
import { catalog } from "./icons/catalog.ts";
import { FONT_FAMILY, FONT_FILES } from "./icons/fonts.ts";
import {
	ACTION_ICON_NAMES,
	type IconState,
	renderActionGlyph,
	renderAlertIcon,
	renderBackgroundBackIcon,
	renderBackgroundIcon,
	renderCommandIcon,
	renderDefaultKeyIcon,
	renderDisplayIcon,
	renderDotIcon,
	renderGcuKeyIcon,
	renderGuardedIcon,
	renderKnobIcon,
	renderNudgeDisplayIcon,
	renderNudgeIcon,
	renderPushButtonIcon,
	renderSimOfflineIcon,
	renderSwitchIcon,
	renderToggleIcon,
	renderToggleStateIcon,
	renderViewIcon,
	type SwitchPosition,
} from "./icons/template.ts";

// Action UUIDs whose key.png / key@2x.png should be the neutral default
// (subtle blue-framed empty tile) instead of the glyph scaled up. The action
// picker (icon.png) keeps the glyph in all cases.
// `dataref-toggle` is intentionally excluded — its on/off state images take
// over the moment the button is configured.
const NEUTRAL_DEFAULT_KEY_ACTIONS: ReadonlySet<string> = new Set([
	"command",
	"command-display",
	"rotary",
	"dataref-display",
	"dataref-write",
	"multi-dataref-display",
	"wind-display",
	"guarded-command",
]);

// Catalog button images keep the old 2-state naming (`_locked.png` /
// `_unlocked.png`) for backwards-compat — the "unlocked" variant maps to the
// new "unlocked_on" rendering (hazard dim + LED on), matching the old look.
const CATALOG_GUARDED_STATES = [
	{ file: "locked", state: "locked" as const },
	{ file: "unlocked", state: "unlocked_on" as const },
];
// Bundle defaults expose the full 3-state set so guarded-dataref can show
// "Guard open / function still off" without faking it.
const BUNDLE_GUARDED_STATES = ["locked", "unlocked_off", "unlocked_on"] as const;
const SWITCH_POSITIONS: SwitchPosition[] = ["min", "mid", "max"];

const OUT_DIR = resolve(process.cwd(), "out/icons");
// Bundle assets land directly inside the plugin bundle so the runtime can
// reference them via relative path in setImage() (e.g. "imgs/sim_offline").
const BUNDLE_IMGS_DIR = resolve(process.cwd(), "com.robertw.xplane.sdPlugin/imgs");
const STATES: IconState[] = ["on", "off"];

// System fonts stay off so every OS renders with exactly the bundled Inter.
async function renderPng(svg: string, size: number): Promise<Buffer> {
	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: size },
		font: {
			fontFiles: FONT_FILES,
			loadSystemFonts: false,
			defaultFontFamily: FONT_FAMILY,
			sansSerifFamily: FONT_FAMILY,
		},
	});
	return resvg.render().asPng();
}

async function main(): Promise<void> {
	await mkdir(OUT_DIR, { recursive: true });

	const ensuredDirs = new Set<string>();
	const ensureGroupDir = async (group: string): Promise<string> => {
		const dir = resolve(OUT_DIR, group);
		if (!ensuredDirs.has(dir)) {
			await mkdir(dir, { recursive: true });
			ensuredDirs.add(dir);
		}
		return dir;
	};

	let toggleCount = 0;
	let displayCount = 0;
	let nudgeCount = 0;
	let nudgeDisplayCount = 0;
	let commandCount = 0;
	let knobCount = 0;
	let gcuKeyCount = 0;
	let backgroundCount = 0;
	let viewCount = 0;
	let alertCount = 0;
	let guardedCount = 0;
	let switchCount = 0;
	let pushButtonCount = 0;

	for (const def of catalog) {
		const groupDir = await ensureGroupDir(def.group);
		if (def.kind === "toggle") {
			for (const state of STATES) {
				const svg = renderToggleIcon(def, state);
				const png = await renderPng(svg, 144);
				await writeFile(resolve(groupDir, `${def.name}_${state}.png`), png);
				toggleCount += 1;
			}
		} else if (def.kind === "display") {
			const svg = renderDisplayIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			displayCount += 1;
		} else if (def.kind === "nudge") {
			const svg = renderNudgeIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			nudgeCount += 1;
		} else if (def.kind === "nudge-display") {
			const svg = renderNudgeDisplayIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			nudgeDisplayCount += 1;
		} else if (def.kind === "command") {
			const svg = renderCommandIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			commandCount += 1;
		} else if (def.kind === "knob") {
			const svg = renderKnobIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			knobCount += 1;
		} else if (def.kind === "gcu_key") {
			const svg = renderGcuKeyIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			gcuKeyCount += 1;
		} else if (def.kind === "view") {
			const svg = renderViewIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			viewCount += 1;
		} else if (def.kind === "alert") {
			for (const state of STATES) {
				const svg = renderAlertIcon(def, state);
				const png = await renderPng(svg, 144);
				await writeFile(resolve(groupDir, `${def.name}_${state}.png`), png);
				alertCount += 1;
			}
		} else if (def.kind === "guarded") {
			for (const { file, state } of CATALOG_GUARDED_STATES) {
				const svg = renderGuardedIcon(def, state);
				const png = await renderPng(svg, 144);
				await writeFile(resolve(groupDir, `${def.name}_${file}.png`), png);
				guardedCount += 1;
			}
		} else if (def.kind === "switch") {
			for (const position of SWITCH_POSITIONS) {
				const svg = renderSwitchIcon(def, position);
				const png = await renderPng(svg, 144);
				await writeFile(resolve(groupDir, `${def.name}_${position}.png`), png);
				switchCount += 1;
			}
		} else if (def.kind === "background-back") {
			const svg = renderBackgroundBackIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			backgroundCount += 1;
		} else if (def.kind === "dot") {
			const svg = renderDotIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			commandCount += 1;
		} else if (def.kind === "pushbutton") {
			const svg = renderPushButtonIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			pushButtonCount += 1;
		} else {
			const svg = renderBackgroundIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			backgroundCount += 1;
		}
	}

	const total =
		toggleCount +
		displayCount +
		nudgeCount +
		nudgeDisplayCount +
		commandCount +
		knobCount +
		gcuKeyCount +
		backgroundCount +
		viewCount +
		alertCount +
		guardedCount +
		switchCount +
		pushButtonCount;
	console.log(
		`Wrote ${total} PNGs to ${OUT_DIR} ` +
			`(${toggleCount} toggle states + ${displayCount} displays + ${nudgeCount} nudges + ` +
			`${nudgeDisplayCount} nudge-displays + ${commandCount} commands + ${knobCount} knobs + ` +
			`${gcuKeyCount} gcu_keys + ${backgroundCount} backgrounds + ${viewCount} views + ` +
			`${alertCount} alert states + ${guardedCount} guarded states + ${switchCount} switch positions + ` +
			`${pushButtonCount} push buttons, ` +
			`grouped into ${ensuredDirs.size} subdirs, all 144×144)`,
	);

	await mkdir(BUNDLE_IMGS_DIR, { recursive: true });
	const offlinePng = await renderPng(renderSimOfflineIcon(), 144);
	const offlinePath = resolve(BUNDLE_IMGS_DIR, "sim_offline.png");
	await writeFile(offlinePath, offlinePng);
	console.log(`Wrote bundle asset: ${offlinePath}`);

	// Default guarded-command state images — manifest States[] and the action
	// runtime use these when the user hasn't uploaded custom imageLocked /
	// imageUnlocked. Empty label, cockpit-green LED to fit the typical use.
	const GUARDED_DIR = resolve(BUNDLE_IMGS_DIR, "guarded");
	await mkdir(GUARDED_DIR, { recursive: true });
	const guardedDefault: GuardedIcon = {
		kind: "guarded",
		name: "_default",
		label: "",
		group: "cockpit",
	};
	for (const state of BUNDLE_GUARDED_STATES) {
		const svg = renderGuardedIcon(guardedDefault, state);
		const png = await renderPng(svg, 144);
		await writeFile(resolve(GUARDED_DIR, `${state}.png`), png);
	}
	console.log(`Wrote bundle assets: ${GUARDED_DIR}/{locked,unlocked_off,unlocked_on}.png`);

	// Action-icons: per-UUID glyphs, written into the plugin bundle so they
	// show up in the Stream Deck library sidebar and as the default key image.
	const ACTION_ICON_SIZES: Array<[string, number]> = [
		["icon.png", 20],
		["icon@2x.png", 40],
		["key.png", 72],
		["key@2x.png", 144],
	];
	const defaultKeySvg = renderDefaultKeyIcon();
	let actionIconCount = 0;
	for (const name of ACTION_ICON_NAMES) {
		const actionDir = resolve(BUNDLE_IMGS_DIR, "actions", name);
		await mkdir(actionDir, { recursive: true });
		const glyphSvg = renderActionGlyph(name);
		const useDefaultKey = NEUTRAL_DEFAULT_KEY_ACTIONS.has(name);
		for (const [filename, size] of ACTION_ICON_SIZES) {
			const isKey = filename.startsWith("key");
			const svg = isKey && useDefaultKey ? defaultKeySvg : glyphSvg;
			const png = await renderPng(svg, size);
			await writeFile(resolve(actionDir, filename), png);
			actionIconCount += 1;
		}
	}
	console.log(
		`Wrote ${actionIconCount} action-icon PNGs across ${ACTION_ICON_NAMES.length} actions`,
	);

	// Toggle state defaults — manifest States[].Image for DataRef Toggle.
	const STATES_DIR = resolve(BUNDLE_IMGS_DIR, "states");
	await mkdir(STATES_DIR, { recursive: true });
	const TOGGLE_STATE_SIZES: Array<[string, number]> = [
		["off.png", 72],
		["off@2x.png", 144],
		["on.png", 72],
		["on@2x.png", 144],
	];
	const toggleSvgs = { off: renderToggleStateIcon("off"), on: renderToggleStateIcon("on") };
	for (const [filename, size] of TOGGLE_STATE_SIZES) {
		const state: IconState = filename.startsWith("off") ? "off" : "on";
		const png = await renderPng(toggleSvgs[state], size);
		await writeFile(resolve(STATES_DIR, filename), png);
	}
	console.log(`Wrote 4 toggle-state PNGs to ${STATES_DIR}`);

	// DataRef Switch state defaults (3-position lever placeholders).
	const SWITCH_STATE_SIZES: Array<[string, number]> = [
		["switch_up.png", 72],
		["switch_up@2x.png", 144],
		["switch_mid.png", 72],
		["switch_mid@2x.png", 144],
		["switch_down.png", 72],
		["switch_down@2x.png", 144],
	];
	const switchStateSvgs: Record<SwitchTilePosition, string> = {
		min: renderSwitchStateSvg("min"),
		mid: renderSwitchStateSvg("mid"),
		max: renderSwitchStateSvg("max"),
	};
	for (const [filename, size] of SWITCH_STATE_SIZES) {
		const pos: SwitchTilePosition = filename.startsWith("switch_up")
			? "min"
			: filename.startsWith("switch_mid")
				? "mid"
				: "max";
		const png = await renderPng(switchStateSvgs[pos], size);
		await writeFile(resolve(STATES_DIR, filename), png);
	}
	console.log(`Wrote 6 switch-state PNGs to ${STATES_DIR}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
