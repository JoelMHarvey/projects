import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "percentbs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS claims (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text         TEXT NOT NULL,
    claim_type   TEXT NOT NULL CHECK(claim_type IN ('verifiable', 'contested', 'indeterminate')),
    submitted_by INTEGER NOT NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scores (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id       INTEGER NOT NULL REFERENCES claims(id),
    evidence_score INTEGER NOT NULL CHECK(evidence_score BETWEEN 0 AND 100),
    rationale      TEXT NOT NULL,
    sources        TEXT,
    scored_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score_version  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS votes (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id INTEGER NOT NULL REFERENCES claims(id),
    user_id  INTEGER NOT NULL,
    vote     TEXT NOT NULL CHECK(vote IN ('true', 'false')),
    voted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(claim_id, user_id)
);
"""


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.executescript(SCHEMA)


def add_claim(text: str, claim_type: str, submitted_by: int) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO claims (text, claim_type, submitted_by) VALUES (?, ?, ?)",
            (text, claim_type, submitted_by),
        )
        return cur.lastrowid


def add_score(claim_id: int, evidence_score: int, rationale: str, sources: list) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO scores (claim_id, evidence_score, rationale, sources) VALUES (?, ?, ?, ?)",
            (claim_id, evidence_score, rationale, json.dumps(sources)),
        )
        return cur.lastrowid


def add_vote(claim_id: int, user_id: int, vote: str) -> bool:
    """Returns True if recorded, False if already voted."""
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO votes (claim_id, user_id, vote) VALUES (?, ?, ?)",
                (claim_id, user_id, vote),
            )
        return True
    except sqlite3.IntegrityError:
        return False


def get_claim(claim_id: int) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT c.id, c.text, c.claim_type, c.submitted_at,
                   s.evidence_score, s.rationale, s.sources,
                   COUNT(CASE WHEN v.vote='true'  THEN 1 END) AS true_votes,
                   COUNT(CASE WHEN v.vote='false' THEN 1 END) AS false_votes
            FROM   claims c
            LEFT JOIN scores s ON s.claim_id = c.id
            LEFT JOIN votes  v ON v.claim_id = c.id
            WHERE  c.id = ?
            GROUP  BY c.id
            """,
            (claim_id,),
        ).fetchone()
        return dict(row) if row else None


def get_recent(n: int = 10) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.text, c.submitted_at,
                   s.evidence_score,
                   COUNT(v.id) AS vote_count
            FROM   claims c
            LEFT JOIN scores s ON s.claim_id = c.id
            LEFT JOIN votes  v ON v.claim_id = c.id
            WHERE  c.claim_type = 'verifiable'
            GROUP  BY c.id
            ORDER  BY c.submitted_at DESC
            LIMIT  ?
            """,
            (n,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_top_voted(n: int = 5) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.text, s.evidence_score,
                   COUNT(v.id) AS vote_count
            FROM   claims c
            LEFT JOIN scores s ON s.claim_id = c.id
            LEFT JOIN votes  v ON v.claim_id = c.id
            WHERE  c.claim_type = 'verifiable'
            GROUP  BY c.id
            ORDER  BY vote_count DESC
            LIMIT  ?
            """,
            (n,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_disputed(n: int = 5) -> list[dict]:
    """Claims with most even true/false split (min 2 votes)."""
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.text, s.evidence_score,
                   COUNT(CASE WHEN v.vote='true'  THEN 1 END) AS true_votes,
                   COUNT(CASE WHEN v.vote='false' THEN 1 END) AS false_votes,
                   COUNT(v.id) AS total_votes,
                   ABS(
                       COUNT(CASE WHEN v.vote='true'  THEN 1 END) -
                       COUNT(CASE WHEN v.vote='false' THEN 1 END)
                   ) AS split
            FROM   claims c
            LEFT JOIN scores s ON s.claim_id = c.id
            LEFT JOIN votes  v ON v.claim_id = c.id
            WHERE  c.claim_type = 'verifiable'
            GROUP  BY c.id
            HAVING total_votes >= 2
            ORDER  BY split ASC, total_votes DESC
            LIMIT  ?
            """,
            (n,),
        ).fetchall()
        return [dict(r) for r in rows]
