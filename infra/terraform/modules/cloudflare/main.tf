terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
  }
}

variable "account_id" {
  type        = string
  description = "Cloudflare account id that owns the R2 bucket"
}

variable "bucket_name" {
  type        = string
  description = "R2 bucket name (resumes are stored here)"
}

variable "cors_origins" {
  type        = list(string)
  description = "Origins allowed to PUT via presigned URL — set via wrangler after apply, see README"
}

resource "cloudflare_r2_bucket" "resumes" {
  account_id = var.account_id
  name       = var.bucket_name
  location   = "ENAM"
}

# Note: the cloudflare provider v4 does not expose R2 CORS as a resource.
# Configure CORS once via `wrangler r2 bucket cors put <name> --file cors.json`
# after apply — see infra/terraform/README.md for the exact command.

output "bucket_name" {
  value = cloudflare_r2_bucket.resumes.name
}

output "account_id" {
  value = var.account_id
}

output "cors_origins" {
  value       = var.cors_origins
  description = "Origins to use in the manual wrangler CORS step"
}
