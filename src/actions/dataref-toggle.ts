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

import { TOLERANCE_FLOAT } from "../const";
import { selectors } from "../selectors/registry";
import { coerceNumber, describeValue, toFiniteNumber } from "../util/coerce";
import {
	type Condition,
	type ConditionSettings,
	parseCondition,
	pressBlocked,
} from "../util/condition";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearTile, setNotFound, setOffline } from "../util/error-tile";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { trimString } from "../util/settings";
import {
	renderToggleStateSvg,
	svgToDataUrl,
	type ToggleBodyColor,
	type ToggleLabelPosition,
	type ToggleOrientation,
} from "../util/toggle-image";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type TriggerMode = "write" | "command" | "command-on-off";

type DataRefToggleSettings = JsonObject &
	ConditionSettings & {
		datarefPath?: string;
		stateDataRefPath?: string;
		valueOff?: string | number;
		valueOn?: string | number;
		triggerMode?: TriggerMode;
		commandPath?: string;
		commandOnPath?: string;
		commandOffPath?: string;
		strictOnMatch?: boolean;
		holdMode?: boolean;
		staticLabel?: string;
		staticLabelPosition?: ToggleLabelPosition;
		orientation?: ToggleOrientation;
		bodyColor?: ToggleBodyColor;
		invert?: boolean;
	};

const STATE_OFF = 0;
const STATE_ON = 1;

interface ParsedSettings {
	path: string;
	statePath: string;
	valueOff: number;
	valueOn: number;
	triggerMode: TriggerMode;
	commandPath: string;
	commandOnPath: string;
	commandOffPath: string;
	strictOnMatch: boolean;
	holdMode: boolean;
	staticLabel: string;
	staticLabelPosition: ToggleLabelPosition;
	orientation: ToggleOrientation;
	bodyColor: ToggleBodyColor;
	invert: boolean;
	condition?: Condition;
}

interface ActionState {
	action: KeyAction<DataRefToggleSettings>;
	// Write target — set/written on key down/up.
	path: string;
	// Read source — subscribed for visual state. Equals `path` when the PI
	// leaves "State DataRef Path" blank (back-compat); differs when a panel
	// indicator and its press target are separate DataRefs.
	statePath: string;
	valueOff: number;
	valueOn: number;
	triggerMode: TriggerMode;
	commandPath: string;
	commandOnPath: string;
	commandOffPath: string;
	strictOnMatch: boolean;
	staticLabel: string;
	staticLabelPosition: ToggleLabelPosition;
	orientation: ToggleOrientation;
	bodyColor: ToggleBodyColor;
	invert: boolean;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
	// Guards against a second keyDown firing while the previous toggle is
	// still in flight — without it, a fast double-click reads the same stale
	// subscription cache twice and sends the same command twice.
	inflightKeyDown: boolean;
	// A hold press rejected by the condition must not write valueOff on release.
	holdBlocked?: boolean;
	// Serializes overlapping renderState() calls so setState from an earlier
	// update can't interleave with a newer one.
	renderPromise?: Promise<void>;
}

const STATE_DIRTY = -1;

