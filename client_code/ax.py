"""AI Expert helpers on top of state.py: the JavaScript engines in theme/assets/ax-kit.js (schematics, stamp,
certificate, progress ring, confetti, the landing pipeline), dates in the browser's language and small text helpers.

    ax.today()                the member's local date (YYYY-MM-DD): streaks and due dates follow their day
    ax.fig(name)              a program's schematic as an SVG string (tokens, context, rag, agents, evals, security, ops, architect)
    ax.fig_caption(name)      that schematic's one-line caption
    ax.date(iso, style)       'short' | 'long' | 'month' | 'time'
    ax.confetti()             a short burst for a pass (nothing under reduced motion)
    ax.verify_url(code)       the public verification address of a credential
    ax.js(value)              a Python dict/list as a real JS object (for the engines)
    ax.set_text(node, text)   textContent on an anvil:dom-node
    ax.title(text)            the browser tab title: "<text> · AI Expert"
"""
import json

from anvil.js import window

APP_NAME = "AI Expert"
INSTITUTE = "AI Expert"

TRACK_FIG = {"core": "tokens", "ctx": "context", "rag": "rag", "agt": "agents", "evl": "evals", "sec": "security",
             "ops": "ops", "fellow": "architect"}


def today():
    return str(window.AX.today())


def fig(name):
    return str(window.AX.fig(name or "architect"))


def fig_caption(name):
    return str(window.AX.figCaption(name or "architect"))


def date(iso, style="short"):
    return str(window.AX.fmtDate(iso or "", style)) if iso else ""


def ago(iso):
    from . import state
    return state.ago(iso)


def confetti():
    window.AX.confetti()


def verify_url(code):
    return str(window.AX.verifyUrl(code))


def weekday(day):
    return str(window.AX.weekday(day))


def js(value):
    return window.JSON.parse(json.dumps(value))


def set_text(node, text):
    node.textContent = "" if text is None else str(text)


def title(text):
    window.document.title = "%s · %s" % (text, APP_NAME)


def hours(minutes):
    """'~1.5' hours from minutes (one decimal)."""
    return "%g" % (round((minutes or 0) / 6.0) / 10.0)


def tone_badge(tone):
    """(text, badge roles) for an incident file's tone."""
    if tone == "exemplary":
        return "Done right", ["badge", "badge-good"]
    if tone == "cautionary":
        return "Incident", ["badge", "badge-bad"]
    return "Mixed lessons", ["badge", "badge-warn"]
