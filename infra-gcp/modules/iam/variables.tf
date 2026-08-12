variable "project_id" {
  type = string
}

variable "project_name" {
  type = string
}

variable "github_org" {
  description = "GitHub organization/user — verified against the actual git remote, not copied from the AWS side's stale default"
  type        = string
  default     = "TuNoCode123"
}

variable "github_repo" {
  type    = string
  default = "DATN"
}

variable "api_service_account_name" {
  description = "API runtime service account's resource name (from the storage module) — the github-actions SA needs iam.serviceAccountUser on this to deploy revisions running as it"
  type        = string
}
