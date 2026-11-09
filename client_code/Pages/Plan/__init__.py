from anvil import *

from ._anvil_designer import PlanTemplate
from ... import ax, state


class Plan(PlanTemplate):
    """#plan (Operate): the member's study plan. Choose background, goal and hours a week (save_plan); see every module
    and final exam scheduled week by week with dates and progress (get_plan), plus warm-up resources."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.hero.set(fig="architect", title="Your study plan",
                      lead="A week-by-week route through all seven programs, ordered for your goal and paced to the hours you actually have.",
                      crumbs=[["#home", "Home"], [None, "Plan"]])
        self._opts = None
        r = state.call("get_plan")
        if r:
            self._draw(r)

    def _draw(self, r):
        o = r["options"]
        if self._opts is None:
            self._opts = o
            self.bg_box.items = [(x["label"], x["id"]) for x in o["backgrounds"]]
            self.goal_box.items = [(x["label"], x["id"]) for x in o["goals"]]
            self.hours_box.items = [("%d hours" % h, h) for h in o["hours"]]
            for box, label in ((self.bg_box, "Your background"), (self.goal_box, "Your goal"), (self.hours_box, "Hours a week")):
                state.set_control_attr(box, "aria-label", label)
        p = r.get("plan")
        if p:
            self.bg_box.selected_value = p["background"]
            self.goal_box.selected_value = p["goal"]
            self.hours_box.selected_value = p["hours"]
            self.save_button.text = "Update my plan"
        else:
            self.bg_box.selected_value = "software"
            self.goal_box.selected_value = "job"
            self.hours_box.selected_value = 5
        self.restart_button.visible = bool(p)
        self.empty_box.visible, self.plan_box.visible = not p, bool(p)
        s = r.get("schedule")
        if not s:
            return
        self.goal_label.text = p["goal_label"]
        self.ends_label.text = "%s · %s" % (ax.date(s["ends"], "long"), state.plural(s["total_weeks"], "week"))
        self.done_label.text = "%d of %d steps" % (s["done_steps"], s["total_steps"])
        self.behind_label.visible = bool(s["behind"])
        self.behind_label.text = ("You're %s behind. That's fine: restart the dates from this week, or add an hour."
                                  % state.plural(s["behind"], "week")) if s["behind"] else ""
        self.warm_panel.items = s["warmup"]
        self.warm_box.visible = bool(s["warmup"])
        self.weeks_panel.items = s["weeks"]

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        r = state.call("save_plan", self.bg_box.selected_value, self.hours_box.selected_value, self.goal_box.selected_value,
                       ax.today())
        if r:
            state.toast("Plan saved. Here's your route.", "ok")
            self._draw(r)

    @handle("restart_button", "click")
    def restart_button_click(self, **event_args):
        r = state.call("restart_plan", ax.today())
        if r:
            state.toast("Dates restarted from this week.", "ok")
            self._draw(r)
