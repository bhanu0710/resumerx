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
