# Runbook: LLM calls failing or fabricating

## Symptom A: analyze/rewrite returning 502

The Groq API is usually the first suspect.

```bash
# quick liveness check
curl -s https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY" | jq '.data[0].id'
```

Check `llm_calls` table in Neon for the last 50 rows — if `status` column (if present) or missing rows indicate failures, read the structured Pino log for the failing route:

```
route=analyze OR route=rewrite
```

Rate limits (429) manifest as user-facing 502s. If sustained:

- Drop bullet rewrite concurrency in `runBulletRewrites` (`CONCURRENCY` constant) from 4 → 2.
- Consider queueing: move rewrites behind the upstash rate-limit middleware per user.

## Symptom B: rewrites getting flagged as fabricated at an elevated rate

Expected baseline: <5% of rewrites carry any validation flag.

1. Pull recent flagged rewrites:

   ```sql
   select id, created_at, bullets
   from rewrites
   order by created_at desc
   limit 20;
   ```

   Inspect each `bullets[*].validation.flags` — is one flag type dominating?

2. If `added_metric` is spiking:
   - Check the rewriter prompt hasn't regressed (rule #2 in `rewriterSystemPrompt`).
   - Verify `REWRITE_LENGTH_DRIFT_MAX` is still 0.2 (mechanical check catches scope inflation).

3. If `exaggerated_scope` is spiking:
   - Groq may have rolled out a model change on `llama-3.3-70b-versatile`. Lower rewriter `temperature` from 0.4 → 0.2 as a hotfix.

4. If the **validator itself** looks unreliable (known-bad rewrites passing):
   - Swap `validatorModel` from `llama-3.1-8b-instant` to `llama-3.3-70b-versatile` temporarily. Doubles cost but restores safety.

## Symptom C: analyses returning structurally-broken JSON

`AnalysisLLMSchema.parse` throws → route returns 502.

1. Check the raw content in the failing `llm_calls` row (if we're logging it).
2. Common causes:
   - Model wrapped output in ```` ```json ```` despite `response_format: json_object` — the `parseLLMJson` regex strips this; if it misses, expand the regex.
   - Required schema field missing — add `.optional()` in `packages/shared/src/schemas.ts` if the field is genuinely non-critical, bump schema minor version.

3. To stop the bleeding while tuning: flip `GROQ_API_KEY` off in the affected env to force the heuristic stub fallback.

## Rollback path

All prompt changes are commits. If a prompt change is the suspect:

```bash
git log --oneline apps/web/src/server/analyze.ts apps/web/src/server/rewrite.ts
git revert <bad-sha>
git push origin HEAD:develop   # or main for production
```

Vercel redeploys within ~60s.