@action({ UUID: "com.robertw.xplane.dataref-toggle" })
export class XPlaneDataRefToggle extends SingletonAction<DataRefToggleSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<DataRefToggleSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			path: parsed.path,
			statePath: parsed.statePath,
			valueOff: parsed.valueOff,
			valueOn: parsed.valueOn,
			triggerMode: parsed.triggerMode,
			commandPath: parsed.commandPath,
			commandOnPath: parsed.commandOnPath,
			commandOffPath: parsed.commandOffPath,
			strictOnMatch: parsed.strictOnMatch,
			staticLabel: parsed.staticLabel,
			staticLabelPosition: parsed.staticLabelPosition,
			orientation: parsed.orientation,
			bodyColor: parsed.bodyColor,
			invert: parsed.invert,
			currentState: STATE_DIRTY,
			inflightKeyDown: false,
		};
		this.states.set(ev.action.id, state);
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DataRefToggleSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<DataRefToggleSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const statePathChanged = parsed.statePath !== state.statePath;

		state.path = parsed.path;
		state.valueOff = parsed.valueOff;
		state.valueOn = parsed.valueOn;
		state.triggerMode = parsed.triggerMode;
		state.commandPath = parsed.commandPath;
		state.commandOnPath = parsed.commandOnPath;
		state.commandOffPath = parsed.commandOffPath;
		state.strictOnMatch = parsed.strictOnMatch;
		state.staticLabel = parsed.staticLabel;
		state.staticLabelPosition = parsed.staticLabelPosition;
		state.orientation = parsed.orientation;
		state.bodyColor = parsed.bodyColor;
		state.invert = parsed.invert;

		if (statePathChanged) {
			this.dropSubscription(state);
			state.statePath = parsed.statePath;
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			await this.applySubscription(state);
			return;
		}

		// Force a re-render so changed off/on thresholds take effect immediately.
		state.currentState = STATE_DIRTY;
		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<DataRefToggleSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.path) {
			streamDeck.logger.warn("dataref-toggle: datarefPath is empty");
			await ev.action.showAlert();
			return;
		}

		const snap = selectors.snapshot();
		const writePath = substitutePlaceholders(parsed.path, snap);

		// Hold mode bypasses toggle/command machinery: write valueOn on press;
		// the matching valueOff happens in onKeyUp. triggerMode and
		// strictOnMatch are ignored here.
		if (parsed.holdMode) {
			const blocked = await pressBlocked(
				this.xplane,
				ev.action,
				parsed.condition,
				"on",
				"dataref-toggle",
			);
			if (state) state.holdBlocked = blocked;
			if (blocked) return;
			try {
				const { basePath, index } = parseDataRefPath(writePath);
				const drId = await this.xplane.getDataRefId(basePath);
				await this.xplane.writeDataRef(drId, parsed.valueOn, index);
				streamDeck.logger.info(
					`dataref-toggle: hold press ${writePath} = ${parsed.valueOn} (id=${drId})`,
				);
				if (state) {
					state.lastValue = parsed.valueOn;
					await this.renderState(state, parsed.valueOn);
				}
			} catch (err) {
				streamDeck.logger.error("dataref-toggle hold press failed", err);
				await ev.action.showAlert();
			}
			return;
		}

		if (state?.inflightKeyDown) {
			streamDeck.logger.info(
				`dataref-toggle: ignoring keyDown while previous toggle is in flight for ${parsed.path}`,
			);
			await ev.action.showAlert();
			return;
		}
		if (state) state.inflightKeyDown = true;

		try {
			if (parsed.triggerMode === "command") {
				if (!parsed.commandPath) {
					streamDeck.logger.warn("dataref-toggle: commandPath is empty in command mode");
					await ev.action.showAlert();
					return;
				}
				// Scope "both" needs no direction, so skip the state lookup then.
				const isOn =
					parsed.condition && parsed.condition.scope !== "both"
						? await this.readIsOn(state, parsed)
						: false;
				if (await this.isBlocked(ev.action, parsed, isOn)) return;
				const commandPath = substitutePlaceholders(parsed.commandPath, snap);
				const cmdId = await this.xplane.getCommandId(commandPath);
				await this.xplane.activateCommand(cmdId);
				streamDeck.logger.info(
					`dataref-toggle: command activate ${commandPath} (id=${cmdId})`,
				);
				// No optimistic update — for a generic command we cannot predict
				// the resulting DataRef value, so we wait for the WS update.
			} else if (parsed.triggerMode === "command-on-off") {
				const { basePath, index } = parseDataRefPath(writePath);
				const drId = await this.xplane.getDataRefId(basePath);
				const current =
					state?.lastValue !== undefined
						? state.lastValue
						: applyIndex(await this.xplane.readDataRef(drId), index);
				const isOn =
					mapValueToStateIndex(
						current,
						parsed.valueOff,
						parsed.valueOn,
						parsed.strictOnMatch,
					) === STATE_ON;
				if (await this.isBlocked(ev.action, parsed, isOn)) return;
				const rawTargetPath = isOn ? parsed.commandOffPath : parsed.commandOnPath;
				if (!rawTargetPath) {
					streamDeck.logger.warn(
						`dataref-toggle: ${isOn ? "commandOffPath" : "commandOnPath"} is empty in on-off command mode`,
					);
					await ev.action.showAlert();
					return;
				}
				const targetPath = substitutePlaceholders(rawTargetPath, snap);
				const cmdId = await this.xplane.getCommandId(targetPath);
				await this.xplane.activateCommand(cmdId);
				streamDeck.logger.info(
					`dataref-toggle: on-off command activate ${targetPath} (id=${cmdId}, isOn=${isOn})`,
				);
				if (state) {
					const target = isOn ? parsed.valueOff : parsed.valueOn;
					state.lastValue = target;
					await this.renderState(state, target);
				}
			} else {
				const { basePath, index } = parseDataRefPath(writePath);
				const drId = await this.xplane.getDataRefId(basePath);
				const current =
					state?.lastValue !== undefined
						? state.lastValue
						: applyIndex(await this.xplane.readDataRef(drId), index);
				const isOn =
					mapValueToStateIndex(
						current,
						parsed.valueOff,
						parsed.valueOn,
						parsed.strictOnMatch,
					) === STATE_ON;
				if (await this.isBlocked(ev.action, parsed, isOn)) return;
				const target = isOn ? parsed.valueOff : parsed.valueOn;
				await this.xplane.writeDataRef(drId, target, index);
				streamDeck.logger.info(
					`dataref-toggle: write ${writePath} = ${target} (id=${drId})`,
				);
				if (state) {
					state.lastValue = target;
					await this.renderState(state, target);
				}
			}
		} catch (err) {
			streamDeck.logger.error("dataref-toggle keyDown failed", err);
			await ev.action.showAlert();
		} finally {
			if (state) state.inflightKeyDown = false;
		}
	}

	override async onKeyUp(ev: KeyUpEvent<DataRefToggleSettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		if (!parsed.holdMode || !parsed.path) return;

		const state = this.states.get(ev.action.id);
		if (state?.holdBlocked) {
			state.holdBlocked = false;
			return;
		}
		const writePath = substitutePlaceholders(parsed.path, selectors.snapshot());
		try {
			const { basePath, index } = parseDataRefPath(writePath);
			const drId = await this.xplane.getDataRefId(basePath);
			await this.xplane.writeDataRef(drId, parsed.valueOff, index);
			streamDeck.logger.info(
				`dataref-toggle: hold release ${writePath} = ${parsed.valueOff} (id=${drId})`,
			);
			if (state) {
				state.lastValue = parsed.valueOff;
				await this.renderState(state, parsed.valueOff);
			}
		} catch (err) {
			streamDeck.logger.error("dataref-toggle hold release failed", err);
			await ev.action.showAlert();
		}
	}

	private isBlocked(
		action: KeyAction<DataRefToggleSettings>,
		parsed: ParsedSettings,
		isOn: boolean,
	): Promise<boolean> {
		return pressBlocked(
			this.xplane,
			action,
			parsed.condition,
			isOn ? "off" : "on",
			"dataref-toggle",
		);
	}

	private async readIsOn(
		state: ActionState | undefined,
		parsed: ParsedSettings,
	): Promise<boolean> {
		let current = state?.lastValue;
		if (current === undefined) {
			const resolved = substitutePlaceholders(parsed.statePath, selectors.snapshot());
			const { basePath, index } = parseDataRefPath(resolved);
			const id = await this.xplane.getDataRefId(basePath);
			current = applyIndex(await this.xplane.readDataRef(id), index);
		}
		return (
			mapValueToStateIndex(current, parsed.valueOff, parsed.valueOn, parsed.strictOnMatch) ===
			STATE_ON
		);
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.statePath) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const resolved = substitutePlaceholders(state.statePath, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, index);
				} catch (err) {
					streamDeck.logger.warn(
						`dataref-toggle: index apply failed for ${state.statePath}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("dataref-toggle: setNotFound failed", e),
					);
					return;
				}
				const prev = state.lastValue;
				state.lastValue = value;
				if (!sameValue(prev, value)) {
					streamDeck.logger.info(
						`dataref-toggle: subscribe ${state.statePath} = ${describeValue(value)}`,
					);
				}
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("dataref-toggle: render failed", err),
				);
			});

			// Seed the visible state immediately via REST so the first frame is
			// correct even before the subscription delivers its first update.
			// Skip if the WS subscription has already delivered a value — that
			// is the fresher source of truth and must not be clobbered by a
			// stale REST read that started before the WS update arrived.
			try {
				const id = await this.xplane.getDataRefId(basePath);
				const initial = applyIndex(await this.xplane.readDataRef(id), index);
				if (state.lastValue === undefined) {
					state.lastValue = initial;
					await this.renderState(state, initial);
				}
			} catch (err) {
				streamDeck.logger.warn(
					`dataref-toggle: initial read failed for ${state.statePath}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`dataref-toggle: subscribe failed for ${state.statePath}`, err);
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
			state.valueOff,
			state.valueOn,
			state.strictOnMatch,
		);
		// Bake our own tile when the user picked a non-default look: vertical
		// orientation, a body color, or a static label. Horizontal + gray + no
		// label needs no override — the manifest default state image already is
		// exactly that. A baked tile overrides the manifest/native image but NOT
		// a user-uploaded one (those take precedence over setImage), so users get
		// color / orientation / label without having to upload custom images.
		const renderCustom =
			state.staticLabel.length > 0 ||
			state.orientation === "vertical" ||
			state.bodyColor !== "gray" ||
			state.invert;
		// invert flips only the visual (handle position / lit track), not the
		// logical state — for DataRefs wired the opposite way (e.g. a "closed"
		// value that should read as OFF).
		const isOn = target === STATE_ON;
		const visualOn = state.invert ? !isOn : isOn;
		const customImage: string | undefined = renderCustom
			? svgToDataUrl(
					renderToggleStateSvg(
						visualOn ? "on" : "off",
						state.staticLabel,
						state.staticLabelPosition,
						state.orientation,
						state.bodyColor,
					),
				)
			: undefined;
		// Chain off any in-flight render so setState from an earlier update
		// can't interleave with this one. Use a swallowing catch so a prior
		// failure doesn't block subsequent renders.
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				if (target === state.currentState) return;
				streamDeck.logger.info(
					`dataref-toggle: setState ${target} for ${state.statePath} (value=${describeValue(value)}, off=${state.valueOff}, on=${state.valueOn}, strict=${state.strictOnMatch})`,
				);
				// Once we have valid data, drop any disconnected/not-found overlay.
				await clearTile(state.action);
				await state.action.setState(target);
				if (customImage !== undefined) {
					await state.action.setImage(customImage);
				} else {
					// Clear any previous plugin-rendered override so the
					// Stream Deck native state image shows through.
					await state.action.setImage(undefined);
				}
				// Only commit currentState after the hardware confirms — keeps the
				// early-exit guard above honest if a follow-up render races.
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			if (!state.statePath) continue;
			// Drop the (already-broken) subscription so the next "online" cleanly
			// re-subscribes, and force renderState to re-push state+image on
			// the next live update so the offline placeholder gets replaced.
			this.dropSubscription(state);
			state.currentState = STATE_DIRTY;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("dataref-toggle: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.statePath && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`dataref-toggle: re-subscribe failed for ${state.statePath}`,
						err,
					),
				);
			}
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.statePath) continue;
			const keys = extractPlaceholderKeys(state.statePath);
			if (!keys.some((k) => changed.has(k))) continue;
			this.dropSubscription(state);
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			this.applySubscription(state).catch((err) =>
				streamDeck.logger.warn(
					`dataref-toggle: selector re-subscribe failed for ${state.statePath}`,
					err,
				),
			);
		}
	}
}

