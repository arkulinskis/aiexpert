import anvil.server
from anvil import *

from ._anvil_designer import StudyTemplate
from ... import ax, router, state


class Study(StudyTemplate):
    """#study, #study/review, #study/<module id>: a drill session with the Drill component (get_study loads the
    items; every rating is saved at once with rate_item: Leitner boxes), then a summary."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.scope = args[0] if args else "review"
        self.completed: list = []
        self.empty.visible = self.session.visible = self.done_card.visible = False
        n = self.dom_nodes
        if self.scope == "review":
            n["back"].setAttribute("href", "#home")
            n["back"].innerHTML = '<i class="ic ic-back"></i>Dashboard'
        else:
            n["back"].setAttribute("href", "#module/" + self.scope)
            n["back"].innerHTML = '<i class="ic ic-back"></i>Back to the module'
        d = state.call("get_study", self.scope, ax.today())
        if not d:
            return
        ax.set_text(n["title"], d["title"])
        ax.set_text(n["subtitle"], d["subtitle"])
        if not d["items"]:
            self.empty.visible = True
            return
        ax.set_text(n["legend"], "Spaced repetition: each \u201cGot it\u201d moves a drill up a box. Next review after "
                    + " · ".join("%dd" % b for b in d["boxes"][1:]) + ".")
        self.session.visible = True
        self.drill.start(d["items"], exam=False, rate=self._rate, done=self._done)

    def _rate(self, item, knew):
        r = anvil.server.call_s("rate_item", item["id"], knew, ax.today())
        if isinstance(r, dict) and r.get("ok") is False:
            state.toast(r.get("error") or "That rating wasn't saved.", "error")
        elif r and r.get("module_completed"):
            self.completed.append(r["module_title"])
            state.toast("Module complete: " + r["module_title"], "ok")
            ax.confetti()

    def _done(self, s):
        n_all = s["got"] + s["missed"]
        pct = int(round(100.0 * s["got"] / n_all)) if n_all else 0
        n = self.dom_nodes
        self.session.visible, self.done_card.visible = False, True
        ax.set_text(n["score"], "%d%%" % pct)
        ax.set_text(n["got"], s["got"])
        ax.set_text(n["missed"], s["missed"])
        ax.set_text(n["xp"], "+%d" % (s["got"] * 3 + s["missed"]))
        if self.completed:
            ax.set_text(n["completed"], "Module complete: " + ", ".join(self.completed))
            n["completed"].hidden = False
        ax.set_text(n["advice"], "The ones you missed come back today. Revisit them before you sleep." if s["missed"]
                    else "Excellent. These drills will return when your memory needs them.")
        review = self.scope == "review"
        self.dash_link.visible = review
        self.again_button.visible = not review
        n["module_a"].hidden = review
        n["module_a"].setAttribute("href", "#module/" + self.scope)
        if pct >= 90 and n_all >= 5:
            ax.confetti()

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        router.go("study", self.scope)
