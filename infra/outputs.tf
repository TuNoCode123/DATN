# =============================================================================
# ROOT OUTPUTS — Important values printed after `terraform apply`
# =============================================================================
#
# These are the values you'll need after deploying:
#   - URLs to access your services
#   - Connection strings for databases
#   - ARNs for CI/CD configuration
#
# Run `terraform output` to see these anytime after the first apply.
# Run `terraform output -json` for machine-readable format.
# =============================================================================

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------
output "vpc_id" {
  description = "VPC ID — useful for debugging in AWS Console"
  value       = module.networking.vpc_id
}

# -----------------------------------------------------------------------------
# DNS & Access URLs
# -----------------------------------------------------------------------------
output "api_url" {
  description = "API endpoint URL"
  value       = "https://api.${var.domain_name}"
  # This is what the frontend uses as NEXT_PUBLIC_API_URL
}

output "web_url" {
  description = "Web frontend URL"
  value       = "https://web.${var.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name (for debugging — normally you use the domain)"
  value       = module.alb.dns_name
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain (for debugging)"
  value       = module.cloudfront.domain_name
}

# -----------------------------------------------------------------------------
# Container Registry (ECR)
# -----------------------------------------------------------------------------
output "ecr_api_url" {
  description = "ECR repository URL for API images — used in CI/CD pipeline"
  value       = module.ecr.api_repository_url
}

output "ecr_web_url" {
  description = "ECR repository URL for Web images — used in CI/CD pipeline"
  value       = module.ecr.web_repository_url
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port) — used in DATABASE_URL"
  value       = module.rds.endpoint
}

# -----------------------------------------------------------------------------
# Redis
# -----------------------------------------------------------------------------
output "redis_endpoint" {
  description = "ElastiCache Redis endpoint (host:port) — used in REDIS_URL"
  value       = module.elasticache.endpoint
}

# -----------------------------------------------------------------------------
# CI/CD
# -----------------------------------------------------------------------------
output "github_actions_role_arn" {
  description = "IAM Role ARN for GitHub Actions OIDC — set as AWS_ROLE_ARN secret in GitHub"
  value       = module.iam.github_actions_role_arn
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------
output "ecs_cluster_name" {
  description = "ECS cluster name — used in deploy scripts and stop/start scripts"
  value       = module.ecs.cluster_name
}

# -----------------------------------------------------------------------------
# S3
# -----------------------------------------------------------------------------
output "uploads_bucket_name" {
  description = "S3 bucket for user file uploads"
  value       = module.s3.uploads_bucket_name
}

# -----------------------------------------------------------------------------
# Cognito
# -----------------------------------------------------------------------------
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_frontend_client_id" {
  description = "Cognito Frontend App Client ID (public, PKCE)"
  value       = module.cognito.frontend_client_id
}

output "cognito_alb_client_id" {
  description = "Cognito ALB App Client ID (confidential, for ALB authenticate-cognito)"
  value       = module.cognito.alb_client_id
}

output "cognito_backend_client_id" {
  description = "Cognito Backend App Client ID (confidential)"
  value       = module.cognito.backend_client_id
}

output "cognito_domain" {
  description = "Cognito Hosted UI domain URL"
  value       = module.cognito.cognito_domain
}

output "cognito_issuer" {
  description = "Cognito token issuer URL (for JWT verification)"
  value       = module.cognito.issuer
}

output "cognito_jwks_uri" {
  description = "Cognito JWKS URI (for JWT verification)"
  value       = module.cognito.jwks_uri
}
