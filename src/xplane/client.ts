/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { EventEmitter } from "node:events";
import WebSocket, { type RawData } from "ws";

import { SubscriptionMultiplexer, type SubscriptionTransport } from "./subscriptions";
import type {
	CommandMeta,
	ConnectionStatus,
	DataRefCallback,
	DataRefMeta,
	DataRefValue,
	ReconnectOptions,
	RestListResponse,
	RestValueResponse,
	SubscriptionHandle,
	WsDataRefUpdateMessage,
	WsRequestEnvelope,
	WsResultMessage,
	WsServerMessage,
	XPlaneClientOptions,
	XPlaneLogger,
} from "./types";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8086;
const DEFAULT_API_VERSION = "v3";
const DEFAULT_RECONNECT: ReconnectOptions = { initialMs: 1000, maxMs: 30000 };
const REQ_TIMEOUT_MS = 5000;
// How long we tolerate "disconnected" before declaring the sim offline. Short
// enough that the user notices, long enough to swallow brief WebSocket
// hiccups (X-Plane reload, network blip) without flashing the offline tile.
const OFFLINE_DELAY_MS = 3000;
// Dead-peer detection: a silently dropped connection (sleeping Mac, WLAN
// change, frozen sim) never emits 'close'. Ping keeps traffic flowing so the
// activity watchdog stays meaningful even when no DataRef is subscribed.
// The timeout allows two pings to go missing before we drop the socket.
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 15000;

export class XPlaneClient extends EventEmitter implements SubscriptionTransport {
	readonly logger: XPlaneLogger;

	private readonly host: string;
	private readonly port: number;
	private readonly apiPath: string;
	private readonly reconnectOpts: ReconnectOptions;

	private ws: WebSocket | null = null;
	private wsState: ConnectionStatus = "disconnected";
	private connectAttempt = 0;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private closed = false;

	private offlineTimer: NodeJS.Timeout | null = null;
	private offlineEmitted = false;

	private heartbeatTimer: NodeJS.Timeout | null = null;
	private lastActivityAt = 0;

	private dataRefIdByName = new Map<string, number>();
	private commandIdByName = new Map<string, number>();

	private nextReqId = 1;
	private pending = new Map<
		number,
		{
			resolve: (r: WsResultMessage) => void;
			reject: (err: unknown) => void;
			timer: NodeJS.Timeout;
		}
	>();

	private inflight = new Set<AbortController>();
	private subs: SubscriptionMultiplexer;

	constructor(opts: XPlaneClientOptions = {}) {
		super();
		this.host = opts.host ?? DEFAULT_HOST;
		this.port = opts.port ?? DEFAULT_PORT;
		this.apiPath = `api/${opts.apiVersion ?? DEFAULT_API_VERSION}`;
		this.reconnectOpts = opts.reconnect ?? DEFAULT_RECONNECT;
		this.logger = opts.logger ?? console;
		this.subs = new SubscriptionMultiplexer(this);
	}

	// ---------------- public REST ----------------

	async getDataRefId(name: string): Promise<number> {
		const cached = this.dataRefIdByName.get(name);
		if (cached !== undefined) return cached;
		return this.resolveDataRefIdFresh(name);
	}

	async getCommandId(name: string): Promise<number> {
		const cached = this.commandIdByName.get(name);
		if (cached !== undefined) return cached;
		const url = `${this.restBase()}/commands?filter[name]=${encodeURIComponent(name)}`;
		const body = await this.fetchJson<RestListResponse<CommandMeta>>(url);
		const match = body?.data?.find((c) => c.name === name) ?? body?.data?.[0];
		if (!match || typeof match.id !== "number") {
			throw new Error(`Command not found: ${name}`);
		}
		this.commandIdByName.set(name, match.id);
		return match.id;
	}

	async readDataRef(id: number): Promise<DataRefValue> {
		const url = `${this.restBase()}/datarefs/${id}/value`;
		const body = await this.fetchJson<RestValueResponse<DataRefValue>>(url);
		if (!body || body.data === undefined) {
			throw new Error(`Read DataRef ${id}: empty response`);
		}
		return body.data;
	}

