# S3 Module — Input Variables

variable "project_name" {
  description = "Name prefix for S3 buckets"
  type        = string
}

variable "environment" {
  description = "Deployment environment (appended to bucket names for uniqueness)"
  type        = string
}
