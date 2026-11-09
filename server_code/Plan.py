"""Study plans: a week-by-week route through the programs, from the learner's background, hours a week and goal.

Stored on users.plan as {"background", "hours", "goal", "start" (ISO date)}. Each module counts as its reading
minutes + MODULE_EXTRA minutes (drills and the challenge); each program's final exam as EXAM_MINUTES.
"""
import datetime as dt

import anvil.server

from . import common as C
from . import Curriculum as K
from . import Learning as L
from . import content_library as LIB

MODULE_EXTRA = 50
EXAM_MINUTES = 45

BACKGROUNDS = {
    "software": "Software engineer",
    "data": "Data scientist or ML engineer",
    "new": "New to programming",
    "pm": "Product or engineering leader",
}
GOALS = {
    "job": "Land an AI engineering role",
    "ship": "Ship an AI feature at work",
    "lead": "Lead and review AI projects",
}
HOURS = [3, 5, 8, 12]

ORDER = {
    "job": ["core", "ctx", "rag", "agt", "evl", "ops", "sec"],
    "ship": ["core", "ctx", "rag", "evl", "sec", "agt", "ops"],
    "lead": ["core", "evl", "sec", "agt", "rag", "ops", "ctx"],
}
WARMUP = {
    "new": ["karpathy-intro", "3b1b", "hf-llm-course"],
    "software": ["karpathy-intro", "anth-courses", "huyen-aie"],
    "data": ["huyen-aie", "applied-llms", "hamel-field"],
    "pm": ["karpathy-intro", "applied-llms", "hamel-field"],
}


def _clean(background, hours, goal):
    if background not in BACKGROUNDS:
        return None, "Choose your background."
    if goal not in GOALS:
        return None, "Choose a goal."
    try:
        hours = int(hours)
    except (TypeError, ValueError):
        return None, "Choose how many hours a week you have."
    if hours not in HOURS:
        return None, "Choose how many hours a week you have."
    return {"background": background, "hours": hours, "goal": goal}, None


def build(plan, user):
    """The schedule: weeks with modules (and exams), marked done from the member's progress."""
    states, prog, creds = K.user_states(user), K.user_progress(user), K.user_credentials(user)
    budget = plan["hours"] * 60
    order = list(ORDER[plan["goal"]])
    if plan["background"] == "data":
        order = ["core"] + [t for t in order if t not in ("core",)]
    steps: list = []
    for tid in order:
        t = K.TRACK_BY_ID[tid]
        for mid in t["modules"]:
            m = K.MODULES[mid]
            st = K.module_status(mid, states, prog)
            steps.append({"kind": "module", "id": mid, "title": m["title"], "track": t["title"], "track_id": tid,
                          "minutes": m["minutes"] + MODULE_EXTRA, "done": st["complete"], "pct": st["pct"]})
        steps.append({"kind": "exam", "id": tid, "title": "Final exam: " + t["title"], "track": t["title"], "track_id": tid,
                      "minutes": EXAM_MINUTES, "done": tid in creds, "pct": 100 if tid in creds else 0})
    start = dt.date.fromisoformat(str(plan["start"])) if plan.get("start") else C.now().date()
    weeks: list = []
    cur: list = []
    used = 0
    for s in steps:
        mins = int(s["minutes"])
        if cur and used + mins > budget:
            weeks.append(cur)
            cur, used = [], 0
        cur.append(s)
        used += mins
    if cur:
        weeks.append(cur)
    today = C.now().date()
    out = []
    for i, w in enumerate(weeks):
        begins = start + dt.timedelta(days=7 * i)
        out.append({"n": i + 1, "begins": begins.isoformat(), "steps": w, "done": all(s["done"] for s in w),
                    "minutes": sum(s["minutes"] for s in w), "current": begins <= today < begins + dt.timedelta(days=7)})
    done_steps = sum(1 for s in steps if s["done"])
    nxt = next((s for s in steps if not s["done"]), None)
    ends = start + dt.timedelta(days=7 * len(weeks))
    behind = 0
    for w in out:
        if dt.date.fromisoformat(str(w["begins"])) + dt.timedelta(days=7) <= today and not w["done"]:
            behind += 1
    return {"weeks": out, "total_weeks": len(weeks), "ends": ends.isoformat(), "next": nxt, "behind": behind,
            "done_steps": done_steps, "total_steps": len(steps),
            "warmup": [LIB.public(LIB.RES_BY_ID[r]) for r in WARMUP[plan["background"]] if r in LIB.RES_BY_ID]}


def _options():
    return {"backgrounds": [{"id": k, "label": v} for k, v in BACKGROUNDS.items()],
            "goals": [{"id": k, "label": v} for k, v in GOALS.items()], "hours": HOURS}


@anvil.server.callable(require_user=True)
def get_plan():
    me = C.require_user()
    plan = me["plan"] if isinstance(me["plan"], dict) else None
    out = {"options": _options(), "plan": None, "schedule": None}
    if plan and plan.get("background") in BACKGROUNDS and plan.get("goal") in GOALS and plan.get("hours") in HOURS:
        out["plan"] = {"background": plan["background"], "goal": plan["goal"], "hours": plan["hours"], "start": plan.get("start"),
                       "background_label": BACKGROUNDS[plan["background"]], "goal_label": GOALS[plan["goal"]]}
        out["schedule"] = build(plan, me)
    return out


@anvil.server.callable(require_user=True)
def save_plan(background, hours, goal, client_day=None):
    me = C.require_user()
    plan, err = _clean(background, hours, goal)
    if plan is None:
        return C.fail(err or "Check your choices.")
    old = me["plan"] if isinstance(me["plan"], dict) else {}
    plan["start"] = old.get("start") or L.today(client_day).isoformat()
    me["plan"] = plan
    return C.ok(**get_plan())


@anvil.server.callable(require_user=True)
def restart_plan(client_day=None):
    """Start the schedule again from this week (keeps the choices and the progress already made)."""
    me = C.require_user()
    plan = dict(me["plan"]) if isinstance(me["plan"], dict) else None
    if not plan:
        return C.fail("Make a plan first.")
    plan["start"] = L.today(client_day).isoformat()
    me["plan"] = plan
    return C.ok(**get_plan())


def plan_brief(user):
    """For the dashboard: this week's steps and the next step, or None."""
    plan = user["plan"] if isinstance(user["plan"], dict) else None
    if not plan or plan.get("background") not in BACKGROUNDS:
        return None
    s = build(plan, user)
    week = next((w for w in s["weeks"] if w["current"]), None) or next((w for w in s["weeks"] if not w["done"]), None)
    return {"week": week, "total_weeks": s["total_weeks"], "ends": s["ends"], "behind": s["behind"],
            "done_steps": s["done_steps"], "total_steps": s["total_steps"], "goal_label": GOALS[plan["goal"]]}
