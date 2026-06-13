# PercentBS — Telegram MVP

Phase 1 build spec. Everything you need to get a working bot in front of 20–50 test users.

---

## Goal

Prove the core loop: user submits a claim, AI scores it, users vote, history accumulates. Nothing more. The interesting output from this phase isn't a polished product — it's learning whether the AI scores sensibly, whether people vote, and what claims they bring when nobody's telling them what to submit.

---

## What the bot does

1. User sends a claim as a text message
2. Bot classifies it (Verifiable / Contested / Indeterminate) and rejects non-Verifiable claims with an explanation
3. Bot scores Verifiable claims with an evidence confidence percentage and a brief rationale
4. User can vote true/false on any claim
5. User can look up any claim's current score and vote count
6. Basic leaderboard: most voted claims, most disputed claims

That's the whole product for Phase 1.

---

## Claim acceptance policy

Before building anything, write this rule into the prompt and the bot's rejection messages.

**Accept:** Claims that are in principle checkable against public evidence. Factual statements about the world with a ground truth.

> "The moon landing happened."
> "Ivermectin does not cure COVID-19."
> "Australia has a larger land area than the USA."

**Reject:** Opinion, prediction, moral judgement, or anything that can't be verified against evidence.

> "This politician is corrupt." → Contested, not Verifiable at MVP stage
> "Electric cars are better than petrol." → Opinion
> "The economy will improve next year." → Prediction
> "X policy is wrong." → Moral judgement

When the bot rejects a claim, it should say why in plain language and suggest the user rephrase if there's a Verifiable version of it.

---

## Bot commands

| Command | What it does |
|---|---|
| `/start` | Welcome message, explains what the bot does |
| `/check [claim]` | Submit a claim for scoring |
| `/vote [claim_id] true\|false` | Vote on a claim |
| `/status [claim_id]` | Get the current score and vote breakdown for a claim |
| `/recent` | Last 10 claims submitted |
| `/top` | Top 5 most voted claims |
| `/disputed` | Top 5 most split claims by vote |
| `/help` | List of commands |

Users can also just send a plain text message — the bot treats it as a `/check` submission.

---

## Database schema

Three tables. Don't add columns until Phase 2 data tells you what you actually need.

```sql
CREATE TABLE claims (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    claim_type  TEXT NOT NULL CHECK(claim_type IN ('verifiable', 'contested', 'indeterminate')),
    submitted_by INTEGER NOT NULL,  -- Telegram user_id
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id        INTEGER NOT NULL REFERENCES claims(id),
    evidence_score  INTEGER NOT NULL CHECK(evidence_score BETWEEN 0 AND 100),
    rationale       TEXT NOT NULL,
    sources         TEXT,           -- JSON array of source strings
    scored_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score_version   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE votes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id    INTEGER NOT NULL REFERENCES claims(id),
    user_id     INTEGER NOT NULL,   -- Telegram user_id
    vote        TEXT NOT NULL CHECK(vote IN ('true', 'false')),
    voted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(claim_id, user_id)       -- one vote per user per claim
);
```

SQLite is fine for Phase 1. Switch to Postgres when you have real traffic.

---

## AI scoring prompt

Test this manually against the 50 seed claims before wiring it into the bot. You want it to score obviously true/false claims correctly and return an honest ~50% on genuinely contested ones — not a confident wrong answer.

```
You are a claim scoring system. Your job is to assess the evidence behind a factual claim and return a structured response.

STEP 1 — Classify the claim:
- "verifiable": has a defensible answer in publicly available evidence
- "contested": evidence exists on both sides, reasonable people disagree based on interpretation
- "indeterminate": the disagreement is about values or moral judgement, not facts

STEP 2 — If verifiable, score it:
- Return an evidence_score from 0 to 100
  - 0–20: strong evidence the claim is false
  - 21–40: evidence leans against the claim
  - 41–59: insufficient or genuinely mixed evidence (default to 50 when no evidence trail exists)
  - 60–79: evidence leans toward the claim being true
  - 80–100: strong evidence the claim is true
- Write a rationale of 2–3 sentences explaining the score
- List up to 3 sources (publication name + brief description of what they say)

STEP 3 — Return JSON only, no other text:

{
  "claim_type": "verifiable" | "contested" | "indeterminate",
  "evidence_score": <integer 0-100 or null if not verifiable>,
  "rationale": "<2-3 sentence explanation>",
  "sources": ["<source 1>", "<source 2>", "<source 3>"] or [],
  "rejection_reason": "<plain-language explanation if not verifiable, else null>"
}

Claim to assess: {{CLAIM}}
```

