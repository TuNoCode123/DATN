variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for the secret IDs"
  type        = string
}

variable "api_service_account_email" {
  description = "API runtime service account — granted secretAccessor on each secret"
  type        = string
}

variable "db_host" {
  description = "Cloud SQL private IP"
  type        = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "redis_host" {
  description = "Memorystore private IP"
  type        = string
}

variable "redis_port" {
  type = number
}

variable "redis_auth_string" {
  type      = string
  sensitive = true
}

variable "paypal_client_secret" {
  description = "PayPal client secret — leave empty until you have real PayPal credentials"
  type        = string
  sensitive   = true
  default     = ""
}
