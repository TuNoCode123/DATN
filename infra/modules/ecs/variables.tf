# ECS Module — Input Variables

variable "project_name" {
  description = "Name prefix for all ECS resources"
  type        = string
}

variable "environment" {
  description = "Deployment environment (prod, staging, dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS region (for CloudWatch log configuration)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the ASG (where EC2 instances launch)"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS EC2 instances"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for ECS cluster nodes (e.g., 't3.small')"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "EC2 key pair name for SSH access (null = no SSH)"
  type        = string
  default     = null
}

# ALB target group ARNs — ECS services register containers here
variable "api_target_group_arn" {
  description = "ALB target group ARN for the API service"
  type        = string
}

variable "web_target_group_arn" {
  description = "ALB target group ARN for the Web service"
  type        = string
}

# ECR repository URLs — where to pull Docker images from
variable "ecr_api_url" {
  description = "ECR repository URL for the API image"
  type        = string
}

variable "ecr_web_url" {
  description = "ECR repository URL for the Web image"
  type        = string
}

# Database connection details
variable "rds_endpoint" {
  description = "RDS endpoint (host:port format)"
  type        = string
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
}

variable "db_username" {
  description = "PostgreSQL username"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

# Redis connection details
variable "redis_endpoint" {
  description = "ElastiCache Redis endpoint (host:port format)"
  type        = string
}

# Domain for CORS
variable "domain_name" {
  description = "Root domain name for building CORS origin URL"
  type        = string
  default     = "neu-study.online"
}

# Cognito (optional)
variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID (passed as env var to API containers)"
  type        = string
  default     = ""
}

variable "cognito_client_id" {
  description = "Cognito App Client ID"
  type        = string
  default     = ""
}

variable "cognito_frontend_client_id" {
  description = "Cognito Frontend App Client ID (public, used by API for token exchange)"
  type        = string
  default     = ""
}

variable "cognito_domain" {
  description = "Cognito Hosted UI domain (e.g., ielts-ai-prd.auth.ap-southeast-2.amazoncognito.com)"
  type        = string
  default     = ""
}
