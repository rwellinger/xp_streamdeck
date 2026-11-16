/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

// X-Plane Stream Deck Plugin — Property Inspector helpers.
// Shared by every action's PI to:
//   - hook autocomplete into <sdpi-textfield> path inputs (DataRef + Command)
//   - show a live value preview while editing a DataRef path
//   - safely merge settings updates without wiping concurrent fields
//
// Loads after https://sdpi-components.dev/releases/v4/sdpi-components.js, so
// `window.SDPIComponents.streamDeckClient` is expected to be available by the
// time PI scripts wire things up.

(() => {
	"use strict";

	const API_BASE = "http://localhost:8086/api/v3";
	const DEBOUNCE_MS = 300;
	const PREVIEW_INTERVAL_MS = 1000;
	const FETCH_TIMEOUT_MS = 2000;

	const PATH_RE = /^(.+?)(?:\[(\d+)\])?$/;
	const parseDataRefPath = (input) => {
		const trimmed = String(input ?? "").trim();
		const m = PATH_RE.exec(trimmed);
		if (!m) return { basePath: trimmed };
		return { basePath: m[1], index: m[2] !== undefined ? Number(m[2]) : undefined };
	};

	const getClient = () => window.SDPIComponents?.streamDeckClient;

	// ---------------- Settings cache ----------------
	// We keep the freshest known settings locally so partial updates we
	// make for image uploads / clears never wipe sibling fields when
	// getSettings() is momentarily empty.

	let cached = null;
	let cacheReady = false;

	const refresh = async () => {
		const client = getClient();
		if (!client) return;
		try {
			const s = await client.getSettings();
			if (s && typeof s === "object") cached = s;
		} catch (err) {
			console.error("xplane-pi-helpers: getSettings failed", err);
		}
	};

	const ready = (async () => {
		await refresh();
		cacheReady = true;
		const client = getClient();
		const live = client?.didReceiveSettings;
		if (live && typeof live.subscribe === "function") {
			live.subscribe((arg) => {
				const s = arg?.payload?.settings ?? arg?.settings;
				if (s && typeof s === "object") cached = s;
			});
		}
	})();

	// ---------------- Selector placeholder substitution ----------------
	// Mirrors src/util/placeholders.ts on the plugin side. Lets the live
	// preview and autocomplete query the *resolved* path (e.g. pdf1/brt)
	// instead of the literal template (pdf{PDF}/brt) which X-Plane can't find.

	let globalCached = {};

	const refreshGlobal = async () => {
		const client = getClient();
		if (!client?.getGlobalSettings) return;
		try {
			const s = await client.getGlobalSettings();
			if (s && typeof s === "object") globalCached = s;
		} catch (err) {
			console.error("xplane-pi-helpers: getGlobalSettings failed", err);
		}
	};

	(async () => {
		await refreshGlobal();
		const client = getClient();
		const live = client?.didReceiveGlobalSettings;
		if (live && typeof live.subscribe === "function") {
			live.subscribe((arg) => {
				const s = arg?.payload?.settings ?? arg?.settings;
				if (s && typeof s === "object") globalCached = s;
			});
		}
	})();

	const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
	const substitutePlaceholders = (path) => {
		if (!path) return path;
		const selectors = globalCached?.selectors;
		if (!selectors || typeof selectors !== "object") return path;
		return path.replace(PLACEHOLDER_RE, (match, key) => {
			const value = selectors[key];
			return typeof value === "number" && Number.isFinite(value) ? String(value) : match;
		});
	};

	const updateSetting = async (key, value) => {
		if (!cacheReady) await ready;
		await refresh();
		const client = getClient();
		if (!client) return;
		if (!cached || typeof cached !== "object") {
			console.warn(`xplane-pi-helpers: refusing to write ${key} — no baseline`);
			return;
		}
		const next = { ...cached };
		if (value === undefined || value === "") delete next[key];
		else next[key] = value;
		cached = next;
		await client.setSettings(next);
	};

	// ---------------- Generic helpers ----------------

	const debounce = (fn, ms) => {
		let t = null;
		return (...args) => {
			if (t) clearTimeout(t);
			t = setTimeout(() => fn(...args), ms);
		};
	};

	const fetchWithTimeout = async (url) => {
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
		try {
			return await fetch(url, { signal: ac.signal });
		} finally {
			clearTimeout(timer);
		}
	};

	const findInnerInput = (sdpiField) =>
		sdpiField.shadowRoot?.querySelector("input") || sdpiField.querySelector("input");

	const waitForInnerInput = async (sdpiField, retries = 30) => {
		for (let i = 0; i < retries; i++) {
			const inner = findInnerInput(sdpiField);
			if (inner) return inner;
			await new Promise((r) => setTimeout(r, 50));
		}
		return null;
	};

	// ---------------- Autocomplete via <datalist> ----------------

	const fetchSuggestions = async (kind, prefix) => {
		if (!prefix || prefix.length < 2) return [];
		const resolvedPrefix = substitutePlaceholders(prefix);
		const endpoint = kind === "command" ? "commands" : "datarefs";
		try {
			const res = await fetchWithTimeout(
				`${API_BASE}/${endpoint}?filter[name]=${encodeURIComponent(resolvedPrefix)}`,
			);
			if (!res.ok) return [];
			const body = await res.json();
			const items = Array.isArray(body?.data) ? body.data : [];
			return items
				.slice(0, 20)
				.map((it) => it?.name)
				.filter((n) => typeof n === "string");
		} catch {
			return [];
		}
	};

	const attachAutocomplete = async (sdpiField, kind) => {
		const inner = await waitForInnerInput(sdpiField);
		if (!inner) {
			console.warn("xplane-pi-helpers: cannot find inner input for autocomplete");
			return;
		}
		const list = document.createElement("datalist");
		list.id = `xplane-suggest-${Math.random().toString(36).slice(2, 8)}`;
		document.body.appendChild(list);
		inner.setAttribute("list", list.id);
		// Browsers cap autocomplete to a list when type=text, which is our
		// default here. No special tweaks needed.
		inner.setAttribute("autocomplete", "off");

		const refreshList = debounce(async () => {
			const suggestions = await fetchSuggestions(kind, inner.value.trim());
			list.innerHTML = "";
			for (const s of suggestions) {
				const opt = document.createElement("option");
				opt.value = s;
				list.appendChild(opt);
			}
		}, DEBOUNCE_MS);

		inner.addEventListener("input", refreshList);
		inner.addEventListener("focus", refreshList);
	};

	// ---------------- Live DataRef preview ----------------

	const fetchDataRefValue = async (rawName) => {
		const resolvedName = substitutePlaceholders(rawName);
		const { basePath, index } = parseDataRefPath(resolvedName);
		try {
			const r1 = await fetchWithTimeout(
				`${API_BASE}/datarefs?filter[name]=${encodeURIComponent(basePath)}`,
			);
			if (!r1.ok) return { state: "error" };
			const body = await r1.json();
			const match = body?.data?.find((d) => d?.name === basePath) ?? body?.data?.[0];
			if (!match || typeof match.id !== "number") return { state: "not-found" };
			const r2 = await fetchWithTimeout(`${API_BASE}/datarefs/${match.id}/value`);
			if (!r2.ok) return { state: "error" };
			const valBody = await r2.json();
			const raw = valBody?.data;
			if (index === undefined) return { state: "ok", value: raw };
			if (!Array.isArray(raw)) {
				return { state: "error", message: "not an array" };
			}
			if (index < 0 || index >= raw.length) {
				return { state: "error", message: `index ${index} out of bounds (length ${raw.length})` };
			}
			return { state: "ok", value: raw[index] };
		} catch {
			return { state: "error" };
		}
	};

	const formatPreview = (result) => {
		switch (result.state) {
			case "ok": {
				const v = result.value;
				if (v === undefined) return "—";
				if (typeof v === "object") return JSON.stringify(v);
				return String(v);
			}
			case "not-found":
				return "Not found";
			case "error":
				return result.message ? result.message : "X-Plane unreachable";
			default:
				return "";
		}
	};

	const attachLivePreview = async (sdpiField, previewEl) => {
		const inner = await waitForInnerInput(sdpiField);
		if (!inner) return;

		let timer = null;
		const stop = () => {
			if (timer) clearInterval(timer);
			timer = null;
		};
		const tick = async () => {
			const name = inner.value.trim();
			if (!name) {
				previewEl.textContent = "";
				stop();
				return;
			}
			const result = await fetchDataRefValue(name);
			previewEl.textContent = formatPreview(result);
			previewEl.dataset.state = result.state;
		};

		const restart = debounce(() => {
			stop();
			tick();
			timer = setInterval(tick, PREVIEW_INTERVAL_MS);
		}, DEBOUNCE_MS);

		inner.addEventListener("input", restart);
		// Kick off if a value is already present (re-opening the PI).
		if (inner.value.trim()) restart();
	};

	// ---------------- About footer ----------------
	// window.open() is a no-op inside a PI; "openUrl" is a PI-allowed
	// Stream Deck event that opens the system browser.

	const ABOUT_LINKS = [
		["More plugins", "https://thwelly.ch/xplane-plugins/"],
		["Buy me a coffee", "https://buymeacoffee.com/thwelly"],
	];

	const renderAboutFooter = async () => {
		const footer = document.createElement("div");
		footer.style.cssText =
			"margin:24px 0 8px;padding-top:8px;border-top:1px solid #3d3d3d;" +
			"font-size:10px;color:#8a8a8a;text-align:center;";
		const label = document.createElement("span");
		label.textContent = "X-Plane plugin by thWelly";
		footer.append(label);
		for (const [text, url] of ABOUT_LINKS) {
			const link = document.createElement("a");
			link.textContent = text;
			link.href = "#";
			link.style.cssText = "color:#8a8a8a;margin-left:10px;";
			link.addEventListener("click", (ev) => {
				ev.preventDefault();
				getClient()
					?.send("openUrl", { url })
					.catch((err) => console.error("xplane-pi-helpers: openUrl failed", err));
			});
			footer.append(link);
		}
		document.body.append(footer);

		try {
			const version = (await getClient()?.getConnectionInfo())?.info?.plugin?.version;
			if (version) label.textContent = `X-Plane plugin v${version} by thWelly`;
		} catch {
			// Version is cosmetic; the footer stays without it.
		}
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			renderAboutFooter().catch((err) => console.error("xplane-pi-helpers: footer failed", err));
		});
	} else {
		renderAboutFooter().catch((err) => console.error("xplane-pi-helpers: footer failed", err));
	}

	window.XPlanePI = {
		attachAutocomplete,
		attachLivePreview,
		updateSetting,
	};
})();
