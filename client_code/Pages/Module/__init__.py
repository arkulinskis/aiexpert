import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import ModuleTemplate
from ... import ax, router, state


class Module(ModuleTemplate):
    """#module/<id>: the public briefing (anyone can read it): Do / Avoid, incident files, sources, further reading and the module's lab. Members also get the
    three steps beside it: read the briefing (mark_read), drill (#study/<id>), the challenge (#challenge/<id>)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.id = args[0] if args else ""
        if not self.id:
            router.go("tracks")
            return
        self._load()

    def _load(self):
        r = anvil.server.call("get_module", self.id)
        if not r.get("ok"):
            self.hero.set(title="Module not found", crumbs=[["#tracks", "Programs"], [None, "Not found"]])
            self.body.visible, self.missing_part.visible = False, True
            return
        self.missing_part.visible = False
        self._draw(r["module"])

    def _draw(self, m):
        self.m = m
        ax.title(m["title"])
        t = m["track"]
        self.hero.set(fig=m["fig"], title=m["title"], lead=m["summary"],
                      crumbs=[["#tracks", "Programs"], ["#tracks/" + t["id"], t["title"]], [None, "Module %d" % m["n"]]],
                      meta=[["clock", "%d min" % m["minutes"]], ["cards", "%d recall · %d demo-or-production calls" % (m["cards"], m["advice"])],
                            ["target", "Challenge: " + m["challenge"]["title"]]])
        self.brief_panel.items = m["briefing"]
        self.do_panel.items = [{"text": x, "good": True} for x in m["do"]]
        self.dont_panel.items = [{"text": x, "good": False} for x in m["dont"]]
        self.cases_sec.visible = bool(m["cases"])
        self.cases_panel.items = m["cases"]
        self.sources_panel.items = m["sources"]
        self.reading_panel.items = m.get("reading") or []
        self.reading_sec.visible = bool(m.get("reading"))
        self.dom_nodes["library_link"].setAttribute("href", "#library/" + t["id"])
        lab = m.get("lab")
        self.lab_card.visible = bool(lab)
        if lab:
            self.dom_nodes["lab_link"].setAttribute("href", "#labs/" + lab)
            ax.set_text(self.dom_nodes["lab_text"], {"cost": "Token and cost calculator", "chunk": "Chunking workbench",
                                                     "retrieval": "Hybrid retrieval lab", "judge": "Judge calibration lab"}.get(lab, "Open the lab"))
        st = m.get("status")
        self.read_box.visible = bool(st and not st["read"])
        self.guest_card.visible, self.steps_card.visible = not st, bool(st)
        n = self.dom_nodes
        if not st:
            ax.set_text(n["guest_text"], "Enrol to drill the %d recall items with spaced repetition, take the challenge "
                        "\u201c%s\u201d, and work toward the %s certificate." % (m["items"], m["challenge"]["title"], t["title"]))
            return
        learned = st["learned"] == st["total"]
        ax.set_text(n["mod_of"], "Module %d of %d" % (m["n"], t["count"]))
        self.ring.pct = st["pct"]
        self.complete_box.visible = st["complete"]
        self._dot(self.step1, n["dot1"], st["read"], "I")
        self.read_button.visible = not st["read"]
        self._dot(self.step2, n["dot2"], learned, "II")
        ax.set_text(n["drill_title"], "Drill: %d of %d learned" % (st["learned"], st["total"]))
        ax.set_text(n["drill_text"], "%d mastered. Rate each one honestly." % st["mastered"])
        self.drill_bar.pct = 100.0 * st["learned"] / max(1, st["total"])
        self._link(n["drill_link"], "#study/" + m["id"], "cards", "Drill again" if st["learned"] else "Start drilling",
                   st["read"] and not learned)
        self._dot(self.step3, n["dot3"], st["challenge_passed"], "III")
        ax.set_text(n["ch_title"], "Challenge: " + m["challenge"]["title"])
        ax.set_text(n["ch_text"], ("Best score %d%%" % st["challenge"] + ("" if st["challenge_passed"] else " · 70% to pass"))
                    if st["challenge"] else "A production scenario. 70% to pass.")
        self._link(n["ch_link"], "#challenge/" + m["challenge"]["id"], "target", "Try again" if st["challenge"] else "Take the challenge",
                   learned and not st["challenge_passed"])
        nl = n["next_link"]
        if m.get("next"):
            nl.setAttribute("href", "#module/" + m["next"]["id"])
            ax.set_text(n["next_k"], "Next module")
            ax.set_text(n["next_t"], m["next"]["title"])
        else:
            nl.setAttribute("href", "#tracks/" + t["id"])
            ax.set_text(n["next_k"], "Last module")
            ax.set_text(n["next_t"], "Back to " + t["title"])

    def _dot(self, step, dot, done, numeral):
        step.classes["done"] = bool(done)
        dot.innerHTML = '<i class="ic ic-check"></i><span class="ui-sr">Done</span>' if done else numeral

    def _link(self, a, href, icon, text, primary):
        a.setAttribute("href", href)
        a.className = "ui-btn sm" + (" primary" if primary else "")
        a.innerHTML = '<i class="ic ic-%s"></i>' % icon
        a.appendChild(window.document.createTextNode(text))

    def _mark(self, to_drill):
        r = state.call("mark_read", self.id, ax.today())
        if not r:
            return
        state.toast("Module complete!" if r["module_completed"] else "Briefing read · +10 XP", "ok")
        if r["module_completed"]:
            ax.confetti()
        if to_drill:
            router.go("study", self.id)
        else:
            self._load()

    @handle("read_button", "click")
    def read_button_click(self, **event_args):
        self._mark(False)

    @handle("read_drill_button", "click")
    def read_drill_button_click(self, **event_args):
        self._mark(True)
