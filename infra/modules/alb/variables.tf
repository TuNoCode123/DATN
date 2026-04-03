# ALB Module — Input Variables

variable "project_name" {
  description = "Name prefix for ALB resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where target groups will be created"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB (must be 2+ AZs)"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID to attach to the ALB"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS (*.neu-study.online)"
  type        = string
}

variable "api_domain" {
  description = "API subdomain for host-based routing (e.g., 'api.neu-study.online')"
  type        = string
}
