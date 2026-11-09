from anvil import *

from ._anvil_designer import PlanWeekTemplate
from ... import ax


class PlanWeek(PlanWeekTemplate):
    """One week of a study plan: its dates, total minutes and its steps. item = a week from Plan.build."""

    def __init__(self, **properties):
        super().__init__(**properties)
        w = self.item
        n = self.dom_nodes
        n["box"].classList.toggle("current", bool(w.get("current")))
        n["box"].classList.toggle("done", bool(w.get("done")))
        n["title"].textContent = "Week %d%s" % (w["n"], " · this week" if w.get("current") else "")
        mins = w.get("minutes") or 0
        n["meta"].textContent = "from %s · about %s h%s" % (ax.date(w["begins"]), ax.hours(mins), " · done" if w.get("done") else "")
        self.steps_panel.items = w["steps"]
