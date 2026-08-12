output "state_bucket_name" {
  description = "GCS bucket name for Terraform state — copy this into infra-gcp/backend.tf"
  value       = google_storage_bucket.terraform_state.name
}
