terraform {
  required_version = ">= 1.6"
  required_providers {
    upstash = {
      source  = "upstash/upstash"
      version = "~> 1.5"
    }
  }
}

variable "name" {
  type        = string
  description = "Redis database name shown in the upstash console"
}

variable "region" {
  type        = string
  description = "Upstash region — pick the one closest to Vercel's edge for the app"
  default     = "us-east-1"
}

resource "upstash_redis_database" "rate_limit" {
  database_name = var.name
  region        = var.region
  tls           = true
  # eviction is fine here — the rate-limit keys are short-lived and re-derivable.
  eviction = true
}

output "rest_url" {
  value     = upstash_redis_database.rate_limit.endpoint
  sensitive = true
}

output "rest_token" {
  value     = upstash_redis_database.rate_limit.rest_token
  sensitive = true
}

output "database_id" {
  value = upstash_redis_database.rate_limit.database_id
}
