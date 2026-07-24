"""
X-Plane Encoder — dial / key stepper for DataRefs (linear or octal) or command pairs.

Gestures (dial):
  rotate CW/CCW  → fine step / command
  press+rotate   → shift (coarse delta or shift commands)
  press+release  → click command
"""

from __future__ import annotations

from GtkHelper.GenerativeUI.ComboRow import ComboRow
from GtkHelper.GenerativeUI.EntryRow import EntryRow
from GtkHelper.GenerativeUI.SpinRow import SpinRow
from GtkHelper.GenerativeUI.SwitchRow import SwitchRow
from loguru import logger as log
from src.backend.DeckManagement.InputIdentifier import Input
from src.backend.PluginManager.ActionCore import ActionCore
from src.backend.PluginManager.EventAssigner import EventAssigner

from ...xplane import (
	apply_index,
	apply_step,
	coerce_number,
	format_value,
	parse_dataref_path,
	step_octal_code,
)


class Encoder(ActionCore):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.has_configuration = True
		self._pressed = False
		self._shifted = False
		self._last_value: float | None = None

		self.add_event_assigner(
			EventAssigner(
				id="xplane_encoder_cw",
				ui_label="Rotate CW",
				default_events=[Input.Dial.Events.TURN_CW, Input.Key.Events.DOWN],
				callback=lambda data: self.on_rotate(+1, data),
			)
		)
		self.add_event_assigner(
			EventAssigner(
				id="xplane_encoder_ccw",
				ui_label="Rotate CCW",
				default_events=[Input.Dial.Events.TURN_CCW],
				callback=lambda data: self.on_rotate(-1, data),
			)
		)
		self.add_event_assigner(
			EventAssigner(
				id="xplane_encoder_down",
				ui_label="Press",
				default_events=[Input.Dial.Events.DOWN],
				callback=self.on_down,
			)
		)
		self.add_event_assigner(
			EventAssigner(
				id="xplane_encoder_up",
				ui_label="Release",
				default_events=[Input.Dial.Events.UP],
				callback=self.on_up,
			)
		)

	def on_ready(self) -> None:
		self.set_media(media_path=self.get_asset_path("info.png"), size=0.75)
		s = self.get_settings()
		self.set_top_label((s.get("label") or "").strip())
		self._refresh_label()

	def on_tick(self) -> None:
		self._refresh_label()

	def get_config_rows(self):
		ComboRow(
			action_core=self,
			var_name="drive_mode",
			default_value="dataref",
			title="Drive Mode",
			items=["dataref", "command"],
			on_change=lambda *_: self.on_ready(),
		)
		ComboRow(
			action_core=self,
			var_name="step_mode",
			default_value="linear",
			title="Step Mode",
			items=["linear", "octal"],
		)
		EntryRow(
			action_core=self,
			var_name="dataref_path",
			default_value="sim/cockpit2/autopilot/heading_dial_deg_mag_pilot",
			title="DataRef Path",
			on_change=lambda *_: self.on_ready(),
		)
		SpinRow(
			action_core=self,
			var_name="delta",
			default_value=1.0,
			title="Delta",
			min=0.0,
			max=1_000_000.0,
			step=0.01,
			digits=4,
		)
		SpinRow(
			action_core=self,
			var_name="coarse_delta",
			default_value=0.0,
			title="Shift Delta (0 = same as Delta)",
			min=0.0,
			max=1_000_000.0,
			step=0.01,
			digits=4,
		)
		EntryRow(
			action_core=self,
			var_name="min_value",
			default_value="",
			title="Min Value",
		)
		EntryRow(
			action_core=self,
			var_name="max_value",
			default_value="",
			title="Max Value",
		)
		SwitchRow(
			action_core=self,
			var_name="cycle",
			default_value=False,
			title="Cycle at Min/Max",
		)
		EntryRow(
			action_core=self,
			var_name="command_cw",
			default_value="",
			title="CW Command",
		)
		EntryRow(
			action_core=self,
			var_name="command_ccw",
			default_value="",
			title="CCW Command",
		)
		EntryRow(
			action_core=self,
			var_name="shift_command_cw",
			default_value="",
			title="Shift CW Command",
		)
		EntryRow(
			action_core=self,
			var_name="shift_command_ccw",
			default_value="",
			title="Shift CCW Command",
		)
		EntryRow(
			action_core=self,
			var_name="click_command",
			default_value="",
			title="Click Command",
		)
		EntryRow(
			action_core=self,
			var_name="label",
			default_value="HDG",
			title="Label",
			on_change=lambda *_: self.on_ready(),
		)
		EntryRow(
			action_core=self,
			var_name="format",
			default_value="%.0f",
			title="Format",
		)
		EntryRow(
			action_core=self,
			var_name="unit",
			default_value="°",
			title="Unit",
		)
		return self.get_generative_ui_widgets()

	def on_down(self, _data=None) -> None:
		self._pressed = True
		self._shifted = False

	def on_up(self, _data=None) -> None:
		shifted = self._shifted
		self._pressed = False
		if not shifted:
			click = (self.get_settings().get("click_command") or "").strip()
			if click:
				self._fire_command(click)
		self._shifted = False

	def on_rotate(self, direction: int, _data=None) -> None:
		shift = self._pressed
		if shift:
			self._shifted = True
		s = self.get_settings()
		ticks = direction  # ±1 per event; multiply if event payload has ticks later
		if (s.get("drive_mode") or "dataref") == "command":
			path = self._command_for(ticks > 0, shift)
			if path:
				self._fire_command(path)
			else:
				self.show_error(duration=1)
			return
		self._step_dataref(ticks, shift)

	def _command_for(self, cw: bool, shift: bool) -> str:
		s = self.get_settings()
		if shift:
			primary = "shift_command_cw" if cw else "shift_command_ccw"
			fallback = "command_cw" if cw else "command_ccw"
			return (s.get(primary) or s.get(fallback) or "").strip()
		return (s.get("command_cw" if cw else "command_ccw") or "").strip()

	def _fire_command(self, path: str) -> None:
		try:
			xplane = self.plugin_base.xplane
			cmd_id = xplane.get_command_id(path)
			xplane.activate_command(cmd_id)
			log.info(f"encoder command: {path}")
		except Exception as err:
			log.error(f"encoder command failed: {path}: {err}")
			self.show_error(duration=2)

	def _opt_float(self, key: str) -> float | None:
		raw = self.get_settings().get(key, "")
		if raw in (None, ""):
			return None
		try:
			return float(raw)
		except (TypeError, ValueError):
			return None

	def _step_dataref(self, ticks: int, shift: bool) -> None:
		s = self.get_settings()
		path = (s.get("dataref_path") or "").strip()
		if not path:
			self.show_error(duration=1)
			return
		delta = float(s.get("delta") or 1)
		coarse = float(s.get("coarse_delta") or 0)
		base = coarse if shift and coarse > 0 else delta
		if not (base > 0):
			self.show_error(duration=1)
			return
		step = base * abs(ticks) * (1 if ticks > 0 else -1)
		min_v = self._opt_float("min_value")
		max_v = self._opt_float("max_value")
		cycle = bool(s.get("cycle", False))
		octal = (s.get("step_mode") or "linear") == "octal"

		try:
			xplane = self.plugin_base.xplane
			base_path, index = parse_dataref_path(path)
			dr_id = xplane.get_dataref_id(base_path)
			current_raw = (
				self._last_value
				if self._last_value is not None
				else apply_index(xplane.read_dataref(dr_id), index)
			)
			current = coerce_number(current_raw) or 0.0
			if octal:
				target = step_octal_code(current, int(step), min_v, max_v)
				blocked = abs(target - current) < 1e-6
			else:
				target, blocked = apply_step(
					current, step, min_v=min_v, max_v=max_v, cycle=cycle
				)
			if blocked:
				self.show_error(duration=1)
				return
			xplane.write_dataref(dr_id, target, index)
			self._last_value = target
			self._paint_value(target)
			log.info(f"encoder step {path}: {current} → {target}")
		except Exception as err:
			log.error(f"encoder step failed: {err}")
			self.show_error(duration=2)

	def _refresh_label(self) -> None:
		s = self.get_settings()
		path = (s.get("dataref_path") or "").strip()
		if not path:
			self.set_center_label("")
			return
		try:
			xplane = self.plugin_base.xplane
			base_path, index = parse_dataref_path(path)
			dr_id = xplane.get_dataref_id(base_path)
			raw = apply_index(xplane.read_dataref(dr_id), index)
			num = coerce_number(raw)
			if num is not None:
				self._last_value = num
			self._paint_value(raw)
		except Exception:
			offline = not self.plugin_base.xplane.ping()
			self.set_center_label("OFFLINE" if offline else "?")

	def _paint_value(self, raw) -> None:
		s = self.get_settings()
		text = format_value(
			raw,
			fmt=(s.get("format") or "%s").strip() or "%s",
			unit=(s.get("unit") or "").strip(),
		)
		self.set_center_label(text)