	async writeDataRef(id: number, value: DataRefValue, index?: number): Promise<void> {
		const url = `${this.restBase()}/datarefs/${id}/value`;
		// X-Plane Web API has a known issue (observed across 12.1.x) where
		// `PATCH .../value?index=N` returns 200 but silently ignores the write
		// for any index ≠ 0 — no error surfaces. Workaround: read the whole
		// array, swap the targeted element, write the full array back. Index 0
		// hits this same path for consistency.
		if (index !== undefined) {
			const current = await this.readDataRef(id);
			if (!Array.isArray(current)) {
				throw new Error(
					`writeDataRef: index=${index} given but DataRef ${id} is not an array`,
				);
			}
			if (index < 0 || index >= current.length) {
				throw new Error(
					`writeDataRef: index ${index} out of bounds (array length ${current.length})`,
				);
			}
			const next = current.slice();
			next[index] = value as number;
			await this.fetchJson(url, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data: next }),
			});
			return;
		}
		await this.fetchJson(url, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ data: value }),
		});
	}

	async activateCommand(id: number, duration = 0): Promise<void> {
		const url = `${this.restBase()}/command/${id}/activate`;
		await this.fetchJson(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ duration }),
		});
	}

	async beginCommand(id: number): Promise<void> {
		await this.setCommandActive(id, true);
	}

	async endCommand(id: number): Promise<void> {
		await this.setCommandActive(id, false);
	}

	// ---------------- subscriptions ----------------

	async subscribe(name: string, callback: DataRefCallback): Promise<SubscriptionHandle> {
		this.connect();
		return this.subs.subscribe(name, callback);
	}

	unsubscribe(handle: SubscriptionHandle): void {
		this.subs.unsubscribe(handle);
	}

	// ---------------- lifecycle ----------------

	connect(): void {
		if (this.closed) throw new Error("XPlaneClient is closed");
		if (this.ws || this.wsState === "connecting") return;
		this.openWs();
	}

	close(): void {
		this.closed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.cancelOfflineSignal();
		this.stopHeartbeat();
		if (this.ws) {
			this.ws.removeAllListeners();
			try {
				this.ws.close();
			} catch {
				/* ignore */
			}
			this.ws = null;
		}
		for (const ac of this.inflight) {
			try {
				ac.abort();
			} catch {
				/* ignore */
			}
		}
		this.inflight.clear();
		for (const p of this.pending.values()) {
			clearTimeout(p.timer);
			p.reject(new Error("XPlaneClient closed"));
		}
		this.pending.clear();
		this.wsState = "disconnected";
	}

	status(): ConnectionStatus {
		return this.wsState;
	}

	/**
	 * True once `OFFLINE_DELAY_MS` has elapsed without a connection. Stays true
	 * across short reconnect attempts; flips back to false the moment the WS
	 * actually opens. Use this in `onWillAppear` to decide whether to show the
	 * offline placeholder immediately at plugin start.
	 */
	isOffline(): boolean {
		return this.offlineEmitted;
	}

	// ---------------- SubscriptionTransport ----------------

	async resolveDataRefId(name: string): Promise<number> {
		const cached = this.dataRefIdByName.get(name);
		if (cached !== undefined) return cached;
		return this.resolveDataRefIdFresh(name);
	}

	sendSubscribe(id: number): void {
		this.sendWs({
			type: "dataref_subscribe_values",
			params: { datarefs: [{ id }] },
		}).catch((err) => this.logger.warn(`subscribe(${id}) failed`, err));
	}

	sendUnsubscribe(id: number): void {
		this.sendWs({
			type: "dataref_unsubscribe_values",
			params: { datarefs: [{ id }] },
		}).catch((err) => this.logger.warn(`unsubscribe(${id}) failed`, err));
	}

	isConnected(): boolean {
		return this.wsState === "connected";
	}

	// ---------------- internal ----------------

	private restBase(): string {
		return `http://${this.host}:${this.port}/${this.apiPath}`;
	}

	private wsUrl(): string {
		return `ws://${this.host}:${this.port}/${this.apiPath}`;
	}

	private async resolveDataRefIdFresh(name: string): Promise<number> {
		const url = `${this.restBase()}/datarefs?filter[name]=${encodeURIComponent(name)}`;
		const body = await this.fetchJson<RestListResponse<DataRefMeta>>(url);
		const match = body?.data?.find((d) => d.name === name) ?? body?.data?.[0];
		if (!match || typeof match.id !== "number") {
			throw new Error(`DataRef not found: ${name}`);
		}
		this.dataRefIdByName.set(name, match.id);
		return match.id;
	}

	private async fetchJson<T = unknown>(
		url: string,
		init: RequestInit = {},
	): Promise<T | undefined> {
		const ac = new AbortController();
		this.inflight.add(ac);
		try {
			const res = await fetch(url, { ...init, signal: ac.signal });
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(
					`${init.method ?? "GET"} ${url} failed: HTTP ${res.status}${text ? ` — ${text}` : ""}`,
				);
			}
			if (res.status === 204) return undefined;
			const ct = res.headers.get("content-type") ?? "";
			if (!ct.includes("application/json")) return undefined;
			return (await res.json()) as T;
		} finally {
			this.inflight.delete(ac);
		}
	}

	private openWs(): void {
		this.wsState = "connecting";
		const ws = new WebSocket(this.wsUrl());
		this.ws = ws;
		ws.on("open", () => this.onWsOpen());
		ws.on("close", () => this.onWsClose());
		ws.on("error", (err) => this.onWsError(err));
		ws.on("message", (data) => this.onWsMessage(data));
		ws.on("pong", () => {
			this.lastActivityAt = Date.now();
		});
	}

	private onWsOpen(): void {
		this.connectAttempt = 0;
		this.wsState = "connected";
		this.logger.info("X-Plane WS connected");
		// IDs are session-scoped; an X-Plane restart invalidates them.
		// Clear caches and re-resolve subscriptions by name on every open.
		this.dataRefIdByName.clear();
		this.commandIdByName.clear();
		this.subs.markAllUnsubscribed();
		this.emit("connected");
		this.cancelOfflineSignal();
		if (this.offlineEmitted) {
			this.offlineEmitted = false;
			this.emit("online");
		}
		void this.subs.rebindAll().catch((err) => {
			this.logger.warn("rebindAll failed", err);
		});
		this.startHeartbeat();
	}

	private onWsClose(): void {
		const wasConnected = this.wsState === "connected";
		this.wsState = "disconnected";
		this.ws = null;
		this.stopHeartbeat();
		this.subs.markAllUnsubscribed();
		for (const p of this.pending.values()) {
			clearTimeout(p.timer);
			p.reject(new Error("WS closed"));
		}
		this.pending.clear();
		if (wasConnected) this.logger.info("X-Plane WS disconnected");
		this.emit("disconnected");
		if (!this.closed) {
			this.scheduleReconnect();
			this.scheduleOfflineSignal();
		}
	}

	private scheduleOfflineSignal(): void {
		if (this.offlineEmitted || this.offlineTimer) return;
		this.offlineTimer = setTimeout(() => {
			this.offlineTimer = null;
			if (this.wsState === "connected" || this.closed) return;
			this.offlineEmitted = true;
			this.logger.info("X-Plane offline (no connection for >=3s)");
			this.emit("offline");
		}, OFFLINE_DELAY_MS);
	}

	private cancelOfflineSignal(): void {
		if (this.offlineTimer) {
			clearTimeout(this.offlineTimer);
			this.offlineTimer = null;
		}
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.lastActivityAt = Date.now();
		this.heartbeatTimer = setInterval(() => this.heartbeatTick(), HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private heartbeatTick(): void {
		const ws = this.ws;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		if (Date.now() - this.lastActivityAt > HEARTBEAT_TIMEOUT_MS) {
			this.logger.warn("X-Plane WS heartbeat timeout - terminating");
			ws.terminate();
			return;
		}
		try {
			ws.ping();
		} catch (err) {
			this.logger.warn("X-Plane WS ping failed", err);
		}
	}

	private onWsError(err: unknown): void {
		this.logger.warn("X-Plane WS error", err);
		this.emit("error", err);
	}

	private scheduleReconnect(): void {
		const { initialMs, maxMs } = this.reconnectOpts;
		const delay = Math.min(initialMs * 2 ** this.connectAttempt, maxMs);
		this.connectAttempt++;
		this.logger.info(`X-Plane WS reconnect in ${delay}ms (attempt ${this.connectAttempt})`);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (!this.closed) this.openWs();
		}, delay);
	}

	private onWsMessage(raw: RawData): void {
		this.lastActivityAt = Date.now();
		let msg: WsServerMessage;
		try {
			msg = JSON.parse(raw.toString()) as WsServerMessage;
		} catch (err) {
			this.logger.warn("WS message parse failed", err);
			return;
		}

		if (msg.type === "dataref_update_values") {
			const data = (msg as WsDataRefUpdateMessage).data ?? {};
			for (const [idStr, value] of Object.entries(data)) {
				const id = Number(idStr);
				if (!Number.isFinite(id)) continue;
				this.subs.deliver(id, value);
			}
			return;
		}

		if (msg.type === "result") {
			const r = msg as WsResultMessage;
			const pending = this.pending.get(r.req_id);
			if (!pending) return;
			this.pending.delete(r.req_id);
			clearTimeout(pending.timer);
			if (r.success) {
				pending.resolve(r);
			} else {
				pending.reject(
					new Error(
						`WS req ${r.req_id} failed: ${r.error_code ?? "?"} ${r.error_message ?? ""}`.trim(),
					),
				);
			}
			return;
		}

		this.logger.debug?.(`unhandled WS message type: ${msg.type}`);
	}

	private sendWs(envelope: {
		type: string;
		params?: Record<string, unknown>;
	}): Promise<WsResultMessage> {
		const ws = this.ws;
		if (!ws || this.wsState !== "connected") {
			return Promise.reject(new Error(`WS not connected (state: ${this.wsState})`));
		}
		const reqId = this.nextReqId++;
		const full: WsRequestEnvelope = { req_id: reqId, ...envelope };
		return new Promise<WsResultMessage>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(reqId);
				reject(new Error(`WS req ${reqId} (${envelope.type}) timeout`));
			}, REQ_TIMEOUT_MS);
			this.pending.set(reqId, { resolve, reject, timer });
			try {
				ws.send(JSON.stringify(full));
			} catch (err) {
				clearTimeout(timer);
				this.pending.delete(reqId);
				reject(err);
			}
		});
	}

	private async setCommandActive(id: number, isActive: boolean): Promise<void> {
		await this.sendWs({
			type: "command_set_is_active",
			params: { commands: [{ id, is_active: isActive }] },
		});
	}
}
