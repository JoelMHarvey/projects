# Substack Newsletter Skill Audit
*Audited: 2026-06-12 by daily-sprint-runner*

## Substack Publication

- **URL**: Stored in `SUBSTACK_PUBLICATION_URL` env var (set in `~/.zshrc`). Not readable from the automated runner — Joel to confirm the live URL.
- **Publication name**: Unknown from code alone — likely "Cosmic Turtle" based on zen-substack context.
- **Homepage quality**: Could not visit live URL (env var not accessible in automated run).

---

## What the Skill Currently Does Well

1. **Clear research protocol** — 5 mandatory search types (Wikipedia, news, expert/long-form, images, "learn more") run in parallel. Systematic and repeatable.
2. **Fixed output template** — every issue uses the same structure: Short Version → Going Deeper → 5 Things → Images → Learn More. Readers know what to expect.
3. **Quality checklist** — 6 explicit checks before output (no jargon, distinct "5 Things", traceable facts, no hallucinated URLs, real image links, read-time estimate).
4. **Failure mode handling** — explicit rules for unavailable sources, overly broad topics, missing images, and conflicting sources. Doesn't stall.
5. **Opt-in posting** — never auto-posts; always asks for confirmation. Safe default.

---

## Gaps Identified

### Gap 1: No publication identity or voice guide
The sign-off is left blank (`— [Leave blank for user to sign]`). There is no named author persona, tone guide, or defined newsletter voice. The skill writes in a generic "newsletter editor" register.

**Impact**: Each issue risks sounding like a different writer. The Cosmic Turtle persona — which the zen-substack project demonstrates Joel has defined — is completely absent here.

**Fix**: Add a Publication Identity section to the skill with: newsletter name, author persona (The Cosmic Turtle), tone guide (ancient, wry, curious, science + Buddhism lens), sign-off format, and a note on what makes this newsletter different from generic science explainers.

### Gap 2: No auto-save of drafts to disk
The skill outputs the newsletter as a markdown block in chat but never saves it to disk. If the conversation closes or the skill is rerun, the draft is gone.

**Impact**: No versioning, no review trail, no way to pick up where you left off.

**Fix**: Add a Step 3b that saves the draft to `~/Projects/substack-newsletter/drafts/YYYY-MM-DD-[slug].md` before offering to post.

### Gap 3: No backlog integration
The topic is always entered manually at runtime. There is no connection to a subject backlog, no way to pull the next queued topic automatically.

**Impact**: Every run requires Joel to decide on a topic. No momentum, no queue discipline.

**Fix**: Add optional backlog mode: if no topic is provided, fetch the top "Queued" item from the Newsletter Subject Backlog page in Notion, confirm with Joel, then proceed.

### Gap 4: No Substack publication details in the skill
The skill has no knowledge of the publication URL, name, or audience. When it writes "Thanks for reading" and leaves the sign-off blank, it has no identity to fall back on.

**Impact**: The output is generic. The newsletter could be for anyone.

**Fix**: Hardcode the publication URL, name, and sign-off into the skill once confirmed. Or read from a `config.md` file in the skill directory.

---

## Top 3 Improvement Priorities

1. **Add The Cosmic Turtle voice and persona** — highest impact, changes every issue.
2. **Auto-save drafts to disk** — prevents loss, enables review.
3. **Add backlog integration** — enables autonomous topic selection from the Newsletter Subject Backlog.

---

## Publication Details (to be confirmed by Joel)

- Substack URL: `$SUBSTACK_PUBLICATION_URL` (set in `~/.zshrc` — not readable in automated runs)
- Publication name: Likely "Cosmic Turtle" — confirm
- Author sign-off: Likely "— The Cosmic Turtle" — confirm
