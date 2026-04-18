variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "r2_access_key_id" {
  type      = string
  sensitive = true
}

variable "r2_secret_access_key" {
  type      = string
  sensitive = true
}

variable "neon_api_key" {
  type      = string
  sensitive = true
}

variable "upstash_email" {
  type = string
}

variable "upstash_api_key" {
  type      = string
  sensitive = true
}

variable "vercel_api_token" {
  type      = string
  sensitive = true
}

variable "git_repo" {
  type    = string
  default = "bhanu0710/resumerx"
}

variable "groq_api_key" {
  type      = string
  sensitive = true
}

variable "pdf_service_token" {
  type      = string
  sensitive = true
}

variable "gcp_project_id" {
  type        = string
  description = "GCP project hosting the pdf-service Cloud Run"
}

variable "sentry_dsn" {
  type      = string
  sensitive = true
}

variable "app_url" {
  type        = string
  description = "The deployed web app URL, used for CORS + NEXT_PUBLIC_APP_URL"
}
