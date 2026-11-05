/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck from "@elgato/streamdeck";

import { TOLERANCE_FLOAT } from "../const";
import { selectors } from "../selectors/registry";
import type { DataRefValue, XPlaneClient } from "../xplane";
import { coerceNumber, describeValue, toFiniteNumber } from "./coerce";
import { applyIndex, parseDataRefPath } from "./dataref-path";
import { substitutePlaceholders } from "./placeholders";
import { trimString } from "./settings";

export type ConditionOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le";
export type ConditionScope = "both" | "on" | "off";
export type ConditionDirection = "on" | "off";

export type ConditionSettings = {
	conditionDataRef?: string;
	conditionOperator?: ConditionOperator;
	conditionValue?: string | number;
	conditionScope?: ConditionScope;
};

export interface Condition {
	path: string;
	operator: ConditionOperator;
	// Undefined when the PI value is empty or invalid — the press is then
	// blocked instead of silently ignoring a half-configured condition.
	expected: number | undefined;
	scope: ConditionScope;
}

const OPERATOR_SYMBOLS: Record<ConditionOperator, string> = {
	eq: "==",
	ne: "!=",
	gt: ">",
	ge: ">=",
	lt: "<",
	le: "<=",
};

export function parseCondition(s: ConditionSettings): Condition | undefined {
	const path = trimString(s.conditionDataRef);
	if (!path) return undefined;
	const operator = s.conditionOperator;
	const scope = s.conditionScope;
	return {
		path,
		operator: operator && Object.hasOwn(OPERATOR_SYMBOLS, operator) ? operator : "eq",
		expected: toFiniteNumber(s.conditionValue),
		scope: scope === "on" || scope === "off" ? scope : "both",
	};
}

export function appliesTo(condition: Condition, direction: ConditionDirection): boolean {
	return condition.scope === "both" || condition.scope === direction;
}

export function compareValue(
	value: DataRefValue,
	operator: ConditionOperator,
	expected: number,
): boolean {
	const num = coerceNumber(value);
	if (num === undefined) return false;
	const equal = Math.abs(num - expected) < TOLERANCE_FLOAT;
	switch (operator) {
		case "eq":
			return equal;
		case "ne":
			return !equal;
		case "gt":
			return num > expected && !equal;
		case "ge":
			return num > expected || equal;
		case "lt":
			return num < expected && !equal;
		case "le":
			return num < expected || equal;
	}
}

/**
 * Returns true when the press must not be executed, after logging and showing
 * the alert. Reads the value at press time instead of subscribing, so it can't
 * act on a stale value; any read failure blocks the press.
 */
export async function pressBlocked(
	xplane: XPlaneClient,
	action: { showAlert(): Promise<void> },
	condition: Condition | undefined,
	direction: ConditionDirection,
	logTag: string,
): Promise<boolean> {
	if (!condition || !appliesTo(condition, direction)) return false;

	const { path, operator, expected } = condition;
	const rule = `${path} ${OPERATOR_SYMBOLS[operator]} ${expected}`;
	try {
		if (expected === undefined) throw new Error("condition value is empty or invalid");
		const resolved = substitutePlaceholders(path, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);
		const id = await xplane.getDataRefId(basePath);
		const value = applyIndex(await xplane.readDataRef(id), index);
		if (compareValue(value, operator, expected)) return false;
		streamDeck.logger.info(
			`${logTag}: press blocked, condition ${rule} not met (value=${describeValue(value)})`,
		);
	} catch (err) {
		streamDeck.logger.warn(`${logTag}: press blocked, condition ${rule} failed`, err);
	}
	await action.showAlert();
	return true;
}
