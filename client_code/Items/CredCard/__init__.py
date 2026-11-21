from anvil import *

from ._anvil_designer import CredCardTemplate
from ... import ax


class CredCard(CredCardTemplate):
    """One of the member's credentials: a live thumbnail of the certificate, the name, code, date and status."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        n = self.dom_nodes
        n["a"].setAttribute("href", "#certificate/" + c["code"])
        n["ev"].setAttribute("href", "#certificate/" + c["code"] + "/evidence")
        n["ev"].hidden = c.get("status") == "revoked"
        n["title"].textContent = c["credential"]
        n["sub"].textContent = "%s · %s" % (c["code"], ax.date(c.get("issued")))
        revoked = c.get("status") == "revoked"
        self.status.text = "Revoked" if revoked else "Valid"
        self.status.role = ["badge", "badge-bad" if revoked else "badge-good"]
        self.cert.cert = c
