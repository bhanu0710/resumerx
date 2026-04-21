# ADR-0002: Zod schemas in `@resumerx/shared` as the single source of truth

- Status: Accepted
- Date: 2026-02
- Deciders: @bhanu0710

## Context

Three surfaces exchange the same structured data:

- LLM output (JSON from Groq `response_format: json_object`)
- Postgres rows (Drizzle ORM)
- HTTP responses between `apps/web` and `apps/pdf-service`

Keeping TypeScript types, runtime validation, and database column types in sync across three boundaries is error-prone. A drift between the LLM's output schema and the database schema is the single most common source of production bugs in LLM apps.

## Decision

All shared contracts are defined as **Zod schemas** in `packages/shared/src/schemas.ts`. TypeScript types are derived via `z.infer`. Every boundary parses:

- LLM responses — `AnalysisLLMSchema.parse(json)` in `analyze.ts`, `RewriteLLMResponseSchema.parse(...)` in `rewrite.ts`
- HTTP requests at pdf-service — Zod parse before render
- Drizzle inserts — `result: Analysis` typed field, schema-checked at insert time

New fields are added as `.optional()` for backward compatibility with older persisted analyses/rewrites. Breaking changes bump a schema version.

## Consequences

- A broken LLM response (missing field, wrong type) fails fast with a readable Zod error instead of crashing deeper in the render pipeline.
- Three apps share one type definition; a schema change triggers typecheck errors everywhere it matters.
- Prompt engineering is constrained by the schema — we write the Zod shape first, then the prompt section describing that shape, which keeps them in sync.

## Related

- `packages/shared/src/schemas.ts`
- `apps/web/src/server/analyze.ts` — `parseLLMJson`
- `apps/pdf-service/src/server.ts` — request validation
