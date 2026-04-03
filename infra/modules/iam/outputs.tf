# IAM Module — Outputs

output "github_actions_role_arn" {
  description = "IAM Role ARN for GitHub Actions — set as AWS_ROLE_ARN secret in your GitHub repo"
  value       = aws_iam_role.github_actions.arn
  # After running `terraform apply`, copy this ARN and add it as a
  # GitHub repository secret named "AWS_ROLE_ARN".
  # GitHub Actions workflows reference it as: ${{ secrets.AWS_ROLE_ARN }}
}

output "oidc_provider_arn" {
  description = "GitHub OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.github.arn
}
