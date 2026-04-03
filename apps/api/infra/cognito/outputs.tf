# ─── Outputs ──────────────────────────────────────────────────
# These values are needed by backend (.env) and frontend (.env.local)

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
  description = "Cognito Hosted UI domain"
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

# ─── Environment variable summary ────────────────────────────
output "env_summary" {
  description = "Copy these to your .env files"
  value       = <<-EOT

    # ── Backend (.env) ──────────────────────────
    AWS_REGION=${var.aws_region}
    COGNITO_USER_POOL_ID=${aws_cognito_user_pool.main.id}
    COGNITO_FRONTEND_CLIENT_ID=${aws_cognito_user_pool_client.frontend.id}
    COGNITO_BACKEND_CLIENT_ID=${aws_cognito_user_pool_client.backend.id}

    # ── Frontend (.env.local) ───────────────────
    NEXT_PUBLIC_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.main.id}
    NEXT_PUBLIC_COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.frontend.id}
    NEXT_PUBLIC_COGNITO_DOMAIN=${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com
  EOT
}
