"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5 and ov["learners"] == 0
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data
K = M["Curriculum"]
as_user(None)
hon = call("get_honour_roll")
assert M["DemoData"].state() == "loaded", "demo loads on first visit"
assert len(hon["items"]) == 5 and all(i["demo"] for i in hon["items"])
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.users.search(is_demo=True) and not T.credentials.search()
as_user(None)
call("get_honour_roll")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
n_creds = len(T.credentials.search())
ok(call("demo_load"))
assert len(T.credentials.search()) == n_creds, "reloading replaces the demo instead of doubling it"
assert call("get_credential", M["DemoData"].FELLOW_CODE)["title"] == "AI Architect"

# ---------------------------------------------------------------------------------- curriculum (public)
assert len(K.TRACKS) == 7 and len(K.MODULES) == 28
for mid, m in K.MODULES.items():
    assert len(m["cards"]) >= 5 and len(m["calls"]) == 3 and len(m["challenge"]["rubric"]) >= 4, mid
    assert all(c in M["content_cases"].CASE_BY_ID for c in m["cases"]), mid
    assert m["fig"] and m["challenge"]["fig"] and len(m["sources"]) >= 2, mid
    assert not m.get("lab") or m["lab"] in M["Labs"].LAB_BY_ID, mid
for t in K.TRACKS:
    assert len(t["capstone"]["rubric"]) >= 4 and t["fig"]
assert len(set(K.CHALLENGES)) == 28 + 7
assert len(K.ITEMS) == 28 * 9
as_user(None)
cat = call("get_catalog")
assert len(cat["tracks"]) == 7 and "status" not in cat["tracks"][0] and cat["totals"]["items"] == len(K.ITEMS)
tr = ok(call("get_track", "rag"))["track"]
assert tr["code"] == "RAG" and len(tr["modules"]) == 4 and "status" not in tr
bad(call("get_track", "nope"))
mod = ok(call("get_module", "core-tokens"))["module"]
assert mod["briefing"] and mod["sources"] and mod["next"]["id"] == "core-output" and mod["lab"] == "cost" and mod["reading"] and "status" not in mod
bad(call("get_module", "nope"))
cs = call("get_cases")["cases"]
assert len(cs) >= 18 and any(c["modules"] for c in cs)
assert all(c["sources"] for c in M["content_cases"].CASES)
case = ok(call("get_case", "aircanada"))["case"]
assert case["story"] and case["sources"] and case["next"]
bad(call("get_case", "nope"))
for fn, args in [("get_dashboard", ()), ("get_study", ("review",)), ("rate_item", ("core-tokens:c1", True)), ("mark_read", ("core-tokens",)),
                 ("get_challenge", ("ch-core-tokens",)), ("submit_challenge", ("ch-core-tokens", "x" * 50, [True])), ("get_exam", ("core",)),
                 ("submit_exam", ("x", {}, "y", [], True)), ("my_credentials", ()), ("admin_credentials", ()), ("admin_set_revoked", ("x", True)),
                 ("toggle_bookmark", ("huyen-aie",)), ("save_lab_run", ("cost", 100)), ("get_plan", ()), ("save_plan", ("software", 5, "job")),
                 ("restart_plan", ())]:
    assert denied(fn, *args), fn
nf = call("get_credential", "AIX-NOPE-0000-AAAAAA")
assert nf["found"] is False

