# =============================================================================
# ROOT main.tf — Phase 1 (Foundation) + Phase 2 (Data tier) of the GCP stack
# =============================================================================
# Mirrors infra/main.tf's role: wires modules together, data flowing like a
# pipeline (module A's output -> module B's input). See
# docs/plans/gcp-migration-spec.md §3 and §9 for the full module/phase plan.
# Phase 2 provisions Cloud SQL, Memorystore, and Storage — all EMPTY (per the
# spec's §6, this is a fresh start, not a data migration) and none of it
# takes production traffic or touches DNS delegation yet.
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # A couple of APIs (identitytoolkit, apikeys) reject calls made under local
  # user ADC unless a quota/billing project is explicitly attached — `gcloud
  # auth application-default set-quota-project` alone isn't picked up by the
  # provider automatically. This pins it to our actual project instead of
  # whatever gcloud's own OAuth client would otherwise resolve to.
  user_project_override = true
  billing_project       = var.project_id
}

# -----------------------------------------------------------------------------
# Enable the GCP APIs Phase 1 + 2 + 3 + 4 + 5 + 6 need
# -----------------------------------------------------------------------------
# Brand-new projects don't have every API pre-enabled.
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",           # VPC, subnets, firewall rules, managed SSL certs, load balancer
    "dns.googleapis.com",               # Cloud DNS
    "artifactregistry.googleapis.com",  # Docker repos
    "servicenetworking.googleapis.com", # Private Service Access (Cloud SQL/Memorystore private IP)
    "sqladmin.googleapis.com",          # Cloud SQL Admin API
    "redis.googleapis.com",             # Memorystore for Redis API
    "iam.googleapis.com",               # service accounts (storage module's api_runtime SA)
    "identitytoolkit.googleapis.com",   # Identity Platform (Firebase Auth under the hood)
    "apikeys.googleapis.com",           # browser API key for the Next.js Firebase Auth SDK
    "aiplatform.googleapis.com",        # Vertex AI (Claude via Model Garden)
    "speech.googleapis.com",            # Speech-to-Text streaming
    "texttospeech.googleapis.com",      # Text-to-Speech
    "run.googleapis.com",               # Cloud Run
    "secretmanager.googleapis.com",     # DATABASE_URL/REDIS_URL/PAYPAL_CLIENT_SECRET
    "sts.googleapis.com",               # Workload Identity Federation token exchange
    "iamcredentials.googleapis.com",    # WIF short-lived credential generation
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false # don't break the project if someone runs `terraform destroy` on this stack
}

# -----------------------------------------------------------------------------
# 1. Network — VPC + subnet foundation
# -----------------------------------------------------------------------------
module "network" {
  source       = "./modules/network"
  project_id   = var.project_id
  project_name = var.project_name
  region       = var.region

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# 2. DNS — Cloud DNS managed zone
# -----------------------------------------------------------------------------
module "dns" {
  source       = "./modules/dns"
  project_id   = var.project_id
  project_name = var.project_name
  domain_name  = var.domain_name

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# 3. Certs — Google-managed SSL certificate (single cert, both hostnames)
# -----------------------------------------------------------------------------
module "certs" {
  source       = "./modules/certs"
  project_id   = var.project_id
  project_name = var.project_name
  domains      = ["api.${var.domain_name}", "web.${var.domain_name}"]

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# 4. Artifact Registry — Docker image storage
# -----------------------------------------------------------------------------
module "artifact_registry" {
  source       = "./modules/artifact-registry"
  project_id   = var.project_id
  project_name = var.project_name
  region       = var.region

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# 5. Cloud SQL — Managed PostgreSQL (private IP, empty — no data migration, §6)
# -----------------------------------------------------------------------------
module "cloud_sql" {
  source       = "./modules/cloud-sql"
  project_id   = var.project_id
  project_name = var.project_name
  region       = var.region
  vpc_id       = module.network.vpc_id
  db_name      = var.db_name
  db_username  = var.db_username
  tier         = var.db_tier

  # Explicit ordering: Cloud SQL's private IP request needs the PSA peering
  # (created inside module.network) to exist first, not just the VPC itself.
  depends_on = [module.network]
}

# -----------------------------------------------------------------------------
# 6. Memorystore — Managed Redis (private IP, same PSA peering as Cloud SQL)
# -----------------------------------------------------------------------------
module "memorystore" {
  source         = "./modules/memorystore"
  project_id     = var.project_id
  project_name   = var.project_name
  region         = var.region
  vpc_id         = module.network.vpc_id
  memory_size_gb = var.redis_memory_size_gb

