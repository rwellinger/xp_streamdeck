"""
X-Plane Rotary — key/dial step for multi-position switches.

Press either:
  - steps a DataRef by ±Delta (Direction sets the sign), with optional Min/Max/Cycle, or
  - activates a CommandPath when Delta is unset / empty.
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
)

_DIR_SIGN = {
	"right": 1,
	"up": 1,
	"left": -1,
	"down": -1,
}


class Rotary(ActionCore):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.has_configuration = True
		self._last_value: float | None = None
		self._hold_id: int | None = None

		self.add_event_assigner(
			EventAssigner(
				id="xplane_rotary_down",
				ui_label="Press",
				default_events=[Input.Key.Events.DOWN, Input.Dial.Events.DOWN],
				callback=self.on_press,
			)
		)
		self.add_event_assigner(
			EventAssigner(
				id="xplane_rotary_up",
				ui_label="Release",
				default_events=[Input.Key.Events.UP, Input.Dial.Events.UP],
				callback=self.on_release,
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
		EntryRow(
			action_core=self,
			var_name="command_path",
			default_value="",
			title="Command Path",
			on_change=lambda *_: self.on_ready(),
		)
		ComboRow(
			action_core=self,
			var_name="direction",
			default_value="right",
			title="Direction",
			items=["right", "left", "up", "down"],
		)
		EntryRow(
			action_core=self,
			var_name="dataref_path",
			default_value="sim/cockpit2/engine/actuators/ignition_key",
			title="DataRef Path",
			on_change=lambda *_: self.on_ready(),
		)
		SpinRow(
			action_core=self,
			var_name="delta",
			default_value=0.0,
			title="Delta (0 = use Command Path)",
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
		SwitchRow(
			action_core=self,
			var_name="hide_endstop_alert",
			default_value=False,
			title="Hide endstop alert",
		)
		EntryRow(
			action_core=self,
			var_name="hold_command",
			default_value="",
			title="Hold Command (at last position)",
		)
		SwitchRow(
			action_core=self,
			var_name="hold_on_last",
			default_value=False,
			title="Hold when already at last position",
		)
		EntryRow(
			action_core=self,
			var_name="label",
			default_value="",
			title="Label",
			on_change=lambda *_: self.on_ready(),
		)
		EntryRow(
			action_core=self,
			var_name="format",
			default_value="%s",
			title="Format",
		)
		EntryRow(
			action_core=self,
			var_name="unit",
			default_value="",
			title="Unit",
		)
		return self.get_generative_ui_widgets()

	def on_press(self, _data=None) -> None:
		s = self.get_settings()
		delta = float(s.get("delta") or 0)
		dataref = (s.get("dataref_path") or "").strip()
		command = (s.get("command_path") or "").strip()
		hold_cmd = (s.get("hold_command") or "").strip()
		can_step = delta > 0 and bool(dataref)

		if not can_step and not command and not hold_cmd:
			self.show_error(duration=1)
			return

		if can_step and bool(s.get("hold_on_last", False)) and hold_cmd:
			if self._at_last_position(delta):
				self._begin_hold(hold_cmd)
				return

		if can_step:
			self._step_dataref(delta)
			return

		if command:
			self._fire_command(command)
		else:
			self.show_error(duration=1)

	def on_release(self, _data=None) -> None:
		if self._hold_id is None:
			return
		try:
			self.plugin_base.xplane.end_command(self._hold_id)
			log.info(f"rotary hold end id={self._hold_id}")
		except Exception as err:
			log.error(f"rotary hold end failed: {err}")
			self.show_error(duration=2)
		finally:
			self._hold_id = None

	def _sign(self) -> int:
		direction = (self.get_settings().get("direction") or "right").strip().lower()
		return _DIR_SIGN.get(direction, 1)

	def _opt_float(self, key: str) -> float | None:
		raw = self.get_settings().get(key, "")
		if raw in (None, ""):
			return None
		try:
			return float(raw)
		except (TypeError, ValueError):
			return None

	def _at_last_position(self, delta: float) -> bool:
		"""True when the next step would be blocked (endstop) without cycle."""
		s = self.get_settings()
		if bool(s.get("cycle", False)):
			return False
		min_v = self._opt_float("min_value")
		max_v = self._opt_float("max_value")
		path = (s.get("dataref_path") or "").strip()
		if not path:
			return False
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
			_, blocked = apply_step(
				current,
				self._sign() * delta,
				min_v=min_v,
				max_v=max_v,
				cycle=False,
			)
			return blocked
		except Exception:
			return False

	def _begin_hold(self, path: str) -> None:
		try:
			xplane = self.plugin_base.xplane
			cmd_id = xplane.get_command_id(path)
			xplane.begin_command(cmd_id)
			self._hold_id = cmd_id
			log.info(f"rotary hold begin: {path} (id={cmd_id})")
		except Exception as err:
			log.error(f"rotary hold begin failed: {path}: {err}")
			self.show_error(duration=2)

	def _fire_command(self, path: str) -> None:
		try:
			xplane = self.plugin_base.xplane
			cmd_id = xplane.get_command_id(path)
			xplane.activate_command(cmd_id)
			log.info(f"rotary command: {path}")
		except Exception as err:
			log.error(f"rotary command failed: {path}: {err}")
			self.show_error(duration=2)

	def _step_dataref(self, delta: float) -> None:
		s = self.get_settings()
		path = (s.get("dataref_path") or "").strip()
		min_v = self._opt_float("min_value")
		max_v = self._opt_float("max_value")
		cycle = bool(s.get("cycle", False))
		hide_endstop = bool(s.get("hide_endstop_alert", False))
		step = self._sign() * delta

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
			target, blocked = apply_step(
				current, step, min_v=min_v, max_v=max_v, cycle=cycle
			)
			if blocked:
				log.info(f"rotary endstop {path} value={current}")
				if not hide_endstop:
					self.show_error(duration=1)
				return
			xplane.write_dataref(dr_id, target, index)
			self._last_value = target
			self._paint_value(target)
			log.info(f"rotary step {path}: {current} → {target}")
		except Exception as err:
			log.error(f"rotary step failed: {err}")
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
