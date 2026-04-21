# ADR-0004: Three-pass rewrite pipeline

- Status: Accepted
- Date: 2026-04
- Deciders: @bhanu0710

## Context

A single "rewrite my resume" prompt produces mediocre output because the model tries to do too much at once: fix bullet formatting, align the summary to the JD's industry, strip clichés, maintain tense consistency, and not fabricate anything — all in one call. Quality improved dramatically when we split the job.

## Decision

`runRewrite` executes three passes in parallel (`Promise.all`):

1. **Bullet rewriter** (`llama-3.3-70b`) — one LLM call per bullet, enforces Google/Meta XYZ format (Action + Task + Measurable Result), runs each rewrite through the validator (ADR-0001). Concurrency capped at 4 to stay under Groq's rate limit.
2. **Section rewriter** (`llama-3.3-70b`, one call) — rewrites Summary and Skills in the voice of 2–3 inferred industry-standard companies (e.g. "fintech → Stripe, Plaid, Ramp"). Enforces 40–60 word summary, 8–20 canonical hard skills, no HR-speak.
3. **Final review** (`llama-3.1-8b-instant`, one call) — polish pass against an explicit cliché blocklist, tense consistency, weak-verb detection, first-person strip, passive-voice flagging. Returns 0–12 surgical find-and-replace items.

All three pass results are persisted on the `RewriteResult`. The download endpoint merges all three before rendering the PDF/DOCX so the final file reflects every accepted change.

## Consequences

- One analysis/rewrite now costs N+2 LLM calls where N is the number of bullets. On a 15-bullet resume that's ~17 calls; at Groq pricing this is still < $0.01 per rewrite.
- Each pass has a narrow, well-defined job, which makes prompt tuning tractable.
- Passes run in parallel so wall-clock latency is `max(passes)`, not the sum.
- A failure in the section rewriter or final review is logged but does not block the bullet rewrites — those are the primary deliverable.
- Users can regenerate the whole pipeline via a single button if prompts change; the old rewrite row is deleted to prevent stale cache bites.

## Related

- `apps/web/src/server/rewrite.ts` — `runRewrite`, `rewriteSummaryAndSkills`, `runFinalReview`
- `apps/web/src/app/api/rewrite/regenerate/route.ts`
- `apps/web/src/app/api/download/[rewriteId]/route.ts` — three-way merge before render
