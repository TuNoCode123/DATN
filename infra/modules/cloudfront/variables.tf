# CloudFront Module — Input Variables

variable "project_name" {
  description = "Name prefix for CloudFront resources"
  type        = string
}

variable "web_domain" {
  description = "Web frontend domain (e.g., 'web.neu-study.online')"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name — used as the CloudFront origin"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 (required for CloudFront)"
  type        = string
}
