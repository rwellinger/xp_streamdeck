/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck, {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DialUpEvent,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { TOLERANCE_FLOAT } from "../const";
import { selectors } from "../selectors/registry";
import { coerceNumber, toFiniteNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { setDialFeedback } from "../util/encoder-feedback";
import { clearOffline, NOT_FOUND_SUFFIX, setOffline } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import { stepOctalCode } from "../util/octal";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { normalizeFormat, resolveZeroSnap, trimString } from "../util/settings";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type DriveMode = "dataref" | "command";
type StepMode = "linear" | "octal";

type EncoderSettings = JsonObject & {
	driveMode?: DriveMode;
	stepMode?: StepMode;
	datarefPath?: string;
	delta?: string | number;
	coarseDelta?: string | number;
	minValue?: string | number;
	maxValue?: string | number;
	hideEndstopAlert?: boolean;
	commandPath?: string;
	commandPathReverse?: string;
	shiftCommandPath?: string;
	shiftCommandPathReverse?: string;
	clickCommand?: string;
	clickHoldMode?: boolean;
	label?: string;
	format?: string;
	unit?: string;
	unitScale?: string | number;
	precision?: string | number;
	snapZero?: boolean;
	zeroThreshold?: string | number;
};

interface Parsed {
	driveMode: DriveMode;
	stepMode: StepMode;
	datarefPath: string;
	delta: number;
	coarseDelta?: number;
	minValue?: number;
	maxValue?: number;
	hideEndstopAlert: boolean;
	commandPath: string;
	commandPathReverse: string;
	shiftCommandPath: string;
	shiftCommandPathReverse: string;
	clickCommand: string;
	clickHoldMode: boolean;
	label: string;
	format: string;
	unit: string;
	unitScale?: number;
	precision?: number;
	zeroSnap?: number;
}

interface State {
	action: DialAction<EncoderSettings>;
	parsed: Parsed;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	pressed: boolean;
	shifted: boolean;
	holdId?: number;
}

@action({ UUID: "com.robertw.xplane.encoder" })
export class XPlaneEncoder extends SingletonAction<EncoderSettings> {
	private readonly states = new Map<string, State>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onOffline());
		this.xplane.on("online", () => this.onOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		const state: State = {
			action: ev.action,
			parsed: parse(ev.payload.settings ?? {}),
			pressed: false,
			shifted: false,
		};
		this.states.set(ev.action.id, state);
		if (this.xplane.isOffline()) {
			await setDialFeedback(ev.action, state.parsed.label, "OFFLINE");
			return;
		}
		await this.subscribe(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<EncoderSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.unsubscribe(state);
		void this.endHold(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<EncoderSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const next = parse(ev.payload.settings ?? {});
		const pathChanged = next.datarefPath !== state.parsed.datarefPath;
		state.parsed = next;
		if (pathChanged) {
			this.unsubscribe(state);
			state.lastValue = undefined;
			await this.subscribe(state);
			return;
		}
		this.render(state);
	}

	override async onDialRotate(ev: DialRotateEvent<EncoderSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parse(ev.payload.settings ?? {});
		const ticks = ev.payload.ticks;
		if (ticks === 0) return;

		const shift = ev.payload.pressed || state.pressed;
		if (shift) {
			state.shifted = true;
			if (state.holdId !== undefined && parsed.clickHoldMode) await this.endHold(state);
		}

		if (parsed.driveMode === "command") {
			await this.fireCommand(
				state,
				ticks > 0
					? shift && parsed.shiftCommandPath
						? parsed.shiftCommandPath
						: parsed.commandPath
					: shift && parsed.shiftCommandPathReverse
						? parsed.shiftCommandPathReverse
						: parsed.commandPathReverse,
				Math.abs(ticks),
			);
			return;
		}
		await this.stepDataRef(state, parsed, shift, ticks);
	}

	override async onDialDown(ev: DialDownEvent<EncoderSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parse(ev.payload.settings ?? {});
		state.pressed = true;
		state.shifted = false;
		if (parsed.clickHoldMode && parsed.clickCommand) {
			await this.beginHold(state, parsed.clickCommand);
		}
	}

	override async onDialUp(ev: DialUpEvent<EncoderSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parse(ev.payload.settings ?? {});
		const shifted = state.shifted;
		state.pressed = false;
		if (state.holdId !== undefined) {
			await this.endHold(state);
			state.shifted = false;
			return;
		}
		if (!shifted && parsed.clickCommand) {
			await this.fireCommand(state, parsed.clickCommand, 1);
		}
		state.shifted = false;
	}

	private async beginHold(state: State, raw: string): Promise<void> {
		const path = substitutePlaceholders(raw, selectors.snapshot());
		try {
			const id = await this.xplane.getCommandId(path);
			await this.xplane.beginCommand(id);
			state.holdId = id;
		} catch (err) {
			streamDeck.logger.error(`encoder: hold begin failed: ${path}`, err);
			await state.action.showAlert();
		}
	}

	private async endHold(state: State): Promise<void> {
		if (state.holdId === undefined) return;
		const id = state.holdId;
		state.holdId = undefined;
		try {
			await this.xplane.endCommand(id);
		} catch (err) {
			streamDeck.logger.error(`encoder: hold end failed (id=${id})`, err);
			await state.action.showAlert();
		}
	}

	private async fireCommand(state: State, raw: string, times: number): Promise<void> {
		if (!raw) {
			await state.action.showAlert();
			return;
		}
		const path = substitutePlaceholders(raw, selectors.snapshot());
		try {
			const id = await this.xplane.getCommandId(path);
			for (let i = 0; i < times; i++) await this.xplane.activateCommand(id);
		} catch (err) {
			streamDeck.logger.error(`encoder: command failed: ${path}`, err);
			await state.action.showAlert();
		}
	}

	private async stepDataRef(
		state: State,
		parsed: Parsed,
		shift: boolean,
		ticks: number,
	): Promise<void> {
		if (!parsed.datarefPath) {
			await state.action.showAlert();
			return;
		}
		const base = shift && parsed.coarseDelta !== undefined ? parsed.coarseDelta : parsed.delta;
		if (!(base > 0)) {
			await state.action.showAlert();
			return;
		}
		const step = base * Math.max(1, Math.abs(Math.trunc(ticks))) * (ticks < 0 ? -1 : 1);

		try {
			const resolved = substitutePlaceholders(parsed.datarefPath, selectors.snapshot());
			const { basePath, index } = parseDataRefPath(resolved);
			const drId = await this.xplane.getDataRefId(basePath);
			const currentRaw =
				state.lastValue !== undefined
					? state.lastValue
					: applyIndex(await this.xplane.readDataRef(drId), index);
			const current = coerceNumber(currentRaw) ?? 0;

			let target =
				parsed.stepMode === "octal"
					? stepOctalCode(current, step, parsed.minValue, parsed.maxValue)
					: current + step;
			if (parsed.stepMode !== "octal") {
				if (parsed.minValue !== undefined) target = Math.max(target, parsed.minValue);
				if (parsed.maxValue !== undefined) target = Math.min(target, parsed.maxValue);
			}

			if (Math.abs(target - current) < TOLERANCE_FLOAT) {
				if (!parsed.hideEndstopAlert) await state.action.showAlert();
				return;
			}

			await this.xplane.writeDataRef(drId, target, index);
			state.lastValue = target;
			this.render(state);
		} catch (err) {
			streamDeck.logger.error("encoder: dataref step failed", err);
			await state.action.showAlert();
		}
	}

	private async subscribe(state: State): Promise<void> {
		if (!state.parsed.datarefPath) {
			await setDialFeedback(state.action, state.parsed.label, "");
			return;
		}
		if (this.xplane.isOffline()) {
			await setDialFeedback(state.action, state.parsed.label, "OFFLINE");
			return;
		}
		const resolved = substitutePlaceholders(state.parsed.datarefPath, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);
		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				try {
					state.lastValue = applyIndex(raw, index);
					this.render(state);
				} catch {
					void setDialFeedback(state.action, state.parsed.label, NOT_FOUND_SUFFIX);
				}
			});
		} catch (err) {
			streamDeck.logger.warn(
				`encoder: subscribe failed for ${state.parsed.datarefPath}`,
				err,
			);
			await setDialFeedback(state.action, state.parsed.label, NOT_FOUND_SUFFIX);
			await state.action.showAlert();
		}
	}

	private unsubscribe(state: State): void {
		if (!state.handle) return;
		this.xplane.unsubscribe(state.handle);
		state.handle = undefined;
	}

	private render(state: State): void {
		if (state.lastValue === undefined) return;
		const { parsed } = state;
		const formatted = formatDataRefValue(state.lastValue, {
			format: parsed.format,
			unitScale: parsed.unitScale,
			precision: parsed.precision,
			zeroSnap: parsed.zeroSnap,
		});
		const value = parsed.unit ? `${formatted} ${parsed.unit}` : formatted;
		void setDialFeedback(state.action, parsed.label, value);
	}

	private onOffline(): void {
		for (const state of this.states.values()) {
			void this.endHold(state);
			state.pressed = false;
			state.shifted = false;
			this.unsubscribe(state);
			state.lastValue = undefined;
			void setDialFeedback(state.action, state.parsed.label, "OFFLINE");
			// Key-only offline bitmap is a no-op for dials.
			void setOffline(state.action);
		}
	}

	private onOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(() => this.subscribe(state))
				.catch((err) => streamDeck.logger.warn("encoder: re-subscribe failed", err));
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.parsed.datarefPath) continue;
			const keys = extractPlaceholderKeys(state.parsed.datarefPath);
			if (!keys.some((k) => changed.has(k))) continue;
			this.unsubscribe(state);
			state.lastValue = undefined;
			this.subscribe(state).catch((err) =>
				streamDeck.logger.warn("encoder: selector re-subscribe failed", err),
			);
		}
	}
}

