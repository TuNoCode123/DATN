# =============================================================================
# NETWORKING MODULE — VPC, Subnets, Gateways, Route Tables, Security Groups
# =============================================================================
#
# This is the FOUNDATION of all AWS infrastructure. Every other resource
# (ECS, RDS, Redis, ALB) lives inside this network.
#
# NETWORK ARCHITECTURE:
# ---------------------
#
#   Internet
#      │
#      ▼
#   ┌──────────────── VPC (10.0.0.0/16) ────────────────┐
#   │                                                     │
#   │  PUBLIC SUBNETS (10.0.1.0/24 + 10.0.2.0/24)       │
#   │  ├── ALB (receives all HTTPS traffic)               │
#   │  ├── NAT Gateway (outbound internet for private)    │
#   │  └── Internet Gateway (connects VPC to internet)    │
#   │                                                     │
#   │  PRIVATE SUBNETS (10.0.10.0/24 + 10.0.11.0/24)    │
#   │  ├── ECS EC2 instances (run containers)             │
#   │  ├── RDS PostgreSQL (database)                      │
#   │  └── ElastiCache Redis (chat pub/sub + cache)       │
#   │                                                     │
#   └─────────────────────────────────────────────────────┘
#
# WHY PUBLIC + PRIVATE?
# - Public: resources that NEED direct internet access (ALB receives requests)
# - Private: resources that should NOT be directly reachable (DB, app servers)
# - Private subnets reach internet OUTBOUND via NAT Gateway (for pulling Docker images)
#   but nothing from the internet can initiate a connection INTO private subnets.
#
# WHY 2 SUBNETS EACH (a + b)?
# - AWS ALB requires subnets in at least 2 Availability Zones (AZs)
# - AZs are physically separate data centers within a region
# - If AZ-a has a power outage, AZ-b still works → high availability
# =============================================================================

# =============================================================================
# VPC — Virtual Private Cloud
# =============================================================================
# A VPC is your own isolated network within AWS. It's like having your own
# private data center in the cloud. Nothing outside can see inside unless
# you explicitly allow it.
#
# CIDR block: 10.0.0.0/16 means:
#   - "10.0" is the network prefix
#   - "/16" means the first 16 bits are fixed → 65,536 available IP addresses
#   - Range: 10.0.0.0 to 10.0.255.255
#   - This is a "private" IP range (RFC 1918) — not routable on the internet
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16" # IP address range for the entire VPC

  # DNS settings — required for RDS, ElastiCache, and other AWS services
  # to resolve their hostnames within the VPC
  enable_dns_hostnames = true # Instances get DNS hostnames (e.g., ip-10-0-1-5.ec2.internal)
  enable_dns_support   = true # VPC has a built-in DNS resolver

  tags = { Name = "${var.project_name}-vpc" }
}

# =============================================================================
# INTERNET GATEWAY (IGW) — Connects VPC to the internet
# =============================================================================
# Without an IGW, nothing in the VPC can reach the internet (or be reached).
# The IGW is attached to the VPC and referenced in public subnet route tables.
# Think of it as the "front door" of your data center.
#
# Only PUBLIC subnets route through the IGW. Private subnets use NAT instead.
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id # Attach this IGW to our VPC

  tags = { Name = "${var.project_name}-igw" }
}

# =============================================================================
# PUBLIC SUBNETS — For ALB and NAT Gateway
# =============================================================================
# A subnet is a subdivision of the VPC's IP range. Each subnet lives in
# exactly ONE Availability Zone (AZ).
#
# "Public" means: instances in this subnet get public IPs and can be
# reached from the internet (if security group allows it).
#
# CIDR: 10.0.1.0/24 → 256 IPs (10.0.1.0 to 10.0.1.255)
#   - AWS reserves 5 IPs per subnet, so 251 usable IPs
# =============================================================================

# Public subnet in Availability Zone A (e.g., ap-southeast-2a)
resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"             # 256 IPs for this subnet
  availability_zone = "${var.aws_region}a"       # e.g., "ap-southeast-2a"

  # Instances launched here automatically get a public IP address
  # This is what makes it a "public" subnet (along with IGW routing)
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public-a" }
}

# Public subnet in Availability Zone B (e.g., ap-southeast-2b)
resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"             # Different CIDR — no overlap!
  availability_zone = "${var.aws_region}b"       # Different AZ for redundancy

  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public-b" }
}

# =============================================================================
# PRIVATE SUBNETS — For ECS, RDS, Redis (not directly internet-accessible)
# =============================================================================
# "Private" means: no public IP, no direct internet access.
# These subnets reach the internet OUTBOUND only, via NAT Gateway.
# Nothing from the internet can initiate a connection to these subnets.
#
# This is where we put sensitive resources:
#   - ECS instances (app servers — only ALB can talk to them)
#   - RDS (database — only ECS can connect)
#   - Redis (only ECS can connect)
#
# CIDR: 10.0.10.0/24 and 10.0.11.0/24 (different range from public subnets)
# =============================================================================

