/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { selectors } from "../selectors/registry";
import { coerceNumber, toFiniteNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { parseEnumMap } from "../util/enum";
import { clearOffline, combineTitle, NOT_FOUND_SUFFIX, setOffline } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { normalizeFormat, resolveZeroSnap, trimString } from "../util/settings";
import { applyStep } from "../util/step";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type RotaryDirection = "left" | "right" | "up" | "down";
type RotaryFormatMode = "numeric" | "enum";

type RotarySettings = JsonObject & {
	commandPath?: string;
	hideConfirmation?: boolean;
	hideEndstopAlert?: boolean;
	direction?: RotaryDirection;
	datarefPath?: string;
	delta?: string | number;
	minValue?: string | number;
	maxValue?: string | number;
	cycle?: boolean;
	label?: string;
	formatMode?: RotaryFormatMode;
	format?: string;
	unit?: string;
	unitScale?: string | number;
	precision?: string | number;
	enumMap?: string;
	holdOnLastPosition?: boolean;
	holdCommand?: string;
	snapZero?: boolean;
	zeroThreshold?: string | number;
};

interface ParsedSettings {
	commandPath: string;
	datarefPath: string;
	delta?: number;
	sign: 1 | -1;
	minValue?: number;
	maxValue?: number;
	cycle: boolean;
	hideEndstopAlert: boolean;
	label: string;
	formatMode: RotaryFormatMode;
	format: string;
	unit: string;
	unitScale?: number;
	precision?: number;
	enumLut: Map<number, string>;
	enumMaxIndex: number | undefined;
	enumValid: boolean;
	holdOnLastPosition: boolean;
	holdCommand: string;
	zeroSnap?: number;
}

interface ActionState {
	action: WillAppearEvent<RotarySettings>["action"];
	parsed: ParsedSettings;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	holdInProgress: boolean;
	activeHoldId?: number;
}

@action({ UUID: "com.robertw.xplane.rotary" })
export class XPlaneRotary extends SingletonAction<RotarySettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<RotarySettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			parsed,
			holdInProgress: false,
		};
		this.states.set(ev.action.id, state);

		if (this.xplane.isOffline()) {
			await setOffline(ev.action);
			return;
		}
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<RotarySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSubscription(state);
		// If a hold was still in progress (unusual — usually onKeyUp clears it),
		// best-effort release so X-Plane doesn't get stuck with the starter held.
		if (state.holdInProgress && state.activeHoldId !== undefined) {
			const id = state.activeHoldId;
			this.xplane
				.endCommand(id)
				.catch((err) =>
					streamDeck.logger.warn("rotary: endCommand on disappear failed", err),
				);
			state.holdInProgress = false;
			state.activeHoldId = undefined;
		}
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<RotarySettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const next = parseSettings(ev.payload.settings ?? {});
		const pathChanged = next.datarefPath !== state.parsed.datarefPath;
		state.parsed = next;

		if (pathChanged) {
			this.dropSubscription(state);
			state.lastValue = undefined;
			if (!state.parsed.datarefPath) {
				await state.action.setTitle(state.parsed.label);
			}
			await this.applySubscription(state);
			return;
		}

		this.render(state);
	}

	override async onKeyDown(ev: KeyDownEvent<RotarySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		const parsed = parseSettings(ev.payload.settings ?? {});
		const hideConfirmation = ev.payload.settings?.hideConfirmation === true;

		const canStep = parsed.delta !== undefined && !!parsed.datarefPath;
		if (!parsed.commandPath && !parsed.holdCommand && !canStep) {
			streamDeck.logger.warn(
				"rotary: commandPath / holdCommand / delta+datarefPath are all empty",
			);
			await ev.action.showAlert();
			return;
		}

		const snap = selectors.snapshot();

		if (shouldHoldOnLast(state, parsed)) {
			const holdCommand = substitutePlaceholders(parsed.holdCommand, snap);
			try {
				const id = await this.xplane.getCommandId(holdCommand);
				await this.xplane.beginCommand(id);
				if (state) {
					state.holdInProgress = true;
					state.activeHoldId = id;
				}
				streamDeck.logger.info(`rotary: hold begin ${holdCommand} (id=${id})`);
			} catch (err) {
				streamDeck.logger.error(`rotary: hold begin failed: ${holdCommand}`, err);
				await ev.action.showAlert();
			}
			return;
		}

		// Optional DataRef step (cycle/clamp) — takes precedence over command activate.
		if (canStep && state) {
			await this.stepDataRef(state, parsed, hideConfirmation);
			return;
		}

		if (parsed.formatMode === "enum" && !parsed.enumValid) {
			streamDeck.logger.warn("rotary: enumMap parse error — refusing to fire command");
			await ev.action.showAlert();
			return;
		}

		if (!parsed.commandPath) {
			streamDeck.logger.warn("rotary: commandPath empty (HOLD / step did not apply)");
			await ev.action.showAlert();
			return;
		}

		const commandPath = substitutePlaceholders(parsed.commandPath, snap);
		try {
			const id = await this.xplane.getCommandId(commandPath);
			await this.xplane.activateCommand(id);
			streamDeck.logger.info(`rotary: activate ${commandPath} (id=${id})`);
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`rotary: command failed: ${commandPath}`, err);
			await ev.action.showAlert();
		}
	}

	private async stepDataRef(
		state: ActionState,
		parsed: ParsedSettings,
		hideConfirmation: boolean,
	): Promise<void> {
		const delta = parsed.delta;
		if (delta === undefined || !(delta > 0) || !parsed.datarefPath) {
			await state.action.showAlert();
			return;
		}
		try {
			const resolvedPath = substitutePlaceholders(parsed.datarefPath, selectors.snapshot());
			const { basePath, index } = parseDataRefPath(resolvedPath);
			const drId = await this.xplane.getDataRefId(basePath);
			const currentRaw =
				state.lastValue !== undefined
					? state.lastValue
					: applyIndex(await this.xplane.readDataRef(drId), index);
			const current = coerceNumber(currentRaw) ?? 0;
			const { value: target, blocked } = applyStep(current, parsed.sign * delta, {
				min: parsed.minValue,
				max: parsed.maxValue,
				cycle: parsed.cycle,
			});
			if (blocked) {
				streamDeck.logger.info(
					`rotary: step at endstop for ${resolvedPath} (value=${current})`,
				);
				if (!parsed.hideEndstopAlert) await state.action.showAlert();
				return;
			}
			await this.xplane.writeDataRef(drId, target, index);
			streamDeck.logger.info(`rotary: step ${resolvedPath} ${current} → ${target}`);
			state.lastValue = target;
			this.render(state);
			if (!hideConfirmation && state.action.isKey()) await state.action.showOk();
		} catch (err) {
			streamDeck.logger.error("rotary: dataref step failed", err);
			await state.action.showAlert();
		}
	}

	override async onKeyUp(ev: KeyUpEvent<RotarySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state?.holdInProgress || state.activeHoldId === undefined) return;
		const id = state.activeHoldId;
		const hideConfirmation = ev.payload.settings?.hideConfirmation === true;
		try {
			await this.xplane.endCommand(id);
			streamDeck.logger.info(`rotary: hold end (id=${id})`);
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`rotary: endCommand failed (id=${id})`, err);
			await ev.action.showAlert();
		} finally {
			state.holdInProgress = false;
			state.activeHoldId = undefined;
		}
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.parsed.datarefPath) {
			await state.action.setTitle(state.parsed.label);
			return;
		}
		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}
		const resolved = substitutePlaceholders(state.parsed.datarefPath, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);
		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				try {
					state.lastValue = applyIndex(raw, index);
					this.render(state);
				} catch (err) {
					streamDeck.logger.warn(
						`rotary: index apply failed for ${state.parsed.datarefPath}`,
						err,
					);
					state.action
						.setTitle(combineTitle(state.parsed.label, NOT_FOUND_SUFFIX))
						.catch((e) => streamDeck.logger.warn("rotary: setTitle failed", e));
				}
			});
		} catch (err) {
			streamDeck.logger.warn(`rotary: subscribe failed for ${state.parsed.datarefPath}`, err);
			await state.action.setTitle(combineTitle(state.parsed.label, NOT_FOUND_SUFFIX));
			await state.action.showAlert();
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private render(state: ActionState): void {
		if (state.lastValue === undefined) return;
		const { parsed } = state;
		let valueText: string;
		if (parsed.formatMode === "enum") {
			if (!parsed.enumValid) {
				valueText = NOT_FOUND_SUFFIX;
			} else {
				const idx = toIndexInteger(state.lastValue, parsed.unitScale);
				if (idx === undefined) {
					valueText = NOT_FOUND_SUFFIX;
				} else {
					const label = parsed.enumLut.get(idx);
					if (label === undefined) {
						// Index falls between defined detents (e.g. flaps still
						// travelling between 10° and 20°). Skip the title update
						// so the last known detent stays visible until the new
						// one settles — better than flashing "?(N)" through the
						// transition.
						return;
					}
					valueText = label;
				}
			}
		} else {
			const formatted = formatDataRefValue(state.lastValue, {
				format: parsed.format,
				unitScale: parsed.unitScale,
				precision: parsed.precision,
				zeroSnap: parsed.zeroSnap,
			});
			valueText = parsed.unit ? `${formatted} ${parsed.unit}` : formatted;
		}
		state.action
			.setTitle(combineTitle(parsed.label, valueText))
			.catch((err) => streamDeck.logger.warn("rotary: setTitle failed", err));
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			// X-Plane went away mid-hold: best-effort release. WS is gone, but a
			// graceful close may still answer briefly. Clear the local flag
			// either way so a later keyUp doesn't try to end again.
			if (state.holdInProgress && state.activeHoldId !== undefined) {
				this.xplane.endCommand(state.activeHoldId).catch(() => {
					/* sim offline — nothing else to do */
				});
				state.holdInProgress = false;
				state.activeHoldId = undefined;
			}
			this.dropSubscription(state);
			state.lastValue = undefined;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("rotary: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(() => this.applySubscription(state))
				.catch((err) => streamDeck.logger.warn("rotary: re-subscribe failed", err));
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.parsed.datarefPath) continue;
			const keys = extractPlaceholderKeys(state.parsed.datarefPath);
			if (!keys.some((k) => changed.has(k))) continue;
			this.dropSubscription(state);
			state.lastValue = undefined;
			this.applySubscription(state).catch((err) =>
				streamDeck.logger.warn(
					`rotary: selector re-subscribe failed for ${state.parsed.datarefPath}`,
					err,
				),
			);
		}
	}
}

