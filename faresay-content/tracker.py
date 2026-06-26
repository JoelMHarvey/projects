#!/usr/bin/env python3
"""Faresay posting tracker — schedule + qualified-signal log (stdlib only, no deps).

Drives the v0 'manual posting' stage and feeds the README's v3 metrics loop: each row
links a generated script to a channel, a date, a UTM-tagged landing URL, and a `score`
(QUALIFIED signal — therapist sign-ups / for-therapists hits in Plausible, NOT views).

Usage:
    python3 tracker.py                          # show the calendar (planned + posted)
    python3 tracker.py urls                     # print UTM-tagged landing URLs to paste in CTAs/bios
    python3 tracker.py add <script> <channel> <YYYY-MM-DD>
    python3 tracker.py posted <row#> [live_url] # mark a row posted (row# = the # in the table)
    python3 tracker.py score  <row#> <number>   # record the qualified-signal score for a row

The row number is stable (it's the underlying index), so it stays valid even though the
table prints sorted by date. Add new rows with `add`; they append at the end.
"""

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
CAL = HERE / "calendar.json"


def load() -> dict:
    return json.load(open(CAL))


def save(d: dict) -> None:
    CAL.write_text(json.dumps(d, indent=2, ensure_ascii=False))


def utm(d: dict, p: dict) -> str:
    landing = d["landing"].get(p["script"], d["landing"].get("_default", "/"))
    return (
        f'{d["base_url"]}{landing}'
        f'?utm_source={p["channel"]}&utm_medium=short_video&utm_campaign={p["script"]}'
    )


def show(d: dict) -> None:
    posts = d["posts"]
    if not posts:
        print("No posts scheduled. Add one: python3 tracker.py add <script> <channel> <YYYY-MM-DD>")
        return
    rows = sorted(enumerate(posts), key=lambda x: (x[1].get("date") or "", x[1]["script"]))
    print(f'{"#":>2}  {"date":10}  {"status":8}  {"channel":16}  {"script":22}  score')
    print("-" * 80)
    for i, p in rows:
        score = p.get("score")
        print(
            f'{i:>2}  {p.get("date") or "—":10}  {p.get("status", "planned"):8}  '
            f'{p["channel"]:16}  {p["script"]:22}  {score if score is not None else "—"}'
        )
    posted = sum(1 for p in posts if p.get("status") == "posted")
    print(f"\n{len(posts)} rows · {len(posts) - posted} planned · {posted} posted")
    print("Tip: `python3 tracker.py urls` for the UTM links · `posted <#> <url>` when live.")


def urls(d: dict) -> None:
    for i, p in enumerate(d["posts"]):
        print(f'[{i}] {p["script"]} / {p["channel"]} ({p.get("status", "planned")})')
        print(f"    {utm(d, p)}")


def _row(d: dict, n: str) -> int:
    try:
        i = int(n)
    except ValueError:
        sys.exit(f"row# must be a number, got {n!r}")
    if i < 0 or i >= len(d["posts"]):
        sys.exit(f"no row {i} (have 0..{len(d['posts']) - 1})")
    return i


def main() -> None:
    args = sys.argv[1:]
    d = load()

    if not args:
        return show(d)

    cmd = args[0]

    if cmd == "urls":
        return urls(d)

    if cmd == "add":
        if len(args) < 4:
            sys.exit("usage: add <script> <channel> <YYYY-MM-DD>")
        d["posts"].append(
            {"script": args[1], "channel": args[2], "date": args[3],
             "status": "planned", "score": None, "url": "", "notes": ""}
        )
        save(d)
        print("added.")
        return show(d)

    if cmd == "posted":
        if len(args) < 2:
            sys.exit("usage: posted <row#> [live_url]")
        i = _row(d, args[1])
        d["posts"][i]["status"] = "posted"
        if len(args) > 2:
            d["posts"][i]["url"] = args[2]
        save(d)
        print("updated.")
        return show(d)

    if cmd == "score":
        if len(args) < 3:
            sys.exit("usage: score <row#> <number>")
        i = _row(d, args[1])
        raw = args[2]
        d["posts"][i]["score"] = float(raw) if "." in raw else int(raw)
        save(d)
        print("updated.")
        return show(d)

    sys.exit(f"unknown command: {cmd!r}. Run with no args to see the calendar.")


if __name__ == "__main__":
    main()
