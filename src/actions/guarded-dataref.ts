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
import { clearTile, setNotFound, setOffline } from "../util/error-tile";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { trimString } from "../util/settings";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type GuardedDataRefSettings = JsonObject & {
	shortDataRef?: string;
	hideShortConfirmation?: boolean;

	longDataRef?: string;
	longValueOff?: string | number;
	longValueOn?: string | number;

	guardDataRef?: string;
	valueLocked?: string | number;
	valueUnlocked?: string | number;
	strictOnMatch?: boolean;
	enforceLock?: boolean;
};

const STATE_LOCKED = 0;
const STATE_UNLOCKED_OFF = 1;
const STATE_UNLOCKED_ON = 2;
const STATE_DIRTY = -1;

interface ParsedSettings {
	shortPath: string;
	hideShortConfirmation: boolean;

	longPath: string;
	longValueOff: number;
	longValueOn: number;

	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	strictOnMatch: boolean;
	enforceLock: boolean;
}

interface ActionState {
	action: KeyAction<GuardedDataRefSettings>;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;

	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	strictOnMatch: boolean;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;

	// Long-press DataRef tracked separately so the visual state can
	// distinguish "guard open, function still off" from "guard open + function on".
	longPath: string;
	longValueOff: number;
	longValueOn: number;
	longHandle?: SubscriptionHandle;
	lastLongValue?: DataRefValue;

	currentState: number;
	renderPromise?: Promise<void>;
}

