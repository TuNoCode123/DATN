# =============================================================================
# INPUT VARIABLES — Configurable values for the entire GCP infrastructure
# =============================================================================
# Mirrors infra/variables.tf (AWS side). Only Phase 1 variables are here for
# now — cloud-sql, memorystore, identity-platform, etc. variables get added
# as each later phase's module is wired in, same incremental approach as the
# migration spec's phasing (docs/plans/gcp-migration-spec.md §9).
# =============================================================================

# -----------------------------------------------------------------------------
# General project settings
# -----------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID — create this manually first (see bootstrap/main.tf header comment)"
  type        = string
  # No default — required. Pass via terraform.tfvars, -var, or TF_VAR_project_id.
}

variable "project_name" {
  description = "Name prefix for all resources (e.g., 'ielts-ai') — matches the AWS side's var.project_name"
  type        = string
  default     = "ielts-ai"
}

variable "environment" {
  description = "Deployment environment (e.g., 'prod', 'staging', 'dev')"
  type        = string
  default     = "prod"
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "asia-southeast1"
  # Singapore — the spec's "ship now" default (§8 open question: compare
  # against australia-southeast1/Sydney with real latency numbers later;
  # this isn't a load-bearing decision to get right on day one).
}

# -----------------------------------------------------------------------------
# Domain & DNS settings
# -----------------------------------------------------------------------------

variable "domain_name" {
  description = "Root domain name — Terraform creates its Cloud DNS managed zone"
  type        = string
  default     = "neu-study.online"
  # Same domain as the AWS side. Registrar NS delegation is NOT touched by
  # this stack — that's a manual step right before launch (spec §7).
}

# -----------------------------------------------------------------------------
# Database (Cloud SQL) settings
# -----------------------------------------------------------------------------

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "ielts_platform" # matches infra/variables.tf's var.db_name default
}

variable "db_username" {
  description = "PostgreSQL user name"
  type        = string
  default     = "ielts_user" # matches infra/variables.tf's var.db_username default
}

variable "db_tier" {
  description = "Cloud SQL machine tier — see modules/cloud-sql/main.tf's cost note"
  type        = string
  default     = "db-custom-1-3840"
}

# -----------------------------------------------------------------------------
# Redis (Memorystore) settings
# -----------------------------------------------------------------------------

variable "redis_memory_size_gb" {
  description = "Memorystore Redis memory size in GB (1 is the minimum)"
  type        = number
  default     = 1
}

# -----------------------------------------------------------------------------
# Auth (Identity Platform) settings
# -----------------------------------------------------------------------------

variable "mfa_state" {
  description = "MFA availability: DISABLED, ENABLED (optional for users), or MANDATORY"
  type        = string
  default     = "DISABLED"
}

# -----------------------------------------------------------------------------
# PayPal (plain env vars are identifiers; only client_secret is sensitive)
# -----------------------------------------------------------------------------

variable "paypal_base_url" {
  type    = string
  default = "https://api-m.sandbox.paypal.com"
}

variable "paypal_client_id" {
  type    = string
  default = ""
}

variable "paypal_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "paypal_webhook_id" {
  type    = string
  default = ""
}

variable "next_public_paypal_client_id" {
  description = "PayPal public client ID exposed to the browser (baked into Next.js at build)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Cloud Run scaling
# -----------------------------------------------------------------------------

variable "api_min_instances" {
  description = "0 saves the most money; 1 avoids cold starts on WebSocket reconnects (spec §8, resolved)"
  type        = number
  default     = 1
}

variable "web_min_instances" {
  type    = number
  default = 0
}

# -----------------------------------------------------------------------------
# CI/CD (Workload Identity Federation)
# -----------------------------------------------------------------------------

variable "github_org" {
  description = "GitHub organization/user — verified against `git remote -v`, not copied from the AWS side's stale default"
  type        = string
  default     = "TuNoCode123"
}

variable "github_repo" {
  type    = string
  default = "DATN"
}
