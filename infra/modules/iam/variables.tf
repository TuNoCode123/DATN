# IAM Module — Input Variables

variable "project_name" {
  description = "Name prefix for IAM resources"
  type        = string
}

variable "github_org" {
  description = "GitHub organization or username (e.g., 'royden')"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (e.g., 'ielts-ai-platform')"
  type        = string
}

variable "ecr_arns" {
  description = "List of ECR repository ARNs that GitHub Actions can push to"
  type        = list(string)
}
