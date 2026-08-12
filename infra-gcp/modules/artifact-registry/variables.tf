variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for the repository IDs"
  type        = string
}

variable "region" {
  description = "GCP region for the repositories (Artifact Registry repos are regional, not global)"
  type        = string
}
