/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

/**
 * Manual smoke test for src/util/condition.ts. Run with: `npm run smoke:condition`.
 * Exits with a non-zero status if any case fails.
 */

import {
	appliesTo,
	type Condition,
	type ConditionOperator,
	compareValue,
	parseCondition,
	pressBlocked,
} from "../src/util/condition";
import type { DataRefValue, XPlaneClient } from "../src/xplane";

const compareCases: [DataRefValue, ConditionOperator, number, boolean][] = [
	[2, "eq", 2, true],
	[2.0000001, "eq", 2, true],
	[1, "eq", 2, false],
	[1, "ne", 2, true],
	[2, "ne", 2, false],
	[3, "gt", 2, true],
	[2, "gt", 2, false],
	[2.0000001, "gt", 2, false],
	[2, "ge", 2, true],
	[1.9999999, "ge", 2, true],
	[1, "ge", 2, false],
	[1, "lt", 2, true],
	[2, "lt", 2, false],
	[2, "le", 2, true],
	[3, "le", 2, false],
	[true, "eq", 1, true],
	["2", "eq", 2, true],
	[[2, 5], "eq", 2, true],
	["abc", "ne", 2, false],
	[[], "eq", 0, false],
];

const parsed = (s: Parameters<typeof parseCondition>[0]): Condition | undefined =>
	parseCondition(s);

const base = { path: "a/b[0]", operator: "eq", expected: 2, scope: "both", hideAlert: false };

const checks: [string, unknown, unknown][] = [
	["no settings → off", parsed({}), undefined],
	["blank path → off", parsed({ conditionDataRef: "  ", conditionValue: 2 }), undefined],
	["defaults", parsed({ conditionDataRef: " a/b[0] ", conditionValue: "2" }), base],
	[
		"invalid operator and scope fall back",
		parsed({
			conditionDataRef: "a/b[0]",
			conditionValue: 2,
			conditionOperator: "constructor" as ConditionOperator,
			conditionScope: "x" as "on",
		}),
		base,
	],
	[
		"explicit fields",
		parsed({
			conditionDataRef: "a/b[0]",
			conditionValue: 2,
			conditionOperator: "le",
			conditionScope: "off",
		}),
		{ ...base, operator: "le", scope: "off" },
	],
	[
		"empty value stays undefined",
		parsed({ conditionDataRef: "a/b[0]", conditionValue: "" }),
		{ ...base, expected: undefined },
	],
	["scope both / on", appliesTo({ ...base, scope: "both" } as Condition, "on"), true],
	["scope both / off", appliesTo({ ...base, scope: "both" } as Condition, "off"), true],
	["scope on / on", appliesTo({ ...base, scope: "on" } as Condition, "on"), true],
	["scope on / off", appliesTo({ ...base, scope: "on" } as Condition, "off"), false],
	[
		"hide alert opt-in",
		parsed({ conditionDataRef: "a/b[0]", conditionValue: 2, hideConditionAlert: true }),
		{ ...base, hideAlert: true },
	],
	["scope off / on", appliesTo({ ...base, scope: "off" } as Condition, "on"), false],
];

let failed = 0;
for (const [value, operator, expected, result] of compareCases) {
	const actual = compareValue(value, operator, expected);
	if (actual !== result) {
		console.log(`[FAIL] ${JSON.stringify(value)} ${operator} ${expected} → ${actual}`);
		failed++;
	}
}
for (const [name, actual, expected] of checks) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		console.log(`[FAIL] ${name} → ${JSON.stringify(actual)}`);
		failed++;
	}
}

const fakeClient = (value: DataRefValue | Error): XPlaneClient =>
	({
		getDataRefId: async () => 1,
		readDataRef: async () => {
			if (value instanceof Error) throw value;
			return value;
		},
	}) as unknown as XPlaneClient;

const cond = (over: Partial<Condition>): Condition => ({ ...(base as Condition), ...over });

const blockCases: [string, DataRefValue | Error, Condition | undefined, boolean, number?][] = [
	["no condition", 0, undefined, false],
	["met", [2, 0], cond({}), false],
	["not met", [1, 0], cond({}), true],
	["other direction not checked", [1, 0], cond({ scope: "off" }), false],
	["read failure blocks", new Error("offline"), cond({}), true],
	["scalar with index blocks", 2, cond({}), true],
	["missing value blocks", [2, 0], cond({ expected: undefined }), true],
	["hidden: not met is silent", [1, 0], cond({ hideAlert: true }), true, 0],
	["hidden: read failure alerts", new Error("offline"), cond({ hideAlert: true }), true, 1],
	[
		"hidden: missing value alerts",
		[2, 0],
		cond({ expected: undefined, hideAlert: true }),
		true,
		1,
	],
];

for (const [name, value, condition, expected, expectedAlerts] of blockCases) {
	let alerts = 0;
	const action = {
		showAlert: async () => {
			alerts++;
		},
	};
	const actual = await pressBlocked(fakeClient(value), action, condition, "on", "smoke");
	if (actual !== expected || alerts !== (expectedAlerts ?? (expected ? 1 : 0))) {
		console.log(`[FAIL] ${name} → blocked=${actual}, alerts=${alerts}`);
		failed++;
	}
}

if (failed > 0) {
	console.error(`\n${failed} case(s) failed`);
	process.exit(1);
}
console.log(`\nAll ${compareCases.length + checks.length + blockCases.length} cases passed`);
