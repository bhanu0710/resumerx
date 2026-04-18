terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP project id that hosts the pdf-service"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name — e.g. resumerx-pdf-staging"
}

variable "pdf_service_token" {
  type        = string
  sensitive   = true
  description = "Bearer token the web app sends on every request — must match Vercel env"
}

variable "image" {
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
  description = "Placeholder image for the first provision — CI overrides with the real image on every deploy, so TF ignores drift here."
}

resource "google_cloud_run_v2_service" "pdf" {
  project             = var.project_id
  name                = var.service_name
  location = var.region

  template {
    containers {
      image = var.image
      ports {
        container_port = 3001
      }

      env {
        name  = "PDF_SERVICE_TOKEN"
        value = var.pdf_service_token
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      # Cloud Run injects PORT automatically (matches container_port above).

      resources {
        limits = {
          memory = "512Mi"
          cpu    = "1"
        }
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 6
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    timeout = "60s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  # CI redeploys with a new image every push — if TF fought that, every CI
  # deploy would cause a TF drift. Let CI own the image; TF owns everything else.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

# Publicly invokable — the web app passes PDF_SERVICE_TOKEN as a bearer, which
# pdf-service verifies in the handler. Auth lives at the app layer, not IAM.
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  name     = google_cloud_run_v2_service.pdf.name
  location = google_cloud_run_v2_service.pdf.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "url" {
  value = google_cloud_run_v2_service.pdf.uri
}

output "service_name" {
  value = google_cloud_run_v2_service.pdf.name
}
