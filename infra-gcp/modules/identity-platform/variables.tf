variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Name prefix for the API key resource"
  type        = string
}

variable "api_service_account_email" {
  description = "API runtime service account (from the storage module) — granted server-side user management access"
  type        = string
}

variable "mfa_state" {
  description = "MFA availability: DISABLED, ENABLED (optional for users), or MANDATORY"
  type        = string
  default     = "DISABLED"
}

variable "additional_authorized_domains" {
  description = "Extra domains allowed to receive OAuth/email-link redirects, beyond localhost and the default firebaseapp.com/web.app domains"
  type        = list(string)
  default     = []
}

variable "google_client_id" {
  description = "Google OAuth2 Client ID — leave empty to skip Google Sign-In for now (email/password only)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth2 Client Secret — leave empty to skip Google Sign-In for now"
  type        = string
  sensitive   = true
  default     = ""
}
