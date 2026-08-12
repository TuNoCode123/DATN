variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "api_service_account_email" {
  description = "API runtime service account (from the storage module)"
  type        = string
}
