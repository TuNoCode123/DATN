variable "project_id" {
  type = string
}

variable "zone_name" {
  description = "Cloud DNS managed zone name (from the dns module)"
  type        = string
}

variable "domain_name" {
  type = string
}

variable "lb_ip_address" {
  description = "Load balancer static IP (from the load-balancer module)"
  type        = string
}
