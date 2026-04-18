# ResumeRx Terraform

Two environments (`staging`, `production`) composing four modules
(`cloudflare`, `neon`, `upstash`, `vercel`). Fly.io is deployed by
`flyctl` in CI — see `modules/fly/README.md` for why.

## Bootstrap order

Terraform can't run without credentials, and you can't get some of these
credentials without a few clicks in a provider UI first. Do these in
order:

1. **Cloudflare** — create an account, find your account id, create an
   API token scoped to `R2: Edit`. Create an R2 API token too (access
   key + secret) — Terraform can't mint those for us.
2. **Neon** — sign up at neon.tech, grab a personal API key from
   account settings.
3. **Upstash** — sign up at upstash.com, grab your email + API key.
4. **Vercel** — sign up and create a team (or use personal). Create a
   token at vercel.com/account/tokens.
5. **Groq** — grab `GROQ_API_KEY` from console.groq.com.
6. **Sentry** — create an org + project, copy the DSN.
7. **Terraform Cloud** (optional but recommended) — create an org named
   `resumerx1` with two workspaces `staging` and `production`, or comment
   out the `backend "remote"` block and use local state to start.

## Running it

Once you have all of the above, from this directory:

```sh
cd environments/staging
cp terraform.tfvars.example terraform.tfvars
# fill in tfvars
terraform init
terraform plan
terraform apply
```

The plan is intentionally loud about what it's touching — read it before
approving. `terraform output -raw database_url` gives you the pooled
Neon connection string for local use or one-off migrations.

## What NOT to put in Terraform

- Fly app creation — `flyctl` owns that.
- Secrets rotation — use the provider UIs.
- Anything that should change between every deploy (Vercel will
  auto-deploy from git; TF just owns the project config + env vars).

## Pause for credentials

Phase 11 of the build stops here. The modules compile and the plan is
ready to run, but **nothing has been applied**. See `docs/BUILD_LOG.md`
phase 11 for the checklist.
