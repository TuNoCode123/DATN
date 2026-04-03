# ══════════════════════════════════════════════════════════════
#  IELTS AI Platform — AWS Cognito Terraform Configuration
# ══════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "ielts-ai-prd"
  callback_urls = [
    "${var.frontend_url}/auth/callback",
  ]
  logout_urls = [
    "${var.frontend_url}/login",
  ]
}

# ──────────────────────────────────────────────────────────────
#  1. Cognito User Pool
# ──────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-user-pool"

  # ── Sign-in ──
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # ── Password policy ──
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # ── MFA ──
  mfa_configuration = var.mfa_configuration

  # ── User attributes ──
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "name"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  # ── Account recovery ──
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # ── Email ──
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # ── Verification ──
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "IELTS AI - Verify your email"
    email_message        = "Your verification code is: {####}"
  }

  # ── Lambda triggers ──
  lambda_config {
    pre_sign_up = aws_lambda_function.pre_signup.arn

    # User Migration Lambda (optional)
    # user_migration = var.migration_lambda_arn
  }

  # ── Device tracking (for adaptive auth) ──
  device_configuration {
    challenge_required_on_new_device      = false
    device_only_remembered_on_user_prompt = true
  }

  # ── Advanced Security (adaptive auth) — uncomment for prod ──
  # user_pool_add_ons {
  #   advanced_security_mode = "ENFORCED"
  # }

  tags = {
    Project     = "ielts-ai"
    Environment = "prd"
    ManagedBy   = "terraform"
  }
}

# ──────────────────────────────────────────────────────────────
#  2. Cognito Domain (Hosted UI)
# ──────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

# ──────────────────────────────────────────────────────────────
#  3. Social Identity Providers
# ──────────────────────────────────────────────────────────────

# ── Google ──
resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id                     = var.google_client_id
    client_secret                 = var.google_client_secret
    authorize_scopes              = "openid email profile"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
    picture        = "picture"
  }

  lifecycle {
    ignore_changes = [provider_details["client_secret"]]
  }
}

# ── Facebook (coming soon) ──
# resource "aws_cognito_identity_provider" "facebook" {
#   user_pool_id  = aws_cognito_user_pool.main.id
#   provider_name = "Facebook"
#   provider_type = "Facebook"
#
#   provider_details = {
#     client_id        = var.facebook_app_id
#     client_secret    = var.facebook_app_secret
#     authorize_scopes = "public_profile,email"
#     api_version      = "v18.0"
#   }
#
#   attribute_mapping = {
#     email    = "email"
#     name     = "name"
#     username = "id"
#   }
#
#   lifecycle {
#     ignore_changes = [provider_details["client_secret"]]
#   }
# }

# ──────────────────────────────────────────────────────────────
#  4. App Client (Frontend — Public, PKCE)
# ──────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool_client" "frontend" {
  name         = "${local.name_prefix}-frontend-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # No client secret — public client for SPA (PKCE)
  generate_secret = false

  # OAuth2 settings
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO", "Google"]

  callback_urls = local.callback_urls
  logout_urls   = local.logout_urls

  # Token validity
  access_token_validity  = 15  # minutes
  id_token_validity      = 15  # minutes
  refresh_token_validity = 7   # days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  # Security
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # Read/write attributes
  read_attributes  = ["email", "name", "picture"]
  write_attributes = ["email", "name"]

  depends_on = [
    aws_cognito_identity_provider.google,
  ]
}

# ──────────────────────────────────────────────────────────────
#  5. App Client (Backend / Machine-to-Machine — Confidential)
# ──────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool_client" "backend" {
  name         = "${local.name_prefix}-backend-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = true

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  read_attributes  = ["email", "name", "picture"]
  write_attributes = ["email", "name"]
}

# ──────────────────────────────────────────────────────────────
#  6. Cognito Groups (Role Mapping)
# ──────────────────────────────────────────────────────────────
resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Administrator users with full access"
  precedence   = 1
}

resource "aws_cognito_user_group" "student" {
  name         = "Student"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Regular student users"
  precedence   = 10
}

# ──────────────────────────────────────────────────────────────
#  7. Pre-Sign-Up Lambda (Account Linking)
# ──────────────────────────────────────────────────────────────

# IAM role for the Lambda
resource "aws_iam_role" "pre_signup_lambda" {
  name = "${local.name_prefix}-pre-signup-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = "ielts-ai"
    Environment = "prd"
    ManagedBy   = "terraform"
  }
}

# Basic Lambda execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "pre_signup_basic" {
  role       = aws_iam_role.pre_signup_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Cognito admin permissions for account linking
resource "aws_iam_role_policy" "pre_signup_cognito" {
  name = "${local.name_prefix}-pre-signup-cognito-policy"
  role = aws_iam_role.pre_signup_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminLinkProviderForUser",
        ]
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

# Lambda function
resource "aws_lambda_function" "pre_signup" {
  function_name = "${local.name_prefix}-pre-signup"
  role          = aws_iam_role.pre_signup_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 5
  memory_size   = 128

  filename         = var.pre_signup_lambda_zip
  source_code_hash = filebase64sha256(var.pre_signup_lambda_zip)

  tags = {
    Project     = "ielts-ai"
    Environment = "prd"
    ManagedBy   = "terraform"
  }
}

# Allow Cognito to invoke the Lambda
resource "aws_lambda_permission" "cognito_pre_signup" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
