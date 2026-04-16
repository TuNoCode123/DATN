# ──────────────────────────────────────────────────────────────
#  Cognito Module — Outputs
# ──────────────────────────────────────────────────────────────

output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "frontend_client_id" {
  description = "App Client ID for frontend (public, no secret)"
  value       = aws_cognito_user_pool_client.frontend.id
}

output "alb_client_id" {
  description = "App Client ID for ALB authenticate-cognito (confidential, with secret)"
  value       = aws_cognito_user_pool_client.alb.id
}

output "alb_client_secret" {
  description = "App Client Secret for ALB authenticate-cognito"
  value       = aws_cognito_user_pool_client.alb.client_secret
  sensitive   = true
}

output "backend_client_id" {
  description = "App Client ID for backend (confidential)"
  value       = aws_cognito_user_pool_client.backend.id
}

output "backend_client_secret" {
  description = "App Client Secret for backend"
  value       = aws_cognito_user_pool_client.backend.client_secret
  sensitive   = true
}

output "cognito_domain" {
  description = "Cognito Hosted UI domain URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "jwks_uri" {
  description = "JWKS URI for JWT verification in backend"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}

output "issuer" {
  description = "Token issuer URL for JWT verification"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}
