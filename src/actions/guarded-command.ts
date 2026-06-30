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
import { clearOffline, clearTile, setNotFound, setOffline } from "../util/error-tile";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { trimString } from "../util/settings";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type LongPressMode = "activate" | "hold" | "autoRepeat";

type GuardedCommandSettings = JsonObject & {
	shortPressCommand?: string;
	hideShortConfirmation?: boolean;

	longPressCommand?: string;
	longPressMode?: LongPressMode;

	guardDataRef?: string;
	valueLocked?: string | number;
	valueUnlocked?: string | number;
	strictOnMatch?: boolean;
};

const STATE_LOCKED = 0;
const STATE_UNLOCKED = 1;

const STATE_DIRTY = -1;

interface ParsedSettings {
	shortPath: string;
	longPath: string;
	longMode: LongPressMode;
	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	strictOnMatch: boolean;
	hideShortConfirmation: boolean;
}

interface ActionState {
	action: KeyAction<GuardedCommandSettings>;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;
	longPressActiveCommandId?: number;
	longPressActiveMode?: LongPressMode;
	repeatInterval?: NodeJS.Timeout;

	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	strictOnMatch: boolean;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
	renderPromise?: Promise<void>;
}

@action({ UUID: "com.robertw.xplane.guarded-command" })
export class XPlaneGuardedCommand extends SingletonAction<GuardedCommandSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<GuardedCommandSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			longPressFired: false,
			guardPath: parsed.guardPath,
			valueLocked: parsed.valueLocked,
			valueUnlocked: parsed.valueUnlocked,
			strictOnMatch: parsed.strictOnMatch,
			currentState: STATE_DIRTY,
		};
		this.states.set(ev.action.id, state);

		if (state.guardPath) {
			await this.applySubscription(state);
		} else if (this.xplane.isOffline()) {
			await setOffline(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<GuardedCommandSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		this.stopRepeater(state);
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<GuardedCommandSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const guardChanged = parsed.guardPath !== state.guardPath;

		state.valueLocked = parsed.valueLocked;
		state.valueUnlocked = parsed.valueUnlocked;
		state.strictOnMatch = parsed.strictOnMatch;

		if (guardChanged) {
			this.dropSubscription(state);
			state.guardPath = parsed.guardPath;
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			if (state.guardPath) {
				await this.applySubscription(state);
			} else {
				await clearOffline(state.action);
				await clearTile(state.action);
				await state.action.setState(STATE_LOCKED);
				state.currentState = STATE_LOCKED;
			}
			return;
		}

		// Force a re-render so changed thresholds take effect.
		state.currentState = STATE_DIRTY;
		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	override onKeyDown(ev: KeyDownEvent<GuardedCommandSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.shortPath && !parsed.longPath) {
			streamDeck.logger.warn("guarded-command: both short and long command paths are empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("guarded-command: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		this.stopRepeater(state);
		state.longPressFired = false;
		state.longPressActiveCommandId = undefined;
		state.longPressActiveMode = undefined;

		state.longPressTimer = setTimeout(() => {
			this.fireLongPress(state, parsed).catch((err) =>
				streamDeck.logger.error("guarded-command: long press failed", err),
			);
		}, TIMINGS.LONG_PRESS_THRESHOLD_MS);

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<GuardedCommandSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});

		this.cancelLongPressTimer(state);

		if (state.longPressFired) {
			await this.endLongPress(state);
			return;
		}

		await this.fireShortPress(state, parsed);
	}

	private async fireShortPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		if (!parsed.shortPath) {
			streamDeck.logger.warn("guarded-command: shortPressCommand is empty");
			await state.action.showAlert();
			return;
		}

		const shortPath = substitutePlaceholders(parsed.shortPath, selectors.snapshot());
		try {
			const id = await this.xplane.getCommandId(shortPath);
			await this.xplane.activateCommand(id);
			streamDeck.logger.info(`guarded-command: short activate ${shortPath} (id=${id})`);
			if (!parsed.hideShortConfirmation) {
				await state.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`guarded-command: short failed ${shortPath}`, err);
			await state.action.showAlert();
		}
	}

	private async fireLongPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		state.longPressFired = true;

		if (!parsed.longPath) {
			streamDeck.logger.warn("guarded-command: longPressCommand is empty");
			await state.action.showAlert();
			return;
		}

		const longPath = substitutePlaceholders(parsed.longPath, selectors.snapshot());
		try {
			const id = await this.xplane.getCommandId(longPath);
			state.longPressActiveCommandId = id;
			state.longPressActiveMode = parsed.longMode;

			if (parsed.longMode === "hold") {
				await this.xplane.beginCommand(id);
				streamDeck.logger.info(`guarded-command: long begin ${longPath} (id=${id})`);
			} else if (parsed.longMode === "autoRepeat") {
				await this.xplane.activateCommand(id);
				streamDeck.logger.info(
					`guarded-command: long auto-repeat start ${longPath} (id=${id})`,
				);
				state.repeatInterval = setInterval(() => {
					this.xplane
						.activateCommand(id)
						.catch((err) =>
							streamDeck.logger.error(
								`guarded-command: repeat failed ${longPath}`,
								err,
							),
						);
				}, TIMINGS.REPEAT_INTERVAL_MS);
			} else {
				await this.xplane.activateCommand(id);
				streamDeck.logger.info(`guarded-command: long activate ${longPath} (id=${id})`);
			}
		} catch (err) {
			streamDeck.logger.error(`guarded-command: long failed ${longPath}`, err);
			state.longPressActiveCommandId = undefined;
			state.longPressActiveMode = undefined;
			await state.action.showAlert();
		}
	}

	private async endLongPress(state: ActionState): Promise<void> {
		const id = state.longPressActiveCommandId;
		const mode = state.longPressActiveMode;
		state.longPressActiveCommandId = undefined;
		state.longPressActiveMode = undefined;

		this.stopRepeater(state);

		if (id === undefined || mode !== "hold") return;

		try {
			await this.xplane.endCommand(id);
			streamDeck.logger.info(`guarded-command: long end (id=${id})`);
		} catch (err) {
			streamDeck.logger.error("guarded-command: long end failed", err);
			await state.action.showAlert();
		}
	}

	private cancelLongPressTimer(state: ActionState): void {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = undefined;
		}
	}

	private stopRepeater(state: ActionState): void {
		if (state.repeatInterval) {
			clearInterval(state.repeatInterval);
			state.repeatInterval = undefined;
		}
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.guardPath) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const resolved = substitutePlaceholders(state.guardPath, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, index);
				} catch (err) {
					streamDeck.logger.warn(
						`guarded-command: index apply failed for ${state.guardPath}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("guarded-command: setNotFound failed", e),
					);
					return;
				}
				state.lastValue = value;
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("guarded-command: render failed", err),
				);
			});

			try {
				const id = await this.xplane.getDataRefId(basePath);
				const initial = applyIndex(await this.xplane.readDataRef(id), index);
				if (state.lastValue === undefined) {
					state.lastValue = initial;
					await this.renderState(state, initial);
				}
			} catch (err) {
				streamDeck.logger.warn(
					`guarded-command: initial read failed for ${state.guardPath}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`guarded-command: subscribe failed for ${state.guardPath}`, err);
			await setNotFound(state.action);
			await state.action.showAlert();
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private renderState(state: ActionState, value: DataRefValue): Promise<void> {
		const target = mapValueToStateIndex(
			value,
			state.valueLocked,
			state.valueUnlocked,
			state.strictOnMatch,
		);
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				if (target === state.currentState) return;
				streamDeck.logger.info(
					`guarded-command: setState ${target} for ${state.guardPath}`,
				);
				await clearTile(state.action);
				await state.action.setState(target);
				// Once valid data arrives, drop the offline image override so the
				// native state image shows through (mirrors dataref-toggle).
				await clearOffline(state.action);
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		// Show offline regardless of guardPath: every keyDown reaches X-Plane via
		// getCommandId(), so without a connection this tile is non-functional even
		// when no guard DataRef is configured.
		for (const state of this.states.values()) {
			this.cancelLongPressTimer(state);
			this.stopRepeater(state);
			if (state.guardPath) {
				this.dropSubscription(state);
				state.currentState = STATE_DIRTY;
			}
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("guarded-command: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.guardPath) {
				if (!state.handle) {
					this.applySubscription(state).catch((err) =>
						streamDeck.logger.warn(
							`guarded-command: re-subscribe failed for ${state.guardPath}`,
							err,
						),
					);
				}
			} else {
				clearOffline(state.action).catch((err) =>
					streamDeck.logger.warn("guarded-command: clearOffline failed", err),
				);
			}
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.guardPath) continue;
			const keys = extractPlaceholderKeys(state.guardPath);
			if (!keys.some((k) => changed.has(k))) continue;
			this.dropSubscription(state);
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			this.applySubscription(state).catch((err) =>
				streamDeck.logger.warn(
					`guarded-command: selector re-subscribe failed for ${state.guardPath}`,
					err,
				),
			);
		}
	}
}

