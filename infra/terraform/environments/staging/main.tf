terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.40" }
    neon       = { source = "kislerdm/neon", version = "~> 0.6" }
    upstash    = { source = "upstash/upstash", version = "~> 1.5" }
    vercel     = { source = "vercel/vercel", version = "~> 2.0" }
  }

  # Remote state lives in Terraform Cloud so both environments share one source of truth.
  # If you're bootstrapping solo, comment this out and use local state until the workspace exists.
  backend "remote" {
    organization = "resumerx1"
    workspaces {
      name = "staging"
    }
  }
}

provider "cloudflare" { api_token = var.cloudflare_api_token }
provider "neon" { api_key = var.neon_api_key }
provider "upstash" {
  email   = var.upstash_email
  api_key = var.upstash_api_key
}
provider "vercel" { api_token = var.vercel_api_token }

module "storage" {
  source       = "../../modules/cloudflare"
  account_id   = var.cloudflare_account_id
  bucket_name  = "resumerx-staging"
  cors_origins = [var.app_url, "http://localhost:3000"]
}

module "db" {
  source       = "../../modules/neon"
  project_name = "resumerx-staging"
  region       = "aws-us-east-2"
}

module "ratelimit" {
  source = "../../modules/upstash"
  name   = "resumerx-staging-rl"
  region = "us-east-1"
}

module "web" {
  source            = "../../modules/vercel"
  project_name      = "resumerx-staging"
  git_repo          = var.git_repo
  production_branch = "develop"

  environment_variables = {
    DATABASE_URL             = { value = module.db.connection_uri, targets = ["production", "preview"] }
    R2_ACCOUNT_ID            = { value = var.cloudflare_account_id, targets = ["production", "preview"] }
    R2_ACCESS_KEY_ID         = { value = var.r2_access_key_id, targets = ["production", "preview"] }
    R2_SECRET_ACCESS_KEY     = { value = var.r2_secret_access_key, targets = ["production", "preview"] }
    R2_BUCKET_NAME           = { value = module.storage.bucket_name, targets = ["production", "preview"] }
    UPSTASH_REDIS_REST_URL   = { value = module.ratelimit.rest_url, targets = ["production", "preview"] }
    UPSTASH_REDIS_REST_TOKEN = { value = module.ratelimit.rest_token, targets = ["production", "preview"] }
    GROQ_API_KEY             = { value = var.groq_api_key, targets = ["production", "preview"] }
    PDF_SERVICE_URL          = { value = var.pdf_service_url, targets = ["production", "preview"] }
    PDF_SERVICE_TOKEN        = { value = var.pdf_service_token, targets = ["production", "preview"] }
    SENTRY_DSN               = { value = var.sentry_dsn, targets = ["production", "preview"] }
    NEXT_PUBLIC_APP_URL      = { value = var.app_url, targets = ["production", "preview"] }
  }
}
