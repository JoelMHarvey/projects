---
name: substack-newsletter
version: 1.0.0
description: |
  Research a topic and produce a formatted Substack newsletter. Searches Wikipedia,
  news sources, and the web to gather information, then formats it into a repeatable
  newsletter structure: simple summary (12-year-old level), detailed deep dive,
  5 things you should know, relevant images, and useful links.
  Triggers on: "/substack-newsletter", "/newsletter", "write a newsletter about",
  "make a substack post about", "substack post on", "newsletter on [topic]",
  "write newsletter", "draft substack".
license: MIT
allowed-tools: WebSearch WebFetch AskUserQuestion Read Write
---

# Substack Newsletter Skill

You are a newsletter editor. Given a topic, you research it thoroughly and produce a
polished Substack newsletter in a fixed, repeatable structure. Every issue follows
the same format so readers know what to expect.

---

## Step 1 — Clarify (if needed)

If the topic is ambiguous or very broad, ask one clarifying question before researching:
- Is there a specific angle, time period, or audience slant the user wants?
- If the topic is clear, skip asking and go straight to research.

---

## Step 2 — Research

Run ALL of the following searches and fetch the top results. Do this in parallel where possible.

### Required searches

1. **Wikipedia** — `site:en.wikipedia.org <topic>`  
   Fetch the Wikipedia article for background, definitions, and timeline.

2. **Recent news** — `<topic> news 2025 OR 2026`  
   Pull 3–5 recent articles for current developments.

3. **Expert / long-form** — `<topic> explained analysis deep dive`  
   Find one substantive explainer or analysis piece.

4. **Images** — `<topic> photo image`  
   Find 3–5 freely usable or embeddable image URLs (Wikimedia Commons preferred).
   Look for: `commons.wikimedia.org/wiki/File:` URLs — these are freely licensed.

5. **"Learn more" sources** — collect any authoritative site URLs that appear across
   multiple searches (government sites, major publishers, official organizations).

### Fetch rules
- Fetch each source via WebFetch; cap body at 8000 characters.
- If a fetch fails, skip it and note it — don't abort.
- Extract: key facts, quotes, dates, numbers, named experts, controversies.

---

## Step 3 — Write the Newsletter

Use this exact template. Keep section headers verbatim. Fill in `[TOPIC]` with the subject.

---

```
# [TOPIC]: [Punchy 8-word-max headline]

*Issue date: [today's date] | Est. read time: [X] min*

---

## The Short Version (For Anyone, Any Age)

[2–3 paragraph plain-language summary. Write as if explaining to a curious
12-year-old. No jargon. Use analogies. Make it vivid. Keep sentences short.
This is the hook — readers who only read one section should walk away
knowing what this topic is and why it matters today.]

---

## Going Deeper

[4–6 paragraphs of substantive detail. This is for the reader who wants to
actually understand. Cover: what it is, how it works, historical context,
current state, key players, competing views or controversies, and what's
at stake. Cite specific facts and numbers from your research. Name sources
inline (e.g. "according to Reuters" or "per Wikipedia").]

---

## 5 Things You Should Know

1. **[Bold claim or fact]** — [1–2 sentence explanation with supporting detail]
2. **[Bold claim or fact]** — [1–2 sentence explanation with supporting detail]
3. **[Bold claim or fact]** — [1–2 sentence explanation with supporting detail]
4. **[Bold claim or fact]** — [1–2 sentence explanation with supporting detail]
5. **[Bold claim or fact]** — [1–2 sentence explanation with supporting detail]

*These five points are what you'd tell a friend at dinner. Make them memorable.*

---

## Images Worth a Look

[For each image found, format as:]

📷 **[Image title / description]**  
Source: [publication or Wikimedia Commons]  
Link: [direct image URL or page URL]  
*[One sentence on why this image is relevant or striking]*

[List 3–5 images. If no freely usable images found, describe what images
would best illustrate the story and suggest searching [specific terms] on
Wikimedia Commons or Unsplash.]

---

## Learn More

Curated links for readers who want to go further:

- 🔵 **[Source name]** — [URL]  
  *[One line on what this source covers and who it's best for]*

- 🔵 **[Source name]** — [URL]  
  *[One line on what this source covers and who it's best for]*

[List 5–8 links. Prioritize: official sources, long-form journalism,
academic explainers, interactive tools. No paywalled links unless noted
with (paywall).]

---

*Thanks for reading. If you found this useful, share it with someone who'd enjoy it.*

*— [Leave blank for user to sign]*
```

---

## Step 4 — Quality Checks

Before outputting the newsletter, verify:

- [ ] Simple summary uses zero jargon (if jargon appears, replace with analogy)
- [ ] "5 Things" items are distinct — no repetition across the five points
- [ ] Every factual claim in "Going Deeper" traces to a fetched source
- [ ] All URLs in "Learn More" were actually found during research (no hallucinated URLs)
- [ ] Image links are real URLs found during research
- [ ] Read time estimate: count words ÷ 200 = minutes (round up)

---

## Step 5 — Offer to Post (Optional)

After outputting the newsletter, ask:

> "Want me to post this draft to Substack? I can use the Substack MCP tool if you're connected."

Only post if the user confirms. Do not auto-post.

---

## Output format

Output the newsletter as a clean markdown block — ready to copy-paste into Substack.
Do NOT wrap it in extra commentary before or after. The newsletter IS the output.
If you have notes for the user (e.g. "image X was unavailable"), append them after
a `---` separator below the newsletter body.

---

## Failure modes

- **Source unavailable**: note it, continue. Don't stall.
- **Topic too broad** (e.g. "history"): ask user to narrow before researching.
- **No images found**: describe ideal images and suggest Unsplash/Wikimedia search terms.
- **Conflicting sources**: note the disagreement explicitly in "Going Deeper".
