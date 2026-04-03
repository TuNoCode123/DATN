# =============================================================================
# NETWORKING MODULE — Input Variables
# =============================================================================
# These variables are passed in from the root main.tf when calling this module.
# Example: module "networking" { project_name = "ielts-ai", ... }

variable "project_name" {
  description = "Name prefix for all networking resources"
  type        = string
}

variable "environment" {
  description = "Deployment environment (prod, staging, dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS region (used to compute availability zone names)"
  type        = string
}

variable "my_ip" {
  description = "Admin IP in CIDR notation for SSH access (e.g., '1.2.3.4/32')"
  type        = string
}
