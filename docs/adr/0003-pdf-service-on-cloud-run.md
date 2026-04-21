# ADR-0003: Split PDF/DOCX rendering into a Cloud Run service

- Status: Accepted
- Date: 2026-04 (migrated from Fly.io after its free tier removal)
- Deciders: @bhanu0710

## Context

`pdfkit` needs native font files and `docx` pulls a large dependency tree. Bundling both into the Next.js web app on Vercel would:

- Blow past Vercel's serverless function size limits
- Pay cold-start cost on every analysis page render
- Couple web deploy cadence to renderer changes

Rendering is also inherently CPU-bound and bursty — ideal for scale-to-zero.

Options considered:

1. **Bundle into Next.js (Vercel).** Rejected: size limits, cold start, no clean separation.
2. **AWS Lambda with container image.** Workable but heavy IAM setup for a hobby project.
3. **Fly.io.** Original choice; abandoned when Fly removed the always-free tier.
4. **GCP Cloud Run v2 (chosen).** Scale-to-zero, container-native, generous free tier.

## Decision

`apps/pdf-service` is a Fastify app deployed to **GCP Cloud Run v2** in `us-central1` under project `resumerx-1776527613`. Image builds via Cloud Build with `cloudbuild.pdf-service.yaml` from the monorepo root (Dockerfile COPYs span workspace packages, so the build context must be the repo root).

Terraform in `infra/terraform/modules/cloudrun/` provisions the service with:

- `lifecycle { ignore_changes = [template[0].containers[0].image] }` so CI owns image updates without TF fighting redeploys
- `allUsers` invoker binding (the `/render` endpoint authenticates via a shared bearer token, not IAM)
- No explicit `PORT` env (Cloud Run auto-injects it)

CI deploys via `gcloud run deploy --image` after a `gcloud builds submit`, authenticated to GCP via Workload Identity Federation (no long-lived keys).

## Consequences

- Web app stays under Vercel's size limits and deploys independently.
- Scale-to-zero means the first render after idle pays a ~1s cold-start; acceptable for our use case.
- Two deploy pipelines to keep in sync: Vercel (web) and Cloud Run (pdf-service). Contract between them is the `ParsedResume` Zod schema.
- Requires a `PDF_SERVICE_URL` env var in the web app, output by Terraform.

## Related

- `apps/pdf-service/`
- `infra/terraform/modules/cloudrun/`
- `cloudbuild.pdf-service.yaml`
- `.github/workflows/main.yml`
