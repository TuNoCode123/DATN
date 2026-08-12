variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix, used in the certificate resource name"
  type        = string
}

variable "domains" {
  description = "List of domains the certificate should cover, e.g. [\"api.neu-study.online\", \"web.neu-study.online\"]"
  type        = list(string)
}
