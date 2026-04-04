variable "project_name" {
  type    = string
  default = "ielts-ai"
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

variable "frontend_url" {
  description = "Frontend URL for OAuth callbacks"
  type        = string
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix (must be globally unique)"
  type        = string
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "mfa_configuration" {
  type    = string
  default = "OFF"
}

variable "pre_signup_lambda_zip" {
  type    = string
  default = "../../modules/cognito/lambda/pre-signup/pre-signup.zip"
}
