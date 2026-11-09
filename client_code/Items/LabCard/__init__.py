from anvil import *

from ._anvil_designer import LabCardTemplate
from ... import ax


class LabCard(LabCardTemplate):
    """A lab as a card on #labs. item = a lab from get_labs (with best = the member's best score or None)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        x = self.item
        n = self.dom_nodes
        n["a"].setAttribute("href", "#labs/" + x["id"])
        n["fig"].innerHTML = ax.fig(x.get("fig"))
        n["where"].textContent = x.get("track_title") or ""
        n["title"].textContent = x.get("title") or ""
        n["blurb"].textContent = x.get("blurb") or ""
        n["mins"].textContent = "%d min" % (x.get("minutes") or 0)
        n["done"].hidden = x.get("best") is None
