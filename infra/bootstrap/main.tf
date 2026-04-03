# =============================================================================
# BOOTSTRAP — One-time setup for Terraform Remote State
# =============================================================================
#
# WHY THIS EXISTS:
# ----------------
# Terraform needs to store its "state" — a JSON file that tracks what
# resources it has created. By default, this is a local file (terraform.tfstate).
#
# Problem: If you lose that file, Terraform forgets about all your AWS resources.
# Also, if two people run Terraform at the same time, they can corrupt the state.
#
# Solution: Store the state in S3 (durable, versioned) and use DynamoDB
# for "locking" (prevents two people from running Terraform simultaneously).
#
# HOW TO USE:
# -----------
# You only run this ONCE, before everything else:
#   cd infra/bootstrap
#   terraform init
#   terraform apply
#
# After this, the main infra/ stack can use S3 as its backend.
# =============================================================================

# -----------------------------------------------------------------------------
# "terraform" block — tells Terraform what version and providers we need
# -----------------------------------------------------------------------------
terraform {
  # We need at least Terraform version 1.5 installed on your machine
  required_version = ">= 1.5"

  required_providers {
    # "aws" provider lets Terraform talk to AWS APIs
    # "~> 5.0" means: any version 5.x (e.g., 5.1, 5.82) but NOT 6.0
    aws = {
      source  = "hashicorp/aws" # Where to download the provider from
      version = "~> 5.0"        # Version constraint (semver)
    }
  }
}

# -----------------------------------------------------------------------------
# Provider configuration — tells Terraform WHICH AWS account/region to use
# -----------------------------------------------------------------------------
provider "aws" {
  region = "ap-southeast-2" # Sydney — same region as all our infra

  # "default_tags" automatically adds these tags to EVERY resource Terraform creates
  # Tags are key-value labels for organizing/billing AWS resources
  default_tags {
    tags = {
      Project   = "ielts-ai-platform"
      ManagedBy = "terraform-bootstrap" # So we know this was created by bootstrap
    }
  }
}

# =============================================================================
# S3 BUCKET — Stores Terraform state file
# =============================================================================
# Think of this as a cloud hard drive that holds our terraform.tfstate file.
# S3 = Simple Storage Service — AWS's object storage (like Google Drive for code).
#
# Why S3 for state?
#   1. Durable: 99.999999999% (11 nines!) durability — your file won't be lost
#   2. Versioned: keeps history of every change (can roll back if corrupted)
#   3. Encrypted: state contains secrets (DB passwords), so we encrypt it
#   4. Shared: team members can all access the same state
# =============================================================================
resource "aws_s3_bucket" "terraform_state" {
  # "bucket" is the globally unique name for this S3 bucket
  # S3 bucket names must be unique across ALL AWS accounts worldwide!
  bucket = "ielts-ai-terraform-state"

  # "lifecycle" is a Terraform meta-argument (not an AWS feature)
  # "prevent_destroy = true" means: if you run `terraform destroy`,
  # Terraform will REFUSE to delete this bucket. This protects your state file
  # from accidental deletion.
  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = "ielts-ai-terraform-state" }
}

# -----------------------------------------------------------------------------
# Enable VERSIONING on the S3 bucket
# -----------------------------------------------------------------------------
# Versioning keeps every version of the state file. If a bad Terraform run
# corrupts the state, you can restore a previous version from S3 console.
# This is separate from the bucket resource because AWS treats it as a
# sub-resource (bucket configuration).
resource "aws_s3_bucket_versioning" "terraform_state" {
  # "bucket" references the S3 bucket we created above
  # The syntax is: resource_type.resource_name.attribute
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled" # Turn on versioning (keeps all file versions)
  }
}

# -----------------------------------------------------------------------------
# Enable SERVER-SIDE ENCRYPTION on the S3 bucket
# -----------------------------------------------------------------------------
# Terraform state may contain sensitive values (like database passwords).
# This ensures the state file is encrypted at rest (when stored on AWS disks).
# "AES256" is AWS-managed encryption — simple, free, and secure.
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # AWS manages the encryption keys for us
    }
  }
}

# -----------------------------------------------------------------------------
# BLOCK ALL PUBLIC ACCESS to the S3 bucket
# -----------------------------------------------------------------------------
# This is a safety net — ensures nobody can accidentally make the state file
# publicly readable. State files contain secrets, so this is critical.
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true  # Block public ACLs (access control lists)
  block_public_policy     = true  # Block public bucket policies
  ignore_public_acls      = true  # Ignore any existing public ACLs
  restrict_public_buckets = true  # Restrict public bucket policies
}

# =============================================================================
# NOTE ON STATE LOCKING
# =============================================================================
# Terraform needs "locking" to prevent two people running `terraform apply`
# at the same time (which would corrupt the state file).
#
# OLD approach (deprecated): DynamoDB table with a "LockID" column.
# NEW approach (Terraform 1.10+): S3-native file-based locking via `use_lockfile = true`
#   - Terraform creates a .tflock file in the same S3 bucket
#   - No DynamoDB table needed — simpler and cheaper!
#   - Configured in backend.tf with: use_lockfile = true
# =============================================================================

# =============================================================================
# OUTPUTS — Values printed after `terraform apply`
# =============================================================================
# Outputs are like return values. After running this bootstrap, Terraform
# will print these values so you can copy them into the main backend.tf file.
output "state_bucket_name" {
  description = "S3 bucket name for Terraform state — use this in backend.tf"
  value       = aws_s3_bucket.terraform_state.id
}
