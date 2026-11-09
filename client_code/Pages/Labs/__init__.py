import json

import anvil.server
from anvil import *

from ._anvil_designer import LabsTemplate
from ... import ax, state


class Labs(LabsTemplate):
    """#labs: the list of labs (get_labs). #labs/<id>: one lab (get_lab) in the LabStage engine; when the learner
    reaches the goal, members' runs are saved (save_lab_run) with XP the first time. Visitors can play every lab."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.lab_id = args[0] if args else ""
        self._saved = False
        if self.lab_id:
            self._one()
        else:
            self._all()

    def _all(self):
        self.lab_box.visible, self.missing_box.visible = False, False
        self.hero.set(fig="rag", title="Labs: feel the numbers",
                      lead="Small simulators for the ideas that are easier to understand with your hands: token budgets, chunking, hybrid retrieval and judge calibration.",
                      crumbs=[["#tracks", "Programs"], [None, "Labs"]])
        d = anvil.server.call("get_labs")
        self.labs_panel.items = d["labs"]

    def _one(self):
        self.list_box.visible = False
        r = anvil.server.call("get_lab", self.lab_id)
        if not r.get("ok"):
            self.lab_box.visible = False
            self.hero.set(title="Lab not found", crumbs=[["#labs", "Labs"], [None, "Not found"]])
            return
        self.missing_box.visible = False
        x = r["lab"]
        self.signed_in = r["signed_in"]
        ax.title(x["title"])
        self.hero.set(fig=x["fig"], title=x["title"], lead=x["blurb"],
                      crumbs=[["#labs", "Labs"], [None, x["title"]]],
                      meta=[["clock", "About %d min" % x["minutes"]], ["book", x["track_title"]]])
        self.goal_label.text = x["goal"]
        self.best_label.visible = x.get("best") is not None
        self.best_label.text = "Completed" if x.get("best") is not None else ""
        n = self.dom_nodes
        n["module_link"].setAttribute("href", "#module/" + x["module"])
        ax.set_text(n["module_text"], "Read: " + x["module_title"])
        self.stage.lab = x["id"]

    @handle("stage", "lab_done")
    def stage_lab_done(self, score, detail, **event_args):
        if self._saved:
            return
        self._saved = True
        self.best_label.visible, self.best_label.text = True, "Completed"
        if not self.signed_in:
            state.toast("Goal reached! Enrol (free) to have your labs recorded.", "ok")
            return
        try:
            d = json.loads(detail or "{}")
        except Exception:
            d = {}
        r = state.call("save_lab_run", self.lab_id, score, d if isinstance(d, dict) else {}, ax.today())
        if r:
            state.toast("Goal reached · +%d XP" % r["xp_gained"], "ok")
            if r["first"]:
                ax.confetti()
