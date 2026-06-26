#!/usr/bin/env python3
"""Faresay v2 — scheduler bridge: calendar.json -> import queue for a posting tool.

Rather than fighting fragile platform APIs (TikTok/IG/etc. each gate posting), this
exports your PLANNED posts as a CSV you import into an off-the-shelf scheduler
(Buffer, Metricool, Publer, Later...). Each row carries:
    date · channel · the rendered video path · a ready caption with the UTM link baked in.

The UTM is built the same way tracker.py does it, so attribution stays consistent:
Plausible will show which ANGLE (utm_campaign = script id) drove real therapist interest.

Dependencies: none (stdlib csv/json).

Usage:
    python3 schedule_export.py                 # -> exports/queue.csv (all 'planned' posts)
    python3 schedule_export.py --all           # include posted rows too
    python3 schedule_export.py --captions      # print captions to the terminal instead

Caption text comes from the matching scripts/<id>.json (hook + cta). Edit before posting.
"""

import csv
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
CAL = HERE / "calendar.json"
SCRIPTS = HERE / "scripts"
OUTV = HERE / "out"
EXPORTS = HERE / "exports"

# Per-channel hashtag sets (light, honest, no spam)
TAGS = {
    "tiktok": "#therapy #mentalhealth #therapist #fairtech",
    "instagram_reels": "#therapy #therapist #mentalhealth #privatepractice",
    "youtube_shorts": "#therapy #therapist #mentalhealth",
    "linkedin": "#mentalhealth #therapists #privatepractice #ethicaltech",
    "facebook": "#therapy #therapist #mentalhealth",
}


def utm(d: dict, p: dict) -> str:
    landing = d["landing"].get(p["script"], d["landing"].get("_default", "/"))
    return (
        f'{d["base_url"]}{landing}'
        f'?utm_source={p["channel"]}&utm_medium=short_video&utm_campaign={p["script"]}'
    )


def script_for(sid: str) -> dict:
    f = SCRIPTS / f"{sid}.json"
    return json.load(open(f)) if f.exists() else {}


def caption(d: dict, p: dict) -> str:
    s = script_for(p["script"])
    hook = s.get("hook", "")
    cta = s.get("cta", "")
    link = utm(d, p)
    tags = TAGS.get(p["channel"], "")
    parts = [x for x in (hook, cta, link, tags) if x]
    return "\n\n".join(parts)


def video_path(sid: str) -> str:
    mp4 = OUTV / f"{sid}.mp4"
    return str(mp4) if mp4.exists() else f"(render first: python3 render.py {sid})"


def main() -> None:
    d = json.load(open(CAL))
    include_posted = "--all" in sys.argv
    rows = [p for p in d["posts"] if include_posted or p.get("status") != "posted"]

    if "--captions" in sys.argv:
        for p in rows:
            print(f"\n=== {p['date']} · {p['channel']} · {p['script']} ===")
            print(caption(d, p))
        return

    EXPORTS.mkdir(exist_ok=True)
    out = EXPORTS / "queue.csv"
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        # Column names chosen to be broadly importable; remap in your tool if needed.
        w.writerow(["Date", "Channel", "Media", "Caption", "Landing URL"])
        for p in rows:
            w.writerow([
                p.get("date", ""),
                p["channel"],
                video_path(p["script"]),
                caption(d, p),
                utm(d, p),
            ])
    print(f"wrote {out.relative_to(HERE)}  ({len(rows)} rows)")
    print("Import into Buffer/Metricool/Publer. Media column points at out/<id>.mp4 —")
    print("render any missing ones with: python3 render.py")


if __name__ == "__main__":
    main()
