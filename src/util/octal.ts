/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

/** Squawk-style codes stored as decimal-looking ints with base-8 digits (0000–7777). */

const PLACES = 4;
const MOD = 8 ** PLACES;

function toOrdinal(code: number): number {
	let rest = Math.abs(Math.trunc(code));
	let ordinal = 0;
	const digits: number[] = [];
	for (let i = 0; i < PLACES; i++) {
		digits.push(Math.min(7, rest % 10));
		rest = Math.floor(rest / 10);
	}
	for (let i = PLACES - 1; i >= 0; i--) ordinal = ordinal * 8 + digits[i];
	return ordinal;
}

function fromOrdinal(ordinal: number): number {
	let n = ((Math.trunc(ordinal) % MOD) + MOD) % MOD;
	let code = 0;
	let place = 1;
	for (let i = 0; i < PLACES; i++) {
		code += (n % 8) * place;
		n = Math.floor(n / 8);
		place *= 10;
	}
	return code;
}

/** Step a squawk-like code in octal space (1207+1 → 1210). Optional XP-style min/max. */
export function stepOctalCode(code: number, steps: number, min?: number, max?: number): number {
	let ordinal = toOrdinal(code) + Math.trunc(steps);
	if (min !== undefined) ordinal = Math.max(ordinal, toOrdinal(min));
	if (max !== undefined) ordinal = Math.min(ordinal, toOrdinal(max));
	return fromOrdinal(ordinal);
}
