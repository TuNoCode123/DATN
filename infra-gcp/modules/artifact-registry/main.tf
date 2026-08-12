# =============================================================================
# ARTIFACT REGISTRY MODULE — Docker image storage
# =============================================================================
# Replaces infra/modules/ecr (AWS ECR). Same idea: private Docker repos that
# CI/CD pushes to and Cloud Run pulls from. Two repos, matching the two ECR
# repos on the AWS side (ielts-ai-api, ielts-ai-web).
# =============================================================================

resource "google_artifact_registry_repository" "api" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.project_name}-api"
  format        = "DOCKER"
  description   = "Docker images for the NestJS API (replaces ECR ielts-ai-api)"
}

resource "google_artifact_registry_repository" "web" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.project_name}-web"
  format        = "DOCKER"
  description   = "Docker images for the Next.js web frontend (replaces ECR ielts-ai-web)"
}
