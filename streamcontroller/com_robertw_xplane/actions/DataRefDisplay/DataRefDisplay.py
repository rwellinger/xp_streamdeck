"""X-Plane DataRef Display — live value on a key."""

from __future__ import annotations

from GtkHelper.GenerativeUI.EntryRow import EntryRow
from GtkHelper.GenerativeUI.SpinRow import SpinRow
from loguru import logger as log
from src.backend.PluginManager.ActionCore import ActionCore

from ...xplane import apply_index, format_value, parse_dataref_path


class DataRefDisplay(ActionCore):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.has_configuration = True
		self._last_path = ""

	def on_ready(self) -> None:
		self.set_media(media_path=self.get_asset_path("info.png"), size=0.75)
		s = self.get_settings()
		self.set_top_label((s.get("label") or "").strip())
		self._refresh()

	def on_tick(self) -> None:
		self._refresh()

	def get_config_rows(self):
		EntryRow(
			action_core=self,
			var_name="dataref_path",
			default_value="sim/cockpit2/gauges/indicators/airspeed_kts_pilot",
			title="DataRef Path",
			on_change=lambda *_: self.on_ready(),
		)
		EntryRow(
			action_core=self,
			var_name="label",
			default_value="IAS",
			title="Label",
			on_change=lambda *_: self.on_ready(),
		)
		EntryRow(
			action_core=self,
			var_name="format",
			default_value="%.0f",
			title="Format",
			on_change=lambda *_: self.on_ready(),
		)
		EntryRow(
			action_core=self,
			var_name="unit",
			default_value="kt",
			title="Unit",
			on_change=lambda *_: self.on_ready(),
		)
		SpinRow(
			action_core=self,
			var_name="unit_scale",
			default_value=1.0,
			title="Unit Scale",
			min=0.0,
			max=1_000_000.0,
			step=0.001,
			digits=6,
			on_change=lambda *_: self.on_ready(),
		)
		return self.get_generative_ui_widgets()

	def _refresh(self) -> None:
		s = self.get_settings()
		path = (s.get("dataref_path") or "").strip()
		if not path:
			self.set_center_label("")
			self.set_bottom_label("—")
			return
		try:
			xplane = self.plugin_base.xplane
			base, index = parse_dataref_path(path)
			dr_id = xplane.get_dataref_id(base)
			raw = apply_index(xplane.read_dataref(dr_id), index)
			scale_raw = s.get("unit_scale", 1.0)
			try:
				scale_f = float(scale_raw)
			except (TypeError, ValueError):
				scale_f = 1.0
			text = format_value(
				raw,
				fmt=(s.get("format") or "%s").strip() or "%s",
				unit=(s.get("unit") or "").strip(),
				unit_scale=None if scale_f == 1.0 else scale_f,
			)
			self.set_center_label(text)
			self.set_bottom_label("")
		except Exception as err:
			log.warning(f"dataref-display: {err}")
			self.set_center_label("OFFLINE" if not self.plugin_base.xplane.is_online() else "?")
