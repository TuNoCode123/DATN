variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for the instance"
  type        = string
}

variable "region" {
  description = "GCP region for the Cloud SQL instance"
  type        = string
}

variable "vpc_id" {
  description = "VPC self_link (from the network module) to attach the private IP to"
  type        = string
}

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

variable "tier" {
  description = "Cloud SQL machine tier — see main.tf's cost note; db-f1-micro/db-g1-small do NOT work for Postgres"
  type        = string
  default     = "db-custom-1-3840" # 1 vCPU, 3.75GB — smallest valid custom tier for Postgres
}

variable "deletion_protection" {
  description = "Prevent `terraform destroy` from deleting the instance — same intent as the AWS bucket's prevent_destroy"
  type        = bool
  default     = true
}