# Private subnet in Availability Zone A
resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"            # 256 IPs
  availability_zone = "${var.aws_region}a"

  # Note: NO map_public_ip_on_launch — this makes it private
  # (Instances here won't get public IPs)

  tags = { Name = "${var.project_name}-private-a" }
}

# Private subnet in Availability Zone B
resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.aws_region}b"

  tags = { Name = "${var.project_name}-private-b" }
}

# =============================================================================
# NAT GATEWAY — Lets private subnets reach the internet (outbound only)
# =============================================================================
# Problem: ECS instances in private subnets need to:
#   - Pull Docker images from ECR
#   - Download npm packages
#   - Call external APIs (e.g., OpenAI)
# But they shouldn't be directly reachable from the internet.
#
# Solution: NAT (Network Address Translation) Gateway
#   - Lives in a PUBLIC subnet (has internet access via IGW)
#   - Private subnet traffic → NAT Gateway → Internet
#   - Return traffic → NAT Gateway → back to private subnet
#   - Internet CANNOT initiate connections through NAT (one-way door)
#
# Cost: ~$32/month + $0.045/GB data transfer
# We use a SINGLE NAT Gateway (in AZ-a) to save costs.
# Production would use one per AZ for high availability.
# =============================================================================

# Elastic IP — a static public IP address for the NAT Gateway
# NAT Gateway needs a fixed public IP so return traffic knows where to go
resource "aws_eip" "nat" {
  domain = "vpc" # Allocate this EIP for use in a VPC (not EC2-Classic)

  tags = { Name = "${var.project_name}-nat-eip" }
}

# The NAT Gateway itself
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id         # Use the Elastic IP we just created
  subnet_id     = aws_subnet.public_a.id # NAT GW lives in a PUBLIC subnet
  # (it needs internet access via IGW to forward traffic)

  # Explicit dependency: NAT Gateway needs the IGW to be ready first
  # Terraform usually figures this out, but we make it explicit here
  depends_on = [aws_internet_gateway.main]

  tags = { Name = "${var.project_name}-nat" }
}

# =============================================================================
# ROUTE TABLES — Traffic rules ("where does each packet go?")
# =============================================================================
# A route table is a set of rules that determine where network traffic goes.
# Each subnet is associated with exactly one route table.
#
# Every route table has an implicit "local" route (10.0.0.0/16 → local)
# that allows all subnets within the VPC to talk to each other.
# =============================================================================

# ── Public Route Table ──────────────────────────────────────────────────────
# Rule: "Any traffic going to the internet (0.0.0.0/0) → use Internet Gateway"
# 0.0.0.0/0 is a "default route" — matches ALL destinations not covered by
# more specific routes. It's like saying "everything else goes here".
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"                    # Destination: anywhere on the internet
    gateway_id = aws_internet_gateway.main.id    # Next hop: Internet Gateway
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

# Associate public subnets with the public route table
# Without this association, the subnets would use the VPC's default route table
# (which has no internet route)
resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id      # Which subnet
  route_table_id = aws_route_table.public.id    # Which route table
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# ── Private Route Table ─────────────────────────────────────────────────────
# Rule: "Any traffic going to the internet (0.0.0.0/0) → use NAT Gateway"
# This is the key difference from public:
#   Public  → Internet Gateway (direct, bidirectional)
#   Private → NAT Gateway (outbound only, one-way)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"                  # Destination: internet
    nat_gateway_id = aws_nat_gateway.main.id       # Next hop: NAT Gateway (not IGW!)
  }

  tags = { Name = "${var.project_name}-private-rt" }
}

# Associate private subnets with the private route table
resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}

# =============================================================================
# SECURITY GROUPS — Firewalls for each resource type
# =============================================================================
#
# A Security Group (SG) is a virtual firewall that controls inbound and
# outbound traffic for AWS resources. Key concepts:
#
#   - "ingress" = inbound rules (who can connect TO this resource)
#   - "egress"  = outbound rules (where can this resource connect TO)
#   - Rules can reference CIDR blocks (IP ranges) or OTHER security groups
#   - Referencing another SG is more secure: "only allow traffic from ALB"
#     instead of "allow traffic from this IP range"
#   - Security groups are STATEFUL: if inbound is allowed, the response
#     is automatically allowed (unlike NACLs which are stateless)
#
# OUR SECURITY GROUP STRATEGY:
#   sg-alb   → open to internet on 80/443 (receives all web traffic)
#   sg-ecs   → only accepts traffic FROM sg-alb (on dynamic ports)
#   sg-rds   → only accepts traffic FROM sg-ecs (on port 5432)
#   sg-redis → only accepts traffic FROM sg-ecs (on port 6379)
#   sg-lambda → outbound only (for future Lambda functions)
#
# This creates a "chain of trust":
#   Internet → ALB (sg-alb) → ECS (sg-ecs) → RDS (sg-rds)
#                                           → Redis (sg-redis)
# =============================================================================