# ---------------------------------------------------------------------------------- learning
as_user(ana)
today = dt.date.today().isoformat()
d = call("get_dashboard", today)
assert d["due"] == 0 and d["next"]["id"] == "core-tokens" and d["me"]["rank"]["rank"] == "Prompt Tinkerer" and len(d["tracks"]) == 7
assert len(d["honour"]) >= 1 and d["case"]["id"]
st = ok(call("get_study", "core-tokens", today))
assert len(st["items"]) == len(K.module_items("core-tokens")) and all(i["box"] is None for i in st["items"])
assert any(i["kind"] == "advice" and "sound" in i for i in st["items"])
bad(call("get_study", "nope"))
bad(call("rate_item", "nope:c1", True))
r1 = ok(call("rate_item", "core-tokens:c1", True, today))
assert r1["box"] == 1 and r1["due"] > today and not r1["module_completed"]
r2 = ok(call("rate_item", "core-tokens:c2", False, today))
assert r2["box"] == 0 and r2["due"] == today
assert ok(call("get_study", "review", today))["items"][0]["id"] == "core-tokens:c2", "a missed card is due today"
ok(call("rate_item", "core-tokens:c1", False, today))
assert T.card_state.get(user=ana, item="core-tokens:c1")["lapses"] == 1
bad(call("mark_read", "nope"))
assert ok(call("mark_read", "core-tokens", today))["first"] is True
assert ok(call("mark_read", "core-tokens", today))["first"] is False
ch = ok(call("get_challenge", "ch-core-tokens"))
assert ch["challenge"]["rubric"] and ch["best"] == 0 and ch["module"]["id"] == "core-tokens"
bad(call("get_challenge", "cap-core"), "capstones are only in exams")
bad(call("submit_challenge", "ch-core-tokens", "too short", [True]))
low = ok(call("submit_challenge", "ch-core-tokens", "I would delegate the pricing test and slow down the acquisition.", [True, False, False, False, False], today))
assert low["score"] == 20 and not low["passed"]
hi = ok(call("submit_challenge", "ch-core-tokens", "Pricing test delegated this week; acquisition gets diligence and a board date; commissions wait.", [True, True, True, True, "yes"], today))
assert hi["score"] == 100 and hi["passed"] and not hi["module_completed"], "cards are not all learned yet"
for item in K.module_items("core-tokens"):
    last = ok(call("rate_item", item, True, today))
assert last["module_completed"] and last["module_title"]
assert T.module_progress.get(user=ana, module="core-tokens")["completed_at"] is not None
assert ana["xp"] > 0 and ana["streak"] == 1
assert call("get_me")["xp"] == ana["xp"]
d = call("get_dashboard", today)
assert d["modules_done"] == 1 and d["next"]["id"] == "core-output"
assert ok(call("get_module", "core-tokens"))["module"]["status"]["complete"]
assert ok(call("get_track", "core"))["track"]["status"]["modules_done"] == 1
assert call("get_dashboard", "1999-01-01")["me"]["xp"] == ana["xp"], "a silly client date falls back to UTC"
as_user(bob)
assert call("get_dashboard", today)["modules_done"] == 0, "progress is per person"

# ---------------------------------------------------------------------------------- exams + credentials
as_user(ana)
locked = ok(call("get_exam", "core"))
assert locked["state"] == "locked" and len(locked["missing"]) == 3
bad(call("get_exam", "nope"))
# complete every Foundations module the quick way (read + challenge + learn all)
for mid in K.TRACK_BY_ID["core"]["modules"]:
    ok(call("mark_read", mid, today))
    ok(call("submit_challenge", K.MODULES[mid]["challenge"]["id"], "A considered answer that covers the main points well.", [True] * 6, today))
    for item in K.module_items(mid):
        ok(call("rate_item", item, True, today))
ex = ok(call("get_exam", "core"))
assert ex["state"] == "ready" and len(ex["items"]) == K.EXAM_ITEMS and ex["capstone"]["rubric"]
assert ok(call("get_exam", "core"))["exam_id"] == ex["exam_id"], "an open exam is reused"
ratings = {i["id"]: True for i in ex["items"]}
as_user(bob)
bad(call("submit_exam", ex["exam_id"], ratings, "x" * 100, [True] * 5, True), "someone else's exam")
as_user(ana)
bad(call("submit_exam", ex["exam_id"], ratings, "x" * 100, [True] * 5, False), "honour code")
bad(call("submit_exam", ex["exam_id"], {}, "x" * 100, [True] * 5, True), "every item rated")
bad(call("submit_exam", ex["exam_id"], ratings, "short", [True] * 5, True), "scenario answer")
half = dict(ratings)
for k in list(half)[:4]:
    half[k] = False
