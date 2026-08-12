variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for the instance"
  type        = string
}

variable "region" {
  description = "GCP region for the Redis instance"
  type        = string
}

variable "vpc_id" {
  description = "VPC self_link (from the network module) to attach the private IP to"
  type        = string
}

variable "memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1 # matches the AWS side's cache.t3.micro (0.5GB) roughly rounded up — Memorystore's minimum is 1GB
}
