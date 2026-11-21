import anvil.server
from anvil import *

from ._anvil_designer import EvidencePickerTemplate
from ... import ax, state


class EvidencePicker(EvidencePickerTemplate):
    """The holder chooses what their certificate shows (get_evidence_options, save_evidence). Closes with the new
    evidence list on save, or None. Everything is off until ticked."""

    def __init__(self, code, **properties):
        super().__init__(**properties)
        self.code = code
        self.boxes: list = []
        self.fellow = False
        state.set_control_attr(self.url_box, "autocomplete", "url")
        state.set_control_attr(self.url_box, "inputmode", "url")
        self.form_box.visible = self.error_box.visible = False
        self.save_button.enabled = False
        try:
            r = anvil.server.call("get_evidence_options", code)
        except Exception:
            r = {"ok": False, "error": "Couldn't load your answers. Check your connection and try again."}
        self.loading_box.visible = False
        if not r or not r.get("ok"):
            self._error((r or {}).get("error") or "Couldn't load your answers.")
            return
        self._draw(r)

    def _error(self, text):
        self.error_box.visible = True
        self.error_label.text = text

    def _draw(self, r):
        self.form_box.visible = True
        self.save_button.enabled = True
        ch = r["chosen"]
        self.fellow = bool(r.get("fellow"))
        n = self.dom_nodes
        if self.fellow:
            comps = r.get("components") or []
            ax.set_text(n["cap_legend"], "Component certificates")
            self.capstone_box.text = "Show my %d component certificates (with links to each)" % len(comps)
            self.capstone_box.visible = bool(comps)
            self.no_capstone.visible = not comps
            self.att_group.visible = False
        else:
            cap = r.get("capstone")
            self.capstone_box.visible = bool(cap)
            self.no_capstone.visible = not cap
            if cap:
                self.capstone_box.text = "Capstone “%s”: my answer and rubric ticks (%d%%, %s)" % (
                    cap["title"], cap["score"], ax.date(cap["date"]))
            atts = r.get("attempts") or []
            self.no_attempts.visible = not atts
            for a in atts:
                box = CheckBox(text="%s: “%s” (%d%%, %s)" % (a["label"], a["title"], a["score"], ax.date(a["date"])),
                               checked=a["id"] in ch["attempts"], role=["ax-check"])
                self.att_panel.add_component(box)
                self.boxes.append((a["id"], box))
        self.capstone_box.checked = bool(ch["show_capstone"])
        self.url_box.text = ch.get("project_url") or ""
        self.note_box.text = ch.get("project_note") or ""

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        url = (self.url_box.text or "").strip()
        note = (self.note_box.text or "").strip()
        if url and not url.startswith("https://"):
            self._error("The project link must start with https://")
            return
        if len(note) > 140:
            self._error("Keep the note to 140 characters (it has %d)." % len(note))
            return
        self.error_box.visible = False
        ids = [aid for aid, box in self.boxes if box.checked]
        self.save_button.enabled = False
        try:
            r = anvil.server.call("save_evidence", self.code, bool(self.capstone_box.checked), ids, url, note)
        except Exception:
            r = {"ok": False, "error": "Couldn't save. Check your connection and try again."}
        self.save_button.enabled = True
        if not r or not r.get("ok"):
            self._error((r or {}).get("error") or "Couldn't save.")
            return
        self.raise_event("x-close-alert", value=r.get("evidence") or [])
