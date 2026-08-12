variable "project_id" {
  type = string
}

variable "project_name" {
  type = string
}

variable "region" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "api_service_account_email" {
  type = string
}

variable "vpc_id" {
  description = "VPC self_link (from the network module) for Direct VPC egress"
  type        = string
}

variable "subnet_id" {
  description = "Subnet self_link (from the network module) for Direct VPC egress"
  type        = string
}

variable "vertex_ai_region" {
  type = string
}

variable "uploads_bucket_name" {
  type = string
}

variable "assets_bucket_name" {
  type = string
}

variable "firebase_web_api_key" {
  type      = string
  sensitive = true
}

variable "firebase_auth_domain" {
  type = string
}

variable "database_url_secret_id" {
  type = string
}

variable "redis_url_secret_id" {
  type = string
}

variable "paypal_client_secret_secret_id" {
  type = string
}

# -----------------------------------------------------------------------------
# PayPal (plain, non-secret identifiers)
# -----------------------------------------------------------------------------

variable "paypal_base_url" {
  type    = string
  default = "https://api-m.sandbox.paypal.com"
}

variable "paypal_client_id" {
  type    = string
  default = ""
}

variable "paypal_webhook_id" {
  type    = string
  default = ""
}

variable "next_public_paypal_client_id" {
  type    = string
  default = ""
}

# -----------------------------------------------------------------------------
# Scaling — §8 open question resolved: api min=1 (avoid WebSocket reconnect
# cold starts), web min=0 (cost savings, SSR tolerates cold start fine)
# -----------------------------------------------------------------------------

variable "api_min_instances" {
  type    = number
  default = 1
}

variable "api_max_instances" {
  type    = number
  default = 10
}

variable "web_min_instances" {
  type    = number
  default = 0
}

variable "web_max_instances" {
  type    = number
  default = 10
}
