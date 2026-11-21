from anvil import *
from anvil.js import window

from ._anvil_designer import EvidenceCardTemplate
from ... import ax


class EvidenceCard(EvidenceCardTemplate):
    """One piece of evidence on a public certificate (Credentials.evidence_public). item = {kind: capstone | challenge |
    components | project, label, title, ...}. Answers show exactly as submitted (pre-wrap); the rubric ticks are the
    holder's own and marked self-assessed; scenario and model answer stay folded."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        n = self.dom_nodes
        kind = it.get("kind")
        work = kind in ("capstone", "challenge")
        ax.set_text(n["label"], it.get("label"))
        ax.set_text(n["title"], it.get("title"))
        n["score"].hidden = not work
        if work:
            ax.set_text(n["score"], "%d%% self-scored · %s" % (it.get("score") or 0, ax.date(it.get("date"))))
        for key in ("sit_box", "answer_box", "rubric_box", "model_box"):
            n[key].hidden = not work
        n["comps"].hidden = kind != "components"
        n["project_box"].hidden = kind != "project"
        doc = window.document
        if work:
            ax.set_text(n["situation"], it.get("situation"))
            ax.set_text(n["ask"], it.get("ask"))
            ax.set_text(n["answer"], it.get("answer"))
            ax.set_text(n["model"], it.get("model"))
            ul = n["rubric"]
            for r in it.get("rubric") or []:
                li = doc.createElement("li")
                li.className = "on" if r.get("ticked") else ""
                mark = doc.createElement("span")
                mark.className = "ev-tick"
                mark.textContent = "✓" if r.get("ticked") else "–"
                li.appendChild(mark)
                txt = doc.createElement("span")
                txt.textContent = r.get("text") or ""
                li.appendChild(txt)
                sr = doc.createElement("span")
                sr.className = "ui-sr"
                sr.textContent = " (ticked by the holder)" if r.get("ticked") else " (not ticked)"
                li.appendChild(sr)
                ul.appendChild(li)
        if kind == "components":
            for c in it.get("components") or []:
                li = doc.createElement("li")
                a = doc.createElement("a")
                a.setAttribute("href", "#certificate/" + window.encodeURIComponent(c.get("code") or ""))
                a.textContent = c.get("credential") or ""
                li.appendChild(a)
                small = doc.createElement("small")
                small.textContent = " %s · %s" % (c.get("code") or "", ax.date(c.get("issued")))
                li.appendChild(small)
                n["comps"].appendChild(li)
        if kind == "project":
            url = it.get("url") or ""
            if url.startswith("https://"):
                n["link"].setAttribute("href", url)
            ax.set_text(n["link_text"], url)
            ax.set_text(n["title"], it.get("note") or "Project")
