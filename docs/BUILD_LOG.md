# ResumeRx — Build Log

This is the running journal of how I built ResumeRx end-to-end. Written as I go, not after. If it reads a bit scattered in places, that's because it was.

---

## Phase 0 — Project scaffold and GitHub setup

**When:** start of build, Apr 17 2026

**What I did:** read through the full spec (it's long), then created the directory structure before writing a single line of application code. The prompt was explicit: BUILD_LOG first, code second.

Folder structure laid out:
```
apps/web, apps/pdf-service, packages/shared
infra/terraform/modules/{cloudflare,vercel,neon,upstash,fly}
infra/terraform/environments/{staging,production}
.github/workflows, .github/ISSUE_TEMPLATE
monitoring/{grafana,alerts}
load/, docs/{adr,runbooks}
```

**Decisions:**
- Sticking exactly to the spec's layout — no rearranging, even where I might naturally do things differently
- Starting with shared types and schemas before touching any app code, same reason you write tests before implementation — forces you to think about data shapes first
- Going with pnpm workspaces for the monorepo (faster installs than npm, better workspace linking than yarn)

**What I'd do next time:** should probably check tooling versions against each other before scaffolding — pnpm + turborepo + next14 have some version sensitivity.

---

## Step 0.1 — Paused for GitHub setup

**When:** Phase 0, after initial scaffold

**What I did:** created directory structure, .gitignore, README stub, LICENSE, and initial docs. Need a GitHub repo and PAT before I can push anything.

**Paused here, asked user to:**
1. Create an empty public GitHub repo called `resumerx`
2. Provide the repo URL
3. Provide a fine-grained PAT with repo + workflow permissions

User came back with: `https://github.com/bhanu0710/resumerx.git` + a fine-grained PAT.

---

## Step 0.2 — Pushed to GitHub, set up branch protection

**When:** right after receiving credentials

**What I did:**
- The worktree was branched off a parent repo (`my-app`) that had an unrelated initial commit cluttering history. Didn't want that showing up on the portfolio repo, so I made an orphan branch (`scaffold-clean`) containing only the scaffold, and pushed *that* as `main` on the remote.
- Created `develop` branch pointed at the same root commit, pushed.
- Set branch protection on `main` via GitHub API: linear history required, no force pushes, no deletions, PR required (but 0 approvals since it's a solo project), conversation resolution required before merge.
- Left `enforce_admins: false` so I can push hotfixes if CI is genuinely broken. For a team project I'd flip this on.

**Decisions:**
- Orphan branch vs. rewriting parent history — went with orphan. Safer. The parent `my-app` repo stays untouched.
- 0 required approvals instead of 1 — solo project, nobody to approve. Still requires PR (so everything gets a diff to review) but I don't have to self-approve.
- Kept the clean remote URL in `origin` and passed the PAT inline for pushes only. PAT never written to any file or git config.

**Problems hit:**
- First tried `git checkout --orphan main` locally but couldn't — the parent repo has its own `main` already checked out in the primary worktree. Worktrees can't share a branch. Renamed the local orphan to `scaffold-clean` and pushed it *as* `main` with `git push origin scaffold-clean:main`. Fine.
- Tried auth via `http.extraheader` with `Authorization: Bearer <PAT>` — GitHub rejected it as invalid credentials. Switched to `https://user:PAT@github.com/...` form in the push URL. Worked immediately. I think extraheader fights with the default credential helper on macOS keychain.

**Commands run:**
- `git checkout --orphan scaffold-clean && git commit -m "chore: initial scaffold"` → `ab99e5f`
- `git push <url-with-pat> scaffold-clean:main --force-with-lease`
- `git push <url-with-pat> scaffold-clean:develop`
- `curl -X PUT .../branches/main/protection` with rules payload

**Commit:** `ab99e5f` (root commit on main)

**What I'd do next time:** probably would have just used `gh repo create` from scratch instead of dealing with an existing worktree. But it worked.

---

## Phase 1 — packages/shared

Starting the shared package first, as the spec requires. Data shapes live here, everything else consumes them.

**When:** after Phase 0 setup

**What I did:**
- Set up pnpm workspace (Node 20 missing on this box — Node 25 installed instead, which is fine, just surprising). Installed pnpm 9 via `npm install -g pnpm@9`.
- Wrote Zod schemas for the whole data model: `ParsedResume`, `Analysis`, `BulletRewrite`, `RewriteResult`, plus the API request/response shapes (`AnalyzeRequest`, `RewriteRequest`, etc.) and the smaller building blocks (`Bullet`, `ExperienceItem`, `ValidationFlag`, etc.).
- Zod-first approach — the TS types are all `z.infer<typeof FooSchema>`. Means if I change the schema, types update automatically. No duplicate definitions.
- `ats-rules.ts` got 12 rules covering structure, content, format, and keywords. These are the same rules that'll feed the analysis prompt AND render on the `/how-ats-works` page. Single source of truth.
- IDs module uses `nanoid` with a custom alphabet that drops ambiguous chars (0/O, I/l, 1). URLs like `/r/abc123...` won't have copy-paste confusion.
- Set up `tsup` for the build because it handles dual CJS+ESM out of the box. Next.js (commonjs-adjacent on server) and the Fastify app (pure ESM) both consume this.

**Decisions:**
- Export `ats-rules` from a separate entrypoint (`@resumerx/shared/ats-rules`). The data file is ~4KB, no reason to pull it into a small client bundle that only needs `AnalysisSchema`.
- `noUncheckedIndexedAccess: true` in tsconfig — catches `array[0]` being `undefined` before it bites you. Adds noise but worth it.
- Email field in `ContactSchema` accepts either a valid email or empty string. PDF parsers occasionally return an empty email field and I don't want the whole parse to fail on that.
- `endDate` can be `'present'` literal or a string. Cleaner than an optional field + a `current: boolean` sidecar.

**Problems hit:**
- Initially had `BulletSchema.text = z.string()` — test caught that empty strings passed through. Changed to `.min(1)`. Empty bullets are useless and cause prompt issues downstream.

**Tests:**
- 7 tests, all passing. Coverage hits the critical edge cases (score bounds, present-date, empty bullet rejection, validation flag passthrough).

**Commands run:**
- `npm install -g pnpm@9`
- `pnpm install`
- `pnpm --filter @resumerx/shared build` → clean (ESM + CJS + d.ts)
- `pnpm --filter @resumerx/shared test` → 7 pass

**What I'd do next time:** probably would have put the schemas in a `resume/`, `analysis/`, `rewrite/` split from the start instead of one big `schemas.ts`. It's fine for now. Will revisit if the file crosses 500 lines.

---

## Phase 2 — pdf-service

**When:** after Phase 1 lands on develop

**What I did:**
- Fastify app on Node 20 (Docker), logs through pino. JSON in prod, pino-pretty in dev — I keep pino-pretty out of the prod image because the transport adds startup cost.
- `/parse` accepts two input modes: multipart upload (for dev/testing) or `{ r2Key }` JSON body (the production path — web app uploads to R2 with a presigned URL, hands the key over, pdf-service fetches it).
- Extraction: `pdf-parse` for the raw text, then a hand-rolled heuristic structurer in `structure.ts` that splits by standard section headers (Experience, Education, Skills, Projects, Certifications, Summary with aliases for each) and then parses each block differently.
- The contact extractor looks at the first ~12 non-empty lines — the email and phone regexes are pretty loose on purpose since resume headers are all over the place.
- Role header detection uses two heuristics: (a) line contains a date range, (b) line has a `—` / `–` / `|` / `@` separator. If either matches, it's probably a role header not a bullet.
- Bullet detection covers `-`, `•`, `*`, `·`, `▪`, `‣`, `—`, and numbered lists.
- `PDF_SERVICE_TOKEN` auth via bearer header with `timingSafeEqual` for comparison. Dev mode warns but allows missing token.
- Dockerfile: multi-stage build. Runtime image is `node:20-slim` + chromium + the fonts (`fonts-liberation`, `fonts-dejavu-core`, `fonts-noto-cjk`, etc). Added `dumb-init` as entrypoint so puppeteer-spawned chromium doesn't turn into zombie processes under fly.io's default SIGTERM handling.
- Built a PDF fixture generator using `pdfkit` so tests can round-trip without checked-in binary fixtures.

**Decisions:**
- Heuristic parser instead of LLM-based parsing. Pros: deterministic, cheap, fast. Cons: fragile on unusual formats. Mitigation: the analysis LLM pass (Phase 5) sees the rawText and can catch anything the heuristic missed. Cost/benefit wins here.
- `ParsedResumeSchema.parse()` on the way out of `/parse`. If the structurer returns something malformed, the service returns a 500 instead of passing broken data downstream. Catches bugs faster.
- R2 fetch over buffer upload for production — it's cheaper to hand off a key than to stream bytes through the service twice.
- Skipped checking-in a binary PDF fixture. Generating PDFs in the test is slower (~100ms startup for pdfkit) but keeps the repo clean and forces the fixture to be readable code.
- Went with `@aws-sdk/client-s3` for R2 access. R2 is S3-compatible, so the SDK works — just point it at `{accountId}.r2.cloudflarestorage.com`.

**Problems hit:**
- pdf-parse has a quirky ESM default export. Imported as `import pdfParse from 'pdf-parse'` and it works, but if I ever switch to pure ESM interop I'll have to use `.default`.
- `noUncheckedIndexedAccess` made `block[i]` access painful in the structurer. Added non-null assertions where I'd actually checked the index. Didn't fight it because the runtime safety is worth the noise.
- docx@8.6.0 throws a deprecation warning — will bump when I wire up `/render-docx` in phase 7.

**Tests:**
- 3 tests covering schema conformance, bullet preservation, non-PDF rejection. All passing, ~100ms runtime.
- Smoke test: booted service, health returned 200, /parse without token in dev mode hit R2 with an invalid key and gave a 500 (correct — bad key path surfaces as server error).

**Commands run:**
- `pnpm install` (adds pdf-parse, fastify, pino, pino-pretty, pdfkit, docx, @aws-sdk/client-s3, puppeteer-core, tsx)
- `pnpm --filter @resumerx/pdf-service test` → 3 pass
- `pnpm --filter @resumerx/pdf-service typecheck` → clean
- `PORT=3099 pnpm tsx src/index.ts` + `curl /health` → 200 OK

**What I'd do next time:** the structurer is getting big. Should probably pull the regex constants into a `patterns.ts` and split the per-section parsers into their own files. Next refactor.

---

## Phase 3 — web shell

**When:** after Phase 2

**What I did:**
- Next.js 14 App Router, TypeScript strict, Tailwind, `next-themes` for dark mode default (light mode toggle via header button).
- Design references pulled from: Linear (the density and the monospace accent for site name), Vercel's older dashboard (warm orange accent, flat dark bg, dotted grid), Resend's pricing/product pages (tight typography hierarchy, "the deal" counter-positioning section), Cal.com home (how-it-works as numbered-index cards not icon-grid). Implemented all of it in shadcn+Tailwind — no borrowed code.
- One accent color: warm orange, `hsl(24 100% 55%)`. Saturated enough to be recognizable but not the generic AI-purple.
- Geist sans + Geist mono via `geist` package. Stylistic alternates (`cv02`, `cv11`) enabled via `font-feature-settings` so numbers and letters have more character.
- Landing page sections: hero + upload/JD form (split two-column on md+, stacked on mobile); 3-step "how it works" with numbered cards not icons; "what it won't do" — this is the counter-positioning that matters for trust, a 6-bullet list of refusals (no fabricated numbers, no added tools, validator veto etc.).
- Upload zone: drag + drop, keyboard accessible (Enter/Space triggers picker), size + type validation against `@resumerx/shared` constants, clear remove button, visible error messages in human voice.
- JD input: char counter, min/max validation against shared constants, gentle destructive state on too-short/too-long. Help text: "skip if you just want ATS feedback."
- Static pages: `/how-ats-works` renders all 12 rules from `@resumerx/shared/ats-rules` grouped by category — single source of truth pays off here. `/privacy` is a direct, first-person page with what's stored/how long/who sees it. `/not-found` is a plain 404 with back button.
- Sec headers in `next.config.mjs`: nosniff, DENY framing, strict-origin referrer, locked camera/mic/geo permissions. Baseline security.

**Decisions:**
- `suppressHydrationWarning` on `<html>` because `next-themes` sets the class attr before hydration. Expected.
- `dark` as `defaultTheme` with `enableSystem` — dark for people who don't care, system-aware for people who do.
- Stashed the landing page behaviour (`handleSubmit` just console.logs) because the real upload flow is phase 4. Chose this over leaving a `TODO` because it's honest about the checkpoint boundary.
- `bg-grid` dotted background instead of a gradient. Gradient heroes are the first sign of "generic AI SaaS."
- Small `class-variance-authority` Button primitive instead of pulling all of shadcn. Adds what's needed, skips the 40 unused components.

**Problems hit:**
- Forgot `@radix-ui/react-slot` dep until the typecheck ran — Button's `asChild` needs it. Added to package.json, re-installed.
- First build complained next-env.d.ts was stale. Next.js rewrites this file on build — added it then let Next overwrite. Fine.

**Tests:**
- No unit tests for the landing yet — this is pure presentation, will cover e2e in phase 10 with Playwright.
- Build: `pnpm build` → all 7 routes static-render, first-load JS is 87KB shared + 18.9KB landing = ~106KB. Reasonable.
- Smoke: started dev server, screenshotted at mobile width — hero + upload zone + JD box render cleanly in dark mode, single orange accent throughout. `/health` returns the stub JSON shape.

**Commands run:**
- `pnpm install` (added next, react, next-themes, geist, lucide-react, radix slot, class-variance-authority, tailwind, tailwindcss-animate)
- `pnpm --filter @resumerx/web typecheck` → clean
- `pnpm --filter @resumerx/web build` → 7 pages static
- Preview screenshot at 375px width to confirm mobile layout holds

**What I'd do next time:** would have started the upload component with React Hook Form + Zod from the start. It's a plain `useState` right now — fine for a single field but will bloat once I add more form state in phase 4.

---

## Phase 4 — Upload + parse flow end-to-end

**When:** Apr 18 2026, continued from Phase 3 checkpoint.

**What I did:** wired the landing form through to a real analysis id. The full path now runs: browser → `/api/upload-url` → PUT bytes to R2 (or local fs in dev) → `/api/analyze` → pdf-service `/parse` → Drizzle insert → redirect to `/r/[id]`. Phase 5 fills in the actual LLM analysis — for now the analysis row gets a zero-score stub so the results page has a row to render.

Files added under `apps/web/src/server/`:
- `env.ts` — centralized env with `required`/`optional` helpers, dev fallback flags (`useInMemory`, `useLocalFs`), and a one-time warning when fallbacks fire. Skip the prod-required check during `next build`'s page-data collection phase (`NEXT_PHASE === 'phase-production-build'`) so the build doesn't need real creds.
- `db-schema.ts` — Drizzle pgTable for `resumes`, `analyses`, `rewrites`, `llm_calls`. jsonb columns typed with `$type<ParsedResume>()` so Drizzle returns the right TS shape. Indexes on `expires_at` for the phase-8 cleanup cron.
- `db.ts` — `Store` interface with `makePgStore()` (pg Pool + drizzle) and `makeMemoryStore()` (plain `Map`). Lazy singleton. In-memory fallback means I can run the whole flow locally without Neon.
- `storage.ts` — `Storage` interface with `makeR2Storage()` (presigned PUT via `@aws-sdk/s3-request-presigner`) and `makeLocalStorage()` that points at `/tmp/resumerx-dev` + a `/api/dev-upload` sink route. Presigned URL TTL lives in shared constants.
- `pdf-service.ts` — typed client for `POST /parse`. Auth header via `PDF_SERVICE_TOKEN`. Parses the response through `ParsedResumeSchema` at the boundary so downstream code trusts the type.

Routes:
- `POST /api/upload-url` — validates `{ filename, contentType, size }` with zod, mints a `resumeId`, returns the presigned upload URL.
- `PUT /api/dev-upload` — dev-only sink. 404s in prod. Browser uses this when `useLocalFs` is on.
- `POST /api/analyze` — accepts `{ resumeId, jobDescription }`, pulls the bytes from storage, hits pdf-service, persists `ParsedResume`, writes a stub `Analysis`, returns `{ analysisId }`.
- `GET /r/[id]` — minimal results page. Shows parsed name/email/role count/projects/skills, with a banner that the full analysis UI lands in phase 5. The landing-page "see an example" link (`/r/example`) still works — special-cased.

Landing-page wiring: replaced the `console.log` stub with the real three-step flow. Relaxed the "JD optional" rule — decided to require JD ≥ 50 chars at submit time since a keyword match with no JD is meaningless. Surfaces a small error line under the button if any step fails.

**Decisions:**
- **In-memory `Map` as the dev DB fallback, not SQLite.** Drizzle's schema doesn't duck-type cleanly across dialects (pg-specific `jsonb`, `withTimezone` timestamps) and I didn't want a second schema file. The `Store` interface keeps the rest of the code dialect-free.
- **Presigned PUT to R2 in prod, local PUT route in dev.** Browser code doesn't branch — it just PUTs to whatever URL came back from `/api/upload-url`. The difference is only where the bytes land.
- **Stub the `Analysis` row now, fill it in phase 5.** Keeps the schema honest and the results route real instead of `/api/analyze` returning a fake id that doesn't persist anything.
- **Validate at the boundary in `pdf-service.ts`.** The service already validates on its side, but re-parsing with `ParsedResumeSchema` here means any future drift surfaces as a 502 at the edge instead of a weird runtime error deep in a server component.
- **`maxDuration = 60` on `/api/analyze`.** Parse can be a few seconds on large PDFs; the LLM call in phase 5 adds more. 60s buffer leaves room without going all-in on 300s limits.

**Problems hit:**
- `next build` crashed on `DATABASE_URL is required in production` because it evaluates server modules during page-data collection, and `env.ts` throws at import time. Fixed by short-circuiting the prod-required check when `NEXT_PHASE === 'phase-production-build'`. The throw still fires at real runtime.
- Node's `Buffer` types don't satisfy `BlobPart` under strict lib types (SharedArrayBuffer union). Copied bytes into a fresh `ArrayBuffer` before wrapping in `Blob` — ugly but typesafe, and the copy is negligible next to the network hop.
- Originally had `jd.length === 0 || jd.length >= JD_MIN_LENGTH` on the submit gate — kept from Phase 3 when I was undecided. Tightened to require ≥ 50 since "analyze without a JD" isn't a real mode in this app.

**Tests:**
- No new unit tests this phase — the routes are wiring, and the real assertions live in phase 10's e2e (upload fixture PDF, expect redirect to `/r/[id]`, expect parsed fields visible). Called out in the phase 10 todo.
- `pnpm --filter @resumerx/web typecheck` → clean after the Buffer/BlobPart fix.
- `pnpm --filter @resumerx/web build` → all routes build, `/api/upload-url`, `/api/analyze`, `/api/dev-upload` listed as dynamic, `/r/[id]` dynamic. Static routes unchanged.

**Commands run:**
- `pnpm install --filter @resumerx/web` (added `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `drizzle-orm`, `pg`; dev: `@types/pg`, `drizzle-kit`)
- `pnpm --filter @resumerx/web typecheck`
- `pnpm --filter @resumerx/web build`

**What I'd do next time:** would have defined the `Store` interface during Phase 1 in `@resumerx/shared`, not inside `apps/web`. The interface is app-agnostic and the memory fallback could live there too. Not moving it now — dep graph is clean as-is.

---

## Phase 5 — Analysis (Groq call + real results page)

**When:** Apr 18 2026, same day as Phase 4.

**What I did:** replaced the zeroed stub analysis with a real one. New `runAnalysis()` in `apps/web/src/server/analyze.ts` builds the prompt from the parsed resume + JD + `ATS_RULES`, calls Groq (llama-3.3-70b-versatile), validates the response against `AnalysisLLMSchema`, and returns the analysis plus timing/token telemetry for phase 9's audit log.

Files:
- `apps/web/src/server/groq.ts` — thin wrapper over Groq's OpenAI-compatible endpoint. No SDK. Returns content + model + tokens + latency. Throws `GroqError` on non-2xx.
- `apps/web/src/server/analyze.ts` — prompt builder + `runAnalysis()`. Includes a heuristic stub (`stubAnalysisFromHeuristics`) that runs when `GROQ_API_KEY` is absent, so the dev flow still renders something believable locally.
- `apps/web/src/app/api/analyze/route.ts` — now calls `runAnalysis()` inline, returns `{ analysisId, resumeId, usedStub }`.
- `apps/web/src/app/r/[id]/page.tsx` — full rewrite. Three score cards (overall / ATS / keyword), matched-vs-missing keyword panels, ATS issues list with severity icons + fix copy, per-section feedback cards with strengths/weaknesses/suggestions. CTA links to `/r/[id]/rewrite` (lands in phase 6).

**Decisions:**
- **No SSE yet.** Spec calls for it on long-running analyze, but a single Groq call at llama-3.3-70b is 3-8s — inline is fine, and the button already says "analyzing…". SSE polish deferred to phase 8 where it'll genuinely matter for the bullet-by-bullet rewrite stream.
- **Heuristic fallback instead of "set GROQ_API_KEY" error.** Same rationale as the in-memory DB: local dev flow should run end-to-end without creds. The fallback stamps a banner issue ("Dev mode fallback analysis · Set GROQ_API_KEY to get the real LLM analysis") so it's never mistaken for real output.
- **ATS rules feed the system prompt verbatim.** `ATS_RULES` is already the single source of truth for `/how-ats-works`. Formatting the same array into the prompt means the tool scores against the rules the user reads — no drift.
- **Validate LLM output at the boundary.** `AnalysisLLMSchema.parse()` on the raw JSON, stamp `id` and `createdAt` server-side. The model controls shape only; identity and time are ours.
- **`response_format: json_object`** plus a defensive markdown-fence strip. Groq's JSON mode is reliable but sometimes a model still wraps in ```json — cheap belt-and-braces.
- **Compact the resume for the prompt.** Experience/projects/education/skills formatted as tight text, not the raw PDF text field. `rawText` would burn 2k tokens on whitespace before saying anything.

**Problems hit:**
- Typecheck failed: `ATS_RULES` isn't on the main `@resumerx/shared` entrypoint, it's exported from `@resumerx/shared/ats-rules` (the subpath was set up in phase 1 to keep client bundles thin). Switched to `import { ATS_RULES } from '@resumerx/shared/ats-rules'`. Needed a `pnpm --filter @resumerx/shared build` first so the subpath types existed in `dist/`.

**Tests:**
- None added this phase — the full prompt + Groq path lands in phase 10's validator-safety test, which needs real e2e fixtures. Noted.
- `pnpm --filter @resumerx/web typecheck` → clean after the subpath import fix.
- `pnpm --filter @resumerx/web build` → all routes build. Same static/dynamic split as phase 4. `/r/[id]` still dynamic.
- Manual: will walk the flow via preview in a moment.

**Commands run:**
- `pnpm --filter @resumerx/shared build`
- `pnpm --filter @resumerx/web typecheck`
- `pnpm --filter @resumerx/web build`

**What I'd do next time:** would have designed the LLM-call + audit-log write as one wrapper from the start (`withLLMAudit(purpose, fn)`) so every call site records tokens/latency without remembering. As-is, `runAnalysis` returns the telemetry and the route throws it away — `llm_calls` table is empty until phase 9 wires it up.

---

## Phase 6 — Bullet rewrite + validator + diff UI

**When:** Apr 18 2026, same afternoon as phase 5.

**What I did:** built the headline feature — bullet-by-bullet rewrite with a validator-LLM guardrail, plus the side-by-side diff page with per-bullet accept/reject. Core pieces:

- `apps/web/src/server/rewrite.ts` — `runRewrite()`. Walks experience + projects bullets, calls the rewriter LLM per bullet, then the validator LLM on each output, then mechanical length-drift check. Concurrency cap of 4 so we don't hammer Groq. Returns the full `RewriteResult` shape with summary counts (total / rewritten / skipped / flagged) + `predictedAtsScoreDelta`.
- Two Groq prompts: rewriter system prompt lists the six absolute rules (no fabrication, no added metrics, no new tech, ±20% length, skip if can't honestly improve, weave keywords only when earned). Validator system prompt asks for structured flags against the five `ValidationFlag` types from `@resumerx/shared`. Both use `response_format: json_object` and parse against their Zod schemas.
- Validator runs on a smaller + faster model (`llama-3.1-8b-instant` via env) — cheap veto. The big model writes, the small one checks.
- Dev fallback: same pattern as phases 4-5. Rewriter stub does a weak-verb → strong-verb swap (worked→built, helped→drove). Validator stub adds a `added_metric` flag if the rewrite has more digit groups than the original. It's enough to exercise the UI states (rewritten, skipped, flagged) without a Groq key.
- `POST /api/rewrite` + `POST /api/rewrite/[id]/accept` — zod-validated request bodies, standard error shapes. Accept writes the user's choice map into the `rewrites.acceptedBullets` jsonb column.
- `/r/[id]/rewrite` is a server component that kicks off `runRewrite()` and redirects to `/rw/[rewriteId]`. No client-side loading state — the browser's native "navigating…" indicator is enough for a 10-30s server action.
- `/rw/[id]` + `components/rewrite-diff.tsx` — per-bullet card with two clickable panels (original / rewrite), keyword chips for injected keywords, validator-flag badge when validation fails, reasoning line below. Sticky save bar at the bottom with "unsaved changes" → "saved HH:MM:SS" after `POST /api/rewrite/[id]/accept`.

**Decisions:**
- **Keep all rewrites in the result even when flagged.** The UI needs to show the user *what* the rewriter wanted to do and *why* the validator rejected it — that's the trust moment. We default the selected panel to "original" for flagged bullets, but the user can still override.
- **Parallel bullets, concurrency 4.** 20-40 bullets at 2-5s each is 40-200s serial. At concurrency 4 that's 10-50s. Groq's free tier rate limits would start biting above 6-8 concurrent, and I want headroom for the validator calls doubling the request count.
- **Per-bullet error swallow.** If one bullet's rewrite throws (timeout, 429, JSON parse), we return a pass-through (original unchanged, reasoning = "error: ..."). Better than failing the whole batch.
- **Mechanical length-drift check after the LLM validator.** The validator sometimes misses length drift because it's focused on facts. The fixed 20% cap is cheap to enforce in code, and gets added to `validation.flags` as `changed_meaning` if tripped.
- **Default-select logic on the client:** rewritten if (a) it differs from the original and (b) validation passed. Otherwise original. Keeps users safe by default; they opt in to flagged text, not out.
- **Redirect `/r/[id]/rewrite` → `/rw/[rewriteId]` as a server component** instead of a client-side kickoff. The link from the analysis page becomes a regular `<Link href="…/rewrite">` and the browser handles "loading" natively. Cleaner than a client button with a spinner.

**Problems hit:**
- **Next.js dev mode didn't share the in-memory store across routes.** `/api/analyze` wrote to one `_store` Map, `/api/rewrite` read from a different one (empty), so every rewrite returned `analysis_not_found`. Cause: App Router evaluates server-module graphs per-route in dev, so module-level singletons aren't singletons. Fix: stash the store on `globalThis.__resumerxStore`. Same pattern people use for prisma in Next. One-line change, no API surface impact.
- **Stale `.next/` build artifacts after running `next build` earlier in the session.** `next dev` hit "Cannot find module vendor-chunks/drizzle-orm@…" because the build had baked in a specific hash. Fix: wipe `.next/` and restart dev. Noted this in my head for phase 12 CI — production flow won't hit it, but dev needs a clean boot if you switch between `build` and `dev`.
- **Stub verb-swap typo.** First run produced "Wuilt" instead of "Built" — I was stitching `original.charAt(0).toUpperCase() + swap.slice(1)` which yields the original's W + "uilt". Caught it on the preview screenshot. Fixed to cap-match the whole replacement verb. Good reminder that dev stubs deserve the same "does it read sane?" scan as prod code.

**Tests:**
- No new unit tests this phase — the validator safety test is the big one and lands in phase 10 with hand-crafted adversarial rewrites.
- `pnpm --filter @resumerx/web typecheck` → clean.
- `pnpm --filter @resumerx/web build` → all routes build. New routes: `/api/rewrite` (dynamic), `/api/rewrite/[id]/accept` (dynamic), `/r/[id]/rewrite` (dynamic), `/rw/[id]` (dynamic).
- Manual preview: uploaded a real PDF, ran analyze, clicked rewrite, landed on `/rw/[id]` showing 5 bullets, 3 rewritten, 2 skipped, 0 flagged. Verb swaps read correctly. Keyword-injection chip showed "postgresql" and "code review" for the bullets where those appeared naturally. Save endpoint round-tripped.

**Commands run:**
- `pnpm --filter @resumerx/web typecheck`
- `pnpm --filter @resumerx/web build`
- Preview walkthrough via /api/upload-url + curl → /api/analyze → /api/rewrite → /rw/[id]

**What I'd do next time:** I'd have stashed the in-memory store on globalThis from the start — the Next.js dev-mode per-route module eval is a known gotcha and I've hit it before. Also, the rewrite kickoff page is a server component that does real work on GET, which means a refresh re-runs the whole rewrite. Should idempotent-guard by keying on `analysisId` and returning the existing rewrite if one exists. Noted for phase 8 polish.

---

## Phase 7 — PDF + DOCX render, download endpoint (2026-04-18)

**What I did:**
- `apps/pdf-service/src/render.ts` — `renderPdf()` with pdfkit (Letter, 0.75" margins, centered contact header, hairline section rules, bold titles + grey meta lines, bulleted experience/projects, skills grouped by category). `renderDocx()` mirrors the same structure with the `docx` package (Paragraph/TextRun, HEADING_2 section headers with bottom border, bullet lists). `applyAccepted()` merges the user's per-bullet choices into the ParsedResume before rendering — same default as the UI (original if no choice saved).
- `apps/pdf-service/src/index.ts` — both `/render-pdf` and `/render-docx` routes now call the real renderers, validate with `RenderBodySchema` (resume + optional accepted map), set `content-type` + `content-disposition`.
- `apps/web/src/server/pdf-service.ts` — added `RenderFormat = 'pdf' | 'docx'` and `renderResume(resume, accepted, format)` typed client that posts to the right endpoint and returns `{ bytes, contentType }`.
- `apps/web/src/app/api/download/[rewriteId]/route.ts` — GET with `?format=pdf|docx`, fetches rewrite → analysis → resume, fills any unsaved acceptances with the UI default (rewritten if passed AND differs, else original), streams the bytes back with `attachment; filename="resume.<ext>"`.
- `apps/web/src/app/rw/[id]/page.tsx` — two download buttons (pdf primary, docx outline) next to the back link.

**Decisions:**
- **Both formats render server-side, no client-side PDF libs.** The download is one HTTP hop: browser → /api/download → pdf-service → bytes. Keeps the bundle small and the font/layout consistent.
- **Default-fill missing acceptances on the server.** The download endpoint replicates the UI's default logic rather than requiring the user to click "save" first. If they never touched anything, they still get a sensible resume out.
- **pdfkit over Puppeteer/Chromium for the PDF.** Predictable layout, no headless browser, ~50ms render vs ~2s for Puppeteer. Looks less flashy but it's an ATS-targeted resume — plain text in a clean single-column layout is what we want anyway.

**Problems hit:**
- **tsup bundled CJS deps into ESM and broke at runtime** — first build of pdf-service ran and immediately crashed on `Dynamic require of "stream" is not supported` from inside pdfkit's `restructure` dep. Fix: externalize all runtime deps (pdfkit, pdf-parse, fastify, @fastify/multipart, docx, @aws-sdk/client-s3, pino, pino-pretty, puppeteer-core) from the tsup bundle. The service-side dist/index.js dropped from 2.47 MB to 23 KB, and Node's ESM→CJS interop handles the imports at runtime. Also moved pdfkit from devDependencies → dependencies (it was a runtime dep mis-classified).
- **NextResponse rejected `Buffer` as BodyInit.** TS error: Buffer not assignable to BodyInit (shows up as URLSearchParams mismatch — confusing error message but real). Fix: copy bytes into a fresh ArrayBuffer before handing to NextResponse. Same trick I used earlier in pdf-service.ts for the Blob/FormData upload.
- **Preview driver used wrong request shape** — my ad-hoc curl script posted `{r2Key, jd}` to `/api/analyze` which expects `{resumeId, jobDescription}`, and used POST to `/api/dev-upload` which is PUT-only. Not a code bug, but flagged that the dev-upload route name + verb could be friendlier. Noted for phase 8.

**Tests:**
- `pnpm --filter @resumerx/web exec tsc --noEmit` → clean.
- `pnpm build` → web + pdf-service build green. `/api/download/[rewriteId]` shows up as a dynamic route.
- Manual preview: full flow upload → analyze → rewrite → `GET /api/download/<id>?format=pdf` returned 200 `application/pdf` 2128 bytes starting `%PDF-`, parses as "PDF 1.3, 1 page". DOCX returned 200 `application/vnd.openxml…wordprocessingml.document` 7926 bytes starting `PK..` with a valid Office zip structure (word/document.xml etc.).

**Commands run:**
- `pnpm --filter @resumerx/web exec tsc --noEmit`
- `pnpm --filter @resumerx/pdf-service build`
- `pnpm build`
- end-to-end curl flow against localhost:3000 with the pdf-service on 3001, in-memory DB + local fs + Groq stubs

**What I'd do next time:** I'd have caught the tsup bundling issue at build time by wiring `node dist/index.js` into the package's `build` step as a smoke-boot check. 23 KB vs 2.47 MB is also a hint — if a Fastify + pdfkit + docx service compiles to 2 MB of bundled JS, something is being dragged in that shouldn't be. I'll carry that smell forward.
