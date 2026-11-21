"""Credentials: a member's certificates, public certificate pages and verification, and admin revocation.

A certificate page shows the holder's name (as it was when issued), the credential, the date and its status.
Anyone with the code can verify it; that's the point of a credential. Nothing else about the holder is shown, except
the evidence the holder opts in to (their own capstone/challenge answers and a project link; see 'evidence' below).
"""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import Curriculum as K


def cred_public(r):
    track = r["track"]
    t: dict = K.FELLOW if track == "fellow" else K.TRACK_BY_ID.get(track, {})
    return {"code": r["code"], "holder": r["holder"], "track": track, "title": K.track_title(track),
            "credential": K.credential_name(track), "track_code": t.get("code", ""), "issued": C.iso(r["issued"]),
            "status": "revoked" if r["revoked"] else "valid", "demo": bool(r["is_demo"]),
            "outcomes": t.get("outcomes", []), "modules": [K.MODULES[m]["title"] for m in t.get("modules", [])]}


def _find(code):
    code = C.text(code, 40).upper().replace(" ", "")
    if not code:
        return None
    return app_tables.credentials.get(code=code)


@anvil.server.callable(require_user=True)
def my_credentials():
    me = C.require_user()
    rows = sorted(app_tables.credentials.search(user=me), key=lambda r: r["issued"])
    have = {r["track"] for r in rows if not r["revoked"]}
    roles = [t for t in have if t not in ("core", "fellow")]
    return {"items": [cred_public(r) for r in rows], "honour_roll": bool(me["honour_roll"]),
            "fellow": {"have": "fellow" in have, "core": "core" in have, "roles": len(roles), "need_roles": K.FELLOW_NEED},
            "tracks": [{"id": t["id"], "title": t["title"], "credential": t["credential"], "have": t["id"] in have} for t in K.TRACKS]}


@anvil.server.callable
def get_credential(code):
    """Public: verify a credential code. Returns the certificate details, or found=False."""
    if C.rate_limited("verify", 60, 600):
        return C.fail("Too many lookups. Please wait a few minutes.")
    r = _find(code)
    if r is None:
        return {"found": False}
    out = cred_public(r)
    out["found"] = True
    me = C.me()
    out["mine"] = me is not None and r["user"] == me
    out["evidence"] = [] if r["revoked"] else evidence_public(r)
    return out


# ------------------------------------------------------------------------------------------- admin
@anvil.server.callable(require_user=True)
def admin_credentials(query=None):
    C.require_admin()
    q = C.text(query, 60).lower()
    rows = list(app_tables.credentials.search(tables.order_by("issued", ascending=False)))
    if q:
        rows = [r for r in rows if q in (r["code"] or "").lower() or q in (r["holder"] or "").lower()]
    out = []
    for r in rows[:300]:
        d = cred_public(r)
        u = C.live_user(r["user"])
        d["email"] = u["email"] if u is not None else ""
        out.append(d)
    return {"items": out, "total": len(rows)}


@anvil.server.callable(require_user=True)
def admin_set_revoked(code, flag):
    C.require_admin()
    r = _find(code)
    if r is None:
        return C.fail("No credential with that code.")
    r["revoked"] = bool(flag)
    return C.ok(item=cred_public(r))


# ------------------------------------------------------------------------------------------- evidence (opt-in)
# The holder can show their own work next to a certificate: the capstone answer from the passing exam, their best
# challenge attempts from the program's modules, and a self-reported project link. Nothing shows until they tick it.
# Stored in cert_evidence (one row per credential). Every read is guarded: no table yet = no evidence, page still works.
URL_MAX, NOTE_MAX, MAX_ATTEMPTS = 300, 140, 12


def _evidence_row(cred):
    try:
        return app_tables.cert_evidence.get(credential=cred)
    except Exception:
        return None


def _rubric(rubric, points):
    pts = points if isinstance(points, (list, tuple)) else []
    return [{"text": t, "ticked": bool(pts[i]) if i < len(pts) else False} for i, t in enumerate(rubric)]


def _track_modules(track_id):
    t = K.TRACK_BY_ID.get(track_id)
    return list(t["modules"]) if t else []


def _passing_exam(cred):
    user = C.live_user(cred["user"])
    if user is None or cred["track"] not in K.TRACK_BY_ID:
        return None
    best = None
    for e in app_tables.exams.search(user=user, track=cred["track"], passed=True):
        if (e["detail"] or {}).get("answer") and (best is None or (e["finished"] or C.now()) > (best["finished"] or C.now())):
            best = e
    return best


def _capstone_item(cred):
    ex = _passing_exam(cred)
    if ex is None:
        return None
    cap = K.TRACK_BY_ID[cred["track"]]["capstone"]
    detail = ex["detail"] or {}
    return {"kind": "capstone", "label": "Final examination · capstone scenario", "title": cap["title"],
            "situation": cap["situation"], "ask": cap["ask"], "answer": detail.get("answer") or "",
            "rubric": _rubric(cap["rubric"], detail.get("points")), "model": cap["model"],
            "score": int(ex["scenario_score"] or 0), "date": C.iso(ex["finished"])}


def _attempt_item(a):
    ch = K.CHALLENGES.get(a["challenge"])
    m = K.MODULES.get(a["module"])
    if ch is None or m is None:
        return None
    return {"kind": "challenge", "label": "Module %d challenge · %s" % (m["n"], m["title"]), "title": ch["title"],
            "situation": ch["situation"], "ask": ch["ask"], "answer": a["answer"] or "",
            "rubric": _rubric(ch["rubric"], a["points"]), "model": ch["model"], "score": int(a["score"] or 0),
            "date": C.iso(a["created"])}