@action({ UUID: "com.robertw.xplane.guarded-dataref" })
export class XPlaneGuardedDataRef extends SingletonAction<GuardedDataRefSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<GuardedDataRefSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			longPressFired: false,
			guardPath: parsed.guardPath,
			valueLocked: parsed.valueLocked,
			valueUnlocked: parsed.valueUnlocked,
			strictOnMatch: parsed.strictOnMatch,
			longPath: parsed.longPath,
			longValueOff: parsed.longValueOff,
			longValueOn: parsed.longValueOn,
			currentState: STATE_DIRTY,
		};
		this.states.set(ev.action.id, state);

		if (state.guardPath) {
			await this.applySubscription(state);
		} else if (this.xplane.isOffline()) {
			await setOffline(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<GuardedDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		this.dropSubscription(state);
		this.dropLongSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<GuardedDataRefSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const guardChanged = parsed.guardPath !== state.guardPath;
		const longChanged = parsed.longPath !== state.longPath;

		state.valueLocked = parsed.valueLocked;
		state.valueUnlocked = parsed.valueUnlocked;
		state.strictOnMatch = parsed.strictOnMatch;
		state.longValueOff = parsed.longValueOff;
		state.longValueOn = parsed.longValueOn;

		if (guardChanged || longChanged) {
			this.dropSubscription(state);
			this.dropLongSubscription(state);
			state.guardPath = parsed.guardPath;
			state.longPath = parsed.longPath;
			state.lastValue = undefined;
			state.lastLongValue = undefined;
			state.currentState = STATE_DIRTY;
			if (state.guardPath) {
				await this.applySubscription(state);
			} else {
				await clearTile(state.action);
				await state.action.setState(STATE_LOCKED);
				state.currentState = STATE_LOCKED;
			}
			return;
		}

		state.currentState = STATE_DIRTY;
		if (state.lastValue !== undefined) {
			await this.renderState(state);
		}
	}

	override onKeyDown(ev: KeyDownEvent<GuardedDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.shortPath && !parsed.longPath) {
			streamDeck.logger.warn("guarded-dataref: both short and long DataRef paths are empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("guarded-dataref: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		state.longPressFired = false;

		state.longPressTimer = setTimeout(() => {
			this.fireLongPress(state, parsed).catch((err) =>
				streamDeck.logger.error("guarded-dataref: long press failed", err),
			);
		}, TIMINGS.LONG_PRESS_THRESHOLD_MS);

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<GuardedDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});

		this.cancelLongPressTimer(state);

		if (state.longPressFired) return;

		await this.fireShortPress(state, parsed);
	}

	private async fireShortPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		if (!parsed.shortPath) {
			streamDeck.logger.warn("guarded-dataref: shortDataRef is empty");
			await state.action.showAlert();
			return;
		}

		try {
			// Hard-coded 0 ↔ 1 toggle: a guard's only job is to open/close.
			const target = await this.toggleDataRef(parsed.shortPath, 0, 1, state);
			streamDeck.logger.info(`guarded-dataref: short toggle ${parsed.shortPath} → ${target}`);
			if (!parsed.hideShortConfirmation) {
				await state.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`guarded-dataref: short failed ${parsed.shortPath}`, err);
			await state.action.showAlert();
		}
	}

	private async fireLongPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		state.longPressFired = true;

		if (this.isGuardLocked(state, parsed)) {
			streamDeck.logger.info(
				`guarded-dataref: long press blocked — guard locked (${state.guardPath})`,
			);
			await state.action.showAlert();
			return;
		}

		if (!parsed.longPath) {
			streamDeck.logger.warn("guarded-dataref: longDataRef is empty");
			await state.action.showAlert();
			return;
		}

		try {
			const target = await this.toggleDataRef(
				parsed.longPath,
				parsed.longValueOff,
				parsed.longValueOn,
				state,
			);
			streamDeck.logger.info(`guarded-dataref: long toggle ${parsed.longPath} → ${target}`);
		} catch (err) {
			streamDeck.logger.error(`guarded-dataref: long failed ${parsed.longPath}`, err);
			await state.action.showAlert();
		}
	}

	// Read current value of `path`, decide whether it is currently "on", and
	// write the opposite. Optimistically updates the matching cached value
	// (lastValue for guard, lastLongValue for long path) so the next render
	// doesn't have to wait for the WS round-trip.
	private async toggleDataRef(
		rawPath: string,
		valueOff: number,
		valueOn: number,
		state: ActionState,
	): Promise<number> {
		const resolved = substitutePlaceholders(rawPath, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);
		const drId = await this.xplane.getDataRefId(basePath);
		let current: DataRefValue;
		if (rawPath === state.guardPath && state.lastValue !== undefined) {
			current = state.lastValue;
		} else if (rawPath === state.longPath && state.lastLongValue !== undefined) {
			current = state.lastLongValue;
		} else {
			current = applyIndex(await this.xplane.readDataRef(drId), index);
		}
		const isOn = isOnValue(current, valueOff, valueOn, false);
		const target = isOn ? valueOff : valueOn;
		await this.xplane.writeDataRef(drId, target, index);
		if (rawPath === state.guardPath) state.lastValue = target;
		if (rawPath === state.longPath) state.lastLongValue = target;
		if (rawPath === state.guardPath || rawPath === state.longPath) {
			await this.renderState(state);
		}
		return target;
	}

	// True only when lock enforcement is on, a guard DataRef is configured, and
	// its last known value maps to "locked". Unknown value → fail open.
	private isGuardLocked(state: ActionState, parsed: ParsedSettings): boolean {
		if (!parsed.enforceLock || !parsed.guardPath || state.lastValue === undefined) return false;
		return !isOnValue(
			state.lastValue,
			parsed.valueLocked,
			parsed.valueUnlocked,
			parsed.strictOnMatch,
		);
	}

	private cancelLongPressTimer(state: ActionState): void {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = undefined;
		}
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.guardPath) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const snap = selectors.snapshot();
		// Guard subscription (drives Locked vs Unlocked-*).
		const guard = parseDataRefPath(substitutePlaceholders(state.guardPath, snap));
		try {
			state.handle = await this.xplane.subscribe(guard.basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, guard.index);
				} catch (err) {
					streamDeck.logger.warn(
						`guarded-dataref: index apply failed for ${state.guardPath}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("guarded-dataref: setNotFound failed", e),
					);
					return;
				}
				state.lastValue = value;
				this.renderState(state).catch((err) =>
					streamDeck.logger.warn("guarded-dataref: render failed", err),
				);
			});

			try {
				const id = await this.xplane.getDataRefId(guard.basePath);
				const initial = applyIndex(await this.xplane.readDataRef(id), guard.index);
				if (state.lastValue === undefined) {
					state.lastValue = initial;
					await this.renderState(state);
				}
			} catch (err) {
				streamDeck.logger.warn(
					`guarded-dataref: initial read failed for ${state.guardPath}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`guarded-dataref: subscribe failed for ${state.guardPath}`, err);
			await setNotFound(state.action);
			await state.action.showAlert();
		}

		// Long-press DataRef subscription — only when it's a distinct path
		// (otherwise lastValue already covers it). Drives Unlocked-Off vs Unlocked-On.
		if (state.longPath && state.longPath !== state.guardPath) {
			const long = parseDataRefPath(substitutePlaceholders(state.longPath, snap));
			try {
				state.longHandle = await this.xplane.subscribe(long.basePath, (raw) => {
					try {
						state.lastLongValue = applyIndex(raw, long.index);
					} catch (err) {
						streamDeck.logger.warn(
							`guarded-dataref: long index apply failed for ${state.longPath}`,
							err,
						);
						return;
					}
					this.renderState(state).catch((err) =>
						streamDeck.logger.warn("guarded-dataref: long render failed", err),
					);
				});
				try {
					const id = await this.xplane.getDataRefId(long.basePath);
					const initial = applyIndex(await this.xplane.readDataRef(id), long.index);
					if (state.lastLongValue === undefined) {
						state.lastLongValue = initial;
						await this.renderState(state);
					}
				} catch (err) {
					streamDeck.logger.warn(
						`guarded-dataref: long initial read failed for ${state.longPath}`,
						err,
					);
				}
			} catch (err) {
				streamDeck.logger.warn(
					`guarded-dataref: long subscribe failed for ${state.longPath}`,
					err,
				);
			}
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private dropLongSubscription(state: ActionState): void {
		if (state.longHandle) {
			this.xplane.unsubscribe(state.longHandle);
			state.longHandle = undefined;
		}
	}

	private renderState(state: ActionState): Promise<void> {
		if (state.lastValue === undefined) return Promise.resolve();
		// When guard and long share the same DataRef, lastValue covers both.
		const longValue =
			state.longPath && state.longPath === state.guardPath
				? state.lastValue
				: state.lastLongValue;
		const target = computeTargetState(state, state.lastValue, longValue);
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				if (target === state.currentState) return;
				streamDeck.logger.info(
					`guarded-dataref: setState ${target} for ${state.guardPath} (longPath=${state.longPath || "<none>"})`,
				);
				await clearTile(state.action);
				await state.action.setState(target);
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.cancelLongPressTimer(state);
			if (state.guardPath) {
				this.dropSubscription(state);
				this.dropLongSubscription(state);
				state.lastValue = undefined;
				state.lastLongValue = undefined;
				state.currentState = STATE_DIRTY;
			}
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("guarded-dataref: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.guardPath && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`guarded-dataref: re-subscribe failed for ${state.guardPath}`,
						err,
					),
				);
			}
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.guardPath) continue;
			const keys = [
				...extractPlaceholderKeys(state.guardPath),
				...extractPlaceholderKeys(state.longPath),
			];
			if (!keys.some((k) => changed.has(k))) continue;
			this.dropSubscription(state);
			this.dropLongSubscription(state);
			state.lastValue = undefined;
			state.lastLongValue = undefined;
			state.currentState = STATE_DIRTY;
			this.applySubscription(state).catch((err) =>
				streamDeck.logger.warn(
					`guarded-dataref: selector re-subscribe failed for ${state.guardPath}`,
					err,
				),
			);
		}
	}
}

