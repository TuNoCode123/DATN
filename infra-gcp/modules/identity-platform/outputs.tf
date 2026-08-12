output "auth_domain" {
  description = "Firebase Auth domain — used in the Next.js Firebase config's authDomain field"
  value       = "${var.project_id}.firebaseapp.com"
}

output "project_id" {
  description = "GCP project ID — used as-is in the Next.js Firebase config's projectId field"
  value       = var.project_id
}

output "web_api_key" {
  description = "Browser API key for the Next.js Firebase Auth SDK config — see main.tf's note on why this isn't treated as a true secret"
  value       = google_apikeys_key.web.key_string
  sensitive   = true
}

output "google_sign_in_enabled" {
  description = "Whether Google Sign-In is currently configured (false until google_client_id/secret are provided)"
  value       = length(google_identity_platform_default_supported_idp_config.google) > 0
}
