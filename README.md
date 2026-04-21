# ResumeRx

> Upload your resume. See what's actually wrong with it. Tailor it to the job — without making things up.

🔗 **Live:** [devwithb.space](https://devwithb.space)

ResumeRx is an honest resume tailoring tool. It analyses your resume against a specific job description using a senior-hiring-manager lens, then rewrites your bullets into the Google/Meta **XYZ format** (Action + Task + Measurable Result) — with a strict validator that refuses to fabricate facts, metrics, or scope. The rewritten resume downloads as a clean, ATS-parseable PDF and DOCX.

---

## What makes this different

- **No fabricated metrics.** Every rewrite runs through a validator that flags added numbers, inflated scope, new technologies, or changed meaning. If the original has no measurable result, the tool asks *you* a specific question (e.g. "What was latency before vs after?") rather than making one up.
- **Industry-standard output.** Prompts explicitly enforce XYZ bullet format, 40–60 word professional summaries, 8–20 canonical hard skills, cliché blocklist ("results-driven", "team player", "rockstar"…), and 1-page/2-page length rules that tier-1 recruiters actually apply.
- **Three-pass rewrite.** Bullet rewriter, section rewriter (summary + skills in industry voice), and a final review pass that catches tense inconsistencies, weak verbs, and filler phrases before export.
- **ATS-safe renderer.** Single-column layout, standard fonts, no tables/columns/text-boxes, proper tab-stop date alignment in both PDF and DOCX.

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Next.js web    │         │   pdf-service    │         │   Groq (LLM)     │
│   (Vercel)       │ ──────▶ │   (Cloud Run)    │         │                  │
│                  │         │   pdfkit + docx  │         │                  │
│   server actions │ ──────────────────────────────────▶ │   llama-3.3-70b  │
│   server-only    │                                      │   llama-3.1-8b   │
└──────┬───────────┘                                      └──────────────────┘
       │
       ├──▶ Neon Postgres (Drizzle) — resumes, analyses, rewrites, llm_calls audit
       ├──▶ Cloudflare R2 — raw uploaded PDFs (artifact TTL)
       └──▶ Upstash Redis — rate limits, idempotency keys
```

- **apps/web** — Next.js 14 App Router, server components, server actions, Drizzle migrations
- **apps/pdf-service** — Fastify on Cloud Run, renders `ParsedResume` → PDF/DOCX
- **packages/shared** — Zod-first schemas (source of truth for all LLM I/O contracts)

## Stack

| Layer         | Tech                                                |
| ------------- | --------------------------------------------------- |
| Frontend      | Next.js 14, React Server Components, Tailwind       |
| LLM           | Groq (llama-3.3-70b rewrite, llama-3.1-8b validate) |
| Database      | Neon Postgres + Drizzle ORM                         |
| Object store  | Cloudflare R2                                       |
| Cache/limit   | Upstash Redis                                       |
| PDF/DOCX      | pdfkit + docx on Cloud Run                          |
| CI/CD         | GitHub Actions → Vercel (web), GCP Cloud Run (pdf)  |
| IaC           | Terraform (GCP), Terraform Cloud `resumerx1`        |
| Observability | Pino structured logs, Sentry, LLM call audit table  |

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env     # fill in Groq, Neon, R2, Upstash
pnpm --filter @resumerx/shared build
pnpm dev
```

If `GROQ_API_KEY` is unset, analysis and rewrite fall back to deterministic heuristic stubs so you can click through the full flow without spending tokens.

## The core promise — and how we keep it

> **"We will not fabricate anything on your resume."**

Mechanisms:

1. **Rewriter prompt** — absolute rules forbid adding facts, metrics, technologies, scope, or seniority not in the original.
2. **Validator pass** — a second model independently checks the rewrite against the original and flags `fabricated_fact`, `added_metric`, `exaggerated_scope`, `new_technology`, or `changed_meaning`.
3. **Mechanical length-drift check** — rewrites >20% longer/shorter than the original get flagged automatically.
4. **Default-to-original UX** — flagged rewrites are shown but the "accepted" text is the original unless the user explicitly chooses the rewrite.
5. **LLM call audit** — every model call is logged to `llm_calls` with token counts, latency, validation result, and parent artifact id.

## Project layout

```
apps/
  web/                  Next.js app (server actions, analyze/rewrite pipelines)
  pdf-service/          Cloud Run service, pdfkit + docx renderer
packages/
  shared/               Zod schemas, constants (source of truth for contracts)
infra/
  terraform/            modules/ (cloudrun) + environments/ (staging, production)
docs/
  adr/                  architecture decision records
  runbooks/             operational runbooks
load/                   k6 scripts (Phase 14)
monitoring/             Grafana dashboards, alert rules
```

## Documentation

- [docs/adr/](docs/adr) — architecture decision records
- [docs/runbooks/](docs/runbooks) — incident response and operations
- [docs/BUILD_LOG.md](docs/BUILD_LOG.md) — phase-by-phase build log
- [SECURITY.md](SECURITY.md) — security disclosure policy
- [CONTRIBUTING.md](CONTRIBUTING.md) — commit conventions, PR guidelines

## License

MIT — see [LICENSE](LICENSE).
