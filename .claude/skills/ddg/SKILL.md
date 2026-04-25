---
name: ddg
description: "Use this skill whenever the user needs web search, live documentation lookup, URL verification, factual grounding, current pricing, incident research, or any evidence that may be newer than the model cutoff. Trigger phrases include \"search the web\", \"look this up\", \"ground this\", \"verify this URL\", \"get current results\", and similar. Invoke the `ddg` binary (crate ddg) with `--agent` for minimal JSON: a top-level array of `{title,url,excerpt?}` (or `{\"error\",\"message\"}` on search failure), or `--format json` for the full `SearchOutput` including `metadata` and `timestamp`. Wall-clock is capped by `--global-timeout` (default 60s; `0` = no whole-run cap; built in; no shell `timeout` required). Deterministic exit codes: 0=ok, 1=error, 2=bad args, 3=anti-bot, 4=global timeout, 5=no results. `ddg --skill` prints this skill. No API key; path-safe `--output`; optional proxy with masked credentials in errors."
---

# Skill - `ddg`

## Mission
- MUST use `ddg` when the answer depends on current or externally verifiable data.
- NEVER invent URLs, versions, prices, changelog details, or news.
- ALWAYS prefer verified results over plausible assumptions.

## Canonical Invocation
- PREFER `--agent` for machine consumption (smallest JSON: only `title`, `url`, `excerpt` per result — no query echo, no counts, no `metadata`). With `--agent`, stderr logging is error-only by default (same as `--quiet`); use `--verbose` for debug logs, or set `RUST_LOG` as needed.
- Use `--format json` only when you need the full `SearchOutput` (diagnostics, `metadata`, `region`, etc.).
- ALWAYS pin `--num` explicitly.
- Use `--global-timeout` for long runs (default 60s; use `0` for no whole-run cap; no shell `timeout` wrapper).

```bash
ddg "<query>" --agent --num 15 | jaq '.[]'
```

## Query Patterns
- Single query: `ddg "query"`
- Batch queries: use `--queries-file` for 3 or more queries.

```bash
printf '%s\n' "tokio runtime" "rayon parallel" "axum middleware" > /tmp/queries.txt
ddg --queries-file /tmp/queries.txt --agent --parallel 5 --num 15 --global-timeout 300
```

## JSON Contracts
- **`--agent`**: success → **one JSON array** of hits, each `{"title","url","excerpt"}`; missing snippet omits `excerpt`. If the run cannot return organic hits for that **query**, stdout is instead **`{"error":"<code>","message":...}`** (use exit codes in parallel with this). **Multi-query** → a JSON **array in input order**; each element is either a **hit array** (possibly empty) or that **`error` object** for a failed sub-query.
- **`--format json`**: full `SearchOutput` / `MultiSearchOutput` with diagnostics and execution metadata.
- Use the English field names from the current codebase. Full-record fields when using `--format json`:
  - SearchOutput: `query`, `engine`, `endpoint`, `timestamp`, `region`, `result_count`, `results`, `pages_searched`, `error`, `message`, `metadata`.
  - SearchResult: `position`, `title`, `url`, `display_url`, `snippet`, `original_title` (`content`, `content_length`, `content_extraction_method` when present).
  - SearchMetadata: `execution_time_ms`, `selectors_hash`, `retries`, `used_endpoint_fallback`, `concurrent_fetches`, `fetch_successes`, `fetch_failures`, `used_chrome`, `user_agent`, `used_proxy`.
  - MultiSearchOutput: `query_count`, `timestamp`, `parallelism`, `searches`.

### Example JSON (`--format json` single query, abridged)
```json
{
  "query": "tokio async",
  "engine": "duckduckgo",
  "endpoint": "html",
  "timestamp": "2026-04-21T12:00:00+00:00",
  "region": "us-en",
  "result_count": 2,
  "pages_searched": 1,
  "results": [
    {
      "position": 1,
      "title": "Tokio - An asynchronous runtime for Rust",
      "url": "https://tokio.rs/",
      "display_url": "https://tokio.rs",
      "snippet": "A runtime for writing reliable, asynchronous applications.",
      "original_title": null
    }
  ],
  "error": null,
  "message": null,
  "metadata": {
    "execution_time_ms": 450,
    "selectors_hash": "a1b2c3d4e5f6g7h8",
    "retries": 0,
    "used_endpoint_fallback": false,
    "concurrent_fetches": 0,
    "fetch_successes": 0,
    "fetch_failures": 0,
    "used_chrome": false,
    "user_agent": "Mozilla/5.0 ...",
    "used_proxy": false
  }
}
```

### Example JSON (`--agent` single query, abridged)
```json
[
  {
    "title": "Tokio - An asynchronous runtime for Rust",
    "url": "https://tokio.rs/",
    "excerpt": "A runtime for writing reliable, asynchronous applications."
  }
]
```

### Example JSON (`--agent` two queries, second search failed, abridged)
```json
[
  [ { "title": "…", "url": "https://a.example/", "excerpt": "…" } ],
  { "error": "rate_limited", "message": "persistent rate limit (HTTP 429)" }
]
```

## Parsing Rules
- ALWAYS use `jaq`, not `jq`.
- ALWAYS guard optional fields with `// ""` or a comparable fallback.
- ALWAYS check the process exit code before parsing stdout.
- ALWAYS inspect `PIPESTATUS[0]` in shell pipelines.
- ALWAYS treat stdout as data and stderr as diagnostics.

```bash
ddg "rust async runtime" --agent --num 15 \
  | jaq '.[] | {title, url, excerpt: (.excerpt // "")}'
```

## Exit Codes
- `0`: success.
- `1`: runtime error.
- `2`: invalid configuration or CLI argument error.
- `3`: DuckDuckGo anti-bot anomaly or soft block.
- `4`: global timeout exceeded.
- `5`: zero results.

## Retries and Fallbacks
- MUST use `--retries` instead of shell retry loops.
- MUST use `--endpoint lite` only after repeated HTML failures or a documented block.
- MUST keep `--parallel` at or below 5 unless you have explicit outbound IP control.

## Failure Handling Pattern
- If exit code is `2`, fix flags or input shape before retrying.
- If exit code is `3`, retry with smaller `--num`, lower `--parallel`, or `--endpoint lite`.
- If exit code is `4`, reduce work (`--num`, `--pages`), increase `--global-timeout`, or use `--global-timeout 0` to drop the whole-run cap (still subject to per-request `-t`).
- If exit code is `5`, report "no results" directly; do not hallucinate fallback facts.

## File Output and Safety
- MUST treat `--output` as validated by the CLI, not by ad hoc shell logic.
- MUST NOT try to smuggle `..` or system directories into `--output`.
- MUST NOT hardcode proxies or credentials in prompts or command examples.
- MUST remember that proxy credentials are masked in errors.

## User-Facing Guidance
- Prefer the first few results as the best starting point, but do not assume ranking equals truth.
- Attribute facts to their source URLs when you reuse them.
- If the CLI returns no data, surface that directly instead of filling gaps with guesses.