function parseSettings(s: GuardedDataRefSettings): ParsedSettings {
	const shortPath = trimString(s.shortDataRef);
	const longPath = trimString(s.longDataRef);
	const guardPathRaw = trimString(s.guardDataRef);
	const guardPath = guardPathRaw || shortPath;

	const longValueOff = toFiniteNumber(s.longValueOff) ?? 0;
	const longValueOn = toFiniteNumber(s.longValueOn) ?? 1;

	// Guard locked = 0, unlocked = 1 — short press toggles between these two
	// values. Override valueLocked/valueUnlocked only if the visual state
	// should be derived from a different DataRef value range.
	const valueLocked = toFiniteNumber(s.valueLocked) ?? 0;
	const valueUnlocked = toFiniteNumber(s.valueUnlocked) ?? 1;

	return {
		shortPath,
		hideShortConfirmation: s.hideShortConfirmation === true,
		longPath,
		longValueOff,
		longValueOn,
		guardPath,
		valueLocked,
		valueUnlocked,
		strictOnMatch: s.strictOnMatch === true,
		enforceLock: s.enforceLock === true,
	};
}

// True when `value` is closer to `valueOn` than to `valueOff` (or — under
// strict mode — exactly matches `valueOn` within float tolerance). Shared
// between guard (locked vs unlocked) and long-press (function off vs on).
function isOnValue(
	value: DataRefValue,
	valueOff: number,
	valueOn: number,
	strictOnMatch: boolean,
): boolean {
	const num = coerceNumber(value);
	if (num === undefined) return false;
	if (strictOnMatch) return Math.abs(num - valueOn) < TOLERANCE_FLOAT;
	if (valueOff === 0 && valueOn === 1) return num >= 0.5;
	const dOff = Math.abs(num - valueOff);
	const dOn = Math.abs(num - valueOn);
	return dOn < dOff;
}

function computeTargetState(
	state: ActionState,
	guardValue: DataRefValue,
	longValue: DataRefValue | undefined,
): typeof STATE_LOCKED | typeof STATE_UNLOCKED_OFF | typeof STATE_UNLOCKED_ON {
	const unlocked = isOnValue(
		guardValue,
		state.valueLocked,
		state.valueUnlocked,
		state.strictOnMatch,
	);
	if (!unlocked) return STATE_LOCKED;
	// Without a long path or a known long value we can't tell whether the
	// function is on — default to "unlocked off" so the bright LED look
	// stays gated on real confirmation.
	if (!state.longPath || longValue === undefined) return STATE_UNLOCKED_OFF;
	const functionOn = isOnValue(
		longValue,
		state.longValueOff,
		state.longValueOn,
		state.strictOnMatch,
	);
	return functionOn ? STATE_UNLOCKED_ON : STATE_UNLOCKED_OFF;
}
