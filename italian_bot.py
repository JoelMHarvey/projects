#!/usr/bin/env python3
"""Italian Language Bot — Telegram tutor for learning Italian with Claude."""

import os
import datetime
import logging
from anthropic import Anthropic
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# ── Config ────────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ["TELEGRAM_TOKEN"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
GROUP_CHAT_ID = int(os.environ["GROUP_CHAT_ID"])
MODEL = "claude-sonnet-4-6"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

client = Anthropic(api_key=ANTHROPIC_API_KEY)


# ── Session memory (runtime) ──────────────────────────────────────────────────
class Session:
    def __init__(self):
        self.vocab_seen: list[str] = []
        self.mistakes: list[str] = []
        self.attempts: int = 0
        self.messages_translated: int = 0


session = Session()


# ── Claude helpers ────────────────────────────────────────────────────────────

def _ask(system: str, user: str, max_tokens: int = 600) -> str:
    resp = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text


def detect_language(text: str) -> str:
    raw = client.messages.create(
        model=MODEL,
        max_tokens=10,
        messages=[{
            "role": "user",
            "content": (
                "Classify the language of this text. "
                "Reply with exactly one word — english, italian, or mixed — and nothing else.\n\n"
                f"Text: {text}"
            ),
        }],
    ).content[0].text.strip().lower()

    for lang in ("mixed", "italian", "english"):
        if lang in raw:
            return lang
    return "english"


def translate_english_to_italian(text: str) -> str:
    return _ask(
        system=(
            "You are an Italian language tutor in a Telegram group. Keep responses short and plain. "
            "For each English message:\n"
            "1. Italian translation in *bold* (single asterisks for Telegram)\n"
            "2. One brief grammar or vocabulary note\n"
            "No excessive praise or enthusiasm. Occasional light encouragement is fine."
        ),
        user=text,
    )


def correct_italian_attempt(text: str) -> str:
    return _ask(
        system=(
            "You are an Italian language tutor. The user attempted Italian. Respond plainly:\n"
            "1. English translation of what they wrote\n"
            "2. Any corrections with brief explanations (skip if correct)\n"
            "3. Corrected Italian in *bold* (single asterisks for Telegram)\n"
            "Keep it short. Light encouragement occasionally is fine, but no effusive praise."
        ),
        user=text,
    )


def handle_mixed(text: str) -> str:
    return _ask(
        system=(
            "You are an Italian language tutor. This message mixes English and Italian. "
            "Handle each part:\n"
            "- Translate English parts to Italian in *bold* (single asterisks for Telegram)\n"
            "- Correct Italian parts briefly\n"
            "- Add a grammar note only if useful\n"
            "Keep it short and plain."
        ),
        user=text,
        max_tokens=700,
    )


def generate_daily_exercise() -> str:
    return _ask(
        system=(
            "You are an Italian language tutor. Generate a short daily exercise for two "
            "English-speaking beginners. Include:\n"
            "1. Word of the Day — Italian word, pronunciation hint, English meaning\n"
            "2. Translation Challenge — one English sentence to translate into Italian\n"
            "3. Cultural Note — one brief fact about Italian life or culture\n"
            "Plain and concise. A couple of emojis are fine."
        ),
        user="Generate today's Italian exercise.",
        max_tokens=400,
    )


def generate_progress_summary() -> str:
    context = (
        f"Vocabulary covered this session: {', '.join(session.vocab_seen) or 'not yet tracked'}\n"
        f"Italian attempts made: {session.attempts}\n"
        f"English messages translated: {session.messages_translated}\n"
        f"Mistakes noted: {', '.join(session.mistakes) or 'none recorded'}"
    )
    return _ask(
        system=(
            "You are an Italian tutor reviewing a session. Give a plain, concise summary:\n"
            "1. Vocabulary covered\n"
            "2. Any patterns in mistakes\n"
            "3. One thing to focus on next\n"
            "No excessive praise. Keep it factual and useful."
        ),
        user=context,
        max_tokens=400,
    )


# ── Telegram handlers ─────────────────────────────────────────────────────────

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply(
        update,
        "🇮🇹 *Ciao!* I'm your Italian tutor.\n\n"
        "• Send English → I'll translate to Italian\n"
        "• Try Italian → I'll correct and encourage you\n"
        "• `/progress` — see your session summary\n"
        "• Daily exercises sent at 8:00 am UTC\n\n"
        "_Iniziamo!_ (Let's start!)",
    )


async def progress_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    summary = generate_progress_summary()
    await _reply(update, f"📊 *Session Progress*\n\n{summary}")


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.text:
        return

    text = update.message.text.strip()
    if text.startswith("/"):
        return

    lang = detect_language(text)
    log.info("lang=%s text=%s", lang, text[:60])

    if lang == "english":
        session.messages_translated += 1
        reply = translate_english_to_italian(text)
    elif lang == "italian":
        session.attempts += 1
        reply = correct_italian_attempt(text)
    else:
        session.messages_translated += 1
        session.attempts += 1
        reply = handle_mixed(text)

    await _reply(update, reply)


async def daily_exercise_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    exercise = generate_daily_exercise()
    text = f"☀️ *Buongiorno!* Here's your daily Italian exercise:\n\n{exercise}"
    try:
        await context.bot.send_message(chat_id=GROUP_CHAT_ID, text=text, parse_mode="Markdown")
    except Exception:
        await context.bot.send_message(chat_id=GROUP_CHAT_ID, text=text)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _reply(update: Update, text: str) -> None:
    try:
        await update.message.reply_text(text, parse_mode="Markdown")
    except Exception:
        await update.message.reply_text(text)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("progress", progress_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))

    app.job_queue.run_daily(
        daily_exercise_job,
        time=datetime.time(hour=8, minute=0, tzinfo=datetime.timezone.utc),
    )

    log.info("Italian bot started — polling")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
