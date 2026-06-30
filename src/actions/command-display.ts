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
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { toFiniteNumber } from "../util/coerce";
import { combineTitle } from "../util/error-tile";
import { formatDataRefValue, type ValueMode } from "../util/format";
import { normalizeFormat, resolveZeroSnap, trimString } from "../util/settings";
import type { XPlaneClient } from "../xplane";
import { SubscribableAction, type SubscribableState } from "./base/subscribable-action";

type CommandDisplaySettings = JsonObject & {
	commandPath?: string;
	hideConfirmation?: boolean;
	datarefPath?: string;
	label?: string;
	format?: string;
	unitScale?: string | number;
	precision?: string | number;
	valueMode?: ValueMode;
	snapZero?: boolean;
	zeroThreshold?: string | number;
};

interface ActionState extends SubscribableState<CommandDisplaySettings> {
	format: string;
	unitScale?: number;
	precision?: number;
	valueMode: ValueMode;
	zeroSnap?: number;
}

@action({ UUID: "com.robertw.xplane.command-display" })
export class XPlaneCommandDisplay extends SubscribableAction<CommandDisplaySettings, ActionState> {
	constructor(xplane: XPlaneClient) {
		super(xplane, "command-display");
	}

	protected override createState(ev: WillAppearEvent<CommandDisplaySettings>): ActionState {
		const parsed = parseSettings(ev.payload.settings ?? {});
		return {
			action: ev.action,
			path: parsed.path,
			label: parsed.label,
			format: parsed.format,
			unitScale: parsed.unitScale,
			precision: parsed.precision,
			valueMode: parsed.valueMode,
			zeroSnap: parsed.zeroSnap,
		};
	}

	protected override updateStateFromSettings(
		state: ActionState,
		ev: DidReceiveSettingsEvent<CommandDisplaySettings>,
	): { pathChanged: boolean } {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;
		state.path = parsed.path;
		state.label = parsed.label;
		state.format = parsed.format;
		state.unitScale = parsed.unitScale;
		state.precision = parsed.precision;
		state.valueMode = parsed.valueMode;
		state.zeroSnap = parsed.zeroSnap;
		return { pathChanged };
	}

	protected override render(state: ActionState): void {
		if (state.lastValue === undefined) return;
		const valueText = formatDataRefValue(state.lastValue, {
			format: state.format,
			unitScale: state.unitScale,
			precision: state.precision,
			valueMode: state.valueMode,
			zeroSnap: state.zeroSnap,
		});
		state.action
			.setTitle(combineTitle(state.label, valueText))
			.catch((err) => streamDeck.logger.warn("command-display: setTitle failed", err));
	}

	override async onKeyDown(ev: KeyDownEvent<CommandDisplaySettings>): Promise<void> {
		const path = trimString(ev.payload.settings?.commandPath);
		const hideConfirmation = ev.payload.settings?.hideConfirmation === true;

		if (!path) {
			streamDeck.logger.warn("command-display: commandPath is empty");
			await ev.action.showAlert();
			return;
		}

		try {
			const id = await this.xplane.getCommandId(path);
			await this.xplane.activateCommand(id);
			streamDeck.logger.info(`command-display: activate ${path} (id=${id})`);
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`command-display: command failed: ${path}`, err);
			await ev.action.showAlert();
		}
	}
}

function parseSettings(s: CommandDisplaySettings): {
	path: string;
	label: string;
	format: string;
	unitScale?: number;
	precision?: number;
	valueMode: ValueMode;
	zeroSnap?: number;
} {
	return {
		path: trimString(s.datarefPath),
		label: trimString(s.label),
		format: normalizeFormat(s.format),
		unitScale: toFiniteNumber(s.unitScale),
		precision: toFiniteNumber(s.precision),
		valueMode: s.valueMode === "string" ? "string" : "numeric",
		zeroSnap: resolveZeroSnap(s.snapZero, s.zeroThreshold),
	};
}
