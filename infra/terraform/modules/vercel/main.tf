terraform {
  required_version = ">= 1.6"
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
  }
}

variable "project_name" {
  type = string
}

variable "git_repo" {
  type        = string
  description = "owner/repo as it appears on GitHub, e.g. bhanu0710/resumerx"
}

variable "production_branch" {
  type    = string
  default = "main"
}

variable "environment_variables" {
  type = map(object({
    value   = string
    targets = list(string) # subset of ["production", "preview", "development"]
  }))
  description = "Env vars to set on the project (pg connection, groq key, r2 creds, etc.)"
  default     = {}
}

resource "vercel_project" "web" {
  name           = var.project_name
  framework      = "nextjs"
  root_directory = "apps/web"

  git_repository = {
    type              = "github"
    repo              = var.git_repo
    production_branch = var.production_branch
  }
}

resource "vercel_project_environment_variable" "vars" {
  for_each   = var.environment_variables
  project_id = vercel_project.web.id
  key        = each.key
  value      = each.value.value
  target     = each.value.targets
  sensitive  = true
}

output "project_id" {
  value = vercel_project.web.id
}
