/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { TOLERANCE_FLOAT } from "../const";

export type StepBounds = {
	min?: number;
	max?: number;
	/** When true and both min/max are set, wrap through the min..max grid by |step|. */
	cycle?: boolean;
};

/**
 * Apply a signed step to `current`.
 * - Default: clamp to min/max (blocked=true when already at the endstop).
 * - Cycle: walk the discrete grid min, min+|step|, … ≤ max and wrap.
 */
export function applyStep(
	current: number,
	signedStep: number,
	opts: StepBounds = {},
): { value: number; blocked: boolean } {
	const abs = Math.abs(signedStep);
	if (!(abs > 0) || !Number.isFinite(signedStep) || !Number.isFinite(current)) {
		return { value: current, blocked: true };
	}

	const { min, max, cycle } = opts;
	if (
		cycle === true &&
		min !== undefined &&
		max !== undefined &&
		Number.isFinite(min) &&
		Number.isFinite(max) &&
		max + TOLERANCE_FLOAT >= min
	) {
		const n = Math.max(0, Math.floor((max - min + TOLERANCE_FLOAT) / abs));
		let idx = Math.round((current - min) / abs);
		if (idx < 0) idx = 0;
		if (idx > n) idx = n;
		const dir = signedStep < 0 ? -1 : 1;
		const mod = n + 1;
		const next = (((idx + dir) % mod) + mod) % mod;
		return { value: min + next * abs, blocked: false };
	}

	let target = current + signedStep;
	if (min !== undefined && target < min) target = min;
	if (max !== undefined && target > max) target = max;
	return {
		value: target,
		blocked: Math.abs(target - current) < TOLERANCE_FLOAT,
	};
}
