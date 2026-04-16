# ──────────────────────────────────────────────────────────────
#  Cognito Module — Input Variables
# ──────────────────────────────────────────────────────────────

variable "project_name" {
  description = "Project name prefix for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region (used in output URLs)"
  type        = string
}

# ── App URLs ─────────────────────────────────────────────────

variable "frontend_url" {
  description = "Frontend application URL (for OAuth callback/logout URLs)"
  type        = string
}

variable "api_domain" {
  description = "API domain for ALB callback URL (e.g., 'api.neu-study.online')"
  type        = string
  default     = ""
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix (must be globally unique)"
  type        = string
}

# ── Social Identity Providers ────────────────────────────────

variable "google_client_id" {
  description = "Google OAuth2 Client ID"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth2 Client Secret"
  type        = string
  sensitive   = true
}

# ── Lambda ───────────────────────────────────────────────────

variable "pre_signup_lambda_zip" {
  description = "Path to the pre-signup Lambda deployment zip"
  type        = string
  default     = ""
}

# ── MFA ──────────────────────────────────────────────────────

variable "mfa_configuration" {
  description = "MFA configuration: OFF, ON, or OPTIONAL"
  type        = string
  default     = "OPTIONAL"
}
