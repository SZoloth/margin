#!/usr/bin/env python3
"""Retrieve k-NN similar human corrections from Margin using EmbeddingGemma 2.

Uses the shared SQLite vector cache at ~/.cache/embeddinggemma2/vectors.sqlite
with schema:
  vectors(model TEXT, text_hash TEXT, dim INTEGER, vec BLOB, updated_at REAL,
          PRIMARY KEY (model, text_hash))

Cache hits run with Python stdlib only (no ML imports). Missing vectors are
encoded offline with google/embeddinggemma-2 when sentence-transformers and the
local model are available; otherwise returns a graceful unavailable JSON result.
"""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import Any

MODEL_NAME = "google/embeddinggemma-2"
DEFAULT_DB_PATH = Path.home() / ".margin" / "margin.db"
DEFAULT_CACHE_PATH = Path.home() / ".cache" / "embeddinggemma2" / "vectors.sqlite"


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_notes_json(notes_json: str) -> list[str]:
    try:
        parsed = json.loads(notes_json)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if isinstance(v, str) and v.strip()]
    except Exception:
        pass
    return []


def load_corrections(db_path: Path, writing_type: str | None = None) -> list[dict[str, Any]]:
    if not db_path.exists():
        return []
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conditions = [
        "notes_json IS NOT NULL",
        "notes_json != '[]'",
        "session_id != '__backfilled__'",
        "UPPER(notes_json) NOT LIKE '%NOT FEEDBACK%'",
        "(category IS NULL OR category != 'non-feedback')",
        "(polarity IS NULL OR polarity != 'positive')",
    ]
    params: list[Any] = []
    if writing_type:
        conditions.append("writing_type = ?")
        params.append(writing_type)

    try:
        rows = conn.execute(
            f"""
            SELECT original_text, notes_json, highlight_color, document_title,
                   document_id, created_at, writing_type, polarity, rationale
            FROM corrections
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            """,
            params,
        ).fetchall()
    finally:
        conn.close()

    seen: set[tuple[str, str]] = set()
    items: list[dict[str, Any]] = []
    for r in rows:
        orig = (r["original_text"] or "").strip()
        notes_raw = (r["notes_json"] or "").strip()
        if not orig:
            continue
        dedup_key = (orig, notes_raw)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        notes = parse_notes_json(notes_raw)
        if not notes:
            continue
        items.append(
            {
                "originalText": orig,
                "notes": notes,
                "highlightColor": r["highlight_color"],
                "documentTitle": r["document_title"],
                "documentId": r["document_id"],
                "createdAt": r["created_at"],
                "writingType": r["writing_type"],
                "polarity": r["polarity"],
                "rationale": r["rationale"],
            }
        )
    return items


def decode_vec(blob: bytes, dim: int) -> array | None:
    if not isinstance(blob, (bytes, bytearray, memoryview)) or dim <= 0 or len(blob) != dim * 4:
        return None
    arr = array("f")
    arr.frombytes(bytes(blob))
    if sys.byteorder != "little":
        arr.byteswap()
    if any(not math.isfinite(x) for x in arr):
        return None
    return arr


def encode_vec_bytes(values: Any) -> tuple[int, bytes, array] | None:
    floats = [float(x) for x in values]
    if not floats or any(not math.isfinite(x) for x in floats):
        return None
    norm = math.sqrt(sum(x * x for x in floats))
    if norm > 0.0:
        floats = [x / norm for x in floats]
    host_arr = array("f", floats)
    le_arr = array("f", host_arr)
    if sys.byteorder != "little":
        le_arr.byteswap()
    return len(host_arr), le_arr.tobytes(), host_arr


def cosine_similarity(a: array, b: array) -> float | None:
    if len(a) != len(b) or len(a) == 0:
        return None
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    if denom == 0.0 or not math.isfinite(denom):
        return 0.0
    sim = dot / denom
    return sim if math.isfinite(sim) else None


