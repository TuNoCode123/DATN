# =============================================================================
# INPUT VARIABLES — Configurable values for the entire infrastructure
# =============================================================================
#
# Variables make Terraform code reusable. Instead of hardcoding values like
# "ielts-ai" everywhere, we use var.project_name — then we can change it
# in ONE place (terraform.tfvars) and it updates everywhere.
#
# Variable types:
#   string  = text          ("hello")
#   number  = integer/float (42, 3.14)
#   bool    = true/false
#   list    = array         (["a", "b", "c"])
#   map     = key-value     ({ key = "value" })
#
# "default" = value used if not provided. No default = REQUIRED (must be set).
# =============================================================================

# -----------------------------------------------------------------------------
# General project settings
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Name prefix for all resources (e.g., 'ielts-ai')"
  type        = string
  default     = "ielts-ai"
  # This gets prepended to resource names: ielts-ai-vpc, ielts-ai-cluster, etc.
  # Keeps everything organized and avoids name conflicts with other projects.
}

variable "environment" {
  description = "Deployment environment (e.g., 'prod', 'staging', 'dev')"
  type        = string
  default     = "prod"
  # Used in tags and some resource names to distinguish environments.
  # For this thesis project, we only have one environment: prod.
}

variable "aws_region" {
  description = "AWS region to deploy all resources into"
  type        = string
  default     = "ap-southeast-2"
  # Sydney region — chosen for proximity to Vietnam/SE Asia.
  # All resources EXCEPT CloudFront ACM cert go here.
}

# -----------------------------------------------------------------------------
# Domain & DNS settings
# -----------------------------------------------------------------------------

variable "domain_name" {
  description = "Root domain name (must already have Route 53 hosted zone)"
  type        = string
  default     = "neu-study.online"
  # This domain is registered externally (e.g., Namecheap, GoDaddy).
  # Its NS records point to Route 53 so AWS manages DNS.
}

# -----------------------------------------------------------------------------
# Network settings
# -----------------------------------------------------------------------------

variable "my_ip" {
  description = "Your public IP in CIDR notation for SSH access (e.g., '123.45.67.89/32')"
  type        = string
  # /32 means "exactly this one IP address".
  # This is used in the ECS security group to allow SSH from only YOUR computer.
  # Find your IP: https://whatismyip.com then add /32 at the end.
  # Example: "203.0.113.50/32"
}

# -----------------------------------------------------------------------------
# Database (RDS) settings
# -----------------------------------------------------------------------------

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "ielts_platform"
  # The name of the database that will be created inside the RDS instance.
  # Same as what you use locally in docker-compose.
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "ielts_user"
  # The admin username for connecting to the database.
}

variable "db_password" {
  description = "PostgreSQL master password (keep secret!)"
  type        = string
  sensitive   = true # "sensitive = true" hides this value in Terraform output/logs
  # NEVER commit this value to git. Set it in terraform.tfvars (which is .gitignored)
  # or pass it via environment variable: TF_VAR_db_password="your_password"
}

variable "db_instance_class" {
  description = "RDS instance type (e.g., 'db.t3.micro' for free tier)"
  type        = string
  default     = "db.t3.micro"
  # db.t3.micro = 2 vCPU, 1 GB RAM — free tier eligible (750 hours/month for 12 months)
  # For production: db.t3.small ($25/mo) or db.r6g.large ($130/mo)
}

# -----------------------------------------------------------------------------
# Redis (ElastiCache) settings
# -----------------------------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
  # cache.t3.micro = 0.5 GB RAM — free tier eligible
  # Sufficient for Socket.IO pub/sub, presence tracking, and typing indicators.
}

# -----------------------------------------------------------------------------
# ECS (Compute) settings
# -----------------------------------------------------------------------------

variable "ecs_instance_type" {
  description = "EC2 instance type for ECS cluster nodes"
  type        = string
  default     = "t3.medium"
  # t3.medium = 2 vCPU, 4 GB RAM — enough for both API + Web containers
  # Each container uses 512 CPU + 1024 MB, so t3.medium fits 2 containers.
  # For cost savings: t3.small (2 vCPU, 2 GB) fits 1 container at a time.
}

variable "key_name" {
  description = "EC2 key pair name for SSH access (must already exist in AWS)"
  type        = string
  default     = null
  # Optional. If you want to SSH into ECS EC2 instances for debugging,
  # create a key pair in AWS Console (EC2 > Key Pairs) and put its name here.
  # Set to null if you don't need SSH access.
}

# -----------------------------------------------------------------------------
# GitHub (CI/CD) settings
# -----------------------------------------------------------------------------

variable "github_org" {
  description = "GitHub organization or username"
  type        = string
  default     = "royden"
  # Used by IAM module to set up OIDC trust between GitHub Actions and AWS.
  # OIDC = OpenID Connect — lets GitHub authenticate to AWS WITHOUT storing
  # AWS access keys as GitHub secrets. Much more secure.
}

variable "github_repo" {
  description = "GitHub repository name (without org prefix)"
  type        = string
  default     = "ielts-ai-platform"
  # The repo that GitHub Actions will deploy from.
}

# -----------------------------------------------------------------------------
# Cognito (external, not managed by this stack)
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Cognito (managed by modules/cognito within this stack)
# -----------------------------------------------------------------------------

variable "frontend_url" {
  description = "Frontend application URL for OAuth callback/logout URLs"
  type        = string
  # e.g., "https://web.neu-study.online"
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix (must be globally unique)"
  type        = string
  # e.g., "ielts-ai-prd" → ielts-ai-prd.auth.ap-southeast-2.amazoncognito.com
}

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

variable "mfa_configuration" {
  description = "MFA configuration: OFF, ON, or OPTIONAL"
  type        = string
  default     = "OPTIONAL"
}

variable "pre_signup_lambda_zip" {
  description = "Path to the pre-signup Lambda deployment zip"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Application runtime config (injected directly into ECS task env from tfvars)
# -----------------------------------------------------------------------------

variable "paypal_client_id" {
  description = "PayPal OAuth client ID (server-side)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paypal_client_secret" {
  description = "PayPal OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paypal_webhook_id" {
  description = "PayPal webhook ID for signature verification"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paypal_base_url" {
  description = "PayPal API base URL (sandbox vs live)"
  type        = string
  default     = "https://api-m.paypal.com"
}

variable "openrouter_api_key" {
  description = "OpenRouter API key (optional — falls back to AWS Bedrock)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "next_public_paypal_client_id" {
  description = "PayPal public client ID exposed to the browser (baked into Next.js at build)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# AWS AI service region overrides (Polly/Transcribe/Bedrock)
# -----------------------------------------------------------------------------

variable "aws_bedrock_region" {
  description = "AWS region for Bedrock (Claude models). Defaults to us-east-1 for broader model availability."
  type        = string
  default     = "us-east-1"
}

variable "aws_transcribe_region" {
  description = "AWS region for Transcribe Streaming"
  type        = string
  default     = "ap-southeast-2"
}

variable "aws_polly_region" {
  description = "AWS region for Polly TTS"
  type        = string
  default     = "ap-southeast-2"
}
