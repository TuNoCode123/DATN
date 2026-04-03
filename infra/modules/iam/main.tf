# =============================================================================
# IAM MODULE — GitHub Actions OIDC Role for CI/CD
# =============================================================================
#
# IAM = Identity and Access Management. Controls WHO can do WHAT in your AWS account.
#
# THE PROBLEM:
# GitHub Actions needs to deploy code to AWS (push images, update ECS services).
# The OLD way: store AWS access key + secret key as GitHub Secrets.
# This is risky — if the keys leak, anyone can access your AWS account.
#
# THE SOLUTION: OIDC (OpenID Connect)
# Instead of long-lived keys, GitHub Actions requests a short-lived token:
#
#   1. GitHub Actions says: "I'm running in repo royden/ielts-ai-platform"
#   2. AWS verifies this with GitHub's OIDC provider (cryptographic proof)
#   3. AWS gives GitHub a temporary token (expires in 1 hour)
#   4. GitHub Actions uses the token to push images and deploy
#
# Benefits:
#   - No long-lived credentials stored anywhere
#   - Token expires in 1 hour (even if leaked, it's useless after that)
#   - AWS knows EXACTLY which repo/branch requested the credentials
#   - Industry best practice (recommended by both AWS and GitHub)
# =============================================================================

# ── OIDC Provider — Trust GitHub's identity system ──────────────────────────
# This tells AWS: "I trust tokens issued by GitHub Actions."
# You only need ONE OIDC provider per AWS account (shared by all repos).
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  # This is GitHub's OIDC issuer URL. AWS will call this URL to verify tokens.

  # "client_id_list" specifies which audiences (clients) are allowed
  # "sts.amazonaws.com" is the standard audience for AWS STS (Security Token Service)
  client_id_list = ["sts.amazonaws.com"]

  # Thumbprint of GitHub's TLS certificate (AWS uses this for verification)
  # This is a fixed value that GitHub publishes — it rarely changes
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = { Name = "${var.project_name}-github-oidc" }
}

# ── IAM Role — What GitHub Actions can do ───────────────────────────────────
# This role defines the PERMISSIONS that GitHub Actions gets when it authenticates.
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions-role"

  # "assume_role_policy" = WHO can assume (use) this role
  # Here: only GitHub Actions from OUR specific repo on the main branch
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRoleWithWebIdentity" # OIDC-based authentication
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
        # Only trust tokens from our GitHub OIDC provider
      }
      Condition = {
        StringEquals = {
          # The "aud" (audience) claim must be "sts.amazonaws.com"
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # The "sub" (subject) claim must match our repo
          # "repo:royden/ielts-ai-platform:*" allows any branch/event
          # You could restrict to "repo:org/repo:ref:refs/heads/main" for main only
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*"
        }
      }
    }]
  })

  tags = { Name = "${var.project_name}-github-actions-role" }
}

# ── ECR Push Policy — Allow pushing Docker images ──────────────────────────
# GitHub Actions needs to push images to ECR during CI/CD builds.
resource "aws_iam_role_policy" "ecr_push" {
  name = "ecr-push"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # GetAuthorizationToken: needed to authenticate Docker client with ECR
        # This is a global action (not specific to a repository)
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*" # This action doesn't support resource-level restrictions
      },
      {
        # Repository-specific actions for pushing images
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", # Check if image layers already exist
          "ecr:GetDownloadUrlForLayer",       # Download existing layers (for caching)
          "ecr:BatchGetImage",                # Get image metadata
          "ecr:PutImage",                     # Push a new image
          "ecr:InitiateLayerUpload",          # Start uploading a new layer
          "ecr:UploadLayerPart",              # Upload layer data
          "ecr:CompleteLayerUpload",          # Finish uploading a layer
        ]
        Resource = var.ecr_arns # Only our specific ECR repositories
      }
    ]
  })
}

# ── ECS Deploy Policy — Allow deploying to ECS ─────────────────────────────
# GitHub Actions needs to update ECS services with new Docker images.
resource "aws_iam_role_policy" "ecs_deploy" {
  name = "ecs-deploy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ECS actions needed for deployment
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",   # Read current task definition
          "ecs:RegisterTaskDefinition",   # Create new task definition revision
          "ecs:UpdateService",            # Update service with new task definition
          "ecs:DescribeServices",         # Check service status
          "ecs:RunTask",                  # Run one-off tasks (migrations)
          "ecs:DescribeTasks",            # Check task status
          "ecs:ListTasks",               # List tasks in a cluster
        ]
        Resource = "*" # ECS actions often need broad access
      },
      {
        # Allow GitHub Actions to pass IAM roles to ECS tasks
        # (ECS needs to assume the task execution role and task role)
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "*"
        Condition = {
          StringLike = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}

# ── Terraform Policy — Allow running Terraform plan/apply ──────────────────
# For the infra pipeline, GitHub Actions needs broad permissions to manage
# infrastructure. This is the most permissive policy — use with care.
resource "aws_iam_role_policy" "terraform" {
  name = "terraform-admin"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          # S3: for Terraform state and S3 bucket management
          "s3:*",
          # DynamoDB: for Terraform state locking
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          # EC2/VPC: for networking resources
          "ec2:*",
          # ECS: for cluster, services, task definitions
          "ecs:*",
          # ECR: for container registries
          "ecr:*",
          # RDS: for database management
          "rds:*",
          # ElastiCache: for Redis
          "elasticache:*",
          # ELB: for ALB management
          "elasticloadbalancing:*",
          # CloudFront: for CDN
          "cloudfront:*",
          # Route 53: for DNS records
          "route53:*",
          # ACM: for SSL certificates
          "acm:*",
          # IAM: for role management (careful — very powerful)
          "iam:*",
          # CloudWatch: for log groups and alarms
          "logs:*",
          "cloudwatch:*",
          # Auto Scaling: for ASG management
          "autoscaling:*",
          # SSM: for parameter store and ECS AMI lookup
          "ssm:GetParameter",
          "ssm:GetParameters",
          # STS: for identity operations
          "sts:GetCallerIdentity",
        ]
        Resource = "*"
      }
    ]
  })
}
