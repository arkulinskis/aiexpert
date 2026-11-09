from anvil import *

from ._anvil_designer import CredRowTemplate
from ... import ax


class CredRow(CredRowTemplate):
    """A credential on the dashboard. item = {credential, code, issued}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        self.dom_nodes["a"].setAttribute("href", "#certificate/" + c["code"])
        self.dom_nodes["title"].textContent = c["credential"]
        self.dom_nodes["sub"].textContent = "%s · %s" % (c["code"], ax.date(c.get("issued")))
