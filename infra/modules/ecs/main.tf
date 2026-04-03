# =============================================================================
# ECS MODULE — Elastic Container Service (Container Orchestration)
# =============================================================================
#
# This is the LARGEST and most important module. ECS runs our Docker containers.
#
# ARCHITECTURE:
#
#   ECS Cluster (logical grouping)
#     ├── Capacity Provider (connects ASG to cluster for auto-scaling)
#     ├── Auto Scaling Group (manages EC2 instances)
#     │   └── Launch Template (config for each EC2 instance)
#     │       ├── ECS-optimized AMI (Amazon Linux + Docker + ECS agent)
#     │       ├── Instance profile (IAM role for the EC2 instance)
#     │       └── User data script (tells ECS agent which cluster to join)
#     │
#     ├── API Service
#     │   ├── Task Definition (Docker config: image, CPU, memory, env vars)
#     │   └── Load Balancer config (registers with ALB target group)
#     │
#     └── Web Service
#         ├── Task Definition
#         └── Load Balancer config
#
# KEY CONCEPTS:
#   - "Cluster" = logical grouping of services (like a namespace)
#   - "Service" = ensures N copies of a task are always running
#   - "Task Definition" = Docker Compose equivalent (image, ports, env vars)
#   - "Task" = a running instance of a task definition (a running container)
#   - "Capacity Provider" = manages EC2 instances to fit running tasks
#
# NETWORKING MODE: "bridge"
#   Container port 4000 → mapped to a random host port (32768-65535)
#   ALB discovers the host port via ECS service discovery and routes to it.
#   This allows multiple containers on the same EC2 instance.
# =============================================================================

# =============================================================================
# ECS CLUSTER
# =============================================================================
# A cluster is a logical grouping. It costs nothing by itself.
# Services and tasks run INSIDE the cluster.
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster" # "ielts-ai-cluster"

  # Container Insights: sends container-level metrics to CloudWatch
  # CPU, memory, network per container — very useful for debugging
  setting {
    name  = "containerInsights"
    value = "enabled" # Free for basic metrics, ~$3/month for detailed
  }

  tags = { Name = "${var.project_name}-cluster" }
}

# =============================================================================
# ECS-OPTIMIZED AMI — The base OS image for EC2 instances
# =============================================================================
# An AMI (Amazon Machine Image) is a pre-built OS image.
# ECS-optimized AMIs come with Docker and the ECS agent pre-installed.
#
# We use a "data source" to look up the latest AMI ID from AWS SSM Parameter Store.
# This way, we always get the newest patched version without hardcoding an AMI ID.
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
  # AWS maintains this parameter — it always points to the latest ECS-optimized AMI
  # No manual AMI ID management needed!
}

# =============================================================================
# LAUNCH TEMPLATE — Configuration for each EC2 instance
# =============================================================================
# A launch template defines HOW each EC2 instance is created:
#   - Which AMI (OS image) to use
#   - Instance type (how much CPU/RAM)
#   - Security groups, SSH key, disk size
#   - IAM role (what AWS services the instance can access)
#   - User data script (runs on first boot)
#
# The Auto Scaling Group uses this template to launch new instances.
resource "aws_launch_template" "ecs" {
  name_prefix = "${var.project_name}-ecs-" # "ielts-ai-ecs-abc123"
  # name_prefix: Terraform adds a random suffix to avoid conflicts

  image_id      = data.aws_ssm_parameter.ecs_ami.value # Latest ECS-optimized AMI
  instance_type = var.instance_type                      # "t3.medium" (2 vCPU, 4 GB)
  key_name      = var.key_name                           # SSH key pair (optional)

  # IAM Instance Profile: gives the EC2 instance permissions to:
  #   - Register with ECS cluster
  #   - Pull Docker images from ECR
  #   - Send logs to CloudWatch
  #   - Use SSM Session Manager (for SSH without opening port 22)
  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  # Security group: only ALB and SSH traffic allowed in
  vpc_security_group_ids = [var.ecs_security_group_id]

  # EBS (Elastic Block Store) — the disk attached to the instance
  block_device_mappings {
    device_name = "/dev/xvda" # Root volume device name (Linux convention)

    ebs {
      volume_size = 30     # 30 GB disk
      volume_type = "gp3"  # General Purpose SSD (3000 IOPS baseline)
      encrypted   = true   # Encrypt the disk at rest
      # 30 GB is enough for Docker images + container data
      # Docker images are typically 200-500 MB each
    }
  }

  # User data: shell script that runs on first boot
  # "templatefile" reads user_data.sh and replaces ${cluster_name} with the actual value
  # "base64encode" is required — AWS expects user data to be base64-encoded
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    cluster_name = "${var.project_name}-cluster"
  }))

  # Tags applied to each EC2 instance created from this template
  tag_specifications {
    resource_type = "instance"
    tags = { Name = "${var.project_name}-ecs-instance" }
  }
}

