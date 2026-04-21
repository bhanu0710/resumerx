# Runbook: pdf-service is down / slow

**Symptom:** Users click "download" and see an error, or the download takes >10s.

## 1. Check Cloud Run health

```bash
curl -i https://resumerx-pdf-staging-953489645890.us-central1.run.app/health
# expect: 200 {"ok":true}
```

If non-200:

```bash
gcloud run services describe resumerx-pdf-staging \
  --region us-central1 --project resumerx-1776527613 \
  --format='value(status.conditions)'

gcloud run revisions list --service resumerx-pdf-staging \
  --region us-central1 --project resumerx-1776527613 \
  --limit 5
```

## 2. Inspect the current revision's logs

```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=resumerx-pdf-staging' \
  --project resumerx-1776527613 --limit 50 --format json
```

Look for: OOM (exit code 137), unhandled promise rejections in pdfkit font loading, request timeouts.

## 3. Roll back to previous revision

```bash
# list revisions
gcloud run revisions list --service resumerx-pdf-staging \
  --region us-central1 --project resumerx-1776527613

# split traffic to last-known-good
gcloud run services update-traffic resumerx-pdf-staging \
  --region us-central1 --project resumerx-1776527613 \
  --to-revisions resumerx-pdf-staging-00003-vbs=100
```

## 4. Redeploy from a known-good SHA

```bash
SHA=<known-good-short-sha>
gcloud builds submit --config cloudbuild.pdf-service.yaml \
  --project resumerx-1776527613 --substitutions=SHORT_SHA=$SHA

gcloud run deploy resumerx-pdf-staging \
  --image us-central1-docker.pkg.dev/resumerx-1776527613/cloud-run-source-deploy/resumerx-pdf-staging:$SHA \
  --region us-central1 --project resumerx-1776527613 --quiet
```

## 5. Verify from the web app side

The web app's download route calls `PDF_SERVICE_URL` from Vercel env. If Cloud Run is healthy but downloads still fail, check that env var matches the service URL in Vercel project settings.
