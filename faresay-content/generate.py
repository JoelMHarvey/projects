"""Faresay content engine — Stage 2: script generation in Joel's voice.

Takes an idea-bank row + the verified facts + the voice guide, asks Claude to write a
15-45s faceless short-form script, then runs it through guardrails.py. Nothing is ever
auto-published: output is a draft for you to approve.

Env:  ANTHROPIC_API_KEY
Run:
    python3 generate.py                 # generate for every idea with status 'approved'
    python3 generate.py origin-bench-001  # one idea by id
    python3 generate.py --new "FTC fine, public, reveal angle"  # ad-hoc brief

Output: scripts/<id>.json  (+ prints guardrail flags)

Model matches your other projects (claude-sonnet-4-6). Swap MODEL if you prefer.
"""

import json
import os
import sys
import pathlib

import anthropic

from guardrails import check_script

MODEL = "claude-sonnet-4-6"
HERE = pathlib.Path(__file__).parent
SCRIPTS_DIR = HERE / "scripts"

SYSTEM = """You write short-form video scripts for Faresay, a fair practice tool for therapists.
Voice and rules are below. Output ONLY valid JSON, no preamble.

{voice}

The script must be 15-45 seconds spoken. Structure:
- hook: one line, the first ~1.5 seconds, designed to stop the scroll
- vo: array of 2-4 short spoken lines
- onscreen_text: array of short caption strings (fewer words than the VO)
- cta: one quiet closing line
- broll_notes: one string describing what's shown (faceless — no presenter)

Use ONLY facts from the FACTS block, phrased as their safe_phrasing. Never invent a number.
"""

USER = """Write a script for this idea.

IDEA:
{idea}

FACTS you may use (use safe_phrasing; obey do_not_say):
{facts}

Return JSON with keys: hook, vo, onscreen_text, cta, broll_notes.
"""


def load(name):
    return json.load(open(HERE / name))


def relevant_facts(idea, facts):
    refs = idea.get("fact_refs", [])
    return {k: facts[k] for k in refs if k in facts}


def generate_one(client, idea, facts, voice):
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM.format(voice=voice),
        messages=[{
            "role": "user",
            "content": USER.format(
                idea=json.dumps(idea, indent=2),
                facts=json.dumps(relevant_facts(idea, facts), indent=2),
            ),
        }],
    )
    text = msg.content[0].text.strip()
    # tolerate ```json fences
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    script = json.loads(text)
    script["_idea_id"] = idea["id"]
    script["_status"] = "draft"
    return script


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY first (it's in your ~/.zshrc for the other projects).")

    facts = load("facts.json")
    voice = open(HERE / "voice.md").read()
    ideas = load("ideas.json")
    SCRIPTS_DIR.mkdir(exist_ok=True)
    client = anthropic.Anthropic()

    args = sys.argv[1:]
    if args and args[0] == "--new":
        brief = args[1] if len(args) > 1 else "Faresay fairness angle, public audience"
        ideas = [{
            "id": "adhoc", "template": "reveal", "audience": "public",
            "hook": "", "payload": brief, "fact_refs": list(facts.keys() - {"_README"}),
            "cta": "", "status": "approved",
        }]
    elif args:
        ideas = [i for i in ideas if i["id"] in args]
        if not ideas:
            sys.exit(f"No idea matched {args}")
    else:
        ideas = [i for i in ideas if i.get("status") == "approved"]

    for idea in ideas:
        print(f"\n=== {idea['id']} ({idea.get('template')}) ===")
        try:
            script = generate_one(client, idea, facts, voice)
        except Exception as e:  # noqa: BLE001
            print(f"  generation failed: {e}")
            continue

        flags = check_script(script, facts)
        out = SCRIPTS_DIR / f"{idea['id']}.json"
        out.write_text(json.dumps(script, indent=2, ensure_ascii=False))
        print(f"  hook: {script.get('hook')}")
        if flags:
            print("  GUARDRAIL FLAGS (review before approving):")
            for sev, m in flags:
                print(f"    [{sev}] {m}")
        else:
            print("  guardrails: clean")
        print(f"  saved -> {out.relative_to(HERE)}")


if __name__ == "__main__":
    main()
