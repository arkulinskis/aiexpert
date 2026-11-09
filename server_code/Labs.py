"""Labs: hands-on simulators that run in the browser (theme/assets/ax-labs.js). The server lists them and records runs.

A lab run is saved when the learner reaches the lab's goal (the engine decides; score 0-100). The first completed run
of each lab gives LAB_XP. Labs work for visitors too; only members' runs are saved.
"""
import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import Curriculum as K
from . import Learning as L

LAB_XP = 15

LABS = [
    {"id": "cost", "title": "Token and cost calculator", "module": "core-tokens", "fig": "tokens", "minutes": 8,
     "blurb": "Model a feature's tokens per call, calls per day and model mix, then use caching, batching, shorter outputs and routing to hit a budget.",
     "goal": "Bring the sample feature under its monthly budget without cutting traffic."},
    {"id": "chunk", "title": "Chunking workbench", "module": "rag-chunk", "fig": "rag", "minutes": 8,
     "blurb": "Split a real-looking policy document by size or by structure, add context headers, and see which chunks still make sense alone.",
     "goal": "Find settings where every chunk answering the test questions carries its section context."},
    {"id": "retrieval", "title": "Hybrid retrieval lab", "module": "rag-hybrid", "fig": "rag", "minutes": 12,
     "blurb": "Run 10 test queries against a small corpus with keyword search, vector-style search, RRF fusion and a reranker. Watch recall@3 and MRR change.",
     "goal": "Reach recall@3 of at least 90% on the test queries."},
    {"id": "judge", "title": "Judge calibration lab", "module": "evl-judge", "fig": "evals", "minutes": 10,
     "blurb": "Label 16 answers yourself, compare with an LLM judge's verdicts, and compute true positive rate, true negative rate and Cohen's kappa.",
     "goal": "Label every answer and read the judge's real error rates."},
]
LAB_BY_ID = {x["id"]: x for x in LABS}


def lab_public(x):
    m = K.MODULES.get(x["module"])
    return dict(x, module_title=m["title"] if m else "", track=m["track"] if m else "",
                track_title=K.TRACK_BY_ID[m["track"]]["title"] if m else "")


@anvil.server.callable
def get_labs():
    me = C.me()
    best = {}
    if me is not None:
        for r in app_tables.lab_runs.search(user=me):
            best[r["lab"]] = max(best.get(r["lab"], 0), int(r["score"] or 0))
    out = []
    for x in LABS:
        d = lab_public(x)
        d["best"] = best.get(x["id"]) if me is not None else None
        out.append(d)
    return {"labs": out, "signed_in": me is not None}


@anvil.server.callable
def get_lab(lab_id):
    x = LAB_BY_ID.get(lab_id)
    if x is None:
        return C.fail("That lab doesn't exist.")
    me = C.me()
    d = lab_public(x)
    d["best"] = None
    if me is not None:
        scores = [int(r["score"] or 0) for r in app_tables.lab_runs.search(user=me, lab=lab_id)]
        d["best"] = max(scores) if scores else None
    others = [lab_public(y) for y in LABS if y["id"] != lab_id]
    return C.ok(lab=d, others=others, signed_in=me is not None)


@anvil.server.callable(require_user=True)
def save_lab_run(lab_id, score, detail=None, client_day=None):
    me = C.require_user()
    if lab_id not in LAB_BY_ID:
        return C.fail("That lab doesn't exist.")
    try:
        score = max(0, min(100, int(score)))
    except (TypeError, ValueError):
        return C.fail("The lab score must be a number.")
    if C.rate_limited("lab", 60, 3600):
        return C.fail("That's a lot of lab runs in one hour. Take a short break.")
    clean: dict = {}
    if isinstance(detail, dict):
        for k, v in list(detail.items())[:12]:
            if isinstance(v, (int, float, bool)):
                clean[str(k)[:40]] = v
            elif isinstance(v, str):
                clean[str(k)[:40]] = v[:200]
    first = len(app_tables.lab_runs.search(user=me, lab=lab_id)) == 0
    app_tables.lab_runs.add_row(user=me, lab=lab_id, score=score, detail=clean, created=C.now(), is_demo=False)
    gained = LAB_XP if first else 2
    L.add_xp(me, gained, L.today(client_day))
    return C.ok(first=first, xp_gained=gained, xp=me["xp"])