function parseSettings(s: DataRefToggleSettings): ParsedSettings {
	const triggerMode: TriggerMode =
		s.triggerMode === "command"
			? "command"
			: s.triggerMode === "command-on-off"
				? "command-on-off"
				: "write";
	const path = trimString(s.datarefPath);
	const stateOverride = trimString(s.stateDataRefPath);
	return {
		path,
		statePath: stateOverride || path,
		valueOff: toFiniteNumber(s.valueOff) ?? 0,
		valueOn: toFiniteNumber(s.valueOn) ?? 1,
		triggerMode,
		commandPath: trimString(s.commandPath),
		commandOnPath: trimString(s.commandOnPath),
		commandOffPath: trimString(s.commandOffPath),
		strictOnMatch: s.strictOnMatch === true,
		holdMode: s.holdMode === true,
		staticLabel: trimString(s.staticLabel),
		staticLabelPosition: s.staticLabelPosition === "bottom" ? "bottom" : "top",
		orientation: s.orientation === "vertical" ? "vertical" : "horizontal",
		bodyColor: parseBodyColor(s.bodyColor),
		invert: s.invert === true,
		condition: parseCondition(s),
	};
}

function parseBodyColor(v: unknown): ToggleBodyColor {
	switch (v) {
		case "red":
		case "green":
		case "white":
		case "blue":
			return v;
		default:
			return "gray";
	}
}

function sameValue(a: DataRefValue | undefined, b: DataRefValue): boolean {
	if (a === undefined) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}
	return a === b;
}

function mapValueToStateIndex(
	value: DataRefValue,
	valueOff: number,
	valueOn: number,
	strictOnMatch: boolean,
): typeof STATE_OFF | typeof STATE_ON {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_OFF;
	if (strictOnMatch) {
		// Tolerance to absorb X-Plane occasionally returning integer modes as
		// floats (e.g. 3.0). Harmless for clean integers.
		return Math.abs(num - valueOn) < TOLERANCE_FLOAT ? STATE_ON : STATE_OFF;
	}
	if (valueOff === 0 && valueOn === 1) {
		return num >= 0.5 ? STATE_ON : STATE_OFF;
	}
	const dOff = Math.abs(num - valueOff);
	const dOn = Math.abs(num - valueOn);
	return dOn < dOff ? STATE_ON : STATE_OFF;
}
