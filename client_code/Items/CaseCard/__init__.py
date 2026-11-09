from anvil import *

from ._anvil_designer import CaseCardTemplate
from ... import ax


class CaseCard(CaseCardTemplate):
    """An incident file teaser. item = a case brief {id, title, company, year, tone, summary}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        n = self.dom_nodes
        n["a"].setAttribute("href", "#cases/" + c["id"])
        n["a"].className = "ax-case " + (c.get("tone") or "")
        self.tone.text, self.tone.role = ax.tone_badge(c.get("tone"))
        n["where"].textContent = "%s · %s" % (c.get("company") or "", c.get("year") or "")
        n["title"].textContent = c.get("title") or ""
        n["summary"].textContent = c.get("summary") or ""
