#!/usr/bin/env python3
"""PercentBS — Telegram fact-scoring bot."""

import os
import json
import logging
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
import db
import ai

TELEGRAM_TOKEN = os.environ["PBS_TELEGRAM_TOKEN"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_sources(sources_json: str | None) -> str:
    if not sources_json:
        return ""
    try:
        sources = json.loads(sources_json) if isinstance(sources_json, str) else sources_json
        return "\n".join(f"  • {s}" for s in sources) if sources else ""
    except Exception:
        return ""


def _truncate(text: str, n: int) -> str:
    return text[:n] + "…" if len(text) > n else text


# ── Command handlers ──────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "PercentBS scores factual claims against public evidence.\n\n"
        "Send me any factual claim and I'll rate how well the evidence supports it.\n\n"
        "/check [claim] — score a claim\n"
        "/vote [id] true|false — vote on a claim\n"
        "/status [id] — score + vote breakdown\n"
        "/recent — last 10 claims\n"
        "/top — most voted claims\n"
        "/disputed — most split claims\n"
        "/help — show commands\n\n"
        "Or just send a message — I'll treat it as a /check."
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "/check [claim] — score a factual claim\n"
        "/vote [id] true|false — cast your vote\n"
        "/status [id] — current score and vote breakdown\n"
        "/recent — last 10 claims\n"
        "/top — top 5 most voted\n"
        "/disputed — top 5 most split by vote\n\n"
        "Or just send a message — I'll treat it as a /check."
    )


async def _process_claim(update: Update, claim_text: str):
    claim_text = claim_text.strip()
    if not claim_text:
        await update.message.reply_text(
            "Send me a claim to score. Example:\n/check Water boils at 100°C at sea level."
        )
        return

    await update.message.reply_text("Scoring…")

    try:
        result = ai.score_claim(claim_text)
    except Exception as e:
        log.error("AI scoring failed: %s", e)
        await update.message.reply_text("Scoring failed — try again in a moment.")
        return

    claim_type = result.get("claim_type", "indeterminate")
    user_id = update.effective_user.id

    if claim_type != "verifiable":
        rejection = result.get("rejection_reason") or "This claim isn't verifiable against public evidence."
        await update.message.reply_text(f"I can't score that one — {rejection}")
        return

    score = result.get("evidence_score")
    rationale = result.get("rationale", "")
    sources = result.get("sources", [])

    claim_id = db.add_claim(claim_text, claim_type, user_id)
    db.add_score(claim_id, score, rationale, sources)

    sources_str = _fmt_sources(json.dumps(sources))
    sources_block = f"\n\nSources:\n{sources_str}" if sources_str else ""

    await update.message.reply_text(
        f'Claim: "{claim_text}"\n\n'
        f"Evidence confidence: {score}%\n"
        f"{rationale}"
        f"{sources_block}\n\n"
        f"Claim ID: #{claim_id} — vote with /vote {claim_id} true or /vote {claim_id} false"
    )


async def cmd_check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _process_claim(update, " ".join(context.args) if context.args else "")


async def cmd_vote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args or len(context.args) < 2:
        await update.message.reply_text("Usage: /vote [id] true|false")
        return

    try:
        claim_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("Claim ID must be a number.")
        return

    vote_str = context.args[1].lower()
    if vote_str not in ("true", "false"):
        await update.message.reply_text("Vote must be true or false.")
        return

    claim = db.get_claim(claim_id)
    if not claim:
        await update.message.reply_text(f"No claim found with ID #{claim_id}.")
        return

    recorded = db.add_vote(claim_id, update.effective_user.id, vote_str)
    if not recorded:
        await update.message.reply_text(f"You've already voted on #{claim_id}.")
        return

    updated = db.get_claim(claim_id)
    await update.message.reply_text(
        f"Vote recorded on #{claim_id}.\n"
        f"Current score: {updated['evidence_score']}% — "
        f"{updated['true_votes']} true / {updated['false_votes']} false"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: /status [id]")
        return

    try:
        claim_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("Claim ID must be a number.")
        return

    claim = db.get_claim(claim_id)
    if not claim:
        await update.message.reply_text(f"No claim found with ID #{claim_id}.")
        return

    total = claim["true_votes"] + claim["false_votes"]
    await update.message.reply_text(
        f'#{claim["id"]}: "{claim["text"]}"\n\n'
        f'Evidence score: {claim["evidence_score"]}%\n'
        f'Community: {claim["true_votes"]} true / {claim["false_votes"]} false ({total} votes)\n'
        f'Submitted: {claim["submitted_at"]}'
    )


async def cmd_recent(update: Update, context: ContextTypes.DEFAULT_TYPE):
    claims = db.get_recent(10)
    if not claims:
        await update.message.reply_text("No claims yet. Submit one with /check.")
        return

    lines = [
        f'#{c["id"]} [{c["evidence_score"]}%] {_truncate(c["text"], 60)}'
        for c in claims
    ]
    await update.message.reply_text("Recent claims:\n\n" + "\n".join(lines))


async def cmd_top(update: Update, context: ContextTypes.DEFAULT_TYPE):
    claims = db.get_top_voted(5)
    if not claims:
        await update.message.reply_text("No votes yet.")
        return

    lines = [
        f'#{c["id"]} [{c["evidence_score"]}%] {c["vote_count"]} votes — {_truncate(c["text"], 50)}'
        for c in claims
    ]
    await update.message.reply_text("Most voted:\n\n" + "\n".join(lines))


async def cmd_disputed(update: Update, context: ContextTypes.DEFAULT_TYPE):
    claims = db.get_disputed(5)
    if not claims:
        await update.message.reply_text("No disputed claims yet.")
        return

    lines = [
        f'#{c["id"]} [{c["evidence_score"]}%] {c["true_votes"]}✓/{c["false_votes"]}✗ — {_truncate(c["text"], 50)}'
        for c in claims
    ]
    await update.message.reply_text("Most disputed:\n\n" + "\n".join(lines))


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _process_claim(update, update.message.text)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    db.init_db()
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("check", cmd_check))
    app.add_handler(CommandHandler("vote", cmd_vote))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("recent", cmd_recent))
    app.add_handler(CommandHandler("top", cmd_top))
    app.add_handler(CommandHandler("disputed", cmd_disputed))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    log.info("PercentBS bot starting…")
    app.run_polling()


if __name__ == "__main__":
    main()
