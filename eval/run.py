#!/usr/bin/env python3
"""Run the eval set against the live agent and score what came back.

The agent itself is TypeScript, so this driver reaches it the same way a browser does:
POST /api/ask and read the NDJSON event stream. That means every number here is produced
by the real pipeline -- the real retriever, the real CitationRegister, the real
validateAnswer -- rather than by a reimplementation that could drift away from it.

    npm run dev                 # in one terminal
    python eval/run.py          # in another

Four checks are scored per question. They are deliberately not equally trustworthy, and
the summary says so:

    1. BEHAVIOR MATCH    answered when it should, refused when it should.  Hard.
    2. CITATION VALIDITY does the cited passage actually support the claim. LLM judge.
    3. RETRIEVAL HIT     did the expected pages come back, and at what rank.  Hard.
    4. ANSWER MATCH      does the answer contain the expected fact.  Fuzzy, advisory.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_PATH = ROOT / "eval" / "questions.json"
RESULTS_DIR = ROOT / "eval" / "results"

# Retrieval returns this many passages per search (lib/vector-index.ts DEFAULT_TOP_K).
# An agent may search several times, so the union across searches can exceed it.
TOP_K_PER_SEARCH = 5

REFUSAL_TEXT = "i don't know based on the provided documents"

RATE_LIMIT_MARKERS = ("rate limit", "quota", "429", "resource_exhausted")

# Words too common to prove an answer contains the expected fact.
STOPWORDS = {
    "the", "a", "an", "of", "to", "in", "or", "and", "vs", "per", "at", "on", "for",
    "is", "are", "be", "with", "that", "this", "it", "as", "by", "from", "you", "your",
    "days", "day", "week", "weeks", "year", "years", "month", "months", "about", "all",
    "each", "every", "their", "they", "up", "over", "rest", "and/or", "must", "can",
}


# ---------------------------------------------------------------------------
# Configuration and input
# ---------------------------------------------------------------------------


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE lines into os.environ without overwriting a real environment var."""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_questions() -> list[dict[str, Any]]:
    with QUESTIONS_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)["questions"]


# ---------------------------------------------------------------------------
# Talking to the agent
# ---------------------------------------------------------------------------


def post_json_stream(url: str, payload: dict[str, Any], timeout: float) -> Iterator[dict]:
    """POST JSON and yield each NDJSON line as it arrives."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def ask_agent(base_url: str, question: str, timeout: float) -> dict[str, Any]:
    """Run one question and flatten the event stream into a record of what happened."""
    queries: list[str] = []
    searches: list[dict[str, Any]] = []
    listed_documents = False
    result: dict[str, Any] | None = None
    error: str | None = None

    started = time.perf_counter()

    try:
        for event in post_json_stream(
            f"{base_url.rstrip('/')}/api/ask", {"question": question}, timeout
        ):
            kind = event.get("type")

            if kind == "search_start":
                queries.append(event.get("query", ""))
            elif kind == "search_end":
                searches.append(
                    {
                        "query": event.get("query", ""),
                        "hits": event.get("hits", 0),
                        "passages": event.get("passages", []),
                    }
                )
            elif kind == "list_documents":
                listed_documents = True
            elif kind == "done":
                result = event.get("result")
            elif kind == "error":
                error = event.get("message")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            error = json.loads(body).get("error", body)
        except json.JSONDecodeError:
            error = f"HTTP {exc.code}: {body[:200]}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        error = f"Could not reach {base_url}: {exc}"

    wall_ms = round((time.perf_counter() - started) * 1000)

    # search_end carries the authoritative query; search_start can lag it. Prefer the
    # completed searches and fall back to the started ones only for searches that never
    # finished.
    generated_queries = [s["query"] for s in searches if s["query"]] or queries

    return {
        "generated_queries": generated_queries,
        "searches": searches,
        "listed_documents": listed_documents,
        "result": result,
        "error": error,
        "wall_ms": wall_ms,
    }


def is_rate_limited(error: str | None) -> bool:
    if not error:
        return False
    lowered = error.lower()
    return any(marker in lowered for marker in RATE_LIMIT_MARKERS)


def ask_with_retry(
    base_url: str, question: str, timeout: float, max_retries: int, verbose: bool
) -> dict[str, Any]:
    """Retry only rate-limit failures; a real bug should surface immediately."""
    backoff = 20.0

    for attempt in range(max_retries + 1):
        record = ask_agent(base_url, question, timeout)

        if not is_rate_limited(record["error"]) or attempt == max_retries:
            record["attempts"] = attempt + 1
            return record

        if verbose:
            print(f"      rate limited, waiting {backoff:.0f}s "
                  f"(attempt {attempt + 1}/{max_retries})", flush=True)
        time.sleep(backoff)
        backoff *= 1.6

    record["attempts"] = max_retries + 1
    return record


# ---------------------------------------------------------------------------
# The LLM judge, used only for citation validity
# ---------------------------------------------------------------------------

JUDGE_PROMPT = """You are a strict citation auditor. You will be shown a CLAIM taken \
from an answer, and the PASSAGE that the answer cited as its evidence for that claim.

