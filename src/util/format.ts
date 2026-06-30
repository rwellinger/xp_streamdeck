/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import type { DataRefValue } from "../xplane";

export type ValueMode = "numeric" | "string";

export interface FormatOptions {
	format?: string;
	unitScale?: number;
	precision?: number;
	valueMode?: ValueMode;
	zeroSnap?: number;
}

const DEFAULT_FORMAT = "%s";
const PRINTF_DEFAULT_FLOAT_PRECISION = 6;

const TOKEN_RE = /%(?:(\d*)(?:\.(\d+))?)?([sdif%])/g;

export function formatDataRefValue(value: DataRefValue, opts: FormatOptions = {}): string {
	const format = opts.format && opts.format.length > 0 ? opts.format : DEFAULT_FORMAT;
	const fallbackPrecision = opts.precision;
	// String mode: decode the value into a printable ASCII string before
	// feeding it through the printf pipeline. X-Plane delivers `data`-type
	// DataRefs (string DataRefs) as a number[] of byte values, zero-padded.
	const scalar = opts.valueMode === "string" ? decodeStringValue(value) : scalarOf(value);

	return format.replace(TOKEN_RE, (_match, _width, tokenPrecision, type) => {
		if (type === "%") return "%";

		const explicitPrecision = tokenPrecision !== undefined ? Number(tokenPrecision) : undefined;
		const precision = explicitPrecision ?? fallbackPrecision;

		if (type === "s") {
			if (typeof scalar === "number" && precision !== undefined) {
				return scaleAndSnap(scalar, opts).toFixed(precision);
			}
			if (typeof scalar === "number") {
				return scaleAndSnap(scalar, opts).toString();
			}
			return stringifyScalar(scalar);
		}

		if (type === "d" || type === "i") {
			const n = scaleAndSnap(toNumber(scalar), opts);
			return Math.trunc(n).toString();
		}

		if (type === "f") {
			const n = scaleAndSnap(toNumber(scalar), opts);
			return n.toFixed(precision ?? PRINTF_DEFAULT_FLOAT_PRECISION);
		}

		return "";
	});
}

function scalarOf(value: DataRefValue): number | string | boolean {
	if (Array.isArray(value)) return value[0] ?? 0;
	return value;
}

function decodeStringValue(value: DataRefValue): string {
	// X-Plane Web API v3 delivers `data`-type DataRefs as a base64-encoded
	// string of the underlying byte buffer (zero-padded). Decode then strip
	// at the first NUL.
	if (typeof value === "string") {
		try {
			return bytesToString(Buffer.from(value, "base64"));
		} catch {
			return value;
		}
	}
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	if (Array.isArray(value)) return bytesToString(value as Iterable<number>);
	return "";
}

function bytesToString(bytes: Iterable<number>): string {
	let out = "";
	for (const b of bytes) {
		if (typeof b !== "number") continue;
		if (b === 0) break;
		// Skip control / non-printable bytes silently rather than rendering �.
		if (b < 0x20 || b > 0x7e) continue;
		out += String.fromCharCode(b);
	}
	return out;
}

function scaleNumber(n: number, scale?: number): number {
	if (scale === undefined || !Number.isFinite(scale)) return n;
	return n * scale;
}

function scaleAndSnap(n: number, opts: FormatOptions): number {
	const scaled = scaleNumber(n, opts.unitScale);
	const t = opts.zeroSnap;
	if (t !== undefined && Number.isFinite(t) && t > 0 && Math.abs(scaled) <= t) return 0;
	return scaled;
}

function toNumber(v: number | string | boolean): number {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

function stringifyScalar(v: number | string | boolean): string {
	if (typeof v === "boolean") return v ? "true" : "false";
	return String(v);
}
