import anvil.server
from anvil import *

from ._anvil_designer import LibraryTemplate
from ... import state


class Library(LibraryTemplate):
    """#library (Read): the curated outside resources (get_library), filterable by program, kind, free, and the member's
    reading list; search by words. #library/<track id> opens with that program selected. Members save with toggle_bookmark."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.hero.set(fig="architect", title="The Library",
                      lead="The best papers, guides, courses, books and tools for each program, picked by hand. Start with the ones marked Start here.",
                      crumbs=[["#tracks", "Programs"], [None, "Library"]])
        d = anvil.server.call("get_library")
        self.items = d["items"]
        self.saved = set(d["saved"])
        self.signed_in = d["signed_in"]
        self.track_box.items = [("All programs", "")] + [(t["title"], t["id"]) for t in d["tracks"]]
        self.kind_box.items = [("Every kind", "")] + [(k["label"] + "s", k["id"]) for k in d["kinds"]]
        state.set_control_attr(self.track_box, "aria-label", "Program")
        state.set_control_attr(self.kind_box, "aria-label", "Kind")
        state.set_control_attr(self.search_box, "type", "search")
        want = args[0] if args else ""
        if want in [t["id"] for t in d["tracks"]]:
            self.track_box.selected_value = want
        self.saved_box.visible = self.signed_in
        self.list_panel.add_event_handler("x-save", self._save)
        self._draw()

    def _draw(self):
        q = (self.search_box.text or "").strip().lower()
        track, kind = self.track_box.selected_value or "", self.kind_box.selected_value or ""
        free, mine = bool(self.free_box.checked), bool(self.saved_box.checked)
        rows = []
        for r in self.items:
            if track and track not in r["tracks"]:
                continue
            if kind and r["kind"] != kind:
                continue
            if free and r["cost"] != "free":
                continue
            if mine and r["id"] not in self.saved:
                continue
            if q and q not in (r["title"] + " " + r["by"] + " " + r["why"]).lower():
                continue
            rows.append(dict(r, saved=r["id"] in self.saved, can_save=self.signed_in))
        rows.sort(key=lambda r: (0 if r["start"] else 1))
        self.list_panel.items = rows
        self.count_label.text = state.plural(len(rows), "resource")
        self.empty_box.visible = not rows
        if mine and not self.saved:
            self.dom_nodes["empty_title"].textContent = "Your reading list is empty"
            self.dom_nodes["empty_text"].textContent = "Press Save on any resource to keep it here."
        else:
            self.dom_nodes["empty_title"].textContent = "Nothing matches"
            self.dom_nodes["empty_text"].textContent = "Try another word or clear a filter."

    def _save(self, ref, **event_args):
        key = state.focus_key()
        r = state.call("toggle_bookmark", ref)
        if r is None:
            return
        if r["saved"]:
            self.saved.add(ref)
        else:
            self.saved.discard(ref)
        self._draw()
        state.refocus(self.list_panel, key)

    @handle("search_box", "change")
    def search_box_change(self, **event_args):
        self._draw()

    @handle("track_box", "change")
    def track_box_change(self, **event_args):
        self._draw()

    @handle("kind_box", "change")
    def kind_box_change(self, **event_args):
        self._draw()

    @handle("free_box", "change")
    def free_box_change(self, **event_args):
        self._draw()

    @handle("saved_box", "change")
    def saved_box_change(self, **event_args):
        self._draw()
