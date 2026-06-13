# Classe Italiana — Telegram Class-Management Bot

A Claude-powered Telegram bot that runs a small cohort class (6–8 English speakers
learning Italian, CEFR A1) inside a group chat. The bot is teacher, moderator,
exercise generator, and progress tracker. Persistent SQLite database keeps every
learner's history so the bot personalises review and difficulty.

This plan is written for Claude Code to implement. Build on the existing patterns
in this workspace:

- `italian_bot.py` — telegram + Claude integration, daily job via `job_queue.run_daily()`
- `percentbs/` — three-file structure (`db.py` stdlib SQLite, `ai.py` Claude calls, `bot.py` handlers)

Use the root `.venv/` (`anthropic`, `python-telegram-bot`, `apscheduler` already installed).
Model: `claude-sonnet-4-6` for routine exercises/corrections; consider `claude-opus-4-8`
only for weekly lesson planning if quality demands it.

---

## 1. Product goals

1. Get a cohort of 6–8 learners from zero to solid A1 Italian in ~16 weeks.
2. Keep all 6–8 engaged for the full run (retention is the hard problem, not the tech).
3. The bot should feel like a warm, slightly playful teacher — not a quiz machine.

**Non-goals (v1):** voice/audio exercises, payments, multiple simultaneous classes,
web dashboard, languages other than Italian, levels above A1.

## 2. Learning-science principles (drive the design, not decoration)

| Principle | How the bot implements it |
|---|---|
| Retrieval practice | Bot asks questions before teaching; exercises are recall, not recognition, wherever possible |
| Spaced repetition | Per-learner SM-2-style scheduling of vocab/grammar items; daily review set drawn from each learner's due items |
| Comprehensible input (i+1) | Exercise difficulty pegged slightly above each learner's tracked level; Claude prompt receives learner's known-vocab list |
| Interleaving | Daily sets mix old grammar topics with the current week's topic |
| Low-stakes frequency | Short daily micro-exercises (2–5 min) beat long weekly assignments |
| Social accountability | Cohort rituals: daily check-in thread, partner exercises, class-wide goals |
| Productive struggle + fast feedback | Bot lets learner attempt, then gives correction with one-line explanation, in-thread, immediately |
| Cooperative > competitive long-term | Leaderboard resets weekly (sprint competition) but a cumulative **Class XP** bar shows collective progress toward shared milestones |

## 3. Class atmosphere & moderation design

- **Persona:** define a named teacher persona (e.g. "Professoressa Lucia") with a
  consistent voice: encouraging, light humour, celebrates errors as data. Persona lives
  in one system-prompt file so it can be tuned without code changes.
- **Daily rhythm (all times configurable, default JST-friendly):**
  - Morning: *Buongiorno* post — word of the day + 1 micro-exercise, replies in thread.
  - Midday: spaced-repetition review — each learner gets a personalised 3-item quiz via
    reply-mention (group) — keep it public so others learn by lurking.
  - Evening: open prompt ("Describe your dinner in Italian — any attempt counts").
- **Weekly rhythm:**
  - Monday: lesson kickoff — bot posts the week's topic with a mini-lesson.
  - Wednesday: partner exercise — bot pairs learners, gives a dialogue task.
  - Friday: weekly challenge + leaderboard reveal + Class XP update.
  - Sunday: gentle weekly recap; bot privately notes who was inactive.