Decide whether the PASSAGE supports the CLAIM.

Rules:
- Judge ONLY against the passage text. Ignore anything you know about the world.
- "supported" means every factual assertion in the claim is stated in the passage.
- "partial" means the passage supports some of the claim but not all of it, or supports \
a weaker version of it.
- "unsupported" means the passage does not establish the claim, including the case where \
the passage is merely about the same topic.
- A claim that generalises beyond the passage's stated scope is NOT supported. If the \
passage says something about full-time employees and the claim is about all employees, \
that is unsupported.

Reply with exactly one word: supported, partial, or unsupported.

CLAIM:
{claim}

PASSAGE:
{passage}

One word:"""


def judge_citation(
    api_key: str, model: str, claim: str, passage: str, timeout: float
) -> dict[str, Any]:
    """Ask the judge whether one passage supports one claim."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {"parts": [{"text": JUDGE_PROMPT.format(claim=claim, passage=passage)}]}
        ],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 2000},
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:200]
        return {"verdict": "error", "detail": f"HTTP {exc.code}: {detail}"}
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        return {"verdict": "error", "detail": str(exc)}

    candidates = body.get("candidates") or []
    if not candidates:
        return {"verdict": "error", "detail": "judge returned no candidates"}

    parts = candidates[0].get("content", {}).get("parts") or []
    text = " ".join(part.get("text", "") for part in parts).strip().lower()

    for verdict in ("unsupported", "supported", "partial"):
        if verdict in text:
            return {"verdict": verdict, "detail": text[:120]}

    return {"verdict": "error", "detail": f"unparseable judge reply: {text[:120]}"}


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def page_of(label: str) -> int | None:
    """Pull the page number out of a citation label like 'nimbus-handbook.md p.3'."""
    match = re.search(r"p\.(\d+)\s*$", label or "")
    return int(match.group(1)) if match else None


