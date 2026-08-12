# =============================================================================
# STORAGE MODULE — GCS buckets + the API's runtime identity
# =============================================================================
# Replaces infra/modules/s3 (AWS S3). Same two-bucket split: "uploads" (user
# files, public-read on the uploads/ prefix only, via presigned/signed URLs)
# and "assets" (fully private, shared static files).
#
# Encryption: GCS encrypts everything at rest by default with Google-managed
# keys — unlike AWS, there's no separate resource needed to turn this on.
#
# SERVICE ACCOUNT — created HERE, not in the future Cloud Run module:
# ----------------------------------------------------------------------
# GCS signed URLs need a service account to sign with. Cloud Run's attached
# identity has no exportable private key (that's a good thing — no key file
# to leak), so signing uses IAM's signBlob API instead, which requires the
# service account to hold `roles/iam.serviceAccountTokenCreator` on itself.
#
# This identity is created now, in the data tier, so IAM bindings can be
# granted incrementally as each later module needs them (Vertex AI in Phase
# 4, Secret Manager access, etc.) — Phase 5's Cloud Run module then attaches
# this same service account as the service's runtime identity, the same way
# infra/modules/ecs attaches aws_iam_role.ecs_task ("For app code (S3, SES,
# etc.)") to the API task.
# =============================================================================

resource "google_service_account" "api_runtime" {
  project      = var.project_id
  account_id   = "${var.project_name}-api"
  display_name = "IELTS AI API runtime identity (Cloud Run, Phase 5)"
}

# Lets the service account sign URLs for itself — no key file involved.
resource "google_service_account_iam_member" "api_runtime_token_creator" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api_runtime.email}"
}

# ── Uploads bucket ──────────────────────────────────────────────────────────
resource "google_storage_bucket" "uploads" {
  project       = var.project_id
  name          = "${var.project_id}-uploads" # project ID prefix guarantees global uniqueness, same reasoning as the AWS account-ID suffix
  location      = var.region
  force_destroy = true # allow Terraform to delete the bucket even with files in it — set false in production if you want a safety net

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  cors {
    origin          = var.cors_allowed_origins
    method          = ["GET", "PUT"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# Public-read on the whole bucket — the AWS side scoped this to the
# "uploads/*" prefix within a shared bucket via a conditioned bucket policy,
# but GCS rejects any IAM Condition combined with a public (allUsers) grant
# (googleapi 400: PublicResourceAllowConditionCheck — a hard platform rule,
# not something to retry around). Since this bucket exists solely to hold
# upload objects (unlike the AWS bucket, nothing else is ever stored here),
# an unconditional bucket-level grant reaches the same real-world outcome.
resource "google_storage_bucket_iam_member" "uploads_public_read" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# The API's runtime identity can read/write/delete objects (needed to
# generate signed PUT URLs and to serve/delete on the user's behalf).
resource "google_storage_bucket_iam_member" "uploads_api_access" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}

# ── Assets bucket (private, shared static files) ────────────────────────────
resource "google_storage_bucket" "assets" {
  project       = var.project_id
  name          = "${var.project_id}-assets"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true
}

resource "google_storage_bucket_iam_member" "assets_api_access" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}
