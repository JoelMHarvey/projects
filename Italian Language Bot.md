---
type: project
title: "Italian Language Bot"
created: 2026-06-03
updated: 2026-06-03
status: in-progress
tags:
  - project/side
  - language/italian
  - tech/python
  - tech/telegram
related:
  - "[[Projects]]"
  - "[[Shin]]"
---

# 🇮🇹 Italian Language Bot

> [!info] Summary
> A Telegram bot for Joel and Shin to learn Italian together — translates messages, corrects Italian attempts, sends daily exercises, and tracks progress over time.

## Overview

A Claude-powered language tutor living inside a private Telegram group chat. Built in Python using `python-telegram-bot` and the Anthropic API. Prototype-first approach; WhatsApp migration possible later.

## Goals

- Immersive, low-friction Italian practice embedded in daily chat
- Real-time translation (English → Italian) with grammar notes
- Gentle correction when either user attempts Italian
- Daily morning exercises to build vocabulary and structure
- Progress tracking via `/progress` command

---

## Tech Stack

| Component | Tool |
|---|---|
| Chat platform | Telegram |
| Bot framework | `python-telegram-bot` |
| AI brain | Claude Sonnet (`claude-sonnet-4-20250514`) |
| Scheduling | `schedule` library |
| Language | Python 3 |

---

## Features

### ✅ Implemented

- **English → Italian translation** with grammar notes and encouragement
- **Italian attempt detection** — two-step API call detects language first, then responds appropriately
- **Italian correction flow** — English translation → warm praise → error corrections with explanation → corrected Italian in bold
- **Mixed language handling** — each part handled appropriately
- **Daily exercise** — sent at 08:00, includes vocab word, translation challenge, cultural note
- **`/progress` command** — Claude summarises vocab covered, weak areas, Italian attempts made, and suggests next focus
- **Session memory** — tracks vocab seen and mistakes during runtime

### 🔲 Planned

- [ ] Persistent memory via SQLite (survives restarts)
- [ ] `/quiz` command — tests vocab already covered
- [ ] Weekly Sunday summary auto-posted to group
- [ ] Level adaptation (beginner → intermediate)
- [ ] WhatsApp migration via Twilio Business API

---

## Setup

### Prerequisites

```bash
pip install python-telegram-bot anthropic schedule
```

### Environment

| Variable | Source |
|---|---|
| `TELEGRAM_TOKEN` | @BotFather on Telegram |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GROUP_CHAT_ID` | From `getUpdates` API call |

### Steps

1. Create bot via @BotFather → get token
2. Add bot to group with Joel + Shin
3. Send a message → visit `https://api.telegram.org/bot<TOKEN>/getUpdates` → get `chat.id`
4. Set config variables in `italian_bot.py`
5. Run: `python italian_bot.py`

---

## File

`italian_bot.py` — single script, self-contained.

> [!tip] Hosting
> Currently runs locally. For 24/7 uptime, deploy to **Railway.app** or a small VPS (DigitalOcean $4/month droplet).

---

## Notes

> [!note] WhatsApp migration path
> When ready: Twilio + WhatsApp Business API + verified phone number. Estimated cost ~$5–15/month. Same Claude backend, different messaging layer.

---

## Log

| Date | Update |
|---|---|
| 2026-06-03 | Initial build — translation, correction, daily exercise, `/progress` command |
