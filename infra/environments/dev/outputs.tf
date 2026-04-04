output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_frontend_client_id" {
  value = module.cognito.frontend_client_id
}

output "cognito_backend_client_id" {
  value = module.cognito.backend_client_id
}

output "cognito_domain" {
  value = module.cognito.cognito_domain
}

output "cognito_jwks_uri" {
  value = module.cognito.jwks_uri
}

output "cognito_issuer" {
  value = module.cognito.issuer
}
