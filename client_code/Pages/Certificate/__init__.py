import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import CertificateTemplate
from ...Dialogs.LinkBox import LinkBox
from ... import ax, state


class Certificate(CertificateTemplate):
    """#certificate/<code>: public. The printable certificate (the ax-cert.js engine) with its verification status,
    copy link, print / save as PDF, and Add to LinkedIn for its holder. get_credential."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.code = args[0] if args else ""
        r = anvil.server.call("get_credential", self.code)
        found = bool(r and r.get("found"))
        self.found_part.visible, self.missing_part.visible = found, not found
        if not found:
            if r and r.get("ok") is False:
                ax.set_text(self.dom_nodes["missing_text"], r.get("error"))
            return
        c = r
        ax.title("%s, %s" % (c["holder"], c["credential"]))
        n = self.dom_nodes
        ax.set_text(n["title"], c["credential"])
        self.cert.cert = c
        url = ax.verify_url(c["code"])
        d = window.Date(c["issued"])
        q = window.encodeURIComponent
        li = ("https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=" + q(c["credential"]) +
              "&organizationName=" + q(ax.INSTITUTE) + "&issueYear=%d&issueMonth=%d" % (d.getFullYear(), d.getMonth() + 1) +
              "&certUrl=" + q(url) + "&certId=" + q(c["code"]))
        n["linkedin_a"].hidden = not (c.get("mine") and c["status"] == "valid")
        n["linkedin_a"].setAttribute("href", li)
        valid = c["status"] == "valid"
        self.valid_box.visible, self.revoked_box.visible = valid, not valid
        ax.set_text(n["valid_text"], "Issued by AI Expert and recorded on its public register." +
                    (" This is a sample record from AI Expert's demonstration data." if c.get("demo") else ""))
        ax.set_text(n["holder"], c["holder"])
        ax.set_text(n["code"], c["code"])
        ax.set_text(n["issued"], ax.date(c["issued"], "long"))
        ax.set_text(n["program"], c["title"])
        self.outcomes_card.visible = bool(c.get("outcomes"))
        self.outcomes_panel.items = c.get("outcomes") or []

    @handle("print_button", "click")
    def print_button_click(self, **event_args):
        window.print()

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        url = ax.verify_url(self.code.upper())
        try:
            window.navigator.clipboard.writeText(url)
            state.toast("Verification link copied", "ok")
        except Exception:
            alert(LinkBox(link=url), buttons=[], role="app-dialog")