  depends_on = [module.network]
}

# -----------------------------------------------------------------------------
# 7. Storage — GCS buckets + the API's runtime service account
# -----------------------------------------------------------------------------
module "storage" {
  source       = "./modules/storage"
  project_id   = var.project_id
  project_name = var.project_name
  region       = var.region

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# 8. Identity Platform — auth (email/password now, Google Sign-In deferred)
# -----------------------------------------------------------------------------
module "identity_platform" {
  source                    = "./modules/identity-platform"
  project_id                = var.project_id
  project_name              = var.project_name
  api_service_account_email = module.storage.api_service_account_email
  mfa_state                 = var.mfa_state
  additional_authorized_domains = [
    "web.${var.domain_name}",
    var.domain_name,
  ]
  # google_client_id / google_client_secret intentionally omitted — defaults
  # to "" so Google Sign-In stays off until you provide real OAuth credentials.

  depends_on = [google_project_service.apis, module.storage]
}

# -----------------------------------------------------------------------------
# 9. Vertex AI — IAM for Claude (Vertex), Speech-to-Text, Text-to-Speech
# -----------------------------------------------------------------------------
module "vertex_ai" {
  source                    = "./modules/vertex-ai"
  project_id                = var.project_id
  api_service_account_email = module.storage.api_service_account_email

  depends_on = [google_project_service.apis, module.storage]
}

# -----------------------------------------------------------------------------
# 10. Secrets — DATABASE_URL, REDIS_URL, PAYPAL_CLIENT_SECRET
# -----------------------------------------------------------------------------
module "secrets" {
  source                    = "./modules/secrets"
  project_id                = var.project_id
  project_name              = var.project_name
  api_service_account_email = module.storage.api_service_account_email
  db_host                   = module.cloud_sql.private_ip_address
  db_name                   = module.cloud_sql.db_name
  db_username               = module.cloud_sql.db_username
  db_password               = module.cloud_sql.db_password
  redis_host                = module.memorystore.host
  redis_port                = module.memorystore.port
  redis_auth_string         = module.memorystore.auth_string
  paypal_client_secret      = var.paypal_client_secret

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# 11. Cloud Run — api, web, migrate job
# -----------------------------------------------------------------------------
module "cloud_run" {
  source                         = "./modules/cloud-run"
  project_id                     = var.project_id
  project_name                   = var.project_name
  region                         = var.region
  domain_name                    = var.domain_name
  api_service_account_email      = module.storage.api_service_account_email
  vpc_id                         = module.network.vpc_id
  subnet_id                      = module.network.subnet_id
  vertex_ai_region               = "global"
  uploads_bucket_name            = module.storage.uploads_bucket_name
  assets_bucket_name             = module.storage.assets_bucket_name
  firebase_web_api_key           = module.identity_platform.web_api_key
  firebase_auth_domain           = module.identity_platform.auth_domain
  database_url_secret_id         = module.secrets.database_url_secret_id
  redis_url_secret_id            = module.secrets.redis_url_secret_id
  paypal_client_secret_secret_id = module.secrets.paypal_client_secret_secret_id
  paypal_base_url                = var.paypal_base_url
  paypal_client_id               = var.paypal_client_id
  paypal_webhook_id              = var.paypal_webhook_id
  next_public_paypal_client_id   = var.next_public_paypal_client_id
  api_min_instances              = var.api_min_instances
  web_min_instances              = var.web_min_instances

  depends_on = [google_project_service.apis, module.secrets]
}

# -----------------------------------------------------------------------------
# 12. Load Balancer — External HTTPS LB, Serverless NEGs, Cloud CDN on web
# -----------------------------------------------------------------------------
module "load_balancer" {
  source           = "./modules/load-balancer"
  project_id       = var.project_id
  project_name     = var.project_name
  region           = var.region
  domain_name      = var.domain_name
  certificate_id   = module.certs.certificate_id
  api_service_name = module.cloud_run.api_service_name
  web_service_name = module.cloud_run.web_service_name

  depends_on = [module.cloud_run]
}

# -----------------------------------------------------------------------------
# 13. IAM — Workload Identity Federation for GitHub Actions CI/CD
# -----------------------------------------------------------------------------
module "iam" {
  source                   = "./modules/iam"
  project_id               = var.project_id
  project_name             = var.project_name
  github_org               = var.github_org
  github_repo              = var.github_repo
  api_service_account_name = module.storage.api_service_account_name

  depends_on = [google_project_service.apis, module.storage]
}

# -----------------------------------------------------------------------------
# 14. DNS Records — A records for api.<domain>/web.<domain> -> the LB IP
# -----------------------------------------------------------------------------
# Doesn't move traffic by itself — see modules/dns-records' header comment.
# The registrar NS delegation step (spec §7) is separate and manual.
module "dns_records" {
  source        = "./modules/dns-records"
  project_id    = var.project_id
  zone_name     = module.dns.zone_name
  domain_name   = var.domain_name
  lb_ip_address = module.load_balancer.lb_ip_address

  depends_on = [module.load_balancer]
}
