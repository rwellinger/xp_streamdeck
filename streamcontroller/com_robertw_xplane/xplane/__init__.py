"""
com_robertw_xplane — StreamController plugin for X-Plane 12
Copyright (c) 2026 thWelly — MIT License
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable

DEFAULT_HOST = "localhost"
DEFAULT_PORT = 8086
API_VERSION = "v3"
TIMEOUT_S = 2.0

DataRefValue = float | int | str | bool | list[float] | None
DataRefCallback = Callable[[DataRefValue], None]


class XPlaneClient:
	"""Minimal X-Plane Web API v3 client (REST). Shared across all actions."""

	def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> None:
		self.host = host
		self.port = port
		self._dataref_ids: dict[str, int] = {}
		self._command_ids: dict[str, int] = {}
		self._lock = threading.Lock()
		self._online = False

	@property
	def base(self) -> str:
		return f"http://{self.host}:{self.port}/api/{API_VERSION}"

	def is_online(self) -> bool:
		return self._online

	def ping(self) -> bool:
		try:
			self._get(f"{self.base}/datarefs?filter[name]=sim/time/zulu_time_sec")
			self._online = True
			return True
		except Exception:
			self._online = False
			return False

	def get_command_id(self, name: str) -> int:
		with self._lock:
			cached = self._command_ids.get(name)
		if cached is not None:
			return cached
		url = f"{self.base}/commands?filter[name]={urllib.parse.quote(name)}"
		body = self._get(url)
		match = next((c for c in (body.get("data") or []) if c.get("name") == name), None)
		if not match:
			match = (body.get("data") or [None])[0]
		if not match or not isinstance(match.get("id"), int):
			raise LookupError(f"Command not found: {name}")
		with self._lock:
			self._command_ids[name] = match["id"]
		return match["id"]

	def get_dataref_id(self, name: str) -> int:
		with self._lock:
			cached = self._dataref_ids.get(name)
		if cached is not None:
			return cached
		url = f"{self.base}/datarefs?filter[name]={urllib.parse.quote(name)}"
		body = self._get(url)
		match = next((c for c in (body.get("data") or []) if c.get("name") == name), None)
		if not match:
			match = (body.get("data") or [None])[0]
		if not match or not isinstance(match.get("id"), int):
			raise LookupError(f"DataRef not found: {name}")
		with self._lock:
			self._dataref_ids[name] = match["id"]
		return match["id"]

	def activate_command(self, command_id: int, duration: float = 0) -> None:
		url = f"{self.base}/command/{command_id}/activate"
		self._post(url, {"duration": duration})

	def begin_command(self, command_id: int) -> None:
		url = f"{self.base}/command/{command_id}/activate"
		self._post(url, {"duration": -1})

	def end_command(self, command_id: int) -> None:
		# Web API: POST with is_active false via set — use duration 0 end by re-activate docs
		# X-Plane v3 uses PATCH on command active state via websocket typically;
		# REST fallback: activate with duration 0 is a click. For hold end we POST deactivate.
		url = f"{self.base}/command/{command_id}/deactivate"
		try:
			self._post(url, {})
		except Exception:
			# Some builds only support WS begin/end; ignore REST deactivate failures.
			pass

	def read_dataref(self, dataref_id: int) -> DataRefValue:
		url = f"{self.base}/datarefs/{dataref_id}/value"
		body = self._get(url)
		return body.get("data")

	def write_dataref(self, dataref_id: int, value: DataRefValue, index: int | None = None) -> None:
		url = f"{self.base}/datarefs/{dataref_id}/value"
		if index is not None:
			current = self.read_dataref(dataref_id)
			if not isinstance(current, list):
				raise TypeError(f"DataRef {dataref_id} is not an array")
			if index < 0 or index >= len(current):
				raise IndexError(f"index {index} out of bounds")
			next_arr = list(current)
			next_arr[index] = value
			self._patch(url, {"data": next_arr})
			return
		self._patch(url, {"data": value})

	def _get(self, url: str) -> Any:
		return self._request("GET", url)

	def _post(self, url: str, payload: dict) -> Any:
		return self._request("POST", url, payload)

	def _patch(self, url: str, payload: dict) -> Any:
		return self._request("PATCH", url, payload)

	def _request(self, method: str, url: str, payload: dict | None = None) -> Any:
		data = None
		headers = {"Accept": "application/json"}
		if payload is not None:
			data = json.dumps(payload).encode("utf-8")
			headers["Content-Type"] = "application/json"
		req = urllib.request.Request(url, data=data, headers=headers, method=method)
		try:
			with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
				raw = resp.read().decode("utf-8")
				self._online = True
				return json.loads(raw) if raw else {}
		except urllib.error.HTTPError as err:
			self._online = False
			body = err.read().decode("utf-8", errors="replace")
			raise RuntimeError(f"HTTP {err.code} {method} {url}: {body}") from err
		except Exception:
			self._online = False
			raise


def parse_dataref_path(path: str) -> tuple[str, int | None]:
	"""Split `name[index]` → (name, index)."""
	path = path.strip()
	if path.endswith("]") and "[" in path:
		base, _, rest = path.rpartition("[")
		idx_s = rest[:-1]
		if idx_s.isdigit():
			return base, int(idx_s)
	return path, None


def apply_index(value: DataRefValue, index: int | None) -> DataRefValue:
	if index is None or not isinstance(value, list):
		return value
	if index < 0 or index >= len(value):
		raise IndexError(f"index {index} out of bounds")
	return value[index]


def coerce_number(value: DataRefValue) -> float | None:
	if isinstance(value, bool):
		return float(value)
	if isinstance(value, (int, float)):
		return float(value)
	if isinstance(value, str):
		try:
			return float(value)
		except ValueError:
			return None
	if isinstance(value, list) and value:
		return coerce_number(value[0])
	return None


TOLERANCE = 1e-6


def apply_step(
	current: float,
	signed_step: float,
	*,
	min_v: float | None = None,
	max_v: float | None = None,
	cycle: bool = False,
) -> tuple[float, bool]:
	"""Return (target, blocked). Cycle walks the min..max grid by |step|."""
	abs_step = abs(signed_step)
	if not (abs_step > 0):
		return current, True

	if (
		cycle
		and min_v is not None
		and max_v is not None
		and max_v + TOLERANCE >= min_v
	):
		n = max(0, int((max_v - min_v + TOLERANCE) // abs_step))
		idx = int(round((current - min_v) / abs_step))
		idx = max(0, min(n, idx))
		direction = -1 if signed_step < 0 else 1
		mod = n + 1
		nxt = ((idx + direction) % mod + mod) % mod
		return min_v + nxt * abs_step, False

	target = current + signed_step
	if min_v is not None and target < min_v:
		target = min_v
	if max_v is not None and target > max_v:
		target = max_v
	return target, abs(target - current) < TOLERANCE


def step_octal_code(
	code: float,
	steps: int,
	min_v: float | None = None,
	max_v: float | None = None,
) -> float:
	"""XPDR-style 0000–7777 codes stored as decimal-looking ints."""
	places = 4
	mod = 8**places

	def to_ordinal(c: int) -> int:
		rest = abs(c)
		digits: list[int] = []
		for _ in range(places):
			digits.append(min(7, rest % 10))
			rest //= 10
		ordinal = 0
		for d in reversed(digits):
			ordinal = ordinal * 8 + d
		return ordinal

	def from_ordinal(ordinal: int) -> int:
		n = ((ordinal % mod) + mod) % mod
		out = 0
		place = 1
		for _ in range(places):
			out += (n % 8) * place
			n //= 8
			place *= 10
		return out

	ordinal = to_ordinal(int(code)) + int(steps)
	if min_v is not None:
		ordinal = max(ordinal, to_ordinal(int(min_v)))
	if max_v is not None:
		ordinal = min(ordinal, to_ordinal(int(max_v)))
	return float(from_ordinal(ordinal))


def format_value(
	value: DataRefValue,
	*,
	fmt: str = "%s",
	unit: str = "",
	unit_scale: float | None = None,
	precision: int | None = None,
) -> str:
	num = coerce_number(value)
	if num is None:
		text = str(value) if value is not None else "?"
	else:
		scaled = num if unit_scale is None else num * unit_scale
		try:
			if precision is not None and "%f" not in fmt and "%.f" not in fmt and "%." not in fmt:
				text = f"{scaled:.{precision}f}"
			elif "%" in fmt and fmt != "%s":
				text = fmt % scaled
			else:
				text = str(scaled)
		except (TypeError, ValueError):
			text = str(scaled)
	return f"{text} {unit}".strip() if unit else text
