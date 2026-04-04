# =============================================================================
# DEV Environment — Cognito Only
# =============================================================================
# This creates ONLY Cognito resources for local development.
# No VPC, RDS, ECS, etc. — those exist only in prod.
#
# Usage:
#   cd infra/environments/dev
#   terraform init
#   terraform plan
#   terraform apply
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "ielts-ai-terraform-state"
    key          = "dev/terraform.tfstate"
    region       = "ap-southeast-2"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ielts-ai-platform"
      ManagedBy   = "terraform"
      Environment = "dev"
    }
  }
}

# -----------------------------------------------------------------------------
# Cognito Module
# -----------------------------------------------------------------------------
module "cognito" {
  source                = "../../modules/cognito"
  project_name          = var.project_name
  environment           = "dev"
  aws_region            = var.aws_region
  frontend_url          = var.frontend_url
  cognito_domain_prefix = var.cognito_domain_prefix
  google_client_id      = var.google_client_id
  google_client_secret  = var.google_client_secret
  mfa_configuration     = var.mfa_configuration
  pre_signup_lambda_zip = var.pre_signup_lambda_zip
}