res = ok(call("submit_exam", ex["exam_id"], half, "My plan for the first ninety days covers safety, guidance, the product line and the team." * 2, [True] * 5, True, today))
assert not res["passed"] and res["drill"] == 67 and res["code"] is None
bad(call("submit_exam", ex["exam_id"], ratings, "x" * 100, [True] * 5, True), "already submitted")
assert ok(call("get_exam", "core"))["state"] == "cooldown"
assert T.card_state.get(user=ana, item=list(half)[0])["box"] == 0, "missed exam items go back to box 0"
for r in T.exams.search(user=ana):  # pretend the cooldown has passed
    r["finished"] = r["finished"] - dt.timedelta(hours=1)
ex2 = ok(call("get_exam", "core"))
assert ex2["state"] == "ready" and ex2["exam_id"] != ex["exam_id"]
res = ok(call("submit_exam", ex2["exam_id"], {i["id"]: True for i in ex2["items"]}, "A complete answer to the capstone scenario with priorities and order." * 2, [True] * 5, True, today))
assert res["passed"] and res["code"].startswith("AIX-FND-") and res["fellow"] is None
assert ok(call("get_exam", "core"))["state"] == "certified"
mine = call("my_credentials")
assert len(mine["items"]) == 1 and mine["fellow"]["core"] and not mine["fellow"]["have"]
pub = call("get_credential", res["code"].lower())
assert pub["found"] and pub["holder"] == "Ana" and pub["status"] == "valid" and pub["mine"] and pub["modules"]
assert "email" not in pub
as_user(None)
assert call("get_credential", res["code"])["mine"] is False
# AI Architect: Foundations + three specialist certificates
for track in ("rag", "agt"):
    Ex = M["Exams"]
    Ex.issue(ana, track, 90)
assert Ex.maybe_fellow(ana) is None, "two specialist certificates are not enough"
Ex.issue(ana, "evl", 90)
assert Ex.maybe_fellow(ana) is not None and K.user_credentials(ana).get("fellow")
assert Ex.maybe_fellow(ana) is None, "only one fellowship"
# honour roll is opt-in
as_user(ana)
assert all(i["name"] != "Ana" for i in call("get_honour_roll")["items"])
me2 = ok(call("update_profile", "Ana Lima", "Backend engineer", True))["me"]
assert me2["title"] == "Backend engineer" and me2["honour_roll"]
assert any(i["name"] == "Ana" for i in call("get_honour_roll")["items"]), "holder name is kept as issued"
# admin: list and revoke
as_user(ana)
assert denied("admin_credentials")
as_user(admin)
lst = call("admin_credentials", "ana")
assert lst["total"] >= 4 and lst["items"][0]["email"] == "ana@example.com"
ok(call("admin_set_revoked", res["code"], True))
assert call("get_credential", res["code"])["status"] == "revoked"
bad(call("admin_set_revoked", "nope", True))
ok(call("admin_set_revoked", res["code"], False))
ov = call("admin_overview")
assert ov["credentials"] >= 4 and ov["attempts"] >= 6 and ov["exams"] == 2 and ov["modules_done"] == 4


# ---------------------------------------------------------------------------------- library, labs, plans
LIB = M["content_library"]
assert len(LIB.RESOURCES) >= 60 and len(LIB.RES_BY_ID) == len(LIB.RESOURCES), "resource ids are unique"
assert all(r[3] in LIB.KINDS and r[4] in ("free", "paid") and r[5].startswith("https://") for r in LIB.RESOURCES)
valid_tracks = {t["id"] for t in K.TRACKS} | {"start"}
assert all(set(r[6]) <= valid_tracks for r in LIB.RESOURCES)
for t in K.TRACKS:
    assert any(t["id"] in r[6] for r in LIB.RESOURCES), "every program has reading: " + t["id"]
