# ElastiCache Module — Input Variables

variable "project_name" {
  description = "Name prefix for ElastiCache resources"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the Redis subnet group"
  type        = list(string)
}

variable "redis_security_group_id" {
  description = "Security group ID to attach to the Redis cluster"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type (e.g., 'cache.t3.micro' for free tier)"
  type        = string
  default     = "cache.t3.micro"
}
