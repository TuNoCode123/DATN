# ECR Module — Outputs

output "api_repository_url" {
  description = "Full URL for the API ECR repository (e.g., 123456789.dkr.ecr.region.amazonaws.com/ielts-ai-api)"
  value       = aws_ecr_repository.api.repository_url
  # This URL is used in ECS task definitions as the Docker image source
  # and in CI/CD pipelines as the push target.
}

output "web_repository_url" {
  description = "Full URL for the Web ECR repository"
  value       = aws_ecr_repository.web.repository_url
}

output "repository_arns" {
  description = "List of ECR repository ARNs — used by IAM module for push permissions"
  value       = [aws_ecr_repository.api.arn, aws_ecr_repository.web.arn]
  # ARN = Amazon Resource Name — a unique identifier for any AWS resource
  # Format: arn:aws:ecr:region:account-id:repository/name
  # IAM policies use ARNs to specify which resources a role can access.
}
