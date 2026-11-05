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
import { coerceNumber, describeValue, toFiniteNumber } from "../util/coerce";
import {
	type Condition,
	type ConditionSettings,
	parseCondition,
	pressBlocked,
} from "../util/condition";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { type EnumMap, parseEnumMap } from "../util/enum";
import { clearTile, setNotFound, setOffline } from "../util/error-tile";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { trimString } from "../util/settings";
import {
	renderSwitchStateSvg,
	type SwitchBodyColor,
	type SwitchLabelPosition,
	type SwitchOrientation,
	type SwitchTilePosition,
	svgToDataUrl,
} from "../util/switch-image";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type DataRefSwitchSettings = JsonObject &
	ConditionSettings & {
		datarefPath?: string;
		minValue?: string | number;
		maxValue?: string | number;
		step?: string | number;
		labels?: string;
		hideShortConfirmation?: boolean;
		hideEndstopAlert?: boolean;
		staticLabel?: string;
		staticLabelPosition?: SwitchLabelPosition;
		orientation?: SwitchOrientation;
		invertDirection?: boolean;
		bodyColor?: SwitchBodyColor;
	};

const STATE_MIN = 0;
const STATE_MID = 1;
const STATE_MAX = 2;
const STATE_DIRTY = -1;

interface ParsedSettings {
	path: string;
	minValue: number;
	maxValue: number;
	step: number;
	labelsRaw: string;
	hideShortConfirmation: boolean;
	hideEndstopAlert: boolean;
	staticLabel: string;
	staticLabelPosition: SwitchLabelPosition;
	orientation: SwitchOrientation;
	invertDirection: boolean;
	bodyColor: SwitchBodyColor;
	condition?: Condition;
}

interface ActionState {
	action: KeyAction<DataRefSwitchSettings>;
	path: string;
	minValue: number;
	maxValue: number;
	step: number;
	labelsRaw: string;
	labels: EnumMap;
	staticLabel: string;
	staticLabelPosition: SwitchLabelPosition;
	orientation: SwitchOrientation;
	invertDirection: boolean;
	bodyColor: SwitchBodyColor;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;
	renderPromise?: Promise<void>;
}

