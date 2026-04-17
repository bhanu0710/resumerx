# Security Policy

## What's stored and for how long

- Uploaded PDFs are stored in Cloudflare R2 and auto-deleted after 24 hours
- Analysis results and rewritten resumes are stored in Postgres and also deleted after 24 hours
- No resume data is used for model training — it goes to Groq's API and that's it
- No auth in v1, so don't put anything in here you'd be upset losing

## Reporting a vulnerability

If you find something, email me at the address in my GitHub profile. I'll respond within a few days. Please don't post it publicly until we've had a chance to fix it.

## Scope

The main surface worth looking at:
- The presigned URL generation (`/api/upload-url`) — make sure it can't be abused to upload to arbitrary paths
- The SSE endpoints — watch for prompt injection via job description input
- The pdf-service auth — PDF_SERVICE_TOKEN should be long and random in prod, check the token comparison is constant-time