function parse(s: EncoderSettings): Parsed {
	const deltaRaw = toFiniteNumber(s.delta);
	const coarseRaw = toFiniteNumber(s.coarseDelta);
	return {
		driveMode: s.driveMode === "command" ? "command" : "dataref",
		stepMode: s.stepMode === "octal" ? "octal" : "linear",
		datarefPath: trimString(s.datarefPath),
		delta: deltaRaw !== undefined && deltaRaw > 0 ? deltaRaw : 1,
		coarseDelta: coarseRaw !== undefined && coarseRaw > 0 ? coarseRaw : undefined,
		minValue: toFiniteNumber(s.minValue),
		maxValue: toFiniteNumber(s.maxValue),
		hideEndstopAlert: s.hideEndstopAlert === true,
		commandPath: trimString(s.commandPath),
		commandPathReverse: trimString(s.commandPathReverse),
		shiftCommandPath: trimString(s.shiftCommandPath),
		shiftCommandPathReverse: trimString(s.shiftCommandPathReverse),
		clickCommand: trimString(s.clickCommand),
		clickHoldMode: s.clickHoldMode === true,
		label: trimString(s.label),
		format: normalizeFormat(s.format),
		unit: trimString(s.unit),
		unitScale: toFiniteNumber(s.unitScale),
		precision: toFiniteNumber(s.precision),
		zeroSnap: resolveZeroSnap(s.snapZero, s.zeroThreshold),
	};
}
