# Chaos checklist

Pre-launch sanity. Each item should pass without taking the user-facing app down. Run against **staging** first.

## Dependency failure simulations

### 1. Groq API down

- Action: Set `GROQ_API_KEY=invalid` in Vercel staging env, redeploy.
- Expected: `/api/analyze` returns 502 with `error: "analysis_failed"` JSON; UI shows readable error, no React crash. The heuristic stub fallback should NOT activate (we only fall back when the key is missing entirely, not when it's wrong — to avoid silently shipping fake analyses in production).
- Recovery: restore key.

### 2. Neon Postgres unreachable

- Action: temporarily revoke the staging Neon role, or set `DATABASE_URL` to an invalid host.
- Expected: `/api/analyze` and `/api/rewrite` return 5xx with structured Pino errors; Sentry captures. No data loss (no in-flight writes).
- Recovery: restore creds.

### 3. R2 unreachable

- Action: revoke R2 access key.
- Expected: upload returns 502, the analyze flow never starts. Already-stored analyses still load.

### 4. pdf-service down

- Action: `gcloud run services update-traffic resumerx-pdf-staging --to-revisions <bad>=100` to a known-broken revision.
- Expected: download button on rewrite page returns user-facing error; analyze + rewrite still work (they don't touch pdf-service).
- Recovery: split traffic back to last good revision (see `pdf-service-down.md`).

### 5. Cold start

- Action: leave Cloud Run idle 15min, then hit `/render-pdf` once.
- Expected: <2.5s including cold start.

## Adversarial input

### 6. Resume PDF that fails to parse

- Action: upload a 1-page PDF of a photo (no extractable text).
- Expected: parse step returns "couldn't extract text" error, not a crash. User sees an actionable message.

### 7. JD that's an essay (50KB)

- Action: paste a huge JD into the analyze form.
- Expected: enforced max length on the input; if it slips through, prompt token count check rejects it client-side or server-side before hitting Groq.

### 8. Resume with 100+ bullets

- Action: upload a CV-style 8-page resume.
- Expected: rewrite is capped by `REWRITE_MAX_BULLETS_PER_REQUEST` (currently first N bullets). UI shows which bullets were and weren't rewritten.

### 9. Malformed LLM response

- Action: temporarily replace `parseLLMJson` with one that returns `{}`.
- Expected: `AnalysisLLMSchema.parse` throws with a readable Zod error; route returns 502; user sees "analysis_failed".

## Rate limits

### 10. Hammering analyze

- Action: run `k6 run load/analyze.js` with target 50 VUs (well above expected).
- Expected: Upstash rate-limit middleware kicks in before Groq does; 429 to client with `retry-after`.

## Sign-off

Date the checklist when run against staging and again before each production deploy.

| Date       | Env     | Run by      | Notes |
| ---------- | ------- | ----------- | ----- |
| _pending_  | staging |             |       |