---

## Bot response templates

Keep these short. Telegram messages should be readable at a glance.

**Claim scored:**
```
Claim: "{{claim_text}}"

Evidence confidence: {{score}}%
{{rationale}}

Sources: {{sources}}

Claim ID: #{{id}} — vote with /vote {{id}} true or /vote {{id}} false
```

**Claim rejected:**
```
I can't score that one — {{rejection_reason}}

{{optional: "If you're trying to check whether [X], try rephrasing as a factual statement."}}
```

**Vote recorded:**
```
Vote recorded on #{{id}}.
Current score: {{score}}% — {{true_votes}} true / {{false_votes}} false
```

**Status:**
```
#{{id}}: "{{claim_text}}"

Evidence score: {{score}}%
Community: {{true_votes}} true / {{false_votes}} false ({{total}} votes)
Submitted: {{submitted_at}}
```

---

## Seed claims

Use these to test the scoring prompt before launch. They're split into three groups intentionally.

**Obviously true (should score 75–100):**
1. The Great Wall of China is visible from space with the naked eye — FALSE, but use the corrected version: "The Great Wall of China is not visible from space with the naked eye."
2. Water boils at 100°C at sea level.
3. The human body has 206 bones in adulthood.
4. Neil Armstrong was the first human to walk on the moon.
5. The Earth orbits the Sun, not the other way around.
6. HIV causes AIDS.
7. The speed of light in a vacuum is approximately 299,792 km/s.
8. Australia is both a country and a continent.
9. DNA carries genetic information.
10. World War II ended in 1945.

**Obviously false (should score 0–25):**
1. The Earth is flat.
2. Vaccines cause autism.
3. The moon landing in 1969 was faked.
4. 5G towers spread COVID-19.
5. Humans only use 10% of their brain.
6. Lightning never strikes the same place twice.
7. Drinking bleach cures illness.
8. The sun revolves around the Earth.
9. Eating carrots gives you night vision.
10. Napoleon Bonaparte was unusually short for his era.

**Genuinely contested (should score 40–60 with high rationale uncertainty):**
1. Social media use causes depression in teenagers.
2. Ivermectin has shown benefit against COVID-19.
3. Immigration reduces wages for native workers.
4. Organic food is more nutritious than conventionally grown food.
5. Video games cause violent behaviour in children.
6. Coffee is good for long-term health.
7. Intermittent fasting is more effective than caloric restriction for weight loss.
8. Attachment parenting produces better outcomes for children.
9. Multitasking reduces productivity.
10. Early reading instruction using phonics produces better outcomes than whole-language methods.

---

## What to measure in Phase 1

Don't skip this. The point of Phase 1 is learning, not shipping.

**AI quality:**
- What percentage of seed claims score in the expected range?
- Does the rationale actually explain the score, or is it generic?
- How often does it confidently score a genuinely contested claim?

**User behaviour:**
- Do people come back after their first submission?
- Do they vote on claims other than their own?
- What types of claims do they submit? (Keep notes — this shapes Phase 2 scope.)
- How do they react when the score disagrees with their belief? Do they rephrase and resubmit?

**System health:**
- Average time from claim submission to score returned
- Any claims that crash or confuse the classifier?
- Any patterns in rejections that suggest the acceptance policy needs adjusting?

---

## Technical stack

Pick whatever you're comfortable with. The bot logic is simple.

- **Bot framework:** python-telegram-bot, Telegraf (Node.js), or Grammy (Node.js/Deno)
- **AI scoring:** Anthropic API (Claude) or OpenAI
- **Database:** SQLite to start (file-based, zero setup)
- **Hosting:** A VPS, Railway, or Fly.io — anything that can run a persistent process

You don't need a web server, a queue, or a caching layer for Phase 1. Keep the stack small.

---

## What Phase 1 is not trying to do

- No voter credibility weighting (flat votes only)
- No score updates over time (scores are set once at submission)
- No web interface
- No analytics dashboard
- No public claim pages
- No Contested or Indeterminate claim handling beyond classification and rejection

All of that comes later, designed against real data from this phase.
