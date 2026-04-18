# fly module

Fly.io doesn't have a first-class Terraform provider that matches flyctl
feature parity, so the pdf-service app is deployed by `flyctl` in CI
(phase 12) rather than by Terraform.

What Terraform does NOT own here:
- app create / release / scale — `flyctl deploy` handles that
- secrets — `flyctl secrets set` in the deploy workflow
- volumes — we don't need persistent storage for the parser sidecar

What lives alongside the Terraform root instead:
- `apps/pdf-service/fly.toml` — the app config
- `.github/workflows/main.yml` — runs `flyctl deploy --remote-only`

If you want Terraform to own DNS or reserved IPs, add them to the
cloudflare module, not here.