def _components(cred):
    user = C.live_user(cred["user"])
    if user is None:
        return []
    rows = sorted([r for r in app_tables.credentials.search(user=user) if not r["revoked"] and r["track"] != "fellow"],
                  key=lambda r: r["issued"])
    return [{"credential": K.credential_name(r["track"]), "code": r["code"], "issued": C.iso(r["issued"])} for r in rows]


def _own_attempt(attempt_id, user, track_id):
    a = C.row_by_id(app_tables.attempts, attempt_id)
    if a is None or a["user"] != user or a["module"] not in _track_modules(track_id):
        return None
    return a


def _url_ok(url):
    if not isinstance(url, str) or not url.startswith("https://") or len(url) > URL_MAX:
        return False
    host = url[8:].split("/")[0]
    return "." in host and len(host) >= 3 and not any(c.isspace() or c in "<>\"'`\\" for c in url)


def evidence_public(cred):
    """The opted-in evidence for a certificate page (never emails, never items the holder didn't tick)."""
    ev = _evidence_row(cred)
    if ev is None:
        return []
    user = C.live_user(cred["user"])
    if user is None:
        return []
    items = []
    if ev["show_capstone"]:
        if cred["track"] == "fellow":
            comps = _components(cred)
            if comps:
                items.append({"kind": "components", "label": "Component certificates",
                              "title": "The certificates behind this credential", "components": comps})
        else:
            cap = _capstone_item(cred)
            if cap:
                items.append(cap)
    if cred["track"] != "fellow":
        for aid in (ev["attempts"] or [])[:MAX_ATTEMPTS]:
            a = _own_attempt(aid, user, cred["track"])
            it = _attempt_item(a) if a is not None else None
            if it:
                items.append(it)
    url = ev["project_url"] or ""
    if url and _url_ok(url):
        items.append({"kind": "project", "label": "Project · self-reported link", "title": ev["project_note"] or "Project",
                      "url": url, "note": ev["project_note"] or ""})
    return items


def _mine(code):
    me = C.require_user()
    r = _find(code)
    if r is None or r["user"] != me:
        return me, None, C.fail("That credential isn't yours.")
    if r["revoked"]:
        return me, None, C.fail("This credential has been revoked, so it can't show evidence.")
    return me, r, None


@anvil.server.callable(require_user=True)
def get_evidence_options(code):
    """What the holder could show on this certificate, and what it shows now."""
    me, r, err = _mine(code)
    if err is not None or r is None:
        return err
    track = r["track"]
    ev = _evidence_row(r)
    chosen = {"show_capstone": bool(ev and ev["show_capstone"]), "attempts": list((ev["attempts"] if ev else None) or []),
              "project_url": (ev["project_url"] if ev else "") or "", "project_note": (ev["project_note"] if ev else "") or ""}
    out: dict = {"code": r["code"], "credential": K.credential_name(track), "fellow": track == "fellow", "chosen": chosen,
                 "capstone": None, "attempts": [], "components": []}
    if track == "fellow":
        out["components"] = _components(r)
    else:
        cap = _capstone_item(r)
        if cap:
            out["capstone"] = {"title": cap["title"], "score": cap["score"], "date": cap["date"]}
        attempts = []
        for mid in _track_modules(track):
            rows = list(app_tables.attempts.search(user=me, module=mid))
            if not rows:
                continue
            best = max(rows, key=lambda a: (int(a["score"] or 0), C.iso(a["created"]) or ""))
            m = K.MODULES[mid]
            ch = K.CHALLENGES.get(best["challenge"]) or {}
            attempts.append({"id": best.get_id(), "label": "Module %d · %s" % (m["n"], m["title"]),
                             "title": ch.get("title", ""), "score": int(best["score"] or 0), "date": C.iso(best["created"])})
        out["attempts"] = attempts
    return C.ok(**out)


@anvil.server.callable(require_user=True)
def save_evidence(code, show_capstone, attempt_ids, project_url, project_note):
    """Choose what this certificate shows. Every attempt must be the caller's and from this program."""
    me, r, err = _mine(code)
    if err is not None or r is None:
        return err
    if C.rate_limited("evidence", 30, 3600):
        return C.fail("That's a lot of changes in one hour. Try again later.")
    track = r["track"]
    ids = attempt_ids if isinstance(attempt_ids, (list, tuple)) else []
    if len(ids) > MAX_ATTEMPTS:
        return C.fail("Choose at most %d challenge answers." % MAX_ATTEMPTS)
    clean_ids = []
    for aid in ids:
        if track == "fellow" or _own_attempt(aid, me, track) is None:
            return C.fail("One of those answers isn't yours or isn't from this program.")
        if aid not in clean_ids:
            clean_ids.append(aid)
    url = C.text(project_url, 400)
    if url and not _url_ok(url):
        return C.fail("The project link must start with https:// and be at most %d characters." % URL_MAX)
    note = C.text(project_note, 400)
    if len(note) > NOTE_MAX:
        return C.fail("Keep the project note to %d characters." % NOTE_MAX)
    try:
        ev = app_tables.cert_evidence.get(credential=r)
        if ev is None:
            ev = app_tables.cert_evidence.add_row(credential=r, user=me, is_demo=False)
        ev.update(show_capstone=bool(show_capstone), attempts=clean_ids, project_url=url, project_note=note, updated=C.now())
    except Exception as e:
        from . import AppStatus
        AppStatus.log_server_error("save_evidence", e)
        return C.fail("Evidence can't be saved yet: the app's database is being updated. Please try again later.")
    return C.ok(evidence=evidence_public(r))
