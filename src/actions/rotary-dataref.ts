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
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { TIMINGS, TOLERANCE_FLOAT } from "../const";
import { selectors } from "../selectors/registry";
import { coerceNumber, toFiniteNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { parseEnumMap } from "../util/enum";
import { clearOffline, combineTitle, NOT_FOUND_SUFFIX, setOffline } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { normalizeFormat, resolveZeroSnap, trimString } from "../util/settings";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type RotaryDirection = "left" | "right" | "up" | "down";
type RotaryFormatMode = "numeric" | "enum";

type RotaryDataRefSettings = JsonObject & {
	datarefPath?: string;
	delta?: string | number;
	coarseDelta?: string | number;
	direction?: RotaryDirection;
	minValue?: string | number;
	maxValue?: string | number;
	hideConfirmation?: boolean;
	hideEndstopAlert?: boolean;
	label?: string;
	formatMode?: RotaryFormatMode;
	format?: string;
	unit?: string;
	unitScale?: string | number;
	precision?: string | number;
	enumMap?: string;
	snapZero?: boolean;
	zeroThreshold?: string | number;
};

interface ParsedSettings {
	datarefPath: string;
	delta: number;
	coarseDelta?: number;
	sign: 1 | -1;
	minValue?: number;
	maxValue?: number;
	hideConfirmation: boolean;
	hideEndstopAlert: boolean;
	label: string;
	formatMode: RotaryFormatMode;
	format: string;
	unit: string;
	unitScale?: number;
	precision?: number;
	enumLut: Map<number, string>;
	enumValid: boolean;
	zeroSnap?: number;
}

interface ActionState {
	action: KeyAction<RotaryDataRefSettings>;
	parsed: ParsedSettings;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;
}

@action({ UUID: "com.robertw.xplane.rotary-dataref" })
export class XPlaneRotaryDataRef extends SingletonAction<RotaryDataRefSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<RotaryDataRefSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			parsed,
			longPressFired: false,
		};
		this.states.set(ev.action.id, state);

		if (this.xplane.isOffline()) {
			await setOffline(ev.action);
			return;
		}
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<RotaryDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<RotaryDataRefSettings>,
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

	override onKeyDown(ev: KeyDownEvent<RotaryDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.datarefPath) {
			streamDeck.logger.warn("rotary-dataref: datarefPath is empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("rotary-dataref: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		state.longPressFired = false;

		if (parsed.coarseDelta !== undefined) {
			state.longPressTimer = setTimeout(() => {
				this.fireStep(state, parsed, "long").catch((err) =>
					streamDeck.logger.error("rotary-dataref: long press failed", err),
				);
			}, TIMINGS.LONG_PRESS_THRESHOLD_MS);
		}

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<RotaryDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});

		this.cancelLongPressTimer(state);

		if (state.longPressFired) return;

		await this.fireStep(state, parsed, "short");
	}

	private async fireStep(
		state: ActionState,
		parsed: ParsedSettings,
		kind: "short" | "long",
	): Promise<void> {
		if (kind === "long") state.longPressFired = true;
		if (!parsed.datarefPath) {
			await state.action.showAlert();
			return;
		}

		const step = kind === "long" ? (parsed.coarseDelta ?? parsed.delta) : parsed.delta;
		if (!(step > 0)) {
			streamDeck.logger.warn("rotary-dataref: delta must be > 0");
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

			let target = current + parsed.sign * step;
			if (parsed.minValue !== undefined && target < parsed.minValue) target = parsed.minValue;
			if (parsed.maxValue !== undefined && target > parsed.maxValue) target = parsed.maxValue;

			if (Math.abs(target - current) < TOLERANCE_FLOAT) {
				streamDeck.logger.info(
					`rotary-dataref: ${kind} press at endstop for ${resolvedPath} (value=${current})`,
				);
				if (!parsed.hideEndstopAlert) await state.action.showAlert();
				return;
			}

			await this.xplane.writeDataRef(drId, target, index);
			streamDeck.logger.info(
				`rotary-dataref: ${kind} step ${resolvedPath} ${current} → ${target}`,
			);
			state.lastValue = target;
			this.render(state);
			if (!parsed.hideConfirmation) {
				await state.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`rotary-dataref: ${kind} step failed`, err);
			await state.action.showAlert();
		}
	}

	private cancelLongPressTimer(state: ActionState): void {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = undefined;
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
						`rotary-dataref: index apply failed for ${state.parsed.datarefPath}`,
						err,
					);
					state.action
						.setTitle(combineTitle(state.parsed.label, NOT_FOUND_SUFFIX))
						.catch((e) => streamDeck.logger.warn("rotary-dataref: setTitle failed", e));
				}
			});
		} catch (err) {
			streamDeck.logger.warn(
				`rotary-dataref: subscribe failed for ${state.parsed.datarefPath}`,
				err,
			);
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
			.catch((err) => streamDeck.logger.warn("rotary-dataref: setTitle failed", err));
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.cancelLongPressTimer(state);
			this.dropSubscription(state);
			state.lastValue = undefined;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("rotary-dataref: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(() => this.applySubscription(state))
				.catch((err) => streamDeck.logger.warn("rotary-dataref: re-subscribe failed", err));
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
					`rotary-dataref: selector re-subscribe failed for ${state.parsed.datarefPath}`,
					err,
				),
			);
		}
	}
}

function parseSettings(s: RotaryDataRefSettings): ParsedSettings {
	const formatMode: RotaryFormatMode = s.formatMode === "enum" ? "enum" : "numeric";
	const { enumLut, enumValid } = parseEnumMap(s.enumMap ?? "");
	const deltaRaw = toFiniteNumber(s.delta);
	const delta = deltaRaw !== undefined && deltaRaw > 0 ? deltaRaw : 1;
	const coarseRaw = toFiniteNumber(s.coarseDelta);
	const coarseDelta = coarseRaw !== undefined && coarseRaw > 0 ? coarseRaw : undefined;
	const sign: 1 | -1 = s.direction === "left" || s.direction === "down" ? -1 : 1;
	return {
		datarefPath: trimString(s.datarefPath),
		delta,
		coarseDelta,
		sign,
		minValue: toFiniteNumber(s.minValue),
		maxValue: toFiniteNumber(s.maxValue),
		hideConfirmation: s.hideConfirmation === true,
		hideEndstopAlert: s.hideEndstopAlert === true,
		label: trimString(s.label),
		formatMode,
		format: normalizeFormat(s.format),
		unit: trimString(s.unit),
		unitScale: toFiniteNumber(s.unitScale),
		precision: toFiniteNumber(s.precision),
		enumLut,
		enumValid,
		zeroSnap: resolveZeroSnap(s.snapZero, s.zeroThreshold),
	};
}

function toIndexInteger(v: DataRefValue, scale?: number): number | undefined {
	const raw = coerceNumber(v);
	if (raw === undefined) return undefined;
	const scaled = scale !== undefined && Number.isFinite(scale) ? raw * scale : raw;
	return Math.round(scaled);
}
