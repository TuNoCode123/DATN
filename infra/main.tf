# =============================================================================
# ROOT main.tf — The "orchestrator" that wires all modules together
# =============================================================================
#
# HOW TERRAFORM MODULES WORK:
# ---------------------------
# A "module" is a reusable folder of .tf files. Think of it like a function:
#   - Input:  variables (arguments you pass in)
#   - Logic:  resources defined inside the module
#   - Output: values the module returns (like a function's return value)
#
# This root main.tf calls each module and passes data between them.
# For example: the networking module creates a VPC and outputs its ID,
# then the ECS module receives that VPC ID as input.
#
# Data flows like a pipeline:
#   networking (creates VPC) → outputs vpc_id → ECS (uses vpc_id)
#   acm (creates SSL cert) → outputs cert_arn → ALB (uses cert_arn)
#   ecr (creates repos)    → outputs repo_url → ECS (uses repo_url)
#
# ORDER OF CREATION:
# Terraform automatically figures out the correct order based on dependencies.
# If module B uses an output from module A, Terraform creates A first.
# You don't need to worry about ordering — just wire the outputs to inputs.
# =============================================================================

# -----------------------------------------------------------------------------
# Terraform settings — version constraints and required providers
# -----------------------------------------------------------------------------
terraform {
  # Minimum Terraform CLI version needed to run this code
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws" # Official AWS provider from HashiCorp registry
      version = "~> 5.0"        # Any 5.x version (not 6.0)
    }
  }
}

# -----------------------------------------------------------------------------
# AWS Provider — DEFAULT region (ap-southeast-2 / Sydney)
# -----------------------------------------------------------------------------
# This is the "default" provider. Any resource without an explicit provider
# will be created in this region.
provider "aws" {
  region = var.aws_region # "ap-southeast-2" (from variables.tf)

  # default_tags: these tags are automatically added to EVERY resource
  # Tags help with:
  #   - Cost tracking: filter AWS billing by "Project = ielts-ai-platform"
  #   - Organization: find all resources for this project in AWS Console
  #   - Automation: scripts can target resources by tag
  default_tags {
    tags = {
      Project     = "ielts-ai-platform"
      ManagedBy   = "terraform"       # So humans know not to edit manually
      Environment = var.environment    # "prod"
    }
  }
}

