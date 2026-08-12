output "uploads_bucket_name" {
  description = "GCS bucket for user file uploads"
  value       = google_storage_bucket.uploads.name
}

output "assets_bucket_name" {
  description = "GCS bucket for shared static assets"
  value       = google_storage_bucket.assets.name
}

output "api_service_account_email" {
  description = "Service account email — attach this as the Cloud Run api service's identity in Phase 5, and grant it further roles (Cloud SQL, Vertex AI, Secret Manager) as those modules are added"
  value       = google_service_account.api_runtime.email
}

output "api_service_account_name" {
  description = "Service account resource name (projects/-/serviceAccounts/...) — needed by google_service_account_iam_member.service_account_id (Phase 6's github-actions actAs grant)"
  value       = google_service_account.api_runtime.name
}
