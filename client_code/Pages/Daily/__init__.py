import json

import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import DailyTemplate
from ...Dialogs.LinkBox import LinkBox
from ... import ax, state

GUEST_KEY = "ax-daily"   # localStorage: {"last": day, "streak": n, "best": n, "today": {"day", "score", "picks"}}


def _guest():
    try:
        raw = state.store_get(GUEST_KEY, "")
        d = json.loads(raw) if isinstance(raw, str) and raw else {}
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _prev_day(day):
    d = window.Date(day + "T12:00:00")
    d.setDate(d.getDate() - 1)
    return "%04d-%02d-%02d" % (d.getFullYear(), d.getMonth() + 1, d.getDate())


class Daily(DailyTemplate):
    """#daily (public): Daily 5, the same five "Demo or production?" calls for everyone each day (get_daily). One card
    at a time: two buttons, then the verdict, the why, the crowd figure and the module to learn it from. The end screen
    has the score, the marks, the streak, Copy result (LinkBox fallback) and LinkedIn. submit_daily records the play
    (crowd stats; members: XP once + their streak). Guests keep their streak in localStorage (GUEST_KEY)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.d: dict = {}
        self.picks: dict = {}
        self.i = 0
        self.share = ""
        self.hero.set(fig="evals", title="Daily 5: demo or production?",
                      lead="Five statements engineers really make. Call each one: production practice, or a demo trap? "
                           "Same five for everyone today, about a minute.",
                      meta=[["clock", "About 1 minute"], ["calendar", "New five every day"]])
        state.live(self.verdict_label)
        self._load()

    # ------------------------------------------------------------------ loading
    def _show(self, part):
        self.loading_box.visible = part == "loading"
        self.error_box.visible = part == "error"
        self.play_box.visible = part == "play"
        self.end_box.visible = part == "end"

    def _load(self):
        self._show("loading")
        try:
            d = anvil.server.call("get_daily", ax.today())
        except Exception:
            self._show("error")
            return
        if not d or not d.get("ok"):
            self._show("error")
            return
        self.d = d
        self.hero.set(meta=[["clock", "About 1 minute"], ["calendar", "Puzzle #%d" % d["number"]]])
        if d.get("played") and d.get("picks"):
            self.picks = dict(d["picks"])
            self._end(d.get("score"), d.get("streak") or 0, replay=True)
            return
        g = _guest()
        today = g.get("today") or {}
        if not d.get("member") and today.get("day") == d["day"] and isinstance(today.get("picks"), dict):
            self.picks = dict(today["picks"])
            self._end(None, int(g.get("streak") or 0), replay=True)
            return
        self.i = 0
        self.picks = {}
        self._card()

    @handle("retry_button", "click")
    def retry_button_click(self, **event_args):
        self._load()

    # ------------------------------------------------------------------ playing
    def _items(self):
        return self.d.get("items") or []

    def _dots(self):
        dots = self.dom_nodes["dots"]
        dots.innerHTML = ""
        for k, it in enumerate(self._items()):
            li = window.document.createElement("li")
            if it["id"] in self.picks:
                li.className = "ok" if self.picks[it["id"]] == it["sound"] else "no"
            elif k == self.i:
                li.className = "on"
            dots.appendChild(li)

    def _card(self):
        self._show("play")
        it = self._items()[self.i]
        n = self.dom_nodes
        ax.set_text(n["count"], "Call %d of %d" % (self.i + 1, len(self._items())))
        ax.set_text(n["track"], it["track"])
        ax.set_text(n["q"], "“%s”" % it["q"])
        self.choices.visible = True
        self.prod_button.enabled = self.demo_button.enabled = True
        self.verdict_box.visible = False
        self._dots()
        state.focus(self.prod_button)

    def _call(self, said_production):
        it = self._items()[self.i]
        self.picks[it["id"]] = bool(said_production)
        right = bool(said_production) == bool(it["sound"])
        self.choices.visible = False
        self.verdict_box.visible = True
        self.verdict_label.text = ("Right: " if right else "Not quite: ") + ("production practice" if it["sound"] else "a demo trap")
        self.verdict_label.role = ["dy-vhead", "dy-right" if right else "dy-wrong"]
        n = self.dom_nodes
        ax.set_text(n["why"], it["why"])
        crowd = it.get("crowd")
        ax.set_text(n["crowd"], ("%d%% of today's players called it right." % crowd) if crowd is not None
                    else "The crowd figure appears once five people have played today.")
        n["learn"].setAttribute("href", "#module/" + it["module"])
        ax.set_text(n["learn_text"], "Learn it: " + it["module_title"])
        last = self.i == len(self._items()) - 1
        self.next_button.text = "See my score" if last else "Next call"
        self._dots()
        state.focus(self.next_button)

    @handle("prod_button", "click")
    def prod_button_click(self, **event_args):
        self._call(True)

    @handle("demo_button", "click")
    def demo_button_click(self, **event_args):
        self._call(False)

    @handle("next_button", "click")
    def next_button_click(self, **event_args):
        if self.i < len(self._items()) - 1:
            self.i += 1
            self._card()
            return
        self._submit()

    def _submit(self):
        self.next_button.enabled = False
        r = None
        try:
            r = anvil.server.call("submit_daily", self.d["day"], self.picks)
        except Exception:
            r = None
        self.next_button.enabled = True
        if r and r.get("ok"):
            crowd = r.get("crowd") or {}
            for it in self._items():
                if crowd.get(it["id"]) is not None:
                    it["crowd"] = crowd[it["id"]]
            if r.get("xp_gained"):
                state.toast("Daily 5 done · +%d XP" % r["xp_gained"], "ok")
        elif r and r.get("error"):
            state.toast(r["error"], "error")
        else:
            state.toast("Your score couldn't be sent, but here it is.", "error")
        streak = int((r or {}).get("streak") or 0)
        if not self.d.get("member"):
            streak = self._guest_save()
        self._end(None, streak, replay=False)

    def _guest_save(self):
        g = _guest()
        day = self.d["day"]
        if g.get("last") == day:
            streak = int(g.get("streak") or 1)
        elif g.get("last") == _prev_day(day):
            streak = int(g.get("streak") or 0) + 1
        else:
            streak = 1
        g.update(last=day, streak=streak, best=max(streak, int(g.get("best") or 0)),
                 today={"day": day, "picks": self.picks})
        state.store_set(GUEST_KEY, json.dumps(g))
        return streak

    # ------------------------------------------------------------------ the end screen
    def _end(self, score, streak, replay):
        self._show("end")
        items = self._items()
        marks = [self.picks.get(it["id"]) == it["sound"] for it in items]
        got = sum(1 for m in marks if m)
        if score is None:
            score = got
        n = self.dom_nodes
        ax.set_text(n["score"], "%d/%d" % (score, len(items)))
        ax.set_text(n["score_sub"], ["Every call was a demo trap for you today. Read the why below.",
                                     "One right. The explanations below are the lesson.",
                                     "Two right. Worth reading the why on the ones you missed.",
                                     "Three right: better than a coin.", "Four right: sharp.",
                                     "Five for five: production instincts."][min(score, 5)] +
                    (" You already played today." if replay else ""))
        ax.set_text(n["streak"], state.plural(streak, "day") + " streak" if streak else "Streak starts today")
        g = _guest()
        sub = "Members' streaks count every day you learn here." if self.d.get("member") else \
            ("Best: %s" % state.plural(int(g.get("best") or streak), "day") if streak else "Play tomorrow to start one.")
        ax.set_text(n["streak_sub"], sub)
        line = "".join(["✓" if m else "✗" for m in marks])
        ax.set_text(n["marks_line"], line)
        url = "%s/#daily" % window.location.host
        self.share = "AI Expert Daily #%d · %d/%d %s %s" % (self.d["number"], score, len(items), line, url)
        ax.set_text(n["share_text"], self.share)
        q = window.encodeURIComponent
        n["linkedin_a"].setAttribute("href", "https://www.linkedin.com/sharing/share-offsite/?url=" +
                                     q("%s/#daily" % window.location.origin))
        now = window.Date()
        mins = 24 * 60 - (now.getHours() * 60 + now.getMinutes())
        ax.set_text(n["next_text"], "Next five in %d h" % round(mins / 60.0) if mins >= 90 else "Next five in %d min" % max(1, mins))
        self.guest_box.visible = not self.d.get("member")
        self._review(items)
        self._dots()
        state.focus(self.copy_button)

    def _review(self, items):
        box = self.dom_nodes["review"]
        box.innerHTML = ""
        doc = window.document
        for it in items:
            mine = self.picks.get(it["id"])
            right = mine == it["sound"]
            li = doc.createElement("li")
            li.className = "dy-item " + ("ok" if right else "no")
            head = doc.createElement("div")
            head.className = "dy-item-head"
            mark = doc.createElement("span")
            mark.className = "dy-mark"
            mark.textContent = "✓" if right else "✗"
            mark.setAttribute("aria-label", "You got this right" if right else "You missed this one")
            head.appendChild(mark)
            qt = doc.createElement("b")
            qt.textContent = "“%s”" % it["q"]
            head.appendChild(qt)
            li.appendChild(head)
            v = doc.createElement("p")
            v.className = "small dy-item-v"
            v.textContent = ("Production practice" if it["sound"] else "Demo trap") + \
                ("" if mine is None else " · you said %s" % ("production practice" if mine else "demo trap")) + \
                ("" if it.get("crowd") is None else " · %d%% of players right" % it["crowd"])
            li.appendChild(v)
            why = doc.createElement("p")
            why.className = "muted small"
            why.textContent = it["why"]
            li.appendChild(why)
            a = doc.createElement("a")
            a.className = "small"
            a.setAttribute("href", "#module/" + it["module"])
            a.textContent = "Learn it: %s (%s)" % (it["module_title"], it["track"])
            li.appendChild(a)
            box.appendChild(li)

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        try:
            window.navigator.clipboard.writeText(self.share)
            state.toast("Result copied", "ok")
        except Exception:
            alert(LinkBox(link=self.share, title="Your Daily 5 result", caption="Copy this text"), buttons=[], role="app-dialog")
