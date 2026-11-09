from anvil import *

from ._anvil_designer import PlanStepTemplate


class PlanStep(PlanStepTemplate):
    """One step of a study plan (a module or a final exam) as a row link with a done tick.
    item = {kind, id, title, track, minutes, done, pct} from Plan.build."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item
        n = self.dom_nodes
        n["a"].setAttribute("href", ("#module/" if s["kind"] == "module" else "#exam/") + s["id"])
        n["a"].classList.toggle("done", bool(s.get("done")))
        n["a"].classList.toggle("exam", s["kind"] == "exam")
        n["tick"].innerHTML = '<i class="ic ic-check"></i>' if s.get("done") else ""
        n["title"].textContent = s.get("title") or ""
        sub = s.get("track") or ""
        if s.get("done"):
            sub += " · done"
        elif s.get("pct"):
            sub += " · %d%%" % s["pct"]
        n["sub"].textContent = sub
        n["mins"].textContent = "%d min" % (s.get("minutes") or 0)