# =============================================================================
# AUTO SCALING GROUP (ASG) — Manages EC2 instance count
# =============================================================================
# The ASG ensures we always have the right number of EC2 instances.
#   - min_size: never fewer than this many instances
#   - max_size: never more than this many instances
#   - desired_capacity: how many to run right now
#
# The ASG automatically:
#   - Replaces unhealthy instances (if one crashes, a new one launches)
#   - Scales out (adds instances) when tasks need more capacity
#   - Scales in (removes instances) when capacity is underutilized
resource "aws_autoscaling_group" "ecs" {
  name             = "${var.project_name}-ecs-asg"
  min_size         = 1  # Always at least 1 instance running
  max_size         = 3  # Never more than 3 (cost protection)
  desired_capacity = 1  # Start with 1 instance

  # Place instances in private subnets (across 2 AZs for availability)
  vpc_zone_identifier = var.private_subnet_ids

  # Use our launch template to create instances
  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest" # Always use the latest version of the template
  }

  # This tag is REQUIRED for ECS managed scaling
  # It tells AWS that this ASG is managed by an ECS capacity provider
  tag {
    key                 = "AmazonECSManaged"
    value               = true
    propagate_at_launch = true # Apply this tag to launched instances too
  }

  # Ignore desired_capacity changes made by ECS auto-scaling
  # Without this, Terraform would reset capacity back to 1 on every apply
  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# =============================================================================
# CAPACITY PROVIDER — Connects ASG to ECS for intelligent scaling
# =============================================================================
# A capacity provider bridges the ASG and ECS cluster. It tells ECS:
# "Use THIS ASG to launch instances when tasks need more capacity."
#
# Managed scaling: ECS automatically adjusts the ASG size based on the
# number of running tasks vs available capacity. Target 80% means ECS
# tries to keep instances 80% utilized (leaving 20% headroom).
resource "aws_ecs_capacity_provider" "ec2" {
  name = "${var.project_name}-ec2-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.ecs.arn

    # Managed termination protection: prevents ASG from terminating instances
    # that are running tasks. DISABLED for our demo (simpler).
    # ENABLED in production to prevent killing running requests.
    managed_termination_protection = "DISABLED"

    managed_scaling {
      status                    = "ENABLED" # Let ECS manage ASG scaling
      target_capacity           = 80        # Target 80% utilization
      minimum_scaling_step_size = 1         # Scale at least 1 instance at a time
      maximum_scaling_step_size = 2         # Scale at most 2 instances at a time
    }
  }
}

# Associate the capacity provider with the cluster
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.ec2.name]

  # Default strategy: when a service doesn't specify a capacity provider,
  # use this one (our EC2 capacity provider)
  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1 # Relative weight (only matters if multiple providers)
  }
}