@action({ UUID: "com.robertw.xplane.dataref-switch" })
export class XPlaneDataRefSwitch extends SingletonAction<DataRefSwitchSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<DataRefSwitchSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			path: parsed.path,
			minValue: parsed.minValue,
			maxValue: parsed.maxValue,
			step: parsed.step,
			labelsRaw: parsed.labelsRaw,
			labels: parseEnumMap(parsed.labelsRaw),
			staticLabel: parsed.staticLabel,
			staticLabelPosition: parsed.staticLabelPosition,
			orientation: parsed.orientation,
			invertDirection: parsed.invertDirection,
			bodyColor: parsed.bodyColor,
			currentState: STATE_DIRTY,
			longPressFired: false,
		};
		this.states.set(ev.action.id, state);
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DataRefSwitchSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<DataRefSwitchSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;

		state.minValue = parsed.minValue;
		state.maxValue = parsed.maxValue;
		state.step = parsed.step;
		if (parsed.labelsRaw !== state.labelsRaw) {
			state.labelsRaw = parsed.labelsRaw;
			state.labels = parseEnumMap(parsed.labelsRaw);
		}
		state.staticLabel = parsed.staticLabel;
		state.staticLabelPosition = parsed.staticLabelPosition;
		state.orientation = parsed.orientation;
		state.invertDirection = parsed.invertDirection;
		state.bodyColor = parsed.bodyColor;

		if (pathChanged) {
			this.dropSubscription(state);
			state.path = parsed.path;
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			await this.applySubscription(state);
			return;
		}

		state.currentState = STATE_DIRTY;
		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	override onKeyDown(ev: KeyDownEvent<DataRefSwitchSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.path) {
			streamDeck.logger.warn("dataref-switch: datarefPath is empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("dataref-switch: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		state.longPressFired = false;

		state.longPressTimer = setTimeout(() => {
			this.fireStep(state, parsed, "long").catch((err) =>
				streamDeck.logger.error("dataref-switch: long press failed", err),
			);
		}, TIMINGS.LONG_PRESS_THRESHOLD_MS);

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<DataRefSwitchSettings>): Promise<void> {
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
		if (!parsed.path) {
			await state.action.showAlert();
			return;
		}

		try {
			const resolvedPath = substitutePlaceholders(parsed.path, selectors.snapshot());
			const { basePath, index } = parseDataRefPath(resolvedPath);
			const drId = await this.xplane.getDataRefId(basePath);
			const currentRaw =
				state.lastValue !== undefined
					? state.lastValue
					: applyIndex(await this.xplane.readDataRef(drId), index);
			const current = coerceNumber(currentRaw) ?? 0;
			// Normally short = +step (toward Max), long = -step (toward Min).
			// With invertDirection, both arrows flip (e.g. AW109 fuel xfeed is
			// wired with +1 visually up, -1 visually down — opposite to most
			// switches, so the user wants short press to drive toward Min).
			const directionMul = parsed.invertDirection ? -1 : 1;
			const stepSigned = (kind === "short" ? 1 : -1) * directionMul * parsed.step;
			const target = Math.max(
				parsed.minValue,
				Math.min(parsed.maxValue, current + stepSigned),
			);

			if (Math.abs(target - current) < TOLERANCE_FLOAT) {
				streamDeck.logger.info(
					`dataref-switch: ${kind} press at endstop for ${parsed.path} (value=${current})`,
				);
				if (!parsed.hideEndstopAlert) await state.action.showAlert();
				return;
			}

			const blocked = await pressBlocked(
				this.xplane,
				state.action,
				parsed.condition,
				target > current ? "on" : "off",
				"dataref-switch",
			);
			if (blocked) return;

			await this.xplane.writeDataRef(drId, target, index);
			streamDeck.logger.info(
				`dataref-switch: ${kind} step ${parsed.path} ${current} → ${target}`,
			);
			state.lastValue = target;
			await this.renderState(state, target);
			if (kind === "short" && !parsed.hideShortConfirmation) {
				await state.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`dataref-switch: ${kind} step failed`, err);
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
		if (!state.path) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const resolved = substitutePlaceholders(state.path, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, index);
				} catch (err) {
					streamDeck.logger.warn(
						`dataref-switch: index apply failed for ${state.path}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("dataref-switch: setNotFound failed", e),
					);
					return;
				}
				const prev = state.lastValue;
				state.lastValue = value;
				if (!sameValue(prev, value)) {
					streamDeck.logger.info(
						`dataref-switch: subscribe ${state.path} = ${describeValue(value)}`,
					);
				}
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("dataref-switch: render failed", err),
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
					`dataref-switch: initial read failed for ${state.path}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`dataref-switch: subscribe failed for ${state.path}`, err);
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
		const target = mapValueToStateIndex(value, state.minValue, state.maxValue, state.step);
		// Only override the title when the user explicitly configured a labels
		// map — otherwise leave Stream Deck's native title editor in charge.
		const hasCustomLabels = state.labels.enumValid && state.labels.enumLut.size > 0;
		const titleText: string | undefined = hasCustomLabels
			? renderTitle(value, state.labels)
			: undefined;
		// We render the switch tile ourselves when:
		// - the user set a static label (need to bake it into the image), OR
		// - the orientation is horizontal (manifest defaults are vertical only), OR
		// - the user wants the visual inverted (manifest defaults don't carry
		//   the swap, e.g. AW109 cargo light DataRef is wired inverted), OR
		// - the user picked a non-default body color (defaults are gray only).
		// Otherwise let Stream Deck show the manifest default / user-picker image.
		const hasStaticLabel = state.staticLabel.length > 0;
		const isHorizontal = state.orientation === "horizontal";
		const invert = state.invertDirection;
		const isColored = state.bodyColor !== "gray";
		const visualTarget =
			invert && target === STATE_MIN
				? STATE_MAX
				: invert && target === STATE_MAX
					? STATE_MIN
					: target;
		const svgPosition: SwitchTilePosition =
			visualTarget === STATE_MIN ? "min" : visualTarget === STATE_MAX ? "max" : "mid";
		const renderCustom = hasStaticLabel || isHorizontal || invert || isColored;
		const customImage: string | undefined = renderCustom
			? svgToDataUrl(
					renderSwitchStateSvg(
						svgPosition,
						state.orientation,
						state.staticLabel,
						state.staticLabelPosition,
						state.bodyColor,
					),
				)
			: undefined;
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				const stateChanged = target !== state.currentState;
				if (!stateChanged) {
					if (titleText !== undefined) await state.action.setTitle(titleText);
					return;
				}
				streamDeck.logger.info(
					`dataref-switch: setState ${target} for ${state.path} (value=${describeValue(value)}, min=${state.minValue}, max=${state.maxValue}, step=${state.step})`,
				);
				await clearTile(state.action);
				await state.action.setState(target);
				if (customImage !== undefined) {
					await state.action.setImage(customImage);
				} else {
					// Clear any previous plugin-rendered override so the
					// Stream Deck native state image shows through.
					await state.action.setImage(undefined);
				}
				if (titleText !== undefined) {
					await state.action.setTitle(titleText);
				} else {
					await state.action.setTitle(undefined);
				}
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.cancelLongPressTimer(state);
			if (!state.path) continue;
			this.dropSubscription(state);
			state.currentState = STATE_DIRTY;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("dataref-switch: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.path && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`dataref-switch: re-subscribe failed for ${state.path}`,
						err,
					),
				);
			}
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			const keys = extractPlaceholderKeys(state.path);
			if (!keys.some((k) => changed.has(k))) continue;
			this.dropSubscription(state);
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			this.applySubscription(state).catch((err) =>
				streamDeck.logger.warn(
					`dataref-switch: selector re-subscribe failed for ${state.path}`,
					err,
				),
			);
		}
	}
}

