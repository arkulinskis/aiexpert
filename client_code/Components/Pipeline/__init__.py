from anvil import *
from anvil.js import window

from ._anvil_designer import PipelineTemplate


class Pipeline(PipelineTemplate):
    """The landing hero's before/after diagram (AX.pipeline). Mounted when shown, cleaned up when hidden."""

    def __init__(self, **properties):
        self._stop = None
        super().__init__(**properties)
        self.add_event_handler("show", self._on_show)
        self.add_event_handler("hide", self._on_hide)

    def _on_show(self, **event_args):
        if self._stop is None:
            self._stop = window.AX.pipeline(self.dom_nodes["box"])

    def _on_hide(self, **event_args):
        if self._stop is not None:
            self._stop()
            self._stop = None