# -----------------------------------------------------------------------------
# AWS Provider — us-east-1 (required for CloudFront ACM certificate)
# -----------------------------------------------------------------------------
# CloudFront is a GLOBAL service, but it requires SSL certificates to be in
# the us-east-1 (N. Virginia) region. This is an AWS-specific requirement.
# We use "alias" to create a second provider config for that region.
# Any resource that needs us-east-1 will specify: providers = { aws = aws.us_east_1 }
provider "aws" {
  alias  = "us_east_1"  # Name for this provider config (used when calling modules)
  region = "us-east-1"  # N. Virginia — required for CloudFront certs

  default_tags {
    tags = {
      Project     = "ielts-ai-platform"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# =============================================================================
# MODULE CALLS — Each module creates a group of related resources
# =============================================================================

# -----------------------------------------------------------------------------
# 1. DNS — Look up the existing Route 53 hosted zone
# -----------------------------------------------------------------------------
# We don't CREATE the hosted zone (it already exists from domain registration).
# This module uses a "data source" to LOOK UP the zone ID, which other
# modules need for creating DNS records and validating SSL certificates.
module "dns" {
  source      = "./modules/dns"       # Path to the module's folder
  domain_name = var.domain_name       # "neu-study.online"
}

# -----------------------------------------------------------------------------
# 2. ACM — SSL certificate for ALB (ap-southeast-2)
# -----------------------------------------------------------------------------
# ACM = AWS Certificate Manager — provides free SSL/TLS certificates.
# This creates a wildcard cert: *.neu-study.online
# A wildcard cert works for ANY subdomain (api., web., admin., etc.)
# The cert is validated via DNS — ACM creates a special DNS record in Route 53,
# and when it sees the record, it knows you own the domain.
module "acm" {
  source      = "./modules/acm"
  domain_name = var.domain_name       # "neu-study.online" → cert for *.neu-study.online
  zone_id     = module.dns.zone_id    # Route 53 zone ID for DNS validation
  # This cert is created in ap-southeast-2 (default provider region)
  # Used by: ALB (for api.neu-study.online HTTPS)
}

# -----------------------------------------------------------------------------
# 3. ACM for CloudFront — SSL certificate (us-east-1, required!)
# -----------------------------------------------------------------------------
# CloudFront REQUIRES its SSL certificate to be in us-east-1.
# We use the same ACM module but with a different provider.
# "providers = { aws = aws.us_east_1 }" overrides the default region.
module "acm_cloudfront" {
  source      = "./modules/acm"
  domain_name = var.domain_name
  zone_id     = module.dns.zone_id

  # This is how you pass a different AWS provider to a module
  # The module will create all its resources in us-east-1 instead of ap-southeast-2
  providers = {
    aws = aws.us_east_1
  }
}

# -----------------------------------------------------------------------------
# 4. Networking — VPC, subnets, gateways, route tables, security groups
# -----------------------------------------------------------------------------
# This is the FOUNDATION. Everything else lives inside this network.
# Creates:
#   - VPC (Virtual Private Cloud) — your isolated network in AWS
#   - Public subnets (for ALB and NAT Gateway — accessible from internet)
#   - Private subnets (for ECS, RDS, Redis — NOT accessible from internet)
#   - Internet Gateway (lets public subnets reach the internet)
#   - NAT Gateway (lets private subnets reach the internet for pulling images)
#   - Route tables (traffic rules: "where does each packet go?")
#   - Security groups (firewalls: "who can talk to whom on which ports?")
module "networking" {
  source       = "./modules/networking"
  project_name = var.project_name   # "ielts-ai" — used as name prefix
  environment  = var.environment    # "prod"
  aws_region   = var.aws_region     # "ap-southeast-2"
  my_ip        = var.my_ip          # Your IP for SSH access (e.g., "1.2.3.4/32")
}

# -----------------------------------------------------------------------------
# 5. ECR — Container registries (Docker image storage)
# -----------------------------------------------------------------------------
# ECR = Elastic Container Registry — AWS's Docker Hub equivalent.
# Creates private repositories to store our Docker images:
#   - ielts-ai-api (NestJS backend)
#   - ielts-ai-web (Next.js frontend)
# GitHub Actions builds images → pushes to ECR → ECS pulls from ECR.
module "ecr" {
  source       = "./modules/ecr"
  project_name = var.project_name
}

# -----------------------------------------------------------------------------
# 6. RDS — Managed PostgreSQL database
# -----------------------------------------------------------------------------
# RDS = Relational Database Service — AWS manages the database server for you.
# Handles: backups, patching, monitoring, encryption, failover.
# We just connect to it like any PostgreSQL server.
module "rds" {
  source            = "./modules/rds"
  project_name      = var.project_name
  environment       = var.environment
  db_name           = var.db_name           # "ielts_platform"
  db_username       = var.db_username       # "ielts_user"
  db_password       = var.db_password       # From terraform.tfvars (secret!)
  db_instance_class = var.db_instance_class # "db.t3.micro"

  # These come from the networking module's outputs:
  private_subnet_ids    = module.networking.private_subnet_ids    # Where RDS lives
  rds_security_group_id = module.networking.rds_security_group_id # Firewall rules
}

# -----------------------------------------------------------------------------
# 7. ElastiCache — Managed Redis (for chat WebSocket + presence)
# -----------------------------------------------------------------------------
# ElastiCache = AWS's managed Redis/Memcached service.
# We use Redis for:
#   1. Socket.IO Redis Adapter — syncs WebSocket events across multiple ECS tasks
#   2. User presence — "is this user online?" (TTL 120s, refreshed by heartbeat)
#   3. Room membership — "who's currently in this chat room?" (Redis SET)
#   4. Typing indicators — "user X is typing..." (TTL 3s, auto-expires)
#   5. Unread counts — fast increment counter per user per conversation
module "elasticache" {
  source             = "./modules/elasticache"
  project_name       = var.project_name
  environment        = var.environment
  node_type          = var.redis_node_type  # "cache.t3.micro"

  private_subnet_ids      = module.networking.private_subnet_ids
  redis_security_group_id = module.networking.redis_security_group_id
}

# -----------------------------------------------------------------------------
# 8. ALB — Application Load Balancer (traffic routing)
# -----------------------------------------------------------------------------
# ALB sits in public subnets and distributes incoming HTTPS traffic to the
# correct ECS service based on the hostname:
#   - api.neu-study.online → API target group (NestJS on port 4000)
#   - * (default)          → Web target group (Next.js on port 3000)
# Also handles: SSL termination, health checks, HTTP→HTTPS redirect,
# sticky sessions (required for Socket.IO WebSocket handshake).
module "alb" {
  source            = "./modules/alb"
  project_name      = var.project_name
  vpc_id            = module.networking.vpc_id
  public_subnet_ids = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  acm_certificate_arn   = module.acm.certificate_arn   # SSL cert for HTTPS
  api_domain            = "api.${var.domain_name}"      # "api.neu-study.online"
}

# -----------------------------------------------------------------------------
# 9. Cognito — User authentication (User Pool, Google social login, Lambda)
# -----------------------------------------------------------------------------
# Creates:
#   - Cognito User Pool (email-based sign-in, optional MFA)
#   - Google social identity provider
#   - Frontend app client (public, PKCE for SPA)
#   - Backend app client (confidential, machine-to-machine)
#   - User groups (Admin, Student)
#   - Pre-Sign-Up Lambda for account linking
module "cognito" {
  source                = "./modules/cognito"
  project_name          = var.project_name
  environment           = var.environment
  aws_region            = var.aws_region
  frontend_url          = var.frontend_url
  cognito_domain_prefix = var.cognito_domain_prefix
  google_client_id      = var.google_client_id
  google_client_secret  = var.google_client_secret
  mfa_configuration     = var.mfa_configuration
  pre_signup_lambda_zip = var.pre_signup_lambda_zip
}

# -----------------------------------------------------------------------------
# 10. ECS — Container orchestration (the biggest module)
# -----------------------------------------------------------------------------
# NOTE: Cognito values (user_pool_id, client IDs, domain) are automatically
# wired from module.cognito outputs — no manual secrets needed.
# -----------------------------------------------------------------------------
# ECS = Elastic Container Service — runs Docker containers on EC2 instances.
# Creates:
#   - ECS Cluster (logical grouping of services)
#   - EC2 Auto Scaling Group (the actual servers running containers)
#   - Launch Template (configuration for each EC2 instance)
#   - Capacity Provider (connects ASG to ECS for auto-scaling)
#   - API Task Definition (Docker config for NestJS)
#   - Web Task Definition (Docker config for Next.js)
#   - API Service (keeps desired number of API tasks running)
#   - Web Service (keeps desired number of Web tasks running)
#   - IAM Roles (permissions for EC2 instances and ECS tasks)
#   - CloudWatch Log Groups (where container logs are stored)
module "ecs" {
  source             = "./modules/ecs"
  project_name       = var.project_name
  environment        = var.environment
  aws_region         = var.aws_region
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id
  instance_type      = var.ecs_instance_type  # "t3.medium"
  key_name           = var.key_name            # SSH key pair (optional)

  # Target groups from ALB — ECS registers its containers here
  api_target_group_arn = module.alb.api_target_group_arn
  web_target_group_arn = module.alb.web_target_group_arn

  # Container image URLs from ECR
  ecr_api_url = module.ecr.api_repository_url  # e.g., "123456789.dkr.ecr.ap-southeast-2.amazonaws.com/ielts-ai-api"
  ecr_web_url = module.ecr.web_repository_url

  # Database and Redis connection info — passed as environment variables to containers
  rds_endpoint   = module.rds.endpoint           # "ielts-ai-postgres.xxx.rds.amazonaws.com"
  redis_endpoint = module.elasticache.endpoint    # "ielts-ai-redis.xxx.cache.amazonaws.com:6379"
  db_name        = var.db_name
  db_username    = var.db_username
  db_password    = var.db_password

  # Cognito config — wired from the cognito module outputs
  cognito_user_pool_id       = module.cognito.user_pool_id
  cognito_client_id          = module.cognito.backend_client_id
  cognito_frontend_client_id = module.cognito.frontend_client_id
  cognito_domain             = module.cognito.cognito_domain

  # S3 bucket name for presigned URLs
  s3_bucket_name = module.s3.uploads_bucket_name
}

# -----------------------------------------------------------------------------
# 11. S3 — File storage buckets
# -----------------------------------------------------------------------------
# Creates S3 buckets for:
#   - User uploads (audio recordings, images) — accessed via presigned URLs
#   - Static assets (shared media files)
module "s3" {
  source       = "./modules/s3"
  project_name = var.project_name
  environment  = var.environment
}

# -----------------------------------------------------------------------------
# 12. CloudFront — CDN for the web frontend
# -----------------------------------------------------------------------------
# CloudFront is a Content Delivery Network (CDN) — caches content at edge
# locations worldwide for faster loading.
# Only used for web.neu-study.online (NOT for the API — WebSocket needs direct ALB).
# Behaviors:
#   /_next/static/* → cached 365 days (hashed filenames = immutable)
#   /* (default)    → no cache (SSR pages must hit the server every time)
module "cloudfront" {
  source          = "./modules/cloudfront"
  project_name    = var.project_name
  web_domain      = "web.${var.domain_name}"  # "web.neu-study.online"
  alb_dns_name    = module.alb.dns_name       # ALB's hostname (CloudFront's origin)
  acm_certificate_arn = module.acm_cloudfront.certificate_arn  # Must be us-east-1 cert!
}

# -----------------------------------------------------------------------------
# 13. DNS Records — Route 53 A records pointing to ALB and CloudFront
# -----------------------------------------------------------------------------
# Creates alias records:
#   api.neu-study.online → ALB (direct, for WebSocket compatibility)
#   web.neu-study.online → CloudFront (cached, for static asset performance)
#
# "Alias" records are AWS-specific — they work like CNAME but at the zone apex
# and don't incur extra DNS query costs.
module "dns_records" {
  source         = "./modules/dns-records"
  domain_name    = var.domain_name
  zone_id        = module.dns.zone_id

  # ALB details for api.neu-study.online
  alb_dns_name   = module.alb.dns_name
  alb_zone_id    = module.alb.zone_id

  # CloudFront details for web.neu-study.online
  cloudfront_domain  = module.cloudfront.domain_name
  cloudfront_zone_id = module.cloudfront.hosted_zone_id
}

# -----------------------------------------------------------------------------
# 14. IAM — GitHub Actions OIDC role for CI/CD
# -----------------------------------------------------------------------------
# Creates an IAM role that GitHub Actions can assume via OIDC (no access keys!).
# This role has permissions to:
#   - Push images to ECR
#   - Deploy ECS services
#   - Run Terraform (for infra changes)
module "iam" {
  source       = "./modules/iam"
  project_name = var.project_name
  github_org   = var.github_org    # "royden"
  github_repo  = var.github_repo   # "ielts-ai-platform"
  ecr_arns     = module.ecr.repository_arns  # ECR repo ARNs for push permissions
}

# =============================================================================
# FUTURE MODULES (uncomment when needed)
# =============================================================================
# module "messaging" { ... }   # SNS topics + SQS queues for async processing
# module "lambda" { ... }      # Lambda workers (email, notifications, file processing)
# module "monitoring" { ... }  # CloudWatch alarms + dashboard