function parseSettings(s: GuardedCommandSettings): ParsedSettings {
	const longMode: LongPressMode =
		s.longPressMode === "activate"
			? "activate"
			: s.longPressMode === "autoRepeat"
				? "autoRepeat"
				: "hold";
	return {
		shortPath: trimString(s.shortPressCommand),
		longPath: trimString(s.longPressCommand),
		longMode,
		guardPath: trimString(s.guardDataRef),
		valueLocked: toFiniteNumber(s.valueLocked) ?? 0,
		valueUnlocked: toFiniteNumber(s.valueUnlocked) ?? 1,
		strictOnMatch: s.strictOnMatch === true,
		hideShortConfirmation: s.hideShortConfirmation === true,
	};
}

function mapValueToStateIndex(
	value: DataRefValue,
	valueLocked: number,
	valueUnlocked: number,
	strictOnMatch: boolean,
): typeof STATE_LOCKED | typeof STATE_UNLOCKED {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_LOCKED;
	if (strictOnMatch) {
		return Math.abs(num - valueUnlocked) < TOLERANCE_FLOAT ? STATE_UNLOCKED : STATE_LOCKED;
	}
	if (valueLocked === 0 && valueUnlocked === 1) {
		return num >= 0.5 ? STATE_UNLOCKED : STATE_LOCKED;
	}
	const dLocked = Math.abs(num - valueLocked);
	const dUnlocked = Math.abs(num - valueUnlocked);
	return dUnlocked < dLocked ? STATE_UNLOCKED : STATE_LOCKED;
}
