import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import LandingTemplate
from ... import router, state

SAMPLE = {"holder": "Priya Raman", "credential": "Certificate in Production RAG", "code": "AIX-RAG-2026-T4WX9N",
          "track": "rag", "demo": True,
          "modules": ["Chunking and indexing", "Hybrid search", "Query rewriting and reranking", "Measuring retrieval and grounding"]}
SHOWN_CASES = ["replit", "echoleak", "aircanada"]


class Landing(LandingTemplate):
    """#landing (Persuade): the front door. The hero is the demo-vs-production pipeline (Components/Pipeline, a drag
    handle over two diagrams), then the reel's contrasts as a table, how learning works, the programs (get_catalog),
    the labs (get_labs), three incident files, the sample certificate with a credential lookup, the Honour Roll
    (get_honour_roll) and questions. Static copy lives in the template."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible, self.member_cta.visible = not me, bool(me)
        self.band_guest.visible, self.band_member.visible = not me, bool(me)
        self.sample_cert.cert = dict(SAMPLE, issued=str(window.Date().toISOString()))
        state.set_control_attr(self.code_box, "aria-label", "Credential ID")
        cat = state.call("get_catalog")
        if cat:
            self.programs_panel.items = cat["tracks"]
            n = self.dom_nodes
            n["n_tracks"].textContent = str(len(cat["tracks"]))
            n["n_modules"].textContent = str(cat["totals"]["modules"])
            n["n_cases"].textContent = str(cat["cases"])
            n["n_items"].textContent = str(cat["totals"]["items"])
        self.labs_panel.items = anvil.server.call_s("get_labs")["labs"]
        cases = anvil.server.call_s("get_cases")
        self.cases_panel.items = [c for c in cases["cases"] if c["id"] in SHOWN_CASES]
        honour = anvil.server.call_s("get_honour_roll")["items"][:6]
        self.honour_panel.items = honour
        self.no_honour.visible = not honour
        self.honour_panel.visible = bool(honour)

    @handle("code_box", "pressed_enter")
    def code_box_pressed_enter(self, **event_args):
        self.verify_button_click()

    @handle("verify_button", "click")
    def verify_button_click(self, **event_args):
        code = (self.code_box.text or "").strip()
        if code:
            router.go("verify", code.upper())