# ── ALB Security Group ──────────────────────────────────────────────────────
# The ALB is the public entry point. It must accept HTTP/HTTPS from anywhere.
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  # "name_prefix" instead of "name": Terraform appends a random suffix
  # This avoids name conflicts if you destroy and recreate the SG
  description = "Security group for ALB - allows HTTP/HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  # Inbound: Allow HTTP (port 80) from anywhere
  # Port 80 traffic will be redirected to HTTPS (443) by the ALB listener
  ingress {
    description = "HTTP from internet (redirected to HTTPS)"
    from_port   = 80          # Start of port range
    to_port     = 80          # End of port range (same = single port)
    protocol    = "tcp"       # TCP protocol (HTTP uses TCP)
    cidr_blocks = ["0.0.0.0/0"] # 0.0.0.0/0 = allow from ALL IP addresses
  }

  # Inbound: Allow HTTPS (port 443) from anywhere
  # This is the main entry point for all web traffic
  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound: Allow ALL traffic to anywhere
  # ALB needs to forward traffic to ECS targets and do health checks
  egress {
    description = "Allow all outbound"
    from_port   = 0           # 0 = all ports
    to_port     = 0
    protocol    = "-1"        # "-1" = all protocols (TCP, UDP, ICMP, etc.)
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

# ── ECS Security Group ──────────────────────────────────────────────────────
# ECS EC2 instances run our Docker containers. They should ONLY accept
# traffic from the ALB (not directly from the internet).
resource "aws_security_group" "ecs" {
  name_prefix = "${var.project_name}-ecs-"
  description = "Security group for ECS EC2 instances - ALB and SSH access only"
  vpc_id      = aws_vpc.main.id

  # Inbound: Allow dynamic ports from ALB only
  # ECS uses "bridge" networking with dynamic port mapping:
  #   Container port 4000 → mapped to a random host port (32768-65535)
  # The ALB discovers which port each container is using via service discovery
  # and sends traffic to that specific port.
  ingress {
    description     = "ALB to ECS dynamic ports (bridge networking)"
    from_port       = 32768   # Start of ephemeral port range
    to_port         = 65535   # End of ephemeral port range
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    # "security_groups" = only allow traffic from resources in sg-alb
    # This is MORE SECURE than using cidr_blocks because it references
    # the ALB's security group directly (even if ALB's IP changes)
  }

  # Inbound: Allow SSH from your IP only (for debugging)
  # SSH = port 22. We restrict this to your specific IP address.
  # In production, you'd use AWS SSM Session Manager instead of SSH.
  ingress {
    description = "SSH from admin IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip] # Your IP only (e.g., "203.0.113.50/32")
  }

  # Outbound: Allow all (ECS needs to pull images, call AWS APIs, etc.)
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-ecs-sg" }
}

# ── RDS Security Group ──────────────────────────────────────────────────────
# PostgreSQL database — only ECS and Lambda can connect (port 5432)
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  description = "Security group for RDS PostgreSQL - ECS and Lambda access only"
  vpc_id      = aws_vpc.main.id

  # Inbound: PostgreSQL from ECS only
  ingress {
    description     = "PostgreSQL from ECS"
    from_port       = 5432    # PostgreSQL default port
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]  # Only from ECS security group
  }

  # Inbound: PostgreSQL from Lambda (for future async workers)
  ingress {
    description     = "PostgreSQL from Lambda (future)"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  # No egress rules needed — RDS doesn't initiate outbound connections
  # (AWS adds a default "allow all outbound" rule anyway, but RDS won't use it)

  tags = { Name = "${var.project_name}-rds-sg" }
}

# ── Redis Security Group ────────────────────────────────────────────────────
# ElastiCache Redis — only ECS can connect (port 6379)
# Used for Socket.IO pub/sub, user presence, typing indicators
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  description = "Security group for ElastiCache Redis - ECS access only"
  vpc_id      = aws_vpc.main.id

  # Inbound: Redis from ECS only
  ingress {
    description     = "Redis from ECS only"
    from_port       = 6379    # Redis default port
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # Outbound: Allow all (for Redis cluster replication, if ever needed)
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # lifecycle: "create_before_destroy" ensures a new SG is created BEFORE
  # the old one is deleted. This prevents downtime during SG changes.
  # Without this, Terraform would delete the old SG first, temporarily
  # leaving resources without a firewall.
  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${var.project_name}-redis-sg" }
}

# ── Lambda Security Group (future) ─────────────────────────────────────────
# For future Lambda workers that need VPC access (to reach RDS).
# Lambda functions don't need inbound rules — they're invoked by AWS services.
resource "aws_security_group" "lambda" {
  name_prefix = "${var.project_name}-lambda-"
  description = "Security group for Lambda functions - outbound only"
  vpc_id      = aws_vpc.main.id

  # No ingress rules — Lambda doesn't receive inbound connections
  # (it's triggered by SQS events, not by incoming network traffic)

  # Outbound: Allow all (Lambda needs to reach RDS, SES, S3 via NAT)
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-lambda-sg" }
}
