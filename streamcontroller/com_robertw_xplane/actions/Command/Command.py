"""X-Plane Command — fire a CommandRef on key / dial press."""

from __future__ import annotations

from GtkHelper.GenerativeUI.EntryRow import EntryRow
from GtkHelper.GenerativeUI.SwitchRow import SwitchRow
from loguru import logger as log
from src.backend.DeckManagement.InputIdentifier import Input
from src.backend.PluginManager.ActionCore import ActionCore
from src.backend.PluginManager.EventAssigner import EventAssigner


class Command(ActionCore):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.has_configuration = True
		self.add_event_assigner(
			EventAssigner(
				id="xplane_command_pressed",
				ui_label="Activate",
				default_events=[Input.Key.Events.DOWN, Input.Dial.Events.DOWN],
				callback=self.on_activate,
			)
		)

	def on_ready(self) -> None:
		self.set_media(media_path=self.get_asset_path("info.png"), size=0.75)
		path = (self.get_settings().get("command_path") or "").strip()
		label = (self.get_settings().get("label") or "").strip()
		self.set_top_label(label)
		self.set_bottom_label(path.split("/")[-1] if path else "Command")

	def get_config_rows(self):
		EntryRow(
			action_core=self,
			var_name="command_path",
			default_value="sim/operation/pause_toggle",
			title="Command Path",
			on_change=lambda *_: self.on_ready(),
		)
		EntryRow(
			action_core=self,
			var_name="label",
			default_value="",
			title="Label",
			on_change=lambda *_: self.on_ready(),
		)
		SwitchRow(
			action_core=self,
			var_name="hide_error",
			default_value=False,
			title="Hide error overlay",
		)
		return self.get_generative_ui_widgets()

	def on_activate(self, _data=None) -> None:
		path = (self.get_settings().get("command_path") or "").strip()
		if not path:
			self.show_error(duration=2)
			return
		try:
			xplane = self.plugin_base.xplane
			cmd_id = xplane.get_command_id(path)
			xplane.activate_command(cmd_id)
			log.info(f"xplane command: {path} (id={cmd_id})")
		except Exception as err:
			log.error(f"xplane command failed: {path}: {err}")
			if not self.get_settings().get("hide_error", False):
				self.show_error(duration=2)
