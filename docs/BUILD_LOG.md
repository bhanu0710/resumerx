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
