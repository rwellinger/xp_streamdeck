# Import StreamController modules
from src.backend.DeckManagement.InputIdentifier import Input
from src.backend.PluginManager.ActionHolder import ActionHolder
from src.backend.PluginManager.ActionInputSupport import ActionInputSupport
from src.backend.PluginManager.PluginBase import PluginBase

from .actions.Command.Command import Command
from .actions.DataRefDisplay.DataRefDisplay import DataRefDisplay
from .actions.Encoder.Encoder import Encoder
from .actions.Rotary.Rotary import Rotary
from .xplane import XPlaneClient


class XPlanePlugin(PluginBase):
	def __init__(self):
		super().__init__()

		self.xplane = XPlaneClient()
		self.xplane.ping()

		self.add_action_holder(
			ActionHolder(
				plugin_base=self,
				action_core=Command,
				action_id_suffix="Command",
				action_name="Command",
				action_support={
					Input.Key: ActionInputSupport.SUPPORTED,
					Input.Dial: ActionInputSupport.SUPPORTED,
					Input.Touchscreen: ActionInputSupport.UNSUPPORTED,
				},
			)
		)
		self.add_action_holder(
			ActionHolder(
				plugin_base=self,
				action_core=DataRefDisplay,
				action_id_suffix="DataRefDisplay",
				action_name="DataRef Display",
				action_support={
					Input.Key: ActionInputSupport.SUPPORTED,
					Input.Dial: ActionInputSupport.SUPPORTED,
					Input.Touchscreen: ActionInputSupport.UNSUPPORTED,
				},
			)
		)
		self.add_action_holder(
			ActionHolder(
				plugin_base=self,
				action_core=Encoder,
				action_id_suffix="Encoder",
				action_name="Encoder",
				action_support={
					Input.Key: ActionInputSupport.SUPPORTED,
					Input.Dial: ActionInputSupport.SUPPORTED,
					Input.Touchscreen: ActionInputSupport.UNSUPPORTED,
				},
			)
		)
		self.add_action_holder(
			ActionHolder(
				plugin_base=self,
				action_core=Rotary,
				action_id_suffix="Rotary",
				action_name="Rotary",
				action_support={
					Input.Key: ActionInputSupport.SUPPORTED,
					Input.Dial: ActionInputSupport.SUPPORTED,
					Input.Touchscreen: ActionInputSupport.UNSUPPORTED,
				},
			)
		)

		self.register(
			plugin_name="X-Plane",
			github_repo="https://github.com/4SLSL/xp-sdcontroller",
			plugin_version="0.2.0",
			app_version="1.5.0-beta.14",
		)
