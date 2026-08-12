variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for the service account"
  type        = string
}

variable "region" {
  description = "GCS bucket location"
  type        = string
}

variable "cors_allowed_origins" {
  description = "Origins allowed to PUT/GET directly against the uploads bucket from the browser"
  type        = list(string)
  default = [
    "https://web.neu-study.online",
    "http://localhost:3000",
  ]
}
