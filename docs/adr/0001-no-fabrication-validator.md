# ADR-0001: Second-model validator to prevent fabrication

- Status: Accepted
- Date: 2026-03
- Deciders: @bhanu0710

## Context

The core product promise is "we will not fabricate anything on your resume." Relying on prompt rules alone is insufficient — large models routinely ignore "do not add metrics" instructions when the temperature is non-zero or when the original bullet is weak and the model feels pressure to "improve" it.

Options considered:

1. **Prompt rules only.** Free, but unreliable. Empirically produces ~5-10% fabrication rate on weak inputs.
2. **Regex/mechanical checks only.** Catches added digits but misses scope inflation ("contributed to" → "led") and invented technologies.
3. **Second-model validator pass** — a separate LLM call that compares original vs rewritten and emits structured flags.
4. **Human-in-the-loop.** Doesn't scale; users are the ones we're protecting.

## Decision

Every rewrite runs through a **second-model validator** (`llama-3.1-8b-instant`, temperature 0) in addition to the primary rewriter. The validator emits typed flags: `fabricated_fact`, `added_metric`, `exaggerated_scope`, `new_technology`, `changed_meaning`. Flagged rewrites are kept in the result for transparency but the UI defaults the "accepted" text to the original until the user explicitly opts in.

A mechanical length-drift check (>20% delta) runs alongside the validator — cheap, deterministic, and catches a failure mode the validator occasionally misses.

## Consequences

- Every rewrite costs 2 LLM calls. Validator is on the fast/cheap 8b model, so cost is ~15% above single-call baseline.
- False-positive flag rate is non-zero; the UX treats a flag as advisory, not fatal.
- All validation results are persisted to `llm_calls` for post-hoc auditing and prompt tuning.

## Related

- `apps/web/src/server/rewrite.ts` — `callValidator`, `lengthDriftExceeded`
- `packages/shared/src/schemas.ts` — `ValidationResult`, `ValidationFlag`