# =============================================================================
# IAM ROLES — Permissions for EC2 instances and ECS tasks
# =============================================================================
#
# There are 3 different IAM roles in ECS:
#
# 1. EC2 Instance Role — permissions for the EC2 instance itself
#    (pull Docker images, register with ECS, send logs)
#
# 2. Task Execution Role — permissions for the ECS AGENT on the instance
#    (pull images from ECR, get secrets from SSM, write logs)
#
# 3. Task Role — permissions for YOUR APPLICATION code
#    (access S3, send emails via SES, publish to SNS)
#
# This separation is important:
#   - The EC2 instance can pull images, but your app code can't
#   - Your app code can access S3, but the ECS agent can't
#   - Principle of least privilege: each component gets only what it needs
# =============================================================================

# ── 1. EC2 Instance Role ───────────────────────────────────────────────────
# This role is assumed by the EC2 instance itself (not the containers).
# It allows the instance to register with the ECS cluster and pull images.
resource "aws_iam_role" "ecs_instance" {
  name = "${var.project_name}-ecs-instance-role"

  # "assume_role_policy" says WHO can use this role
  # Here: only EC2 instances can assume (use) this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"            # Permission to assume the role
      Effect    = "Allow"                     # Allow (not Deny)
      Principal = { Service = "ec2.amazonaws.com" } # Only EC2 can assume this
    }]
  })
}

# Attach AWS-managed policies to the instance role
# These are pre-built policy bundles that AWS maintains

# AmazonEC2ContainerServiceforEC2Role: allows the instance to register with ECS,
# pull Docker images, and deregister when terminated
resource "aws_iam_role_policy_attachment" "ecs_instance" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# AmazonSSMManagedInstanceCore: allows AWS Systems Manager to manage the instance
# This enables "Session Manager" — SSH-like access through AWS Console (no port 22 needed)
resource "aws_iam_role_policy_attachment" "ecs_ssm" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# CloudWatchAgentServerPolicy: allows the CloudWatch agent to send metrics
resource "aws_iam_role_policy_attachment" "ecs_cloudwatch" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# Instance Profile: wrapper around the IAM role that EC2 instances can use
# EC2 doesn't use IAM roles directly — it uses "instance profiles" that contain roles
resource "aws_iam_instance_profile" "ecs" {
  name = "${var.project_name}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance.name
}

# ── 2. Task Execution Role ─────────────────────────────────────────────────
# Used by the ECS AGENT (not your app) to pull images and write logs.
# This role is specified in task definitions as "execution_role_arn".
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution"

  # Only the ECS task service can assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# AmazonECSTaskExecutionRolePolicy: allows ECS agent to pull images from ECR
