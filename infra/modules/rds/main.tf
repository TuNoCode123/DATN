# =============================================================================
# RDS MODULE — Managed PostgreSQL Database
# =============================================================================
#
# RDS = Relational Database Service. AWS manages the database server:
#   - Automatic backups (daily snapshots)
#   - Automatic patching (minor version updates)
#   - Encryption at rest (data on disk is encrypted)
#   - Performance Insights (query-level monitoring)
#   - Multi-AZ failover (optional, for high availability)
#
# We just connect to it like any PostgreSQL server using DATABASE_URL:
#   postgresql://ielts_user:password@hostname:5432/ielts_platform
#
# IMPORTANT: The database is in a PRIVATE subnet — it cannot be accessed
# from the internet. Only ECS instances (in the same VPC) can connect.
# =============================================================================

# ── DB Subnet Group ─────────────────────────────────────────────────────────
# Tells RDS which subnets it can use. RDS requires subnets in at least 2 AZs
# (even for single-AZ deployments) so it knows where to launch the standby
# in case you later enable Multi-AZ.
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = var.private_subnet_ids # [private-a, private-b] — both in private subnets

  tags = { Name = "${var.project_name}-db-subnet-group" }
}

# ── Parameter Group ─────────────────────────────────────────────────────────
# A parameter group is a collection of database configuration settings.
# Think of it as a postgresql.conf file, but managed by AWS.
# We customize a few settings for monitoring and debugging.
resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-pg16-params"
  family = "postgres16" # Must match the PostgreSQL major version

  # pg_stat_statements: a PostgreSQL extension that tracks execution stats
  # for all SQL statements. Essential for finding slow queries.
  # This loads the extension module when the database starts.
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  # Log any SQL query that takes longer than 1000ms (1 second).
  # These slow queries appear in CloudWatch Logs for debugging.
  # Set to 0 to log ALL queries (very verbose, good for debugging).
  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Milliseconds — log queries slower than 1 second
  }

  tags = { Name = "${var.project_name}-pg16-params" }
}

# =============================================================================
# RDS INSTANCE — The actual PostgreSQL database server
# =============================================================================
resource "aws_db_instance" "postgres" {
  # "identifier" is the name AWS uses for this RDS instance
  # (different from "db_name" which is the database name INSIDE the instance)
  identifier = "${var.project_name}-postgres" # "ielts-ai-postgres"

  # ── Engine settings ───────────────────────────────────────────────────────
  engine         = "postgres" # Database engine (could be mysql, mariadb, etc.)
  engine_version = "16"       # Let AWS pick the latest 16.x patch available in the region

  # ── Instance size ─────────────────────────────────────────────────────────
  instance_class = var.db_instance_class # "db.t3.micro" — 2 vCPU, 1 GB RAM
  # Free tier: 750 hours/month of db.t3.micro for the first 12 months.
  # For production: db.t3.small (2 vCPU, 2 GB) or db.r6g.large (2 vCPU, 16 GB)

  # ── Storage ───────────────────────────────────────────────────────────────
  allocated_storage = 20    # 20 GB initial storage
  storage_type      = "gp3" # General Purpose SSD (gp3) — best price/performance
  # gp3: 3000 IOPS baseline, 125 MB/s throughput — included in the price
  # Alternative: "io1" for high IOPS workloads (much more expensive)
  storage_encrypted = true # Encrypt data at rest using AWS KMS

  # ── Database settings ─────────────────────────────────────────────────────
  db_name  = var.db_name     # "ielts_platform" — the database name created on launch
  username = var.db_username # "ielts_user" — master username
  password = var.db_password # From terraform.tfvars (sensitive, not logged)

  # ── Network ───────────────────────────────────────────────────────────────
  db_subnet_group_name   = aws_db_subnet_group.main.name        # Which subnets RDS can use
  vpc_security_group_ids = [var.rds_security_group_id]          # Firewall: ECS + Lambda only
  parameter_group_name   = aws_db_parameter_group.postgres.name # Our custom config

  # "publicly_accessible = false" means: NO public IP, cannot connect from internet
  # This is a critical security setting. Only resources inside the VPC can connect.
  publicly_accessible = false

  # ── Backup ────────────────────────────────────────────────────────────────
  backup_retention_period = 1             # Keep daily backups for 1 day (free tier limit)
  backup_window           = "03:00-04:00" # Daily backup at 3-4 AM UTC
  # Backups are automatic snapshots of the entire database.
  # You can restore to any point in time within the retention period.

  # ── Maintenance ───────────────────────────────────────────────────────────
  maintenance_window = "sun:04:00-sun:05:00" # Apply patches on Sunday 4-5 AM UTC
  # AWS automatically applies minor version updates and security patches.
  # The maintenance window is when AWS is allowed to restart the DB for updates.

  # ── Deletion settings ─────────────────────────────────────────────────────
  skip_final_snapshot = true # Don't create a snapshot when deleting
  # In production, set this to false (creates a backup before deletion).
  # For a thesis project, we skip it to make `terraform destroy` faster.
  delete_automated_backups = true  # Delete backups when DB is deleted
  deletion_protection      = false # Allow `terraform destroy` to delete this DB
  # In production, set deletion_protection = true to prevent accidental deletion.

  # ── Monitoring ────────────────────────────────────────────────────────────
  performance_insights_enabled          = true # Enable Performance Insights (free for 7 days retention)
  performance_insights_retention_period = 7    # Keep performance data for 7 days
  # Performance Insights shows: which queries are slow, CPU/IO waits, etc.
  # Very useful for debugging "why is my API slow?" — check the DB first.

  tags = { Name = "${var.project_name}-postgres" }

  # ── Lifecycle ─────────────────────────────────────────────────────────────
  lifecycle {
    # Ignore password changes made outside Terraform (e.g., via AWS Console)
    # If you rotate the password manually, Terraform won't try to reset it
    ignore_changes = [password]
  }
}
