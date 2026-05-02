# Load tests

k6 scripts for the two hot paths:

- `render-pdf.js` — hits `pdf-service /render-pdf` with a representative `ParsedResume`. The renderer is CPU-bound; this tells us how Cloud Run's autoscaler behaves under burst.
- `analyze.js` — hits `apps/web /api/analyze`. Bound by Groq latency, so this is mostly a smoke test of the route's error handling under concurrent uploads, not raw throughput.

## Install

```bash
brew install k6        # macOS
# or: docker pull grafana/k6
```

## Run

```bash
# pdf-service render burst — needs the shared bearer token
PDF_SERVICE_URL=https://resumerx-pdf-staging-953489645890.us-central1.run.app \
PDF_SERVICE_TOKEN=$(op read "op://staging/pdf-service/token" 2>/dev/null || echo "set-me") \
k6 run load/render-pdf.js

# web app analyze smoke
WEB_URL=https://staging.devwithb.space \
k6 run load/analyze.js
```

## Targets (staging)

| Scenario          | Goal                                | Acceptable |
| ----------------- | ----------------------------------- | ---------- |
| `/render-pdf` p95 | <800ms warm                         | <1500ms    |
| `/render-pdf` p99 | <1500ms warm                        | <3000ms    |
| Cold start        | First req after idle <1500ms        | <2500ms    |
| Error rate        | 0 across the 5min run               | <0.1%      |
| `/api/analyze` 502| 0 (Groq is the failure mode)        | <1%        |

If we exceed these we tune `min_instance_count` on Cloud Run (currently 0) or drop bullet rewrite concurrency.
