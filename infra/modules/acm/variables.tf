# ACM Module — Input Variables

variable "domain_name" {
  description = "Root domain name for the wildcard certificate (e.g., 'neu-study.online')"
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone ID for DNS validation records"
  type        = string
}
