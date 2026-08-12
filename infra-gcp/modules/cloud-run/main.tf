# =============================================================================
# CLOUD RUN MODULE — api, web, and the migrate job
# =============================================================================
# Replaces infra/modules/ecs (AWS ECS/EC2). No cluster, no instances, no
# dynamic port mapping — Cloud Run handles all of that itself.
#
# PLACEHOLDER IMAGES — read this before wondering why the services 404:
# ------------------------------------------------------------------------
# Terraform can't reference an image that doesn't exist yet in Artifact
# Registry, and no image has been pushed there yet (that happens once,
# manually, or via Phase 6's CI/CD). Both services default to Google's public
# "hello" placeholder image so `terraform apply` succeeds standalone; once
# you build and push the real images, `gcloud run deploy` (or CI/CD) updates
# them directly — `lifecycle.ignore_changes` on the image field stops
# Terraform from fighting that and reverting it back to the placeholder on
# the next `terraform apply`.
#
# INGRESS — services only accept traffic from the load balancer
# ------------------------------------------------------------------------
# `ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"` means the *.run.app
# URL can't be used to bypass the load balancer's host-routing/Cloud CDN —
# this is the spec's §7 requirement ("Configure Cloud Run ingress so
# production traffic cannot bypass the intended load balancer controls").
# Both services still grant `roles/run.invoker` to allUsers — ingress
# controls *where* traffic can enter from, IAM controls *who* may invoke;
# auth itself is enforced by the app (Identity Platform tokens), not Cloud
# Run's own IAM layer.
# =============================================================================

locals {
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
}

resource "google_cloud_run_v2_service" "api" {
  project             = var.project_id
  name                = "${var.project_name}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false

  template {
    service_account  = var.api_service_account_email
    session_affinity = true # best-effort Socket.IO sticky routing — Redis adapter (Phase 2) covers the rest

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY" # keep reaching Vertex AI/GCS/Identity Platform directly, only route Cloud SQL/Memorystore traffic through the VPC
      network_interfaces {
        network    = var.vpc_id
        subnetwork = var.subnet_id
      }
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 4000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "VERTEX_AI_REGION"
        value = var.vertex_ai_region
      }
      env {
        name  = "GCS_UPLOADS_BUCKET_NAME"
        value = var.uploads_bucket_name
      }
      env {
        name  = "GCS_ASSETS_BUCKET_NAME"
        value = var.assets_bucket_name
      }
      env {
        name  = "FRONTEND_URL"
        value = "https://web.${var.domain_name}"
      }
      env {
        name  = "PAYPAL_BASE_URL"
        value = var.paypal_base_url
      }
      env {
        name  = "PAYPAL_CLIENT_ID"
        value = var.paypal_client_id
      }
      env {
        name  = "PAYPAL_WEBHOOK_ID"
        value = var.paypal_webhook_id
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.database_url_secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = var.redis_url_secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "PAYPAL_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.paypal_client_secret_secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].labels, # CI's deploy-cloudrun action stamps commit-sha/managed-by labels Terraform doesn't know about
      client,             # set by whichever tool last deployed (gcloud/deploy-cloudrun) — not something we manage
      client_version,
      scaling, # phantom top-level block (distinct from template.scaling, which we do manage) — the API always returns it with computed defaults even though nothing here sets it, causing perpetual no-op drift otherwise
    ]
  }
}

resource "google_cloud_run_v2_service" "web" {
  project             = var.project_id
  name                = "${var.project_name}-web"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false

  template {
    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # NEXT_PUBLIC_* values are baked into the client bundle at image build
      # time (Dockerfile ARGs) — these runtime copies only cover any
      # server-side code path that reads process.env directly instead of the
      # inlined literal.
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://api.${var.domain_name}/api"
      }
      env {
        name  = "NEXT_PUBLIC_WS_URL"
        value = "https://api.${var.domain_name}"
      }
      env {
        name  = "NEXT_PUBLIC_FIREBASE_API_KEY"
        value = var.firebase_web_api_key
      }
      env {
        name  = "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
        value = var.firebase_auth_domain
      }
      env {
        name  = "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "NEXT_PUBLIC_PAYPAL_CLIENT_ID"
        value = var.next_public_paypal_client_id
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].labels, # CI's deploy-cloudrun action stamps commit-sha/managed-by labels Terraform doesn't know about
      client,             # set by whichever tool last deployed (gcloud/deploy-cloudrun) — not something we manage
      client_version,
      scaling, # phantom top-level block (distinct from template.scaling, which we do manage) — the API always returns it with computed defaults even though nothing here sets it, causing perpetual no-op drift otherwise
    ]
  }
}

resource "google_cloud_run_v2_job" "migrate" {
  project             = var.project_id
  name                = "${var.project_name}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = var.api_service_account_email
      max_retries     = 0

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.vpc_id
          subnetwork = var.subnet_id
        }
      }

      containers {
        image   = local.placeholder_image
        command = ["npx"]
        args    = ["prisma", "migrate", "deploy"]

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = var.database_url_secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client, # set by whichever tool last executed the job (gcloud run jobs update/execute)
      client_version,
    ]
  }
}

# Public — auth is enforced by the app (Identity Platform tokens), not
# Cloud Run's IAM layer. Ingress is still locked to the load balancer only.
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