- **Re-engagement (core feature):** if a learner is silent ≥3 days, the bot sends a
  low-pressure individual nudge ("We missed you — here's a 30-second exercise to jump
  back in"). Never shames publicly. Inactivity never shown on leaderboard.
- **Moderation:** keep conversation on-topic gently; answer any Italian question asked
  in the group; correct errors with sandwich pattern (acknowledge → correct → encourage).

## 4. Curriculum (A1, 16 weeks)

Store as data (YAML or table), not code, so it's editable. Outline:

1. Greetings, introductions, essere
2. Numbers, age, avere
3. Articles & gender, family
4. Present tense -are verbs, daily routine
5. Present tense -ere/-ire, food & ordering
6. Adjective agreement, descriptions
7. Review week 1 + consolidation challenge
8. Question words, directions, c'è/ci sono
9. Possessives, house & home
10. andare/fare/stare/dare, weather, time
11. Piacere, hobbies & preferences
12. Modal verbs (potere/dovere/volere)
13. Passato prossimo intro (avere)
14. Passato prossimo (essere), telling stories
15. Review week 2 + mock A1 exam
16. Finale: class project (group story in Italian) + individual assessment + certificates

Each week: ~20 vocab items + 1–2 grammar points fed into the spaced-repetition pool.

## 5. Architecture

```
classe-italiana/
├── bot.py            # telegram handlers, jobs, group moderation
├── ai.py             # Claude calls: exercise gen, grading, persona replies
├── db.py             # stdlib sqlite3, schema + queries
├── srs.py            # spaced-repetition scheduling (SM-2 lite)
├── curriculum.py     # loads curriculum.yaml, exposes week/topic/vocab
├── curriculum.yaml   # 16-week syllabus data
├── persona.md        # teacher system prompt (editable without code change)
├── start.sh          # background runner, PID + log (copy percentbs/start.sh pattern)
└── PLAN.md           # this file
```

Single group chat for v1 (one class). `GROUP_CHAT_ID` env var, same as existing bots.

### Database schema (SQLite)

```sql
learners(id, tg_user_id, name, joined_at, level_estimate, active)
items(id, week, type 'vocab'|'grammar', front, back, notes)
reviews(id, learner_id, item_id, due_at, interval_days, ease, last_result)
exercises(id, created_at, kind, prompt_text, week, message_id)
attempts(id, exercise_id, learner_id, answer_text, score, feedback, created_at)
xp_events(id, learner_id, points, reason, created_at)   -- leaderboard + class XP derived from this
class_state(key, value)   -- current_week, started_at, etc.
```

History and artifacts (every exercise, every attempt, every correction) are kept
forever — this is what lets the bot say "you confused *essere/avere* twice last week,
let's review."

### Claude prompt design (ai.py)

- One system prompt = persona.md + current week context + the specific learner's
  profile (level estimate, weak items, recent errors) when grading or personalising.
- Use prompt caching on the persona/curriculum block (same pattern as zen-substack).
- Grading returns structured JSON: `{score: 0-3, corrected_text, feedback_line}` —
  score maps directly to SM-2 quality for the SRS update.

## 6. Gamification

- **XP:** attempt = 2 XP, correct = +3, daily streak bonus, partner-exercise completion
  bonus. Everything via `xp_events` so it's auditable and tunable.
- **Weekly leaderboard:** resets Monday. Top 3 named Friday with flair; bottom never
  called out.
- **Class XP:** cumulative bar toward shared milestones ("Class reaches Roma at
  5,000 XP") — keeps weak learners contributing without shame.
- **Badges:** streaks, "comeback" badge for returning after absence (rewards exactly
  the behaviour retention needs).

## 6b. AI classmates (Michel Thomas technique)

Two disclosed AI student personas join the class as separate bot accounts, run from
the same backend process (Telegram bots cannot see other bots' messages, so all
orchestration happens server-side via the shared database — students never need to
read the group; the teacher backend decides when they speak).

- **Marco (the struggler):** answers slightly below class level with *curated* common
  errors drawn from the class's actual weak items in the DB. Purpose: normalises
  mistakes (reduces answer anxiety) and invites humans to correct him — peer
  correction is high-value retrieval practice. The teacher awards XP for correcting
  Marco. Marco visibly improves over the weeks (motivating progress arc).
- **Sofia (the star):** answers slightly above class level — a live i+1 model of
  reachable Italian. Never answers first; always waits so humans attempt retrieval
  before seeing her version.

**Disclosure:** explicitly introduced as AI classmates at class start. Telegram marks
bot accounts anyway; hiding them risks the whole class's trust and violates ToS via
fake accounts. Pedagogical-agent research shows the benefit survives disclosure.

**Behaviour rules:**
- Answer at most ~40% of exercises, with randomised 2–15 min delay.
- Activity inversely proportional to human activity: quiet when chat is lively,
  Marco answers first only after ~10 min of class silence (keeps momentum).
- Marco's error of the day logged to `exercises`/`attempts` like any learner, so the
  teacher can reference it ("remember Marco's mix-up yesterday?").
- Hard cap: AI classmates never exceed 25% of total class messages per day.

**Schema addition:** `learners.kind` column (`human` | 'ai'), AI learners excluded
from leaderboard rankings but visible in the thread.

**Build placement:** Phase 3.5 — after class dynamics work, before full curriculum.
Needs two extra BotFather tokens (`MARCO_TOKEN`, `SOFIA_TOKEN`).

## 7. Build phases

### Phase 1 — Skeleton (MVP, ~1 session)
- db.py schema + init, curriculum.yaml weeks 1–4, persona.md
- bot.py: /start, /join (register learner), morning daily post, reply handling in
  thread, Claude grading of replies, XP recording
- Validate with yourself + one test account in a test group

### Phase 2 — SRS + personalisation
- srs.py SM-2 lite; midday personalised review job
- Learner profiles fed into grading prompts; /me command (private stats)

### Phase 3 — Class dynamics
- Weekly rhythm jobs (kickoff, partner pairing, Friday leaderboard + Class XP)
- Re-engagement nudges (3-day silence detector)
- /leaderboard, /progress commands

### Phase 3.5 — AI classmates
- Marco + Sofia bot accounts, persona files, orchestration rules (see §6b)
- `learners.kind` column; XP for correcting Marco; activity caps

### Phase 4 — Polish + full curriculum
- Weeks 5–16 curriculum content (Claude can draft, human-review)
- Review weeks 7/15 logic, mock exam, finale project flow
- Badges, streaks, tone tuning of persona

## 8. Riskiest assumptions & cheap tests

1. **People stay engaged 16 weeks** — test: run Phase 1–3 with a 4-week pilot
   (weeks 1–4 only) before building the full curriculum. If pilot retention <60%,
   redesign rhythm before writing 12 more weeks of content.
2. **Public personalised quizzes feel fun, not exposing** — ask pilot group directly
   in week 2; fallback is DM-based review.
3. **Claude grading is consistent enough for XP fairness** — spot-check 20 graded
   attempts in week 1; tighten the grading rubric in the prompt if variance is high.
4. **Daily cadence is right** — watch reply rates per slot; drop the lowest-engagement
   daily slot rather than adding more.

## 9. Env & run

```bash
source ../.venv/bin/activate
CI_TELEGRAM_TOKEN=... ANTHROPIC_API_KEY=... CI_GROUP_CHAT_ID=... python3 bot.py
# or background:
./start.sh   # logs → classe.log, PID → classe.pid
```

New bot token from @BotFather (don't reuse italian_bot's token). Bot needs group
admin or at least privacy mode disabled to read all group messages.
