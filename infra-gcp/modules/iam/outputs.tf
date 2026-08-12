output "github_actions_service_account_email" {
  description = "Set as the `service_account` input to google-github-actions/auth in the workflows"
  value       = google_service_account.github_actions.email
}

output "workload_identity_provider" {
  description = "Full resource name — set as the `workload_identity_provider` input to google-github-actions/auth"
  value       = google_iam_workload_identity_pool_provider.github.name
}
