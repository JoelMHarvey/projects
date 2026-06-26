# Faresay content engine — starter

The v0/v1 of the content pipeline from the strategy doc. Turns idea-bank rows into
faceless short-form scripts **in your voice**, with verified facts and automated
guardrails. Nothing auto-publishes — every script is a draft you approve.

## Files

| File | What it is |
|------|------------|
| `facts.json` | The verified, screen-safe stat sheet. The ONLY source of numbers. |
| `voice.md` | Your style guide + example lines the generator writes from. |
| `ideas.json` | The idea bank — one row per shootable idea (the 5 starters are seeded). |
| `guardrails.py` | Flags banned phrases, scope claims, hype, and unsourced figures. |
| `generate.py` | Stage 2: calls Claude to draft scripts from idea rows + facts. |
| `scripts/` | Generated drafts land here (created on first run). |
| `calendar.json` | Posting schedule + qualified-signal log (the source of truth for what goes out when). |
| `tracker.py` | Schedule/track posts and build UTM-tagged landing URLs. Stdlib only. |

## Setup

```bash
cd faresay-content
python3 -m venv .venv && source .venv/bin/activate   # or reuse your root .venv
pip install anthropic
export ANTHROPIC_API_KEY=...        # already in your ~/.zshrc for the other bots
```

## Use

```bash
python3 guardrails.py               # demo the guardrail checker on a deliberately bad script
python3 generate.py                 # draft scripts for every 'approved' idea
python3 generate.py data-betrayal-002   # just one
python3 generate.py --new "the data betrayal, public, reveal angle"  # ad-hoc brief
```

Each run writes `scripts/<id>.json` and prints any guardrail flags. Review, tweak the
wording so it sounds like you, set `_status` to `approved`, then it's ready to record.

New ideas in `ideas.json` are seeded as `status: "draft"` so they don't burn API calls
until you approve them. Flip the ones you like to `"approved"` and re-run `generate.py`,
or draft a single one regardless of status with `generate.py <id>`.

## Posting (track what goes out + what works)

```bash
python3 tracker.py                 # the schedule (planned + posted)
python3 tracker.py urls            # UTM-tagged landing URLs to paste in each post's CTA/bio
python3 tracker.py add the-gap-003 youtube_shorts 2026-07-09
python3 tracker.py posted 0 https://tiktok.com/@you/video/123   # mark row 0 live
python3 tracker.py score 0 4       # log the QUALIFIED signal (sign-ups), not views
```

`calendar.json` maps each script to a landing page (`/trust`, `/compare`,
`/pricing/explained`, `/for-therapists`) and stamps every link with
`utm_source`/`utm_campaign`, so Plausible shows which **angle** drove real therapist
interest. That `score` column is what feeds the v3 loop below.

## Rendering (script JSON -> faceless vertical MP4)

```bash
python3 render.py --check          # confirm ffmpeg + list which scripts have voiceovers
python3 render.py                  # render every script in scripts/ -> out/<id>.mp4
python3 render.py data-betrayal-002   # just one
```

Each render is 1080x1920 (Shorts/Reels/TikTok), faceless: hook card -> caption beats ->
CTA card, in brand colours. **Voiceover (recommended):** drop `voiceover/<id>.mp3` and the
video is timed to it; with no VO it renders silent with fixed beat timing so you can dub
later. Requires system `ffmpeg`. This is a clean *starter* template — swap in B-roll or
restyle in CapCut/Remotion once an angle proves out. Don't gold-plate before the test batch.

## Scheduling (calendar -> import queue for a posting tool)

```bash
python3 schedule_export.py         # -> exports/queue.csv (all 'planned' posts)
python3 schedule_export.py --captions   # preview captions in the terminal
python3 schedule_export.py --all   # include already-posted rows
```

Exports a CSV you import into Buffer / Metricool / Publer / Later — each row has the date,
channel, the rendered `out/<id>.mp4` path, and a ready caption with the **UTM link baked in**
(same scheme as `tracker.py`). We export to a scheduler on purpose: the platform posting
APIs are gated and fragile; an off-the-shelf tool handles the actual publishing reliably
while you keep attribution. Render any missing videos first with `render.py`.

## The roadmap beyond this (from the pipeline doc)

- **v0:** idea bank + manual posting. Prove which angles get *qualified* signal.
- **v1:** LLM script-gen + guardrails, you approve + post. (`generate.py`, `guardrails.py`)
- **v2 (you're here):** templated rendering (`render.py`) + scheduler bridge with UTM tags
  (`schedule_export.py`, building on `tracker.py` / `calendar.json`).
- **v3:** close the loop — pull per-post metrics into each idea's `score`, weight generation
  toward winning template+audience combos. Only now is it a true engine.

## The one rule that protects your integrity

Automate the **repetitive** (drafting, rendering, posting, metrics). Keep the **judgement**
(which angle, what's true, what's in good taste) yours. `guardrails.py` enforces the
hard lines; you enforce the rest. Never auto-publish raw output.
