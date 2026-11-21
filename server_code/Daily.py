"""Daily 5: the public "Demo or production?" game. Everyone gets the same five calls each day (no account needed).

pick(day): a fixed shuffle of every "Demo or production?" call (kind "advice", 84 of them), five consecutive ones per
day (wrapping), so every call comes round once in about 17 days. Puzzle number = days since EPOCH + 1.
The crowd figure ("64% of players called it") is only shown once at least CROWD_MIN people played that call that day.
Members' plays are kept in daily_runs (one per day, +DAILY_XP once, which also keeps their study streak); guests keep
their streak in the browser (localStorage "ax-daily", Pages/Daily). Every table read is guarded, so the game still
plays (without crowd figures) before the user accepts the new tables in Anvil.
"""
import datetime as dt

import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import Curriculum as K
from . import Learning as L

EPOCH = dt.date(2026, 11, 20)
PER_DAY = 5
CROWD_MIN = 5
DAILY_XP = 10


def _shuffled(ids, seed):
    """A deterministic Fisher-Yates shuffle (own LCG, so it never changes with Python's random module)."""
    out, s = list(ids), seed
    for i in range(len(out) - 1, 0, -1):
        s = (s * 6364136223846793005 + 1442695040888963407) % (2 ** 64)
        j = (s >> 33) % (i + 1)
        out[i], out[j] = out[j], out[i]
    return out


ADVICE = sorted(i for i, it in K.ITEMS.items() if it["kind"] == "advice")
ORDER = _shuffled(ADVICE, 20261120)


def index(day):
    return (day - EPOCH).days


def number(day):
    return max(1, index(day) + 1)


def pick(day):
    start = (index(day) * PER_DAY) % len(ORDER)
    return [ORDER[(start + i) % len(ORDER)] for i in range(PER_DAY)]


def _crowd(day, ids):
    """{item: percent right} for calls with at least CROWD_MIN plays today; {} if the table isn't there yet."""
    out = {}
    try:
        for r in app_tables.daily_stats.search(day=day):
            if r["item"] in ids and (r["total"] or 0) >= CROWD_MIN:
                out[r["item"]] = int(round(100.0 * (r["right"] or 0) / r["total"]))
    except Exception:
        return {}
    return out


def _streak(me, day):
    return (me["streak"] or 0) if me["last_study"] in (day, day - dt.timedelta(days=1)) else 0


def _run(me, day):
    try:
        return app_tables.daily_runs.get(user=me, day=day)
    except Exception:
        return None


def _card(item_id, crowd):
    it = K.ITEMS[item_id]
    m = K.MODULES[it["module"]]
    return {"id": item_id, "q": it["q"], "sound": bool(it["sound"]), "why": it["a"], "module": m["id"],
            "module_title": m["title"], "track": K.TRACK_BY_ID[m["track"]]["title"], "crowd": crowd.get(item_id)}


@anvil.server.callable
def get_daily(client_day=None):
    """Today's five calls (public). Members also get whether they already played today, and their streak."""
    day = L.today(client_day)
    ids = pick(day)
    crowd = _crowd(day, ids)
    out = {"ok": True, "day": day.isoformat(), "number": number(day), "items": [_card(i, crowd) for i in ids],
           "member": False, "played": False, "score": None, "picks": None, "streak": 0}
    me = C.me()
    if me is not None:
        out["member"] = True
        out["streak"] = _streak(me, day)
        r = _run(me, day)
        if r is not None:
            out.update(played=True, score=int(r["score"] or 0), picks=dict(r["picks"] or {}))
    return out


@anvil.server.callable
def submit_daily(day, picks):
    """Record today's five answers. picks = {item_id: True (production practice) / False (demo trap)}."""
    try:
        d = dt.date.fromisoformat(str(day)[:10])
    except Exception:
        return C.fail("That isn't today's puzzle.")
    if L.today(d.isoformat()) != d:
        return C.fail("That isn't today's puzzle. Reload the page for today's five.")
    ids = pick(d)
    if not isinstance(picks, dict) or set(picks.keys()) != set(ids) or any(not isinstance(v, bool) for v in picks.values()):
        return C.fail("Answer all five calls first.")
    if C.rate_limited("daily", 6, 3600):
        return C.fail("That's a lot of plays in one hour. Come back tomorrow for the next five.")
    marks = [picks[i] == bool(K.ITEMS[i]["sound"]) for i in ids]
    score = sum(1 for m in marks if m)
    me = C.me()
    first_for_member = False
    count_it = True
    if me is not None:
        r = _run(me, d)
        if r is not None:
            count_it, score = False, int(r["score"] or 0)
    session = getattr(anvil.server, "session")
    seen = list(session.get("daily_counted") or [])
    if d.isoformat() in seen:
        count_it = False
    if count_it:
        try:
            for i, ok in zip(ids, marks):
                row = app_tables.daily_stats.get(day=d, item=i)
                if row is None:
                    app_tables.daily_stats.add_row(day=d, item=i, right=1 if ok else 0, total=1)
                else:
                    row.update(right=(row["right"] or 0) + (1 if ok else 0), total=(row["total"] or 0) + 1)
            session["daily_counted"] = (seen + [d.isoformat()])[-7:]
        except Exception as e:
            from . import AppStatus
            AppStatus.log_server_error("submit_daily stats", e)
    if me is not None and _run(me, d) is None:
        try:
            app_tables.daily_runs.add_row(user=me, day=d, score=score, picks={k: bool(v) for k, v in picks.items()},
                                          created=C.now(), is_demo=False)
            first_for_member = True
        except Exception as e:
            from . import AppStatus
            AppStatus.log_server_error("submit_daily run", e)
        if first_for_member:
            L.add_xp(me, DAILY_XP, d)
    crowd = _crowd(d, ids)
    return C.ok(score=score, marks=marks, number=number(d), crowd={i: crowd.get(i) for i in ids},
                xp_gained=DAILY_XP if first_for_member else 0, streak=_streak(me, d) if me is not None else 0,
                member=me is not None)
