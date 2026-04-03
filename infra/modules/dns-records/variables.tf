# DNS-Records Module — Input Variables

variable "domain_name" {
  description = "Root domain name (e.g., 'neu-study.online')"
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name for api.* alias record"
  type        = string
}

variable "alb_zone_id" {
  description = "ALB's hosted zone ID for alias record"
  type        = string
}

variable "cloudfront_domain" {
  description = "CloudFront distribution domain name for web.* alias record"
  type        = string
}

variable "cloudfront_zone_id" {
  description = "CloudFront's hosted zone ID for alias record"
  type        = string
}