as_user(None)
lib = call("get_library")
assert lib["items"] and lib["saved"] == [] and not lib["signed_in"] and len(lib["tracks"]) == 7
as_user(ana)
assert ok(call("toggle_bookmark", "huyen-aie"))["saved"] is True
assert call("get_library")["saved"] == ["huyen-aie"]
assert ok(call("toggle_bookmark", "huyen-aie"))["saved"] is False
bad(call("toggle_bookmark", "nope"))
as_user(bob)
assert call("get_library")["saved"] == [], "reading lists are per person"

as_user(None)
labs = call("get_labs")
assert len(labs["labs"]) == 4 and all(x["best"] is None and x["module_title"] for x in labs["labs"])
assert ok(call("get_lab", "retrieval"))["lab"]["track"] == "rag"
bad(call("get_lab", "nope"))
as_user(ana)
xp0 = ana["xp"]
r = ok(call("save_lab_run", "retrieval", 100, {"bm25": True, "k": 60, "junk": {"nested": 1}}, today))
assert r["first"] and r["xp_gained"] == M["Labs"].LAB_XP and ana["xp"] == xp0 + M["Labs"].LAB_XP
assert T.lab_runs.search(user=ana)[0]["detail"] == {"bm25": True, "k": 60}, "only simple values are kept"
assert ok(call("save_lab_run", "retrieval", "250"))["first"] is False
assert max(x["score"] for x in T.lab_runs.search(user=ana)) == 100, "scores are capped at 100"
bad(call("save_lab_run", "nope", 100))
bad(call("save_lab_run", "cost", "lots"))
assert ok(call("get_lab", "retrieval"))["lab"]["best"] == 100

as_user(bob)
pl = call("get_plan")
assert pl["plan"] is None and pl["schedule"] is None and len(pl["options"]["backgrounds"]) == 4
bad(call("save_plan", "astronaut", 5, "job"))
bad(call("save_plan", "software", 7, "job"))
bad(call("save_plan", "software", 5, "fame"))
pl = ok(call("save_plan", "software", 5, "job", today))
sch = pl["schedule"]
assert pl["plan"]["goal"] == "job" and sch["total_steps"] == 28 + 7 and sch["done_steps"] == 0 and sch["weeks"][0]["current"]
assert sch["weeks"][0]["steps"][0]["id"] == "core-tokens" and sch["next"]["id"] == "core-tokens"
assert all(w["minutes"] <= 5 * 60 or len(w["steps"]) == 1 for w in sch["weeks"]), "weeks fit the hours"
assert sch["warmup"], "warm-up resources for the background"
slow = ok(call("save_plan", "software", 3, "job", today))["schedule"]
assert slow["total_weeks"] > sch["total_weeks"], "fewer hours = more weeks"
lead = ok(call("save_plan", "pm", 5, "lead", today))["schedule"]
order = [s["track_id"] for w in lead["weeks"] for s in w["steps"]]
assert order.index("evl") < order.index("rag"), "leads start with evaluation"
assert call("get_dashboard", today)["plan"]["week"]["n"] == 1
ok(call("restart_plan", today))
as_user(ana)
assert call("get_dashboard", today)["plan"] is None, "plans are per person"
bad(call("restart_plan", today), "no plan yet")
ok(call("save_plan", "data", 8, "ship", today))
done_plan = call("get_plan")["schedule"]
assert done_plan["done_steps"] >= 5, "progress already made counts (4 modules + the Foundations exam)"

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "legal_state", "legal_accept", "get_catalog", "get_track", "get_module", "get_cases",
          "get_case", "get_honour_roll", "get_credential", "get_library", "get_labs", "get_lab"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
