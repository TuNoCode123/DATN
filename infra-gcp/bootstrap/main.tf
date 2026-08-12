# =============================================================================
# BOOTSTRAP — One-time setup for Terraform Remote State (GCP side)
# =============================================================================
#
# Same problem as infra/bootstrap/main.tf (the AWS side): Terraform state is
# a JSON file tracking every resource it manages. Losing it means Terraform
# "forgets" your infrastructure exists; two people applying at once can
# corrupt it. Solution: store it in a GCS bucket (durable, versioned) — GCS
# has native locking built in, no separate lock table needed (same idea as
# S3's use_lockfile on the AWS side).
#
# PREREQUISITE — this does NOT create the GCP project itself:
# ------------------------------------------------------------
# Unlike AWS accounts, Terraform can't usually create a brand-new GCP project
# with billing attached for a personal/no-organization account — that's a
# one-time manual step:
#   1. https://console.cloud.google.com/projectcreate  → note the Project ID
#   2. Link a billing account to it (Billing → Link a billing account)
#   3. gcloud auth login && gcloud auth application-default login
#   4. gcloud config set project <PROJECT_ID>
#
# HOW TO USE (after the above):
# ------------------------------
#   cd infra-gcp/bootstrap
#   terraform init
#   terraform apply -var="project_id=<PROJECT_ID>"
#
# Copy the printed `state_bucket_name` output into infra-gcp/backend.tf,
# then `cd ../` and `terraform init` to start using the GCS backend.
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Enable the Cloud Storage API
# -----------------------------------------------------------------------------
# Brand-new GCP projects don't have every API pre-enabled. This is the one
# bootstrap needs; every other API gets enabled by the main infra-gcp/ stack.
resource "google_project_service" "storage" {
  project            = var.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

# =============================================================================
# GCS BUCKET — Stores Terraform state file
# =============================================================================
# Bucket names are globally unique across ALL of GCP, like S3. We prefix with
# the project ID (which is itself globally unique) so there's no collision
# risk — same reasoning as the AWS bucket getting an account-ID suffix.
# =============================================================================
resource "google_storage_bucket" "terraform_state" {
  name     = "${var.project_id}-tfstate"
  location = var.state_bucket_location # multi-region, e.g. "ASIA" — survives a single-region outage
  project  = var.project_id

  # Equivalent of the AWS bucket's versioning — keeps every past version of
  # the state file so a corrupted apply can be rolled back from the console.
  versioning {
    enabled = true
  }

  # Equivalent of the AWS bucket's public-access-block — state files contain
  # secrets (DB passwords, etc.), so this must never be publicly readable.
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  # Mirrors the AWS bucket's prevent_destroy — protects state from an
  # accidental `terraform destroy` in the bootstrap config itself.
  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.storage]
}
