from anvil import *
from anvil.js import window

from ._anvil_designer import HomeTemplate
from ... import ax, state


def _greeting():
    h = window.Date().getHours()
    return "Good morning" if h < 12 else "Good afternoon" if h < 18 else "Good evening"


class Home(HomeTemplate):
    """#home (Operate): the member's dashboard from get_dashboard: rank, XP and streak; today's review with the week
    strip; this week's plan (or an invitation to make one); examinations ready; continue where you left off; programs;
    credentials; incident of the day; Honour Roll."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        d = state.call("get_dashboard", ax.today())
        if d:
            self._draw(d)

    def _draw(self, d):
        me, n = d["me"], self.dom_nodes
        r = me["rank"]
        first = ((state.me() or {}).get("name") or "").split(" ")[0]
        ax.set_text(n["greeting"], "%s, %s" % (_greeting(), first) if first else _greeting())
        bits = [me["title"]] if me.get("title") else []
        bits += ["%d of %d drills learned" % (d["learned"], d["total_items"]),
                 "%d of %d modules complete" % (d["modules_done"], d["modules_total"]),
                 state.plural(len(d["credentials"]), "credential")]
        ax.set_text(n["sub"], " · ".join(bits))
        ax.set_text(n["rank"], r["rank"])
        ax.set_text(n["xp"], "%d XP" % me["xp"])
        into = 100 if not r["next_at"] else int(round(100.0 * (me["xp"] - r["floor"]) / (r["next_at"] - r["floor"])))
        self.rank_bar.pct = into
        ax.set_text(n["next_rank"], "%d XP to %s" % (r["next_at"] - me["xp"], r["next"]) if r["next"] else "The highest rank")
        ax.set_text(n["streak"], state.plural(me["streak"], "day"))
        # today's review
        due = d["due"]
        ax.set_text(n["due"], due)
        ax.set_text(n["due_title"], "Drills due for review today" if due else "You're up to date")
        ax.set_text(n["due_text"], "A few minutes of recall keeps it for months." if due
                    else "New drills come due as your memory needs them. Keep going with a module.")
        self.week_panel.items = d["week"]
        self.review_link.visible, self.programs_link.visible = bool(due), not due
        self._plan(d.get("plan"))
        tracks = {t["id"]: t for t in d["tracks"]}
        self.exams_panel.items = [tracks[i] for i in d["ready_exam"] if i in tracks]
        self.exams_panel.visible = bool(d["ready_exam"])
        # continue / up next
        nx = d.get("next")
        self.next_card.visible, self.all_done.visible = bool(nx), not nx
        if nx:
            st = nx["status"]
            n["next_img"].innerHTML = ax.fig(nx.get("fig"))
            ax.set_text(n["next_title"], nx["title"])
            ax.set_text(n["next_where"], "%s · %s · Module %d" % ("Continue" if st["pct"] else "Up next", nx["track"], nx["n"]))
            ax.set_text(n["next_summary"], nx["summary"])
            self._step(n["st_read"], st["read"], "Briefing")
            self._step(n["st_drill"], st["learned"] == st["total"], "Drills %d/%d" % (st["learned"], st["total"]))
            self._step(n["st_ch"], st["challenge_passed"], "Challenge")
            go = n["next_go"]
            go.setAttribute("href", "#module/" + nx["id"])
            go.innerHTML = '<i class="ic ic-arrow"></i>' + ("Continue" if st["pct"] else "Begin")
        self.tracks_panel.items = d["tracks"]
        self.creds_panel.items = d["credentials"]
        self.no_creds.visible = not d["credentials"]
        self.creds_panel.visible = bool(d["credentials"])
        c = d["case"]
        self.case_tone.text, self.case_tone.role = ax.tone_badge(c["tone"])
        ax.set_text(n["case_where"], "%s · %s" % (c["company"], c["year"]))
        ax.set_text(n["case_title"], c["title"])
        ax.set_text(n["case_summary"], c["summary"])
        n["case_link"].setAttribute("href", "#cases/" + c["id"])
        self.honour_panel.items = [dict(h, compact=True) for h in d["honour"]]
        self.no_honour.visible = not d["honour"]
        self.honour_panel.visible = bool(d["honour"])

    def _plan(self, p):
        self.plan_card.visible, self.noplan_card.visible = bool(p), not p
        if not p:
            return
        w = p.get("week")
        if w:
            meta = "Week %d of %d · %s" % (w["n"], p["total_weeks"], p["goal_label"])
            if p.get("behind"):
                meta += " · %s behind" % state.plural(p["behind"], "week")
            self.plan_panel.items = w["steps"]
        else:
            meta = "Every step done. Time to aim for the next credential."
            self.plan_panel.items = []
        ax.set_text(self.dom_nodes["plan_meta"], meta)

    def _step(self, node, ok, label):
        node.className = "ui-badge good" if ok else "ui-badge"
        node.innerHTML = '<i class="ic ic-%s"></i>' % ("check" if ok else "clock")
        node.appendChild(window.document.createTextNode(label))
