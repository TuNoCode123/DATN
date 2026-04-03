# =============================================================================
# ECR MODULE — Elastic Container Registry (Docker Image Storage)
# =============================================================================
#
# ECR is AWS's private Docker registry (like Docker Hub, but private).
# It stores the Docker images that ECS pulls and runs.
#
# Flow: Developer → Docker build → Push to ECR → ECS pulls from ECR → Runs
#
# We create 2 repositories:
#   1. ielts-ai-api — NestJS backend images
#   2. ielts-ai-web — Next.js frontend images
#
# Each push creates a new image tagged with the git commit SHA.
# Lifecycle policies auto-delete old images to save storage costs.
# =============================================================================

# ── API Repository ──────────────────────────────────────────────────────────
resource "aws_ecr_repository" "api" {
  name = "${var.project_name}-api" # "ielts-ai-api"

  # "image_tag_mutability" controls whether you can overwrite an existing tag.
  # MUTABLE: you CAN push a new image with the same tag (e.g., "latest")
  #   - Convenient: CI always pushes "latest" without worrying about unique tags
  # IMMUTABLE: once a tag is used, it can't be overwritten
  #   - Safer: prevents accidental overwrite of production images
  # We use MUTABLE because we push both :latest and :commit-sha tags
  image_tag_mutability = "MUTABLE"

  # Enable image scanning — automatically checks for known vulnerabilities
  # (CVEs) in your Docker images when pushed
  image_scanning_configuration {
    scan_on_push = true # Scan every image on push (free for basic scanning)
  }

  # Force delete: allows Terraform to delete the repo even if it has images
  # Without this, `terraform destroy` would fail if images exist
  force_delete = true

  tags = { Name = "${var.project_name}-api" }
}

# ── Web Repository ──────────────────────────────────────────────────────────
resource "aws_ecr_repository" "web" {
  name                 = "${var.project_name}-web" # "ielts-ai-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  force_delete = true

  tags = { Name = "${var.project_name}-web" }
}

# =============================================================================
# LIFECYCLE POLICIES — Auto-delete old images to save storage costs
# =============================================================================
# Without lifecycle policies, every CI/CD push adds a new image (~200-500 MB).
# After 100 deploys, you'd have ~50 GB of old images ($5/month).
#
# This policy keeps only the 10 most recent images and deletes the rest.
# The "latest" tag is always kept because it matches a tagged image.

# API lifecycle policy
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name # Apply to the API repository

  # The policy is a JSON document (AWS requires this format)
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1            # Lower number = higher priority
        description  = "Keep only last 10 images" # Human-readable description
        selection = {
          tagStatus   = "any"       # Apply to ALL images (tagged + untagged)
          countType   = "imageCountMoreThan"  # Trigger when image count exceeds...
          countNumber = 10          # ...10 images. Delete the oldest ones.
        }
        action = {
          type = "expire"           # "expire" = delete the matched images
        }
      }
    ]
  })
}

# Web lifecycle policy (same rules)
resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
