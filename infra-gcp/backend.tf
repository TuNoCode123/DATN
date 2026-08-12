# =============================================================================
# BACKEND CONFIGURATION — Where Terraform stores its state
# =============================================================================
# Mirrors infra/backend.tf's role (S3 -> GCS). You MUST run bootstrap/ first
# — this bucket doesn't exist until that apply creates it.
#
# IMPORTANT: like the AWS side, you cannot use variables in this block —
# Terraform reads it before processing any variables. Replace the bucket name
# below with the `state_bucket_name` output from `terraform apply` in
# infra-gcp/bootstrap/, then run `terraform init` here.
# =============================================================================

terraform {
  backend "gcs" {
    bucket = "ielts-ai-491816-tfstate" # from bootstrap/outputs.tf's state_bucket_name
    prefix = "infra-gcp/state"         # path inside the bucket where state is stored
  }
}
