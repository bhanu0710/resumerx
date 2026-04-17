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

Waiting for those values before continuing.

---
