# ─── Variables ────────────────────────────────────────────────
variable "aws_region" {
  description = "AWS region for Cognito resources"
  type        = string
  default     = "ap-southeast-2"
}

# ─── App URLs ─────────────────────────────────────────────────
variable "frontend_url" {
  description = "Frontend application URL"
  type        = string
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix (must be globally unique)"
  type        = string
  default     = "ielts-ai-prd"
}

# ─── Social Identity Providers ────────────────────────────────
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

# Facebook — coming soon, uncomment when ready
# variable "facebook_app_id" {
#   description = "Facebook App ID"
#   type        = string
#   sensitive   = true
# }
#
# variable "facebook_app_secret" {
#   description = "Facebook App Secret"
#   type        = string
#   sensitive   = true
# }

# ─── Migration Lambda ────────────────────────────────────────
variable "migration_lambda_arn" {
  description = "ARN of the User Migration Lambda (set after deploying the Lambda)"
  type        = string
  default     = ""
}

# ─── Pre-Sign-Up Lambda ──────────────────────────────────────
variable "pre_signup_lambda_zip" {
  description = "Path to the pre-signup Lambda deployment zip"
  type        = string
  default     = "../lambda/pre-signup/pre-signup.zip"
}

# ─── MFA ──────────────────────────────────────────────────────
variable "mfa_configuration" {
  description = "MFA configuration: OFF, ON, or OPTIONAL"
  type        = string
  default     = "OPTIONAL"
}