function parseSettings(s: DataRefSwitchSettings): ParsedSettings {
	const minValue = toFiniteNumber(s.minValue) ?? -1;
	const maxValue = toFiniteNumber(s.maxValue) ?? 1;
	const stepRaw = toFiniteNumber(s.step) ?? 1;
	// A non-positive step would loop or invert direction — guard against it.
	const step = stepRaw > 0 ? stepRaw : 1;
	const staticLabelPosition: SwitchLabelPosition =
		s.staticLabelPosition === "bottom" ? "bottom" : "top";
	const orientation: SwitchOrientation =
		s.orientation === "horizontal" ? "horizontal" : "vertical";
	const bodyColor: SwitchBodyColor =
		s.bodyColor === "red" ? "red" : s.bodyColor === "green" ? "green" : "gray";
	return {
		path: trimString(s.datarefPath),
		minValue,
		maxValue,
		step,
		labelsRaw: typeof s.labels === "string" ? s.labels : "",
		hideShortConfirmation: s.hideShortConfirmation === true,
		hideEndstopAlert: s.hideEndstopAlert === true,
		staticLabel: trimString(s.staticLabel),
		staticLabelPosition,
		orientation,
		invertDirection: s.invertDirection === true,
		bodyColor,
		condition: parseCondition(s),
	};
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
	minValue: number,
	maxValue: number,
	step: number,
): typeof STATE_MIN | typeof STATE_MID | typeof STATE_MAX {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_MID;
	const halfStep = step / 2;
	if (num <= minValue + halfStep) return STATE_MIN;
	if (num >= maxValue - halfStep) return STATE_MAX;
	return STATE_MID;
}

function renderTitle(value: DataRefValue, labels: EnumMap): string {
	const num = coerceNumber(value);
	if (num !== undefined && labels.enumValid && labels.enumLut.size > 0) {
		const key = Math.round(num);
		if (Math.abs(num - key) < TOLERANCE_FLOAT) {
			const label = labels.enumLut.get(key);
			if (label !== undefined) return label;
		}
	}
	if (num === undefined) return describeValue(value);
	if (Number.isInteger(num)) return String(num);
	return num.toFixed(2);
}