def merge_retrieved(searches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse every search into one ranked view of what the agent actually saw.

    A page can surface in several searches at different ranks. The best rank and best
    score are kept, because the question a recall metric answers is "did the agent ever
    get to see this page", not "did one particular query find it".
    """
    best: dict[int, dict[str, Any]] = {}

    for search in searches:
        for position, passage in enumerate(search.get("passages", []), start=1):
            page = page_of(passage.get("label", ""))
            if page is None:
                continue

            score = float(passage.get("score", 0.0))
            existing = best.get(page)

            if existing is None:
                best[page] = {
                    "page": page,
                    "label": passage.get("label", ""),
                    "n": passage.get("n"),
                    "best_rank": position,
                    "best_score": score,
                    "times_retrieved": 1,
                }
                continue

            existing["times_retrieved"] += 1
            existing["best_rank"] = min(existing["best_rank"], position)
            existing["best_score"] = max(existing["best_score"], score)

    return sorted(best.values(), key=lambda entry: (entry["best_rank"], -entry["best_score"]))


def score_behavior(question: dict[str, Any], result: dict[str, Any] | None) -> dict[str, Any]:
    """The primary check, and the only one with no judgement call in it."""
    expected_refuse = question["expected_behavior"] == "refuse"
    actually_refused = bool(result and result.get("refused"))

    if expected_refuse and actually_refused:
        cell = "true_refuse"
    elif expected_refuse and not actually_refused:
        cell = "false_answer"       # answered something it had no grounds to answer
    elif not expected_refuse and actually_refused:
        cell = "false_refuse"       # over-refused a question the document covers
    else:
        cell = "true_answer"

    return {
        "expected": "refuse" if expected_refuse else "answer",
        "actual": "refuse" if actually_refused else "answer",
        "cell": cell,
        "passed": cell in ("true_refuse", "true_answer"),
    }


def score_retrieval(
    question: dict[str, Any], retrieved: list[dict[str, Any]]
) -> dict[str, Any]:
    """Did the pages that genuinely hold the answer come back, and how highly ranked?"""
    expected = list(dict.fromkeys(question["expected_pages"]))

    if not expected:
        # Refusal cases have no correct page, so recall is undefined rather than zero.
        return {
            "applicable": False,
            "expected_pages": [],
            "found_pages": [],
            "missing_pages": [],
            "ranks": {},
            "recall": None,
            "passed": None,
        }

    by_page = {entry["page"]: entry for entry in retrieved}
    found = [page for page in expected if page in by_page]
    missing = [page for page in expected if page not in by_page]
    ranks = {str(page): by_page[page]["best_rank"] for page in found}

    return {
        "applicable": True,
        "expected_pages": expected,
        "found_pages": found,
        "missing_pages": missing,
        "ranks": ranks,
        "recall": len(found) / len(expected),
        "passed": not missing,
    }


def significant_tokens(text: str) -> list[str]:
    """The tokens whose presence would actually prove the answer contains the fact.

    Numbers are kept no matter how short, and are never treated as stopwords. In this
    domain the number IS the fact -- "16 weeks", "20 days", "$50", "2019" -- and a plain
    length filter silently discards every one of them, which quietly turns this check off
    for the questions it matters most for.
    """
    tokens = re.findall(r"[a-z0-9][a-z0-9$,%.:/-]*", text.lower())
    keep: list[str] = []

    for raw in tokens:
        token = raw.strip(".,:")
        if not token:
            continue
        if any(character.isdigit() for character in token):
            keep.append(token)
        elif len(token) > 2 and token not in STOPWORDS:
            keep.append(token)

    return keep


def contains_token(haystack: str, token: str) -> bool:
    """Whole-token containment, so "16" does not match inside "2016"."""
    pattern = rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])"
    return re.search(pattern, haystack) is not None


def score_answer_match(
    question: dict[str, Any], result: dict[str, Any] | None
) -> dict[str, Any]:
    """Loose containment check. Explicitly the least trustworthy of the four."""
    expected = question.get("expected_answer") or ""

    if not expected:
        return {"applicable": False, "overlap": None, "missing": [], "passed": None}

    answer = (result or {}).get("answer", "") or ""
    haystack = answer.lower()

    wanted = significant_tokens(expected)
    if not wanted:
        return {"applicable": False, "overlap": None, "missing": [], "passed": None}

    present = [token for token in wanted if contains_token(haystack, token)]
    missing = [token for token in wanted if not contains_token(haystack, token)]
    overlap = len(present) / len(wanted)

    return {
        "applicable": True,
        "overlap": round(overlap, 3),
        "missing": missing,
        # Deliberately generous: this check exists to catch an answer that is about
        # something else entirely, not to grade phrasing.
        "passed": overlap >= 0.6,
        "confidence": "low",
    }


def sentences_citing(answer: str, number: int) -> str:
    """The sentence(s) in the answer that carry [number], which is the claim it makes."""
    pieces = re.split(r"(?<=[.!?])\s+", answer.strip())
    marker = f"[{number}]"
    hits = [piece.strip() for piece in pieces if marker in piece]
    return " ".join(hits) if hits else answer.strip()


def score_citations(
    result: dict[str, Any] | None,
    api_key: str | None,
    model: str,
    timeout: float,
    delay: float,
    verbose: bool,
) -> dict[str, Any]:
    """Judge every citation the answer actually made against the passage behind it."""
    sources = (result or {}).get("sources") or []
    answer = (result or {}).get("answer", "") or ""

    if not sources:
        return {"applicable": False, "judged": [], "supported": 0, "total": 0, "rate": None}

    judged: list[dict[str, Any]] = []

    for source in sources:
        number = source.get("n")
        claim = sentences_citing(answer, number)

        if not api_key:
            verdict = {"verdict": "skipped", "detail": "no judge key"}
        else:
            verdict = judge_citation(api_key, model, claim, source.get("text", ""), timeout)
            if delay:
                time.sleep(delay)

        if verbose:
            print(f"      [{number}] {source.get('label')} -> {verdict['verdict']}", flush=True)

        judged.append(
            {
                "n": number,
                "label": source.get("label"),
                "page": page_of(source.get("label", "")),
                "score": source.get("score"),
                "claim": claim,
                "passage": source.get("text", ""),
                "verdict": verdict["verdict"],
                "detail": verdict.get("detail", ""),
            }
        )

    scorable = [entry for entry in judged if entry["verdict"] in
                ("supported", "partial", "unsupported")]
    supported = sum(1 for entry in scorable if entry["verdict"] == "supported")

    return {
        "applicable": bool(scorable),
        "judged": judged,
        "supported": supported,
        "total": len(scorable),
        "rate": (supported / len(scorable)) if scorable else None,
        "passed": (supported == len(scorable)) if scorable else None,
    }


def failure_reasons(scores: dict[str, Any]) -> list[str]:
    reasons = []

    behavior = scores["behavior"]
    if not behavior["passed"]:
        if behavior["cell"] == "false_answer":
            reasons.append("answered a question it should have refused")
        else:
            reasons.append("refused a question the document covers")

    retrieval = scores["retrieval"]
    if retrieval["applicable"] and not retrieval["passed"]:
        missing = ", ".join(f"p.{p}" for p in retrieval["missing_pages"])
        reasons.append(f"never retrieved {missing}")

    citations = scores["citations"]
    if citations["applicable"] and not citations["passed"]:
        bad = [e for e in citations["judged"] if e["verdict"] in ("unsupported", "partial")]
        detail = ", ".join(f"[{e['n']}] {e['verdict']}" for e in bad)
        reasons.append(f"citation not supported by its passage: {detail}")

    answer_match = scores["answer_match"]
    if answer_match["applicable"] and not answer_match["passed"]:
        reasons.append(
            f"expected fact not found in answer (overlap {answer_match['overlap']:.0%}, low confidence)"
        )

    return reasons


# ---------------------------------------------------------------------------
# Aggregation and reporting
# ---------------------------------------------------------------------------


def aggregate(records: list[dict[str, Any]]) -> dict[str, Any]:
    scored = [r for r in records if r["status"] == "scored"]

    matrix = {"true_answer": 0, "false_refuse": 0, "false_answer": 0, "true_refuse": 0}
    for record in scored:
        matrix[record["scores"]["behavior"]["cell"]] += 1

    behavior_correct = matrix["true_answer"] + matrix["true_refuse"]
    behavior_accuracy = behavior_correct / len(scored) if scored else None

    all_refusals = matrix["true_refuse"] + matrix["false_refuse"]
    refusal_precision = matrix["true_refuse"] / all_refusals if all_refusals else None

    recalls = [r["scores"]["retrieval"]["recall"] for r in scored
               if r["scores"]["retrieval"]["applicable"]]
    recall_at_k = sum(recalls) / len(recalls) if recalls else None

    judged_total = sum(r["scores"]["citations"]["total"] for r in scored)
    judged_supported = sum(r["scores"]["citations"]["supported"] for r in scored)
    citation_validity = judged_supported / judged_total if judged_total else None

    matches = [r["scores"]["answer_match"]["passed"] for r in scored
               if r["scores"]["answer_match"]["applicable"]]
    answer_match_rate = (sum(1 for m in matches if m) / len(matches)) if matches else None

    latencies = sorted(r["latency_ms"] for r in scored if r.get("latency_ms"))
    tokens = [r["tokens"]["totalTokens"] for r in scored if r.get("tokens")]

    by_category: dict[str, dict[str, Any]] = {}
    for record in scored:
        bucket = by_category.setdefault(
            record["category"], {"total": 0, "behavior_passed": 0}
        )
        bucket["total"] += 1
        if record["scores"]["behavior"]["passed"]:
            bucket["behavior_passed"] += 1
    for bucket in by_category.values():
        bucket["behavior_accuracy"] = bucket["behavior_passed"] / bucket["total"]

    return {
        "confusion_matrix": matrix,
        "behavior_accuracy": behavior_accuracy,
        "refusal_precision": refusal_precision,
        "retrieval_recall_at_k": recall_at_k,
        "citation_validity": citation_validity,
        "citations_judged": judged_total,
        "citations_supported": judged_supported,
        "answer_match_rate": answer_match_rate,
        "by_category": by_category,
        "latency_ms": {
            "median": latencies[len(latencies) // 2] if latencies else None,
            "min": latencies[0] if latencies else None,
            "max": latencies[-1] if latencies else None,
        },
        "tokens": {
            "total": sum(tokens) if tokens else None,
            "mean_per_question": round(sum(tokens) / len(tokens)) if tokens else None,
            "reported_for": len(tokens),
        },
    }


def calibration_buckets(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group judged citations by retrieval score, so the score can be checked for meaning.

    A retrieval score is only useful if a higher one really does mean a more supportable
    citation. Bucketing the judge's verdicts by score is what turns that from an
    assumption into something visible.
    """
    edges = [0.0, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 1.01]
    buckets = [
        {"lower": edges[i], "upper": edges[i + 1], "supported": 0, "total": 0}
        for i in range(len(edges) - 1)
    ]

    for record in records:
        if record["status"] != "scored":
            continue
        for entry in record["scores"]["citations"]["judged"]:
            if entry["verdict"] not in ("supported", "partial", "unsupported"):
                continue
            score = float(entry.get("score") or 0.0)
            for bucket in buckets:
                if bucket["lower"] <= score < bucket["upper"]:
                    bucket["total"] += 1
                    if entry["verdict"] == "supported":
                        bucket["supported"] += 1
                    break

    for bucket in buckets:
        bucket["rate"] = (bucket["supported"] / bucket["total"]) if bucket["total"] else None

    return buckets


def percent(value: float | None) -> str:
    return "  n/a" if value is None else f"{value * 100:5.1f}%"


def print_summary(payload: dict[str, Any]) -> None:
    run = payload["run"]
    totals = payload["aggregate"]
    matrix = totals["confusion_matrix"]

    print()
    print("=" * 72)
    if not run["complete"]:
        print("  PARTIAL RUN -- metrics below cover only the questions that completed")
        print(f"  {run['scored']} of {run['total_questions']} scored, "
              f"{run['errored']} errored, {run['skipped']} never attempted")
    else:
        print(f"  COMPLETE RUN -- all {run['total_questions']} questions scored")
    print("=" * 72)
    print(f"  base url : {run['base_url']}")
    print(f"  judge    : {run['judge_model'] if run['judge_enabled'] else 'DISABLED'}")
    print(f"  finished : {run['finished_at']}")
    print()

    print("  CHECK                        RESULT     BASIS")
    print("  " + "-" * 68)
    print(f"  1. behavior match           {percent(totals['behavior_accuracy'])}"
          f"     {run['scored']} questions")
    print(f"  2. citation validity        {percent(totals['citation_validity'])}"
          f"     {totals['citations_judged']} citations judged")
    print(f"  3. retrieval recall@{TOP_K_PER_SEARCH}       {percent(totals['retrieval_recall_at_k'])}"
          f"     {len([1 for r in payload['results'] if r['status'] == 'scored' and r['scores']['retrieval']['applicable']])} answerable questions")
    print(f"  4. answer match (fuzzy)     {percent(totals['answer_match_rate'])}"
          f"     low confidence, advisory only")
    print()
    print(f"  refusal precision           {percent(totals['refusal_precision'])}"
          f"     of all refusals made")
    print()

    print("  CONFUSION MATRIX (rows = expected, cols = actual)")
    print("  " + "-" * 68)
    print(f"  {'':16}{'answered':>12}{'refused':>12}")
    print(f"  {'should answer':16}{matrix['true_answer']:>12}{matrix['false_refuse']:>12}")
    print(f"  {'should refuse':16}{matrix['false_answer']:>12}{matrix['true_refuse']:>12}")
    print()
    print(f"  false_answer = {matrix['false_answer']}  (ungrounded answers -- the failure "
          f"this project exists to prevent)")
    print(f"  false_refuse = {matrix['false_refuse']}  (over-refusal -- unhelpful, but safe)")
    print()

    print("  BY CATEGORY (behavior match)")
    print("  " + "-" * 68)
    for name in ("direct", "multi_hop", "out_of_scope", "adversarial"):
        bucket = totals["by_category"].get(name)
        if not bucket:
            continue
        print(f"  {name:16}{percent(bucket['behavior_accuracy'])}"
              f"     {bucket['behavior_passed']}/{bucket['total']}")
    print()

    latency = totals["latency_ms"]
    tokens = totals["tokens"]
    if latency["median"] is not None:
        print(f"  latency  median {latency['median']} ms  "
              f"(min {latency['min']}, max {latency['max']})")
    if tokens["total"] is not None:
        print(f"  tokens   {tokens['total']} total, ~{tokens['mean_per_question']} per question "
              f"({tokens['reported_for']} questions reported usage)")
    print()

    print("  CALIBRATION (retrieval score -> fraction of citations judged supported)")
    print("  " + "-" * 68)
    for bucket in payload["calibration"]:
        if not bucket["total"]:
            continue
        label = f"{bucket['lower']:.2f}-{min(bucket['upper'], 1.0):.2f}"
        bar = "#" * round((bucket["rate"] or 0) * 30)
        print(f"  {label:>12}  {percent(bucket['rate'])}  n={bucket['total']:<3} {bar}")
    print()

    failures = [r for r in payload["results"] if r["status"] == "scored" and r["failures"]]
    print(f"  FAILURES ({len(failures)} of {run['scored']} scored questions)")
    print("  " + "-" * 68)
    for record in failures:
        print(f"  {record['id']:5} [{record['category']:12}] {record['question'][:48]}")
        for reason in record["failures"]:
            print(f"        -> {reason}")
    if not failures:
        print("  none")
    print()

    errored = [r for r in payload["results"] if r["status"] == "error"]
    if errored:
        print(f"  ERRORED ({len(errored)}) -- excluded from every metric above")
        print("  " + "-" * 68)
        for record in errored:
            print(f"  {record['id']:5} {str(record['error'])[:60]}")
        print()

    print("  NOTE: the sample handbook indexes to only 7 passages and each search returns")
    print(f"        {TOP_K_PER_SEARCH}, so retrieval recall is near-saturated by construction and is the")
    print("        weakest signal here. Behavior match and citation validity carry the")
    print("        real information.")
    print("=" * 72)
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.environ.get("EVAL_BASE_URL", "http://localhost:3000"),
                        help="Where the app is running (default: http://localhost:3000)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Run only the first N questions. Forces the run to be marked partial.")
    parser.add_argument("--only", default=None,
                        help="Comma-separated question ids or categories to run.")
    parser.add_argument("--delay", type=float, default=2.0,
                        help="Seconds to wait between questions, to stay inside the free-tier rate limit.")
    parser.add_argument("--judge-delay", type=float, default=1.0,
                        help="Seconds to wait between judge calls.")
    parser.add_argument("--timeout", type=float, default=180.0, help="Per-request timeout in seconds.")
    parser.add_argument("--max-retries", type=int, default=3,
                        help="Retries for rate-limited questions.")
    parser.add_argument("--judge-model", default=os.environ.get("EVAL_JUDGE_MODEL", "gemini-flash-lite-latest"))
    parser.add_argument("--no-judge", action="store_true",
                        help="Skip citation validity. Everything else still runs.")
    parser.add_argument("--quiet", action="store_true", help="Less per-question output.")
    return parser.parse_args()


