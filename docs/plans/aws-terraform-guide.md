# AWS Services in Terraform — A Practical Guide

> This guide explains the most commonly used AWS services when deploying a real web application with Terraform. It focuses on **why** things work the way they do, not just **what** to type.

---

## Table of Contents

1. [How to Read This Guide](#how-to-read-this-guide)
2. [The Big Picture — How Services Connect](#the-big-picture)
3. [IAM — The Permission System](#iam)
4. [S3 — Object Storage](#s3)
5. [CloudFront — CDN](#cloudfront)
6. [S3 + CloudFront — Static Site Hosting](#s3--cloudfront-together)
7. [ECS — Container Orchestration](#ecs)
8. [ALB — Application Load Balancer](#alb)
9. [ECS + ALB — Running a Backend API](#ecs--alb-together)
10. [Cognito — User Authentication](#cognito)
11. [Common Mistakes and How to Avoid Them](#common-mistakes)

---

## How to Read This Guide

For each service, you'll see:

- **What it is** — plain English explanation
- **Key Terraform resources** — the `aws_*` blocks you'll write
- **Important fields** — marked as `REQUIRED` or `OPTIONAL (but you probably need it)`
- **What breaks if you get it wrong** — real consequences, not just theory
- **Code snippets** — only the parts that matter, not full boilerplate

---

## The Big Picture

Here's how these services fit together in a typical web application:

```
                        ┌─────────────┐
                        │  Route 53   │  (DNS)
                        └──────┬──────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
          ┌──────▼──────┐             ┌──────▼──────┐
          │ CloudFront  │             │     ALB     │
          │   (CDN)     │             │ (Load Bal.) │
          └──────┬──────┘             └──────┬──────┘
                 │                           │
          ┌──────▼──────┐             ┌──────▼──────┐
          │     S3      │             │    ECS      │
          │  (Static    │             │ (Containers │
          │   files)    │             │  running    │
          └─────────────┘             │  your API)  │
                                     └──────┬──────┘
                                            │
                                     ┌──────▼──────┐
                                     │     RDS     │
                                     │ (Database)  │
                                     └─────────────┘

          ┌─────────────┐
          │   Cognito   │  ← Handles user login/signup
          └─────────────┘     (used by both frontend & API)

          ┌─────────────┐
          │     IAM     │  ← Controls WHO can do WHAT
          └─────────────┘     (permissions for everything)
```

**The flow:**
1. User visits `app.example.com` → CloudFront serves the React/Next.js static build from S3
2. Frontend calls `api.example.com` → ALB routes the request to an ECS container running your NestJS API
3. Cognito handles login/signup → issues JWT tokens that the API validates
4. IAM ties it all together — every service needs permissions to talk to other services

---

## IAM — The Permission System

### What is it?

IAM (Identity and Access Management) is AWS's permission system. **Every single thing** in AWS needs IAM permissions to do anything. Think of it as the security guard that checks IDs at every door.

There are three core concepts:

| Concept | What it is | Real-world analogy |
|---------|-----------|-------------------|
| **Policy** | A document listing allowed/denied actions | A permission slip listing what you can do |
| **Role** | An identity that services can "wear" | A uniform that grants access to certain areas |
| **User/Group** | Human identities | Employee badges |

> **Key insight:** In Terraform, you almost never create IAM Users. You create **Roles** that AWS services assume. Your ECS container "wears" a role that lets it read from S3. Your Lambda "wears" a role that lets it write to DynamoDB.

### Key Terraform Resources

#### `aws_iam_role` — Creating a Role

```hcl
resource "aws_iam_role" "ecs_task_role" {
  name = "my-api-task-role"

  # This is the "trust policy" — WHO can wear this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"  # Only ECS tasks can use this role
      }
    }]
  })
}
```

**Fields breakdown:**

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `name` | REQUIRED | Unique name for the role | Terraform can't create it |
| `assume_role_policy` | REQUIRED | Defines WHO can use this role | **This is the #1 IAM mistake.** Without it, no service can assume the role. With the wrong principal, the wrong service gets access |

> **Why `assume_role_policy` matters so much:** This is like defining who is allowed to put on the uniform. If you set `Principal.Service = "ec2.amazonaws.com"` but you want ECS to use it, ECS will get "Access Denied" and your containers will fail to start. The error message will be cryptic — something like "unable to assume role" — and you'll spend hours debugging.

#### `aws_iam_policy` — Defining Permissions

```hcl
resource "aws_iam_policy" "s3_read" {
  name = "s3-read-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::my-bucket",       # The bucket itself (for ListBucket)
        "arn:aws:s3:::my-bucket/*"      # Objects inside (for GetObject)
      ]
    }]
  })
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `Effect` | REQUIRED | `Allow` or `Deny` | Defaults to deny (everything blocked) |
| `Action` | REQUIRED | What operations are allowed | Nothing is permitted |
| `Resource` | REQUIRED | Which specific AWS resources | `"*"` allows access to ALL resources (security risk). Always scope this down |

> **Common mistake:** Using `"Resource": "*"` because it's easier. This means your ECS task can read **every** S3 bucket in your account. In a production system, this is a security audit failure. Always specify the exact ARN.

#### `aws_iam_role_policy_attachment` — Connecting Role + Policy

```hcl
resource "aws_iam_role_policy_attachment" "ecs_s3" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.s3_read.arn
}
```

This is the glue. Without it, the role exists and the policy exists, but they're not connected — like having a key and a lock but never putting them together.

### IAM — The Two Roles ECS Needs

This confuses almost everyone:

```
┌──────────────────────────┐     ┌──────────────────────────┐
│   Task Execution Role    │     │      Task Role           │
│                          │     │                          │
│  Used BY AWS to:         │     │  Used BY YOUR CODE to:   │
│  • Pull Docker images    │     │  • Read from S3          │
│  • Write logs            │     │  • Send emails via SES   │
│  • Get secrets           │     │  • Access DynamoDB       │
│                          │     │                          │
│  Principal:              │     │  Principal:              │
│  ecs-tasks.amazonaws.com │     │  ecs-tasks.amazonaws.com │
└──────────────────────────┘     └──────────────────────────┘
```

- **Execution Role**: AWS needs this to set up your container (pull image, start logging). Without it, your container never starts.
- **Task Role**: Your application code uses this to access other AWS services. Without it, your API can't call S3/SES/etc.

---

## S3 — Object Storage

### What is it?

S3 (Simple Storage Service) is AWS's file storage. Think of it as a hard drive in the cloud, but:
- It's virtually unlimited in size
- Every file gets a URL
- You control who can access each file
- It can host static websites

**Common uses:**
- Hosting your React/Next.js build (static site hosting)
- Storing user uploads (profile pictures, documents)
- Storing logs, backups, data exports

### Key Terraform Resources

#### `aws_s3_bucket` — The Bucket

```hcl
resource "aws_s3_bucket" "frontend" {
  bucket = "my-app-frontend-prod"
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `bucket` | OPTIONAL but use it | Globally unique name | AWS auto-generates an ugly name like `terraform-20240315...`. Hard to identify later |

> **Important:** Bucket names are **globally unique across ALL AWS accounts worldwide**. `my-bucket` is probably taken. Use a naming convention like `{company}-{project}-{environment}` → `myco-ielts-prod`.

> **Gotcha:** By default, S3 blocks all public access. This is good for security but means your static site won't work until you explicitly configure public access.

#### `aws_s3_bucket_public_access_block` — Public Access Control

```hcl
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true   # Block public ACLs
  block_public_policy     = false  # Allow public bucket policies (needed for static hosting)
  ignore_public_acls      = true   # Ignore any public ACLs
  restrict_public_buckets = false  # Allow public bucket policies to work
}
```

> **Why are there 4 separate fields?** AWS added these over time as security layers. For static website hosting, you need `block_public_policy = false` so CloudFront (or users) can read your files. For private buckets (like user uploads), set ALL to `true`.

| Scenario | block_public_acls | block_public_policy | ignore_public_acls | restrict_public_buckets |
|----------|:-:|:-:|:-:|:-:|
| Static site (via CloudFront) | true | false | true | false |
| Private uploads | true | true | true | true |

#### `aws_s3_bucket_website_configuration` — Static Hosting

```hcl
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"  # For SPA routing — all 404s go to index.html
  }
}
```

| Field | Required? | Why it matters |
|-------|-----------|---------------|
| `index_document.suffix` | REQUIRED for website hosting | Without it, visiting the root URL shows an XML error instead of your app |
| `error_document.key` | OPTIONAL but critical for SPAs | Without it, navigating to `/tests/123` directly returns a 404 because S3 looks for a file at that path. Setting it to `index.html` lets your React router handle the URL |

#### `aws_s3_bucket_policy` — Who Can Read the Files

```hcl
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontAccess"
      Effect    = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}
```

> **Why not just make the bucket public?** You could, but then anyone can access your files directly via the S3 URL, bypassing CloudFront. This means:
> - No caching benefits
> - No HTTPS (S3 website endpoints are HTTP only)
> - No access logging
> - Higher costs (S3 data transfer > CloudFront)

---

## CloudFront — CDN

### What is it?

CloudFront is AWS's Content Delivery Network (CDN). It caches your files on servers around the world so users get fast load times regardless of their location.

```
Without CloudFront:
  User in Vietnam ──────── (300ms) ──────── S3 in us-east-1
                                            (slow!)

With CloudFront:
  User in Vietnam ── (20ms) ── CloudFront Edge in Singapore ── (cached) ── S3 in us-east-1
                               (fast! file is already here)
```

**Why use it even if all your users are in one region?**
- HTTPS support (S3 websites are HTTP-only)
- Custom domain names
- Caching reduces S3 costs
- DDoS protection (AWS Shield)
- Custom error pages

### Key Terraform Resources

#### `aws_cloudfront_distribution` — The Main Resource

This is one of the most complex Terraform resources. Here's the important parts:

```hcl
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = ["app.example.com"]  # Your custom domain
  price_class         = "PriceClass_100"     # Only use cheapest edge locations

  # Where CloudFront gets the files from
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3Origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # How CloudFront handles requests
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3Origin"

    # Use a managed cache policy (recommended over custom)
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"  # CachingOptimized

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  # Handle SPA routing — return index.html for 403/404
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  # SSL certificate
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
```

**Field-by-field breakdown:**

| Field | Required? | What it does | What happens if wrong |
|-------|-----------|-------------|----------------------|
| `enabled` | REQUIRED | Turns the distribution on/off | Set to `false` and nothing is served |
| `default_root_object` | OPTIONAL but critical | What file to serve at `/` | Users see an XML "Access Denied" error when visiting your root URL |
| `aliases` | OPTIONAL | Custom domain names | You can only access via the ugly `d1234.cloudfront.net` URL |
| `price_class` | OPTIONAL | Which edge locations to use | `PriceClass_All` (default) uses all 400+ locations worldwide — expensive. `PriceClass_100` uses only US/Europe — cheapest |
| `viewer_protocol_policy` | REQUIRED (in behavior) | HTTP/HTTPS handling | `"allow-all"` means unencrypted HTTP traffic is possible — security risk. Always use `"redirect-to-https"` |
| `compress` | OPTIONAL | Gzip/Brotli compression | Without it, files are served uncompressed — 3-5x larger, slower loads |

> **The `custom_error_response` block — why you NEED it for SPAs:**
> When a user navigates to `/tests/123`, CloudFront asks S3 for a file at `/tests/123`. That file doesn't exist (it's a client-side route), so S3 returns 403/404. Without `custom_error_response`, the user sees an error. WITH it, CloudFront returns `index.html` instead, and your React Router handles the URL.

#### `aws_cloudfront_origin_access_control` — Secure S3 Access

```hcl
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
```

This tells CloudFront to sign its requests to S3, so S3 knows the request is from your CloudFront distribution and not some random person. Combined with the S3 bucket policy, this means only CloudFront can read your files.

---

## S3 + CloudFront Together

Here's the complete connection pattern:

```
┌──────────────────────────────────────────────────┐
│                  CloudFront                       │
│                                                   │
│  origin {                                         │
│    domain_name = S3_BUCKET.bucket_domain_name     │──── connects to S3
│    origin_access_control_id = OAC.id              │──── uses OAC for auth
│  }                                                │
└──────────────────────────────────────────────────┘
         ▲                              │
         │                              ▼
    User Request               ┌──────────────────┐
    (HTTPS)                    │    S3 Bucket      │
                               │                   │
                               │  bucket_policy:   │
                               │    Principal:     │
                               │     cloudfront    │──── only allows CF
                               │    Condition:     │
                               │     SourceArn =   │
                               │     CF_DIST.arn   │
                               └──────────────────┘
```

**The chain of trust:**
1. CloudFront uses OAC to sign requests to S3
2. S3 bucket policy only allows requests from that specific CloudFront distribution
3. Result: Files are private in S3 but publicly accessible through CloudFront

---

## ECS — Container Orchestration

### What is it?

ECS (Elastic Container Service) runs Docker containers on AWS. Think of it as: "I have a Docker image, please run it for me and keep it running."

**Two launch types:**

| Launch Type | What it means | When to use |
|------------|---------------|-------------|
| **EC2** | You manage the servers (EC2 instances) that containers run on | Need GPU, specific instance types, cost optimization at scale |
| **Fargate** | AWS manages the servers — you just define CPU/memory | Simpler, good for most workloads, pay-per-use |

> This guide focuses on **EC2 launch type** since that's what your infrastructure uses.

### ECS Concepts (the hierarchy)

```
┌─────────────────────────────────────────────┐
│                 ECS Cluster                  │
│  (A logical grouping — like a "project")    │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │            ECS Service                   │ │
│  │  (Keeps N copies of your app running)   │ │
│  │                                          │ │
│  │  ┌──────────┐  ┌──────────┐             │ │
│  │  │  Task 1  │  │  Task 2  │  ← running  │ │
│  │  │ (container│  │(container│    copies   │ │
│  │  │  instance)│  │ instance)│             │ │
│  │  └──────────┘  └──────────┘             │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │     EC2 Instances (the servers)         │ │
│  │  (Registered to cluster via ECS Agent)  │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

Task Definition (the blueprint):
  - Which Docker image to use
  - How much CPU/memory
  - Environment variables
  - Port mappings
  - Which IAM roles
```

### Key Terraform Resources

#### `aws_ecs_cluster` — The Cluster

```hcl
resource "aws_ecs_cluster" "main" {
  name = "my-app-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"          # Optional: enables CloudWatch monitoring
  }
}
```

Simple but important — everything else lives inside a cluster.

#### `aws_ecs_task_definition` — The Blueprint

This is the most important ECS resource. It tells ECS HOW to run your container.

```hcl
resource "aws_ecs_task_definition" "api" {
  family                   = "my-api"
  network_mode             = "bridge"       # For EC2 launch type
  requires_compatibilities = ["EC2"]
  cpu                      = "512"          # 0.5 vCPU
  memory                   = "1024"         # 1 GB

  execution_role_arn = aws_iam_role.ecs_execution_role.arn  # For AWS to pull image
  task_role_arn      = aws_iam_role.ecs_task_role.arn       # For your code

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.api.repository_url}:latest"
    essential = true
    
    portMappings = [{
      containerPort = 4000
      hostPort      = 0        # Dynamic port mapping (important for EC2!)
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT",     value = "4000" },
      { name = "DATABASE_URL", value = "postgresql://..." }
    ]

    # Send container logs to CloudWatch
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/my-api"
        "awslogs-region"        = "ap-southeast-1"
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}
```

**Field-by-field breakdown:**

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `family` | REQUIRED | Names the task definition (groups revisions) | Can't create the definition |
| `network_mode` | OPTIONAL | How networking works | Defaults to `bridge` on EC2. Use `awsvpc` for Fargate. Wrong mode = containers can't communicate properly |
| `requires_compatibilities` | OPTIONAL but use it | Validates the config for your launch type | Without it, you might set configs that don't work on your launch type and only discover at deploy time |
| `cpu` / `memory` | Depends on launch type | Resource limits | Too low → OOM kills, crashes. Too high → wasted money. **No default** for Fargate (must specify) |
| `execution_role_arn` | REQUIRED in practice | Lets AWS pull your Docker image and write logs | Container fails to start with "unable to pull image" error |
| `task_role_arn` | OPTIONAL | Lets your code access AWS services | Your API gets "Access Denied" when trying to use S3, SES, etc. |
| `essential` | OPTIONAL (default true) | If this container dies, should the whole task stop? | If `false` and the container crashes, ECS won't restart it — silent failure |
| `hostPort = 0` | N/A | **Dynamic port mapping** — AWS picks a random port on the host | If you hardcode a port (e.g., `4000`), you can only run ONE task per EC2 instance. With `0`, ALB discovers the random port via service discovery |

> **The `hostPort = 0` trick:** This is critical for EC2 launch type. When you have 2 instances of your API on the same EC2 host, they can't both use port 4000. Setting `hostPort = 0` lets AWS assign random ports (e.g., 32768, 32769). The ALB automatically discovers these ports through ECS service integration.

> **Secrets management:** Don't put secrets in `environment`. Use `secrets` instead:
> ```hcl
> secrets = [
>   {
>     name      = "DATABASE_URL"
>     valueFrom = "arn:aws:ssm:region:account:parameter/my-app/database-url"
>   }
> ]
> ```
> This pulls values from SSM Parameter Store or Secrets Manager at runtime. The execution role needs `ssm:GetParameters` permission.

#### `aws_ecs_service` — The Runner

The service ensures your desired number of tasks are always running.

```hcl
resource "aws_ecs_service" "api" {
  name            = "api-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2                        # Run 2 copies
  launch_type     = "EC2"

  # Connect to ALB
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  # Prevent Terraform from fighting with auto-scaling
  lifecycle {
    ignore_changes = [desired_count]
  }

  # Wait for ALB to be ready
  depends_on = [aws_lb_listener.https]
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `desired_count` | OPTIONAL (default 1) | How many copies of your container to run | Only 1 instance = no redundancy. If it crashes, downtime until ECS restarts it |
| `load_balancer` | OPTIONAL | Registers tasks with ALB | ALB doesn't know about your containers — no traffic reaches them |
| `container_name` + `container_port` | REQUIRED (in load_balancer) | Which container and port to route to | ALB sends traffic to wrong container or port — 502 errors |
| `depends_on` | OPTIONAL but important | Ensures ALB listener exists before service starts | ECS tries to register with a target group that has no listener → service creation fails |

> **The `lifecycle` block:** If you use auto-scaling (and you should in production), auto-scaling changes `desired_count` outside of Terraform. Without `ignore_changes`, the next `terraform apply` would reset it back to whatever is in your code, undoing the auto-scaling.

#### EC2 Instances for ECS (Launch Template + Auto Scaling Group)

For EC2 launch type, you need actual servers. Here's the pattern:

```hcl
# Find the latest ECS-optimized AMI
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

resource "aws_launch_template" "ecs" {
  name_prefix   = "ecs-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = "t3.medium"

  # This is how the EC2 instance knows which cluster to join
  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
  EOF
  )

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name  # Needs ecsInstanceRole
  }

  vpc_security_group_ids = [aws_security_group.ecs_instances.id]
}

resource "aws_autoscaling_group" "ecs" {
  desired_capacity = 2
  max_size         = 4
  min_size         = 1

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tag {
    key                 = "AmazonECSManaged"
    value               = true
    propagate_at_launch = true
  }
}
```

> **Critical: The `user_data` script.** This single line tells the EC2 instance which ECS cluster to join. Without it, the instance starts but ECS doesn't know it exists — your tasks have nowhere to run. This is the #1 reason for "service my-service was unable to place a task" errors.

> **Why use an ECS-optimized AMI?** These AMIs come with the ECS Agent pre-installed. The ECS Agent is the software that communicates with the ECS control plane. Using a regular Ubuntu AMI means you'd have to install and configure the agent yourself.

---

## ALB — Application Load Balancer

### What is it?

An Application Load Balancer distributes incoming traffic across multiple targets (your ECS tasks). It operates at Layer 7 (HTTP/HTTPS), meaning it understands URLs, headers, and cookies.

```
                    ┌─────────────────────────────┐
                    │            ALB              │
                    │                              │
User ── HTTPS ────▶│  Listener (port 443)         │
                    │    │                         │
                    │    ├─ Rule: /api/* ──▶ TG 1  │──▶ ECS API tasks
                    │    │                         │
                    │    └─ Rule: default ──▶ TG 2 │──▶ ECS Web tasks
                    │                              │
                    └─────────────────────────────┘

TG = Target Group (a pool of targets that receive traffic)
```

### Key Terraform Resources

#### `aws_lb` — The Load Balancer itself

```hcl
resource "aws_lb" "main" {
  name               = "my-app-alb"
  internal           = false           # Internet-facing
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `internal` | OPTIONAL (default false) | Whether ALB is internet-facing or internal | `true` means only accessible from within VPC — public users can't reach it |
| `load_balancer_type` | OPTIONAL (default "application") | ALB vs NLB | NLB is Layer 4 (TCP) — doesn't understand HTTP, can't route by path |
| `subnets` | REQUIRED | Which subnets the ALB lives in | **Must be in at least 2 AZs.** Must be PUBLIC subnets for internet-facing ALB. Wrong subnets = unreachable |
| `security_groups` | OPTIONAL but always use | Firewall rules | Without SG, or with wrong rules, traffic is blocked |

> **Subnet gotcha:** The ALB needs to be in **public** subnets (with an internet gateway). Your ECS tasks should be in **private** subnets. The ALB bridges the gap.

#### `aws_lb_target_group` — The Pool of Targets

```hcl
resource "aws_lb_target_group" "api" {
  name        = "api-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"         # For EC2 launch type

  health_check {
    path                = "/api/health"
    healthy_threshold   = 2        # Pass 2 checks = healthy
    unhealthy_threshold = 3        # Fail 3 checks = unhealthy
    timeout             = 5
    interval            = 30
    matcher             = "200"    # Expected HTTP status
  }
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `target_type` | OPTIONAL | `"instance"` for EC2, `"ip"` for Fargate | Wrong type = targets never register properly |
| `health_check.path` | OPTIONAL (default `/`) | URL the ALB checks to verify your app is alive | If your app doesn't respond on `/`, all targets marked unhealthy → 503 errors |
| `health_check.matcher` | OPTIONAL (default `"200"`) | Expected HTTP status code | If your health endpoint returns 204 or 302, ALB thinks it's unhealthy |
| `health_check.interval` | OPTIONAL (default 30) | Seconds between checks | Too frequent = unnecessary load. Too slow = slow to detect failures |

> **The health check is the most important part of the target group.** If the health check fails, the ALB removes the target and no traffic flows to it. The #1 debugging step for "all targets unhealthy" is:
> 1. Can you curl the health check path from the container?
> 2. Is the security group allowing traffic from ALB to the container port?
> 3. Does the health check path return the expected status code?

#### `aws_lb_listener` — What the ALB Listens For

```hcl
# HTTPS listener (the main one)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.api.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP listener — redirect to HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `certificate_arn` | REQUIRED for HTTPS | SSL certificate from ACM | HTTPS doesn't work — users see certificate errors |
| `ssl_policy` | OPTIONAL but important | Which TLS versions to allow | Default may allow old TLS 1.0 — security vulnerability |
| `default_action` | REQUIRED | What to do with incoming requests | Listener has no routing — returns 503 |

> **Always create both listeners.** The HTTP listener (port 80) should redirect to HTTPS. Without it, users who type `http://api.example.com` get "connection refused" instead of being redirected.

---

## ECS + ALB Together

Here's how ECS and ALB are wired together:

```
┌───────────────────────────────────────────────────────┐
│                        ALB                             │
│                                                        │
│  Listener :443 ──▶ Target Group (api-tg)              │
│                         │                              │
│                         │ health_check: /api/health    │
│                         │ target_type: instance        │
└─────────────────────────┼─────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────┐
│                    ECS Service                         │
│                                                        │
│  load_balancer {                                       │
│    target_group_arn = api-tg                           │──── registers tasks
│    container_name   = "api"                            │     with target group
│    container_port   = 4000                             │
│  }                                                     │
│                                                        │
│  ┌──────────────┐     ┌──────────────┐                │
│  │ Task 1       │     │ Task 2       │                │
│  │ :4000 → :327│     │ :4000 → :327│                │
│  │          68  │     │          69  │                │
│  └──────────────┘     └──────────────┘                │
│  (container port)     (dynamic host ports)            │
└───────────────────────────────────────────────────────┘
```

**The flow:**
1. ECS Service creates tasks and tells the ALB "here are my tasks and their ports"
2. ALB registers them in the target group
3. ALB health-checks each task
4. Healthy tasks receive traffic
5. If a task crashes, ECS starts a new one. ALB detects it via health check and routes traffic to the new one.

**Security Groups needed:**

```hcl
# ALB security group — allow internet traffic
resource "aws_security_group" "alb" {
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Allow from anywhere
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ECS instances security group — ONLY allow traffic from ALB
resource "aws_security_group" "ecs_instances" {
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]  # Only from ALB!
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

> **Why the ECS ingress port range is 0-65535:** Because of dynamic port mapping (`hostPort = 0`), we don't know which port ECS will assign. So we allow ALL ports, but ONLY from the ALB security group. This is secure because only the ALB can initiate connections to ECS instances.

---

## Cognito — User Authentication

### What is it?

Cognito is AWS's managed authentication service. Instead of building login/signup/password-reset yourself, Cognito handles it. It provides:
- User registration and login
- Email/phone verification
- Social login (Google, Facebook, etc.)
- JWT token issuance and validation
- Multi-factor authentication (MFA)

```
┌──────────┐     ┌──────────────────┐     ┌──────────┐
│ Frontend │────▶│ Cognito Hosted UI│────▶│ Frontend │
│ (login   │     │ (or custom UI)   │     │ (with    │
│  button) │     │                  │     │  tokens) │
└──────────┘     └──────────────────┘     └────┬─────┘
                                               │
                                               │ JWT token in header
                                               ▼
                                          ┌──────────┐
                                          │   API    │
                                          │ (validates│
                                          │  token)  │
                                          └──────────┘
```

### Key Terraform Resources

#### `aws_cognito_user_pool` — The User Directory

```hcl
resource "aws_cognito_user_pool" "main" {
  name = "my-app-users"

  # How users sign in
  username_attributes = ["email"]     # Users log in with email (not username)
  
  # Auto-verify email
  auto_verified_attributes = ["email"]

  # Password rules
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false       # Be reasonable — don't torture your users
    require_uppercase = true
  }

  # What information to collect about users
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `username_attributes` | OPTIONAL | How users identify themselves | Default is `username` — users need a separate username. Most modern apps use `["email"]` |
| `auto_verified_attributes` | OPTIONAL | Skip manual verification | Without it, users must click a verification link before they can log in. Good for production, annoying for development |
| `password_policy` | OPTIONAL | Password requirements | Default is all-required + 8 chars. Users will complain about requiring symbols |
| `schema` | OPTIONAL | Custom attributes | After creation, **you cannot delete schema attributes.** Plan carefully. You CAN add new ones later |

> **Major gotcha:** Once a User Pool is created, many settings **cannot be changed** without destroying and recreating it (which deletes all users). This includes: `username_attributes`, `schema` attributes, and `alias_attributes`. Plan these carefully before your first `terraform apply`.

#### `aws_cognito_user_pool_client` — The App Connection

```hcl
resource "aws_cognito_user_pool_client" "web" {
  name         = "web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # OAuth settings for hosted UI
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true
  
  callback_urls = [
    "https://app.example.com/auth/callback",
    "http://localhost:3000/auth/callback"     # For local development
  ]
  
  logout_urls = [
    "https://app.example.com/login",
    "http://localhost:3000/login"
  ]

  supported_identity_providers = ["COGNITO"]  # Add "Google" etc. for social login

  # Token validity
  access_token_validity  = 1    # hours
  id_token_validity      = 1    # hours
  refresh_token_validity = 30   # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # IMPORTANT: Don't generate a client secret for SPAs
  generate_secret = false
}
```

| Field | Required? | What it does | What breaks without it |
|-------|-----------|-------------|----------------------|
| `callback_urls` | REQUIRED for OAuth | Where Cognito redirects after login | Login works but redirect fails — user stuck on Cognito page |
| `generate_secret` | OPTIONAL (default false) | Create a client secret | **Must be `false` for browser/SPA apps** (JavaScript can't securely store secrets). Must be `true` for server-side apps |
| `allowed_oauth_flows` | OPTIONAL | `"code"` (recommended) or `"implicit"` | `"implicit"` is less secure — tokens in URL. Always use `"code"` |
| `access_token_validity` | OPTIONAL | How long tokens last | Default is 1 hour. Too short = users re-login constantly. Too long = security risk |

#### `aws_cognito_user_pool_domain` — The Login URL

```hcl
# Option 1: Cognito-hosted domain (easy, ugly URL)
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "my-app-auth"                    # → my-app-auth.auth.region.amazoncognito.com
  user_pool_id = aws_cognito_user_pool.main.id
}

# Option 2: Custom domain (professional, requires ACM cert)
resource "aws_cognito_user_pool_domain" "custom" {
  domain          = "auth.example.com"
  certificate_arn = aws_acm_certificate.auth.arn
  user_pool_id    = aws_cognito_user_pool.main.id
}
```

### Cognito + Your API — Token Validation

Your NestJS API needs to validate Cognito JWT tokens. Here's the connection:

```
Frontend                    Cognito                     API
   │                          │                          │
   │──── Login ──────────────▶│                          │
   │◀─── JWT tokens ─────────│                          │
   │                          │                          │
   │──── API request ─────────────────────────────────▶│
   │     (Authorization: Bearer <access_token>)         │
   │                          │                          │
   │                          │◀── Fetch JWKS ──────────│
   │                          │──── Public keys ────────▶│
   │                          │                          │
   │                          │    (validates signature) │
   │◀──── API response ───────────────────────────────│
```

The API validates tokens by:
1. Fetching Cognito's public keys (JWKS) from `https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json`
2. Verifying the token signature matches
3. Checking the token hasn't expired
4. Checking the `aud` (audience) claim matches the client ID

---

## Common Mistakes and How to Avoid Them

### 1. Security Groups — The Silent Killer

**Symptom:** "Everything deployed successfully but nothing works"

```
Most common cause:
  ALB ──✗──▶ ECS (security group doesn't allow ALB → ECS traffic)
  ECS ──✗──▶ RDS (security group doesn't allow ECS → RDS traffic)
```

**Fix:** Always check security groups first. Use the chain:
```
Internet → ALB SG (allow 80/443 from 0.0.0.0/0)
       → ECS SG (allow dynamic ports from ALB SG)
       → RDS SG (allow 5432 from ECS SG)
```

### 2. IAM — Permission Errors That Don't Say "Permission"

**Symptom:** Cryptic errors like "unable to pull secrets or registry auth"

**Cause:** The ECS execution role is missing permissions for ECR (image pulling) or CloudWatch (logging).

**Fix:** Always attach the `AmazonECSTaskExecutionRolePolicy` managed policy to your execution role:

```hcl
resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
```

### 3. Subnets — Public vs Private Confusion

```
Public Subnet:                     Private Subnet:
  - Has route to Internet Gateway    - Has route to NAT Gateway
  - ALB goes here                    - ECS instances go here
  - NAT Gateway goes here            - RDS goes here
  - Bastion hosts go here            - ElastiCache goes here
```

**Mistake:** Putting ECS instances in public subnets. They're directly exposed to the internet — security risk.

**Mistake:** Putting ALB in private subnets. Internet users can't reach it.

### 4. Terraform State — Don't Lose It

**Symptom:** `terraform apply` tries to create resources that already exist.

**Cause:** State file was lost, corrupted, or multiple people running Terraform locally.

**Fix:** Always use remote state (S3 + DynamoDB for locking):

```hcl
terraform {
  backend "s3" {
    bucket         = "my-app-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

### 5. ACM Certificates — Region Matters

**Gotcha:** CloudFront requires ACM certificates in `us-east-1`, regardless of where your other resources are.

```hcl
# Certificate for CloudFront — MUST be in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = "app.example.com"
  validation_method = "DNS"
}

# Certificate for ALB — can be in your normal region
resource "aws_acm_certificate" "api" {
  domain_name       = "api.example.com"
  validation_method = "DNS"
}
```

### 6. Terraform Dependency Cycles

**Symptom:** `Error: Cycle` in terraform plan

**Cause:** Resource A references Resource B, and Resource B references Resource A.

**Example:** Security group A allows traffic from SG B, and SG B allows traffic from SG A.

**Fix:** Use `aws_security_group_rule` as separate resources instead of inline rules:

```hcl
resource "aws_security_group" "a" {
  name   = "sg-a"
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "b" {
  name   = "sg-b"
  vpc_id = aws_vpc.main.id
}

# Separate rule resources break the cycle
resource "aws_security_group_rule" "a_to_b" {
  type                     = "ingress"
  security_group_id        = aws_security_group.b.id
  source_security_group_id = aws_security_group.a.id
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
}
```

---

## Quick Reference — Service Connections

| From | To | How they connect | Terraform field |
|------|-----|-----------------|-----------------|
| CloudFront | S3 | Origin + OAC | `origin.domain_name`, `origin_access_control_id` |
| S3 | CloudFront | Bucket policy allowing CF | `aws_s3_bucket_policy` with CloudFront principal |
| ALB | ECS | Target group + Service | `aws_ecs_service.load_balancer.target_group_arn` |
| ECS Task | Any AWS service | Task Role | `aws_ecs_task_definition.task_role_arn` |
| ECS (setup) | ECR + Logs | Execution Role | `aws_ecs_task_definition.execution_role_arn` |
| EC2 | ECS Cluster | User data script | `ECS_CLUSTER=cluster-name` in user_data |
| Cognito | Frontend | Client + Callback URLs | `aws_cognito_user_pool_client.callback_urls` |
| API | Cognito | JWKS validation | Cognito JWKS endpoint (not Terraform — runtime config) |

---

## What to Learn Next

1. **VPC Networking** — Subnets, NAT Gateways, Route Tables (the foundation everything sits on)
2. **ECR** — Where your Docker images live (referenced by ECS task definitions)
3. **Route 53** — DNS records pointing to CloudFront and ALB
4. **SSM Parameter Store** — Secure secrets management (referenced by ECS task secrets)
5. **Auto Scaling** — ECS Service auto-scaling + EC2 auto-scaling (keep costs in check)
6. **CI/CD with GitHub Actions** — Automate `terraform plan/apply` and ECS deployments