def ensure_cache_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vectors (
            model TEXT,
            text_hash TEXT,
            dim INTEGER,
            vec BLOB,
            updated_at REAL,
            PRIMARY KEY (model, text_hash)
        )
        """
    )
    conn.commit()


def load_cached_vectors(cache_path: Path, hashes: list[str]) -> dict[str, array]:
    if not cache_path.exists() or not hashes:
        return {}
    conn: sqlite3.Connection | None = None
    cached: dict[str, array] = {}
    unique_hashes = list(dict.fromkeys(hashes))
    try:
        uri = f"{cache_path.resolve().as_uri()}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        # Chunk to stay well under SQLite's variable limit.
        for start in range(0, len(unique_hashes), 500):
            chunk = unique_hashes[start : start + 500]
            placeholders = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"SELECT text_hash, dim, vec FROM vectors WHERE model = ? AND text_hash IN ({placeholders})",
                [MODEL_NAME, *chunk],
            ).fetchall()
            for h, dim, blob in rows:
                vec = decode_vec(blob, int(dim))
                if vec is not None:
                    cached[h] = vec
    except sqlite3.Error:
        return {}
    finally:
        if conn is not None:
            conn.close()
    return cached


def persist_vectors_best_effort(
    cache_path: Path, rows_to_insert: list[tuple[str, str, int, bytes, float]]
) -> None:
    if not rows_to_insert:
        return
    conn: sqlite3.Connection | None = None
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(cache_path), timeout=5.0)
        ensure_cache_table(conn)
        conn.executemany(
            "INSERT OR REPLACE INTO vectors (model, text_hash, dim, vec, updated_at) VALUES (?, ?, ?, ?, ?)",
            rows_to_insert,
        )
        conn.commit()
    except (sqlite3.Error, OSError):
        # Best-effort cache persistence: never discard successful inference if cache is read-only/locked.
        pass
    finally:
        if conn is not None:
            conn.close()


def compute_and_cache_vectors(
    cache_path: Path, missing_pairs: list[tuple[str, str]]
) -> tuple[dict[str, array], str | None]:
    if not missing_pairs:
        return {}, None

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    try:
        import torch
        from sentence_transformers import SentenceTransformer
    except Exception as exc:
        return {}, f"sentence-transformers unavailable: {exc}"

    try:
        device = "mps" if hasattr(torch.backends, "mps") and torch.backends.mps.is_available() else "cpu"
        model_kwargs = {"dtype": torch.float32} if device == "cpu" else {}
        model = SentenceTransformer(
            MODEL_NAME,
            local_files_only=True,
            device=device,
            model_kwargs=model_kwargs,
        )
        texts = [t for _, t in missing_pairs]
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    except Exception as exc:
        return {}, f"failed to load or run {MODEL_NAME} offline: {exc}"

    now = time.time()
    computed: dict[str, array] = {}
    rows_to_insert: list[tuple[str, str, int, bytes, float]] = []
    for (h, _), vec in zip(missing_pairs, vecs):
        encoded = encode_vec_bytes(vec)
        if encoded is not None:
            dim, raw, host_arr = encoded
            computed[h] = host_arr
            rows_to_insert.append((MODEL_NAME, h, dim, raw, now))

    persist_vectors_best_effort(cache_path, rows_to_insert)
    return computed, None


def emit_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, allow_nan=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="EmbeddingGemma 2 k-NN correction retriever for Margin.")
    parser.add_argument("--query", type=str, default=None, help="Query text")
    parser.add_argument("--query-stdin", action="store_true", help="Read query text from stdin")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="Path to margin.db")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE_PATH, help="Path to vectors.sqlite")
    parser.add_argument("--limit", type=int, default=6, help="Max results (1..50)")
    parser.add_argument("--writing-type", type=str, default=None, help="Optional writing_type filter")
    parser.add_argument("--no-encode", action="store_true", help="Use cached vectors only; do not load model")
    parser.add_argument("--index-only", action="store_true", help="Precompute missing correction vectors and exit")
    args = parser.parse_args()

    limit = min(max(args.limit, 1), 50)
    items = load_corrections(args.db, args.writing_type)

    if args.index_only:
        hashes = [hash_text(it["originalText"]) for it in items]
        cached = load_cached_vectors(args.cache, hashes)
        seen_h: set[str] = set()
        unique_missing: list[tuple[str, str]] = []
        for h, it in zip(hashes, items):
            if h not in cached and h not in seen_h:
                seen_h.add(h)
                unique_missing.append((h, it["originalText"]))
        if unique_missing and not args.no_encode:
            computed, err = compute_and_cache_vectors(args.cache, unique_missing)
            if err:
                emit_json({"indexed": 0, "total": len(items), "available": False, "reason": err})
                return 0
            emit_json({"indexed": len(computed), "total": len(items), "available": True})
            return 0
        emit_json({"indexed": 0, "total": len(items), "available": True})
        return 0

    query = sys.stdin.read() if args.query_stdin else (args.query or "")
    query = query.strip()
    if not query or not items:
        emit_json({"results": [], "backend": "empty", "available": True, "cached": True})
        return 0

    query_hash = hash_text(query)
    item_hashes = [hash_text(it["originalText"]) for it in items]
    cached = load_cached_vectors(args.cache, [query_hash, *item_hashes])

    expected_dim = len(cached[query_hash]) if query_hash in cached else None
    missing_map: dict[str, str] = {}
    if query_hash not in cached:
        missing_map[query_hash] = query
    for h, it in zip(item_hashes, items):
        vec = cached.get(h)
        if vec is None or (expected_dim is not None and len(vec) != expected_dim):
            missing_map[h] = it["originalText"]

    used_cache_only = len(missing_map) == 0
    if missing_map:
        if args.no_encode:
            emit_json(
                {
                    "results": [],
                    "backend": "unavailable",
                    "available": False,
                    "cached": False,
                    "reason": "query or corpus vectors not cached (--no-encode)",
                }
            )
            return 0
        computed, err = compute_and_cache_vectors(args.cache, list(missing_map.items()))
        if err:
            emit_json(
                {
                    "results": [],
                    "backend": "unavailable",
                    "available": False,
                    "cached": False,
                    "reason": err,
                }
            )
            return 0
        cached.update(computed)

    query_vec = cached.get(query_hash)
    if query_vec is None:
        emit_json(
            {
                "results": [],
                "backend": "unavailable",
                "available": False,
                "cached": False,
                "reason": "query vector unavailable",
            }
        )
        return 0

    scored: list[tuple[float, dict[str, Any]]] = []
    for h, it in zip(item_hashes, items):
        vec = cached.get(h)
        if vec is None:
            continue
        sim = cosine_similarity(query_vec, vec)
        if sim is None:
            continue
        scored.append((sim, it))

    scored.sort(key=lambda pair: (pair[0], pair[1]["createdAt"]), reverse=True)
    results = []
    for sim, it in scored[:limit]:
        entry = dict(it)
        entry["similarity"] = round(float(sim), 6)
        results.append(entry)

    emit_json(
        {
            "results": results,
            "backend": "sqlite-cache" if used_cache_only else "embeddinggemma2",
            "available": True,
            "cached": used_cache_only,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
