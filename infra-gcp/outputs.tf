# =============================================================================
# ROOT OUTPUTS — Phase 1 + Phase 2 values
# =============================================================================
# Run `terraform output` after apply to see these (sensitive ones like
# db_password/redis_auth_string need `terraform output <name>` or `-json`).
# More get added as later phases' modules are wired in (Cloud Run URLs, load
# balancer IP, Identity Platform config, ...).
# =============================================================================

output "name_servers" {
  description = "Cloud DNS name servers — set these as NS records at your domain registrar right before launch (spec §7), not now"
  value       = module.dns.name_servers
}

output "vpc_id" {
  description = "VPC self_link — useful for debugging in GCP Console"
  value       = module.network.vpc_id
}

output "subnet_id" {
  description = "Subnet self_link — used by Cloud Run's Direct VPC egress config in a later phase"
  value       = module.network.subnet_id
}

output "certificate_name" {
  description = "Managed SSL certificate name — will show PROVISIONING until DNS points at the load balancer (Phase 5/7)"
  value       = module.certs.certificate_name
}

output "api_repository_url" {
  description = "Artifact Registry Docker URL prefix for API images — used in CI/CD to tag/push"
  value       = module.artifact_registry.api_repository_url
}

output "web_repository_url" {
  description = "Artifact Registry Docker URL prefix for Web images — used in CI/CD to tag/push"
  value       = module.artifact_registry.web_repository_url
}

# -----------------------------------------------------------------------------
# Cloud SQL
# -----------------------------------------------------------------------------
output "cloud_sql_private_ip" {
  description = "Cloud SQL private IP — host part of DATABASE_URL"
  value       = module.cloud_sql.private_ip_address
}

output "db_name" {
  description = "Database name"
  value       = module.cloud_sql.db_name
}

output "db_username" {
  description = "Database user name"
  value       = module.cloud_sql.db_username
}

output "db_password" {
  description = "Database user password — Terraform-generated, sensitive"
  value       = module.cloud_sql.db_password
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Memorystore
# -----------------------------------------------------------------------------
output "redis_host" {
  description = "Redis private IP — host part of REDIS_URL"
  value       = module.memorystore.host
}

output "redis_port" {
  description = "Redis port"
  value       = module.memorystore.port
}

output "redis_auth_string" {
  description = "Redis AUTH password — sensitive"
  value       = module.memorystore.auth_string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Storage
# -----------------------------------------------------------------------------
output "uploads_bucket_name" {
  description = "GCS bucket for user file uploads"
  value       = module.storage.uploads_bucket_name
}

output "assets_bucket_name" {
  description = "GCS bucket for shared static assets"
  value       = module.storage.assets_bucket_name
}

output "api_service_account_email" {
  description = "Service account to attach as the Cloud Run api service's identity in Phase 5"
  value       = module.storage.api_service_account_email
}

# -----------------------------------------------------------------------------
# Identity Platform
# -----------------------------------------------------------------------------
output "firebase_auth_domain" {
  description = "Firebase Auth domain — NEXT_PUBLIC_FIREBASE_CONFIG's authDomain field"
  value       = module.identity_platform.auth_domain
}

output "firebase_web_api_key" {
  description = "Browser API key — NEXT_PUBLIC_FIREBASE_CONFIG's apiKey field (see identity-platform module's note on why this isn't a true secret)"
  value       = module.identity_platform.web_api_key
  sensitive   = true
}

output "google_sign_in_enabled" {
  description = "Whether Google Sign-In is configured yet (false until you provide OAuth credentials)"
  value       = module.identity_platform.google_sign_in_enabled
}

# -----------------------------------------------------------------------------
# Cloud Run
# -----------------------------------------------------------------------------
output "api_run_uri" {
  description = "Cloud Run's own *.run.app URL for api — not reachable from outside (INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER), useful for gcloud debugging only"
  value       = module.cloud_run.api_service_uri
}

output "web_run_uri" {
  value = module.cloud_run.web_service_uri
}

output "migrate_job_name" {
  value = module.cloud_run.migrate_job_name
}

# -----------------------------------------------------------------------------
# Load Balancer
# -----------------------------------------------------------------------------
output "lb_ip_address" {
  description = "Static IP — point api.<domain>/web.<domain> A records at this at launch time (spec §7), not before"
  value       = module.load_balancer.lb_ip_address
}

# -----------------------------------------------------------------------------
# CI/CD
# -----------------------------------------------------------------------------
output "github_actions_service_account_email" {
  description = "Set as GitHub Actions secret GCP_SERVICE_ACCOUNT"
  value       = module.iam.github_actions_service_account_email
}

output "workload_identity_provider" {
  description = "Set as GitHub Actions secret GCP_WORKLOAD_IDENTITY_PROVIDER"
  value       = module.iam.workload_identity_provider
}
