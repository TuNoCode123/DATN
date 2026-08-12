variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix, used as a label on the zone"
  type        = string
}

variable "domain_name" {
  description = "Root domain name — Terraform creates its Cloud DNS managed zone"
  type        = string
}
