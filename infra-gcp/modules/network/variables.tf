variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for all resources (e.g., 'ielts-ai')"
  type        = string
}

variable "region" {
  description = "GCP region for the subnet"
  type        = string
}

variable "subnet_cidr" {
  description = "CIDR range for the regional subnet"
  type        = string
  default     = "10.10.0.0/20" # 4096 addresses — plenty for Cloud Run's VPC-egress ENIs + future private-IP peering
}