# and write logs to CloudWatch
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ── 3. Task Role (application permissions) ─────────────────────────────────
# Used by YOUR APPLICATION CODE inside the container.
# This role is specified in task definitions as "task_role_arn".
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# Custom policy: what your NestJS application is allowed to do
resource "aws_iam_role_policy" "ecs_task_permissions" {
  name = "app-permissions"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # S3: allow the API to upload/download/delete files in the uploads bucket
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.project_name}-uploads-*/*"
        # The /* at the end means "all objects in the bucket"
      },
      {
        # SNS: allow publishing notification events (future)
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = "arn:aws:sns:*:*:${var.project_name}-*"
      },
      {
        # SQS: allow sending messages to queues (future)
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = "arn:aws:sqs:*:*:${var.project_name}-*"
      },
      {
        # SES: allow sending emails (future)
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendTemplatedEmail"]
        Resource = "*" # SES doesn't support resource-level restrictions
      }
    ]
  })
}

# =============================================================================
# CLOUDWATCH LOG GROUPS — Where container logs are stored
# =============================================================================
# ECS sends container stdout/stderr to CloudWatch Logs.
# Each service gets its own log group for organized viewing.
# Retention: 14 days (then auto-deleted to save costs).

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}/api"  # e.g., "/ecs/ielts-ai/api"
  retention_in_days = 14 # Keep logs for 14 days, then delete

  tags = { Name = "${var.project_name}-api-logs" }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project_name}/web"
  retention_in_days = 14

  tags = { Name = "${var.project_name}-web-logs" }
}

# =============================================================================
# TASK DEFINITIONS — Docker configuration for each service
# =============================================================================
# A task definition is like docker-compose.yml for AWS. It defines:
#   - Which Docker image to run
#   - How much CPU/memory to allocate
#   - Which port the container listens on
#   - Environment variables (database URL, etc.)
#   - Health check configuration
#   - Where to send logs

# ── API Task Definition ─────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family = "${var.project_name}-api" # "ielts-ai-api"
  # "family" groups versions of the same task definition.
  # Each deploy creates a new revision: ielts-ai-api:1, ielts-ai-api:2, etc.

  execution_role_arn = aws_iam_role.ecs_task_execution.arn # For ECS agent (pull images, logs)
  task_role_arn      = aws_iam_role.ecs_task.arn           # For app code (S3, SES, etc.)
  network_mode       = "bridge" # Docker bridge networking (dynamic port mapping)
  # "bridge" = containers get a random host port mapped to their container port
  # "awsvpc" = each task gets its own ENI and IP (used with Fargate)

  # Container definition — the Docker container configuration
  # This is a JSON array (can have multiple containers per task, but we use 1)
  container_definitions = jsonencode([{
    name      = "api"                          # Container name (referenced by ALB)
    image     = "${var.ecr_api_url}:latest"    # Docker image from ECR
    cpu       = 512                            # 512 CPU units = 0.5 vCPU
    # 1 vCPU = 1024 CPU units. t3.medium has 2048 total (2 vCPU).
    memory    = 1024                           # 1024 MB = 1 GB RAM
    essential = true                           # If this container dies, stop the whole task

    # Port mapping: container port → random host port
    portMappings = [{
      containerPort = 4000  # NestJS listens on 4000 inside the container
      hostPort      = 0     # 0 = dynamic port (let Docker pick a random port)
      # ALB discovers the random port via ECS service discovery
      protocol      = "tcp"
    }]

    # Environment variables passed to the container
    # These are the same as what you'd put in .env locally
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "4000" },
      # DATABASE_URL: full connection string for PostgreSQL
      # Format: postgresql://username:password@host:port/database
      {
        name  = "DATABASE_URL"
        value = "postgresql://${var.db_username}:${var.db_password}@${var.rds_endpoint}/${var.db_name}"
      },
      # REDIS_URL: connection string for ElastiCache Redis
      { name = "REDIS_URL", value = "redis://${var.redis_endpoint}" },
      # Frontend URL for CORS (Cross-Origin Resource Sharing)
      { name = "FRONTEND_URL", value = "https://web.${var.domain_name}" },
      # Cognito configuration (if using Cognito auth)
      { name = "COGNITO_USER_POOL_ID", value = var.cognito_user_pool_id },
      { name = "COGNITO_CLIENT_ID", value = var.cognito_client_id },
    ]

    # Health check: ECS runs this command periodically to check container health
    # If the health check fails, ECS kills and replaces the container
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:4000/api/health || exit 1"]
      # "curl -f" fails with exit code 22 if HTTP response is 4xx/5xx
      # "|| exit 1" ensures the health check reports failure
      interval    = 30  # Check every 30 seconds
      timeout     = 5   # Wait up to 5 seconds for a response
      retries     = 3   # Allow 3 consecutive failures before marking unhealthy
      startPeriod = 60  # Grace period: don't check for the first 60 seconds
      # startPeriod gives the app time to boot (NestJS startup + Prisma migration)
    }

    # Log configuration: send container logs to CloudWatch
    logConfiguration = {
      logDriver = "awslogs" # AWS CloudWatch Logs driver (built into ECS)
      options = {
        "awslogs-group"         = "/ecs/${var.project_name}/api" # Log group name
        "awslogs-region"        = var.aws_region                 # AWS region
        "awslogs-stream-prefix" = "api"                          # Prefix for log streams
        # Each container gets a stream: api/api/<task-id>
      }
    }
  }])

  tags = { Name = "${var.project_name}-api-task" }
}

# ── Web Task Definition ─────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "web" {
  family             = "${var.project_name}-web" # "ielts-ai-web"
  execution_role_arn = aws_iam_role.ecs_task_execution.arn
  network_mode       = "bridge"
  # Web doesn't need task_role_arn — it doesn't access S3/SES directly
  # (all API calls go through the backend)

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${var.ecr_web_url}:latest"
    cpu       = 512   # 0.5 vCPU
    memory    = 1024  # 1 GB RAM
    essential = true

    portMappings = [{
      containerPort = 3000 # Next.js listens on 3000
      hostPort      = 0    # Dynamic port mapping
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      # Next.js needs to know where the API is for server-side rendering (SSR)
      # During SSR, the server makes API calls directly (not through the browser)
    ]

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project_name}/web"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "web"
      }
    }
  }])

  tags = { Name = "${var.project_name}-web-task" }
}

# =============================================================================
# ECS SERVICES — Keep desired number of tasks always running
# =============================================================================
# A "service" is a controller that ensures N copies of a task definition
# are always running. If a container crashes, the service replaces it.
# If you deploy a new image, the service does a rolling update.

# ── API Service ─────────────────────────────────────────────────────────────
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"     # "ielts-ai-api"
  cluster         = aws_ecs_cluster.main.id       # Run in our cluster
  task_definition = aws_ecs_task_definition.api.arn # Which task def to run
  desired_count   = 1                              # Run 1 copy of this task

  # Use our EC2 capacity provider (not Fargate)
  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }

  # Register running containers with the ALB target group
  # When a new container starts, ECS tells the ALB "hey, send traffic to this container"
  load_balancer {
    target_group_arn = var.api_target_group_arn # ALB API target group
    container_name   = "api"                    # Must match the name in container_definitions
    container_port   = 4000                     # Container port (not host port)
  }

  # Rolling deployment configuration:
  # min 50% = during deploy, at least 50% of desired tasks stay running
  # max 200% = during deploy, can temporarily run up to 200% of desired tasks
  # With desired_count=1: min=0 (can stop old), max=2 (can run old+new simultaneously)
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # Ignore changes to task_definition and desired_count
  # CI/CD updates the task definition (new image tag), not Terraform
  # ECS auto-scaling changes desired_count, not Terraform
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = { Name = "${var.project_name}-api-service" }
}

# ── Web Service ─────────────────────────────────────────────────────────────
resource "aws_ecs_service" "web" {
  name            = "${var.project_name}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }

  load_balancer {
    target_group_arn = var.web_target_group_arn
    container_name   = "web"
    container_port   = 3000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = { Name = "${var.project_name}-web-service" }
}

# =============================================================================
# MIGRATION TASK DEFINITION — One-off task to run Prisma migrations
# =============================================================================
# This task runs `npx prisma migrate deploy` and then exits.
# It's triggered by the CI/CD pipeline after deploying new code.
# Unlike services, this task runs ONCE and doesn't restart.
resource "aws_ecs_task_definition" "api_migrate" {
  family             = "${var.project_name}-api-migrate"
  execution_role_arn = aws_iam_role.ecs_task_execution.arn
  task_role_arn      = aws_iam_role.ecs_task.arn
  network_mode       = "bridge"

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = "${var.ecr_api_url}:latest"
    cpu       = 256
    memory    = 512
    essential = true

    # Override the default container command to run migrations instead of the API
    command = ["npx", "prisma", "migrate", "deploy"]

    environment = [
      { name = "NODE_ENV", value = "production" },
      {
        name  = "DATABASE_URL"
        value = "postgresql://${var.db_username}:${var.db_password}@${var.rds_endpoint}/${var.db_name}"
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project_name}/api"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])

  tags = { Name = "${var.project_name}-api-migrate-task" }
}
