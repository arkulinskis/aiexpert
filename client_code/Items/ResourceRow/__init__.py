from anvil import *

from ._anvil_designer import ResourceRowTemplate
from ... import state


class ResourceRow(ResourceRowTemplate):
    """One Library resource: kind, free/paid, title (opens the original in a new tab), author, why it's worth it,
    and Save to the reading list for members. item = content_library.public(...) + optional "saved" / "can_save".
    Save raises x-save on the panel with ref=<id>; the page toggles it and redraws."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        n = self.dom_nodes
        n["kind"].textContent = r.get("kind_label") or ""
        n["cost"].textContent = "Free" if r.get("cost") == "free" else "Paid"
        n["cost"].className = "ui-badge " + ("good" if r.get("cost") == "free" else "warn")
        n["start"].hidden = not r.get("start")
        n["link"].setAttribute("href", r.get("url") or "#")
        n["link"].textContent = r.get("title") or ""
        n["link"].setAttribute("aria-label", "%s (opens in a new tab)" % (r.get("title") or ""))
        n["by"].textContent = r.get("by") or ""
        n["why"].textContent = r.get("why") or ""
        can = bool(r.get("can_save"))
        self.act_box.visible = can
        saved = bool(r.get("saved"))
        self.save_button.text = "Saved" if saved else "Save"
        self.save_button.role = ["btn", "btn-sm", "btn-primary" if saved else "btn-ghost", "ic-bookmark"]
        if can:
            state.set_control_attr(self.save_button, "aria-pressed", "true" if saved else "false")
            state.set_control_attr(self.save_button, "aria-label", "Save %s to your reading list" % (r.get("title") or ""))
            state.set_control_attr(self.save_button, "data-key", "save-" + r["id"])

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-save", ref=self.item["id"])
