variable "project_id" {
  description = "GCP project ID (create this manually first — see main.tf header comment)"
  type        = string
  # No default — required. Pass via -var, TF_VAR_project_id, or terraform.tfvars.
}

variable "region" {
  description = "Default GCP region for the provider (doesn't affect the bucket's multi-region location)"
  type        = string
  default     = "asia-southeast1"
}

variable "state_bucket_location" {
  description = "GCS bucket location for Terraform state — a multi-region for durability, not a single zone/region"
  type        = string
  default     = "ASIA"
  # "ASIA" = multi-region across Asia. Alternatives: "US", "EU", or a single
  # region like "asia-southeast1" if you want state to live next to your
  # other resources instead. Multi-region costs slightly more but survives
  # a regional outage — worth it for something as critical as state.
}
