output "vercel_project_id" {
  value = module.web.project_id
}

output "r2_bucket_name" {
  value = module.storage.bucket_name
}

output "neon_project_id" {
  value = module.db.project_id
}

# connection string + rate-limit token are sensitive — pull with
#   terraform output -raw database_url
output "database_url" {
  value     = module.db.connection_uri
  sensitive = true
}

output "upstash_rest_url" {
  value     = module.ratelimit.rest_url
  sensitive = true
}
