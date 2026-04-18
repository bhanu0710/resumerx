terraform {
  required_version = ">= 1.6"
  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.6"
    }
  }
}

variable "project_name" {
  type        = string
  description = "Neon project name (shows up in the console)"
}

variable "region" {
  type        = string
  description = "Neon region, e.g. aws-us-east-2"
  default     = "aws-us-east-2"
}

# Neon auto-creates a default database + role on project creation, and the
# project resource exposes a ready connection_uri. We use that — one fewer
# thing to manage, and the connection string rotates if the role password
# ever does.
resource "neon_project" "this" {
  name       = var.project_name
  region_id  = var.region
  pg_version = 16

  # Free tier caps history retention at 6h (21600s). Provider default is 24h
  # which the API rejects — set explicitly so this works on the free plan.
  history_retention_seconds = 21600
}

output "connection_uri" {
  value     = neon_project.this.connection_uri
  sensitive = true
}

output "project_id" {
  value = neon_project.this.id
}
