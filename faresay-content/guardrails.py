"""Guardrail checker for Faresay content scripts.

FLAGS problems — never silently fixes them. A flagged script is routed to Joel for
review; nothing auto-publishes. This is the single rule that keeps the engine inside
the brand's integrity.

Usage:
    from guardrails import check_script
    flags = check_script(script_dict, facts)
    if flags:  # list of (severity, message) — review before approving
        ...
"""

import re

# Phrases that should never appear (case-insensitive substring match).
BANNED_SUBSTRINGS = [
    # Pre-pivot pricing error
    ("15%", "Faresay takes NO commission now. '15%' was the pre-pivot model."),
    ("15 percent", "Faresay takes NO commission now. '15 percent' was the pre-pivot model."),
    ("our commission", "Faresay charges no session commission — don't imply one."),
    ("we take a cut", "Faresay takes no cut of sessions."),
    # Profit vs revenue
    ("billion in profit", "Say REVENUE, not profit — Teladoc posted losses."),
    ("billion dollars in profit", "Say REVENUE, not profit."),
    # Crisis-service implication
    ("crisis service", "Never imply Faresay is a crisis service."),
    ("emergency help", "Never imply Faresay is a crisis/emergency service."),
    # Clinical-outcome overclaim
    ("cure your", "No clinical-outcome claims."),
    ("fix your anxiety", "No clinical-outcome claims."),
    ("guaranteed results", "No outcome guarantees."),
    ("will cure", "No clinical-outcome claims."),
]

# Scope-of-practice: must not claim to be a qualified/practising therapist.
SCOPE_PATTERNS = [
    (r"\bI am a (qualified|pract[ií]sing|registered|licensed) (psychotherapist|therapist|counsell?or)\b",
     "SCOPE: don't claim to be qualified/practising. Lead with 'training to be a counsellor'."),
    (r"\bas a (qualified|pract[ií]sing|licensed) (therapist|counsell?or|psychotherapist)\b",
     "SCOPE: don't claim qualified status."),
]

# Fake-urgency / hype markers.
HYPE_PATTERNS = [
    (r"\b(act now|limited time|don'?t miss out|hurry|only \d+ (spots|places) left)\b",
     "No fake urgency / scarcity."),
    (r"!{2,}", "Drop the multiple exclamation marks — anti-hype voice."),
]

# Any standalone money/percentage figure must be traceable to facts.json safe_phrasing.
MONEY_RE = re.compile(r"(\$[\d,]+(?:\.\d+)?\s*(?:million|billion|m|bn)?|£[\d,]+|\b\d{1,3}\s*%)", re.I)


def _all_text(script: dict) -> str:
    parts = []
    for key in ("hook", "cta"):
        if script.get(key):
            parts.append(str(script[key]))
    for key in ("vo", "onscreen_text"):
        v = script.get(key)
        if isinstance(v, list):
            parts.extend(str(x) for x in v)
        elif v:
            parts.append(str(v))
    return "\n".join(parts)


def _approved_figures(facts: dict) -> list[str]:
    """Pull every money/percent figure that appears in an approved safe_phrasing."""
    figs = set()
    for f in facts.values():
        if not isinstance(f, dict):
            continue
        phr = f.get("safe_phrasing", "")
        for m in MONEY_RE.findall(phr):
            figs.add(re.sub(r"\s+", "", m.lower()))
    return figs


def check_script(script: dict, facts: dict) -> list[tuple[str, str]]:
    """Return a list of (severity, message). Empty list == clean."""
    flags: list[tuple[str, str]] = []
    text = _all_text(script)
    low = text.lower()

    for sub, msg in BANNED_SUBSTRINGS:
        if sub.lower() in low:
            flags.append(("BLOCK", f"Banned phrase '{sub}': {msg}"))

    for pat, msg in SCOPE_PATTERNS:
        if re.search(pat, text, re.I):
            flags.append(("BLOCK", msg))

    for pat, msg in HYPE_PATTERNS:
        if re.search(pat, text, re.I):
            flags.append(("WARN", msg))

    approved = _approved_figures(facts)
    for raw in MONEY_RE.findall(text):
        norm = re.sub(r"\s+", "", raw.lower())
        if norm not in approved:
            flags.append((
                "REVIEW",
                f"Figure '{raw}' is not in any facts.json safe_phrasing — verify or remove "
                f"before putting it on screen.",
            ))

    return flags


if __name__ == "__main__":
    import json
    import sys

    facts = json.load(open("facts.json"))
    bad = {
        "hook": "As a qualified therapist, I guarantee results!!",
        "vo": ["We only take 15%.", "We make a billion in profit."],
        "cta": "Act now, only 3 spots left.",
    }
    print("Demo — deliberately bad script:\n")
    for sev, msg in check_script(bad, facts):
        print(f"  [{sev}] {msg}")
    if len(sys.argv) > 1:
        s = json.load(open(sys.argv[1]))
        print("\nChecking", sys.argv[1])
        for sev, msg in check_script(s, facts) or [("OK", "clean")]:
            print(f"  [{sev}] {msg}")