def select_questions(questions: list[dict[str, Any]], args: argparse.Namespace) -> list[dict]:
    selected = questions

    if args.only:
        wanted = {token.strip() for token in args.only.split(",") if token.strip()}
        selected = [q for q in selected if q["id"] in wanted or q["category"] in wanted]

    if args.limit is not None:
        selected = selected[: args.limit]

    return selected


def main() -> int:
    args = parse_args()
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")

    api_key = None if args.no_judge else os.environ.get("GOOGLE_API_KEY", "").strip()
    if not args.no_judge and not api_key:
        print("GOOGLE_API_KEY is not set, so citation validity cannot be judged.")
        print("Add it to .env, or pass --no-judge to run the other three checks.")
        return 2

    questions = read_questions()
    selected = select_questions(questions, args)
    verbose = not args.quiet

    print(f"Running {len(selected)} of {len(questions)} questions against {args.base_url}")
    if len(selected) != len(questions):
        print("This is a SUBSET -- the run will be labelled partial.")
    print()

    records: list[dict[str, Any]] = []
    started_at = datetime.now(timezone.utc)

    for position, question in enumerate(selected, start=1):
        if verbose:
            print(f"[{position:2}/{len(selected)}] {question['id']:5} "
                  f"{question['category']:12} {question['question'][:44]}", flush=True)

        run = ask_with_retry(args.base_url, question["question"], args.timeout,
                             args.max_retries, verbose)
        result = run["result"]

        if run["error"] or result is None:
            records.append(
                {
                    "id": question["id"],
                    "question": question["question"],
                    "category": question["category"],
                    "expected_behavior": question["expected_behavior"],
                    "expected_answer": question["expected_answer"],
                    "expected_pages": question["expected_pages"],
                    "notes": question["notes"],
                    "status": "error",
                    "error": run["error"] or "The agent produced no result.",
                    "generated_queries": run["generated_queries"],
                    "wall_ms": run["wall_ms"],
                }
            )
            if verbose:
                print(f"      ERROR: {str(run['error'])[:70]}", flush=True)
            time.sleep(args.delay)
            continue

        retrieved = merge_retrieved(run["searches"])

        scores = {
            "behavior": score_behavior(question, result),
            "retrieval": score_retrieval(question, retrieved),
            "answer_match": score_answer_match(question, result),
            "citations": score_citations(result, api_key, args.judge_model,
                                         args.timeout, args.judge_delay, verbose),
        }

        record = {
            "id": question["id"],
            "question": question["question"],
            "category": question["category"],
            "expected_behavior": question["expected_behavior"],
            "expected_answer": question["expected_answer"],
            "expected_pages": question["expected_pages"],
            "notes": question["notes"],
            "status": "scored",
            "generated_queries": run["generated_queries"],
            "searches": run["searches"],
            "retrieved": retrieved,
            "answer": result.get("answer", ""),
            "refused": bool(result.get("refused")),
            "sources": result.get("sources", []),
            "invalid_citations": result.get("invalidCitations", []),
            "latency_ms": result.get("latencyMs") or run["wall_ms"],
            "wall_ms": run["wall_ms"],
            "tokens": result.get("usage"),
            "attempts": run.get("attempts", 1),
        }
        record["failures"] = failure_reasons(scores)
        record["scores"] = scores
        records.append(record)

        if verbose:
            verdict = "PASS" if not record["failures"] else "FAIL"
            print(f"      {verdict}  {'refused' if record['refused'] else 'answered'}  "
                  f"{record['latency_ms']} ms  "
                  f"{len(run['generated_queries'])} search(es)", flush=True)

        time.sleep(args.delay)

    finished_at = datetime.now(timezone.utc)
    scored = [r for r in records if r["status"] == "scored"]
    errored = [r for r in records if r["status"] == "error"]

    payload = {
        "run": {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_s": round((finished_at - started_at).total_seconds()),
            "base_url": args.base_url,
            "judge_enabled": bool(api_key),
            "judge_model": args.judge_model,
            "top_k_per_search": TOP_K_PER_SEARCH,
            "total_questions": len(questions),
            "attempted": len(records),
            "scored": len(scored),
            "errored": len(errored),
            "skipped": len(questions) - len(records),
            # A run only counts as complete when every question was attempted AND every
            # attempt produced a result. Anything else is labelled so a partial run can
            # never be read as a full one.
            "complete": len(records) == len(questions) and not errored,
        },
        "aggregate": aggregate(records),
        "calibration": calibration_buckets(records),
        "results": records,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = finished_at.strftime("%Y-%m-%dT%H-%M-%SZ")
    out_path = RESULTS_DIR / f"{stamp}.json"
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print_summary(payload)
    print(f"Wrote {out_path.relative_to(ROOT)}")
    print("View it at /evals")

    return 0


if __name__ == "__main__":
    sys.exit(main())
