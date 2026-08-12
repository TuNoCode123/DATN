# Artifact Registry repos don't expose a ready-made "URL" attribute the way
# ECR does — Docker image URLs follow a fixed, documented format:
#   <region>-docker.pkg.dev/<project_id>/<repository_id>/<image>:<tag>
# so we build it manually here, same shape CI/CD will use to tag images.

output "api_repository_url" {
  description = "Artifact Registry Docker URL prefix for API images — used in CI/CD to tag/push"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}"
}

output "web_repository_url" {
  description = "Artifact Registry Docker URL prefix for Web images — used in CI/CD to tag/push"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.web.repository_id}"
}
