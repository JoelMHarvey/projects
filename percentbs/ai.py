import json
import os
from anthropic import Anthropic

MODEL = "claude-sonnet-4-6"

_SYSTEM = """You are a claim scoring system. Your job is to assess the evidence behind a factual claim and return a structured response.

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
}"""

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def score_claim(claim_text: str) -> dict:
    resp = _get_client().messages.create(
        model=MODEL,
        max_tokens=800,
        system=_SYSTEM,
        messages=[{"role": "user", "content": f"Claim to assess: {claim_text}"}],
    )
    raw = resp.content[0].text.strip()
    # Strip markdown fences if the model wraps its output
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw
    return json.loads(raw)
