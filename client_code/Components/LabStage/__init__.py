from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import LabStageTemplate


class LabStage(LabStageTemplate):
    """A lab engine (AX.lab) mounted on show, destroyed on hide. The engine is plain JS (sliders, tables, BM25, RRF),
    because rebuilding it on every slider move in the browser's Python would be far too slow."""

    def __init__(self, **properties):
        self._lab = ""
        self._stop = None
        self._shown = False
        super().__init__(**properties)
        self._done_fn = anvil.js.report_exceptions(self._done)
        self.add_event_handler("show", self._on_show)
        self.add_event_handler("hide", self._on_hide)

    @property
    def lab(self):
        return self._lab

    @lab.setter
    def lab(self, value):
        self._lab = value or ""
        if self._shown:
            self._mount()

    def _mount(self):
        self._unmount()
        if self._lab:
            self._stop = window.AX.lab(self.dom_nodes["box"], self._lab, self._done_fn)

    def _unmount(self):
        if self._stop is not None:
            self._stop()
            self._stop = None

    def _on_show(self, **event_args):
        self._shown = True
        self._mount()

    def _on_hide(self, **event_args):
        self._shown = False
        self._unmount()

    def _done(self, score, detail):
        self.raise_event("lab_done", score=score, detail=str(detail or "{}"))
