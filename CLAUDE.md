# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace overview

Personal projects directory — multiple independent projects, not a monorepo. Each subdirectory is its own project with its own dependencies. The root `.venv/` is a shared Python venv for the top-level scripts.

## Active projects

### Language bots (`italian_bot.py`, `japanese_bot.py`)

Telegram language-tutoring bots backed by Claude. Both follow identical architecture:
- Single-file scripts using `python-telegram-bot` and `anthropic` SDK
- Language detection → route to translate / correct / handle-mixed
- Daily exercise job via `job_queue.run_daily()` at 08:00 UTC
- Runtime-only `Session` object (not persisted across restarts)

**Run:**
```bash
source .venv/bin/activate
# Italian bot
TELEGRAM_TOKEN=... ANTHROPIC_API_KEY=... GROUP_CHAT_ID=... python3 italian_bot.py

# Japanese bot (uses separate env vars)
TELEGRAM_TOKEN=... ANTHROPIC_API_KEY=... GROUP_CHAT_ID=... python3 japanese_bot.py
```

**Background (with PID tracking):**
```bash
./start_italian_bot.sh   # logs → italian_bot.log, PID → italian_bot.pid
./start_japanese_bot.sh  # logs → japanese_bot.log, PID → japanese_bot.pid

kill $(cat italian_bot.pid)   # stop
tail -f italian_bot.log       # watch logs
```

Italian bot env: `TELEGRAM_TOKEN`, `ANTHROPIC_API_KEY`, `GROUP_CHAT_ID`  
Japanese bot env: `JP_TELEGRAM_TOKEN`, `ANTHROPIC_API_KEY`, `JP_GROUP_CHAT_ID`

Both use `claude-sonnet-4-6`.

---

### Zen Substack (`zen-substack/`)

Generates Zen Buddhist quote posts (koan / teaching / verse / mondo / saying) and optionally publishes to Substack via its private API. Uses `claude-opus-4-8` with prompt caching on the system prompt.

**Run:**
```bash
cd zen-substack
python3 generate_posts.py                   # generate all 5, save as drafts/
python3 generate_posts.py --type koan       # single type, no publish
python3 generate_posts.py --type koan --publish  # generate + publish
python3 generate_posts.py --publish         # all 5 + publish all
```

Cron uses `run.sh` — sources `~/.zshrc` for env vars. Drafts saved to `drafts/YYYY-MM-DD/`.

Env vars: `ANTHROPIC_API_KEY`, `SUBSTACK_PUBLICATION_URL`, `SUBSTACK_SID`, `SUBSTACK_USER_ID`

---

### Apple Mail MCP (`apple-mail-mcp/`)

MCP server exposing Apple Mail to Claude. Uses `uv`, `fastmcp`, `ruff`, `mypy`, `pytest`.

```bash
cd apple-mail-mcp
uv sync --dev          # install deps
make test              # unit tests only (no Mail.app needed)
make test-integration  # needs Mail.app open (sets MAIL_TEST_MODE=true)
make lint              # ruff check
make format            # ruff format
make typecheck         # mypy
make check-all         # lint + typecheck + tests + version sync checks
```

Has its own `.claude/CLAUDE.md` — read that when working inside this project.

---

---

### Chatbot (`chatbot/`)

Streamlit PDF Q&A app using LangChain + OpenAI. Loads `.pkl` vector stores (FAISS) from pre-processed PDFs. Own `venv/`.

```bash
cd chatbot
source venv/bin/activate
streamlit run app.py
```

Env: `OPENAI_API_KEY`

---

### Talk to Santa (`talktosanta/`)

Express/Node.js + MongoDB app. JWT auth, QR code generation. Vanilla JS frontend in `frontend/`. No build step — static files served by Express.

```bash
cd talktosanta
npm install
node script.js
```

---

### Mofu-chan (`Mofu-chan/`)

SwiftUI iOS app. Open `Mofu-chan.xcodeproj` in Xcode. Main files: `ContentView.swift`, `AudioManager.swift`.

---

### claude-howto (`claude-howto/`)

Documentation/tutorial project for Claude Code features (slash commands, memory, skills, subagents, MCP, hooks). Multilingual (`ja/`, `uk/`, `vi/`, `zh/`). Read-only reference — no build step.

---

## Python environment

Root `.venv/` — used by language bots and zen-substack. Contains: `anthropic`, `python-telegram-bot`, `apscheduler`, `requests`.  
Root `venv/` — legacy venv (chatbot uses its own `chatbot/venv/`).  
`apple-mail-mcp/` manages its own venv via `uv`.

## Model usage across projects

| Project | Model |
|---|---|
| italian_bot.py | `claude-sonnet-4-6` |
| japanese_bot.py | `claude-sonnet-4-6` |
| zen-substack | `claude-opus-4-8` |
| chatbot | OpenAI (not Claude) |