function shouldHoldOnLast(state: ActionState | undefined, parsed: ParsedSettings): boolean {
	if (parsed.formatMode !== "enum") return false;
	if (!parsed.holdOnLastPosition) return false;
	if (!parsed.holdCommand) return false;
	if (parsed.enumLut.size < 2) return false;
	if (parsed.enumMaxIndex === undefined) return false;
	if (!state || state.lastValue === undefined) return false;
	const idx = toIndexInteger(state.lastValue, parsed.unitScale);
	if (idx === undefined) return false;
	// Trigger on the second-to-last index: pressing now would advance to the
	// last position (which is the "hold" position, e.g. starter on Cessna).
	return idx === parsed.enumMaxIndex - 1;
}

function parseSettings(s: RotarySettings): ParsedSettings {
	const formatMode: RotaryFormatMode = s.formatMode === "enum" ? "enum" : "numeric";
	const { enumLut, enumMaxIndex, enumValid } = parseEnumMap(s.enumMap ?? "");
	const deltaRaw = toFiniteNumber(s.delta);
	const delta = deltaRaw !== undefined && deltaRaw > 0 ? deltaRaw : undefined;
	const sign: 1 | -1 = s.direction === "left" || s.direction === "down" ? -1 : 1;
	return {
		commandPath: trimString(s.commandPath),
		datarefPath: trimString(s.datarefPath),
		delta,
		sign,
		minValue: toFiniteNumber(s.minValue),
		maxValue: toFiniteNumber(s.maxValue),
		cycle: s.cycle === true,
		hideEndstopAlert: s.hideEndstopAlert === true,
		label: trimString(s.label),
		formatMode,
		format: normalizeFormat(s.format),
		unit: trimString(s.unit),
		unitScale: toFiniteNumber(s.unitScale),
		precision: toFiniteNumber(s.precision),
		enumLut,
		enumMaxIndex,
		enumValid,
		holdOnLastPosition: s.holdOnLastPosition === true,
		holdCommand: trimString(s.holdCommand),
		zeroSnap: resolveZeroSnap(s.snapZero, s.zeroThreshold),
	};
}

function toIndexInteger(v: DataRefValue, scale?: number): number | undefined {
	const raw = coerceNumber(v);
	if (raw === undefined) return undefined;
	const scaled = scale !== undefined && Number.isFinite(scale) ? raw * scale : raw;
	return Math.round(scaled);
}
