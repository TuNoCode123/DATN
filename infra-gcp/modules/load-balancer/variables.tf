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

variable "certificate_id" {
  description = "Managed SSL certificate self_link (from the certs module, Phase 1)"
  type        = string
}

variable "api_service_name" {
  type = string
}

variable "web_service_name" {
  type = string
}
