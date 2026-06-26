#!/usr/bin/env python3
"""Faresay v2 — templated renderer: script JSON -> faceless vertical MP4.

Turns scripts/<id>.json into a 1080x1920 short:
    hook card  ->  caption beats (one per onscreen_text line)  ->  CTA card
Brand-coloured, no faces, ready for FB / YouTube Shorts / Instagram / TikTok.

Voiceover (optional but recommended): drop an audio file at
    voiceover/<id>.(mp3|m4a|wav)
and the video is timed/padded to it. With no VO, beats use fixed durations so you
can record and dub later — the timing is preserved.

Dependencies: ffmpeg (system). No Python packages required.

Usage:
    python3 render.py                 # render every script in scripts/
    python3 render.py the-gap-003     # one script by id
    python3 render.py --check         # just report ffmpeg + which VOs are present
Output: out/<id>.mp4
"""

import json
import pathlib
import shutil
import subprocess
import sys
import textwrap

HERE = pathlib.Path(__file__).parent
SCRIPTS = HERE / "scripts"
VO_DIR = HERE / "voiceover"
OUT = HERE / "out"

# Brand
FOREST = "0x217567"
SAND = "0xFBEFE6"
INK = "0x2A2A2A"
CREAM = "0xFAF7F2"
W, H = 1080, 1920
FONT = None  # auto-detected below

# Fixed per-beat seconds when there's no voiceover to time against
HOOK_SECS = 2.8
BEAT_SECS = 2.6
CTA_SECS = 3.2


def find_font() -> str:
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]:
        if pathlib.Path(p).exists():
            return p
    return ""  # ffmpeg will use its default


def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def audio_for(idea_id: str):
    for ext in ("mp3", "m4a", "wav"):
        f = VO_DIR / f"{idea_id}.{ext}"
        if f.exists():
            return f
    return None


def audio_duration(path: pathlib.Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def esc(text: str) -> str:
    """Escape text for ffmpeg drawtext."""
    return (
        text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")
        .replace("%", "\\%")
    )


def wrap(text: str, width: int = 22) -> str:
    return "\n".join(textwrap.wrap(text, width=width)) or text


def card(text: str, seconds: float, bg: str, fg: str, accent: bool, idx: int) -> pathlib.Path:
    """Render a single still 'card' clip to a temp mp4 and return its path."""
    OUT.mkdir(exist_ok=True)
    tmp = OUT / f"._beat_{idx}.mp4"
    wrapped = esc(wrap(text))
    fontfile = f"fontfile='{FONT}':" if FONT else ""
    # A thin brand bar near the bottom for consistency
    drawtext = (
        f"drawtext={fontfile}text='{wrapped}':fontcolor={fg}:fontsize=72:"
        f"x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=18:box=0"
    )
    bar = (
        f"drawbox=x=0:y=h-160:w=iw:h=12:color={FOREST}:t=fill"
    )
    logo = (
        f"drawtext={fontfile}text='faresay':fontcolor={FOREST}:fontsize=40:"
        f"x=(w-text_w)/2:y=h-110"
    )
    vf = f"{drawtext},{bar},{logo}"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", f"color=c={bg}:s={W}x{H}:d={seconds:.2f}",
         "-vf", vf, "-r", "30", "-pix_fmt", "yuv420p", str(tmp)],
        check=True,
    )
    return tmp


def build(idea_id: str, script: dict) -> pathlib.Path:
    beats = []  # (text, bg, fg, accent)
    beats.append((script.get("hook", ""), SAND, INK, True))
    for line in script.get("onscreen_text", []) or script.get("vo", []):
        beats.append((line, CREAM, INK, False))
    beats.append((script.get("cta", ""), FOREST, CREAM, True))

    vo = audio_for(idea_id)
    total = audio_duration(vo) if vo else None
    if total:
        # distribute VO duration: hook + cta get a bit more weight
        weights = [1.4] + [1.0] * (len(beats) - 2) + [1.6]
        wsum = sum(weights)
        durs = [max(1.2, total * w / wsum) for w in weights]
    else:
        durs = [HOOK_SECS] + [BEAT_SECS] * (len(beats) - 2) + [CTA_SECS]

    clips = []
    for i, ((text, bg, fg, accent), secs) in enumerate(zip(beats, durs)):
        if not text:
            continue
        clips.append(card(text, secs, bg, fg, accent, i))

    OUT.mkdir(exist_ok=True)
    concat_list = OUT / f"._concat_{idea_id}.txt"
    concat_list.write_text("".join(f"file '{c.name}'\n" for c in clips))
    silent = OUT / f"._silent_{idea_id}.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(concat_list), "-c", "copy", str(silent)],
        check=True, cwd=OUT,
    )

    final = OUT / f"{idea_id}.mp4"
    if vo:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(vo),
             "-c:v", "copy", "-c:a", "aac", "-shortest", str(final)],
            check=True,
        )
    else:
        shutil.move(str(silent), str(final))

    # cleanup temp beat/concat files (best-effort; some mounts disallow unlink)
    for f in OUT.glob("._*"):
        try:
            f.unlink()
        except OSError:
            pass
    return final


def main() -> None:
    global FONT
    FONT = find_font()

    if "--check" in sys.argv:
        print("ffmpeg:", "ok" if have_ffmpeg() else "MISSING")
        print("font:", FONT or "(ffmpeg default)")
        for s in sorted(SCRIPTS.glob("*.json")):
            sid = s.stem
            print(f"  {sid:24} voiceover: {audio_for(sid) or '(none — will render silent)'}")
        return

    if not have_ffmpeg():
        sys.exit("ffmpeg/ffprobe not found. Install ffmpeg (e.g. `brew install ffmpeg`).")

    targets = [a for a in sys.argv[1:] if not a.startswith("--")]
    files = ([SCRIPTS / f"{t}.json" for t in targets]
             if targets else sorted(SCRIPTS.glob("*.json")))

    for f in files:
        if not f.exists():
            print(f"  skip: {f.name} not found")
            continue
        script = json.load(open(f))
        out = build(f.stem, script)
        print(f"  rendered -> {out.relative_to(HERE)}")


if __name__ == "__main__":
    main()
