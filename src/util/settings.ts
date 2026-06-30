/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { toFiniteNumber } from "./coerce";

const DEFAULT_ZERO_SNAP = 0.1;

export function trimString(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

export function trimStringOr(v: unknown, fallback: string): string {
	const trimmed = trimString(v);
	return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeFormat(v: unknown): string {
	return trimStringOr(v, "%s");
}

export function resolveZeroSnap(enabled: unknown, threshold: unknown): number | undefined {
	if (enabled !== true) return undefined;
	const t = toFiniteNumber(threshold);
	return t !== undefined && t > 0 ? t : DEFAULT_ZERO_SNAP;
}
