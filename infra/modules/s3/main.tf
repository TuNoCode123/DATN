# =============================================================================
# S3 MODULE — File Storage Buckets
# =============================================================================
#
# S3 (Simple Storage Service) stores files (objects) in "buckets".
# We create 2 buckets:
#   1. Uploads — user file uploads (audio, images, documents)
#   2. Assets — shared static files (logos, default images)
#
# FILE UPLOAD FLOW (Presigned URLs):
#   1. Frontend → POST /api/uploads/presign { filename, contentType }
#   2. API generates a presigned PUT URL (valid for 5 minutes)
#   3. Frontend uploads file DIRECTLY to S3 (no API bandwidth used!)
#   4. Frontend → POST /api/uploads/complete { fileKey }
#   5. API stores the file reference in PostgreSQL
#
# Why presigned URLs?
#   - The API never touches the file data → lower bandwidth costs
#   - Uploads go directly to S3 → faster for the user
#   - Presigned URLs expire → no long-lived credentials exposed
# =============================================================================

# ── Uploads Bucket ──────────────────────────────────────────────────────────
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.project_name}-uploads-${var.environment}" # "ielts-ai-uploads-prod"
  # Bucket names must be globally unique across ALL AWS accounts

  force_destroy = true # Allow Terraform to delete bucket even with files in it
  # In production, set this to false to prevent accidental data loss

  tags = { Name = "${var.project_name}-uploads" }
}

# Block all public access to the uploads bucket
# Files are accessed via presigned URLs only (not public URLs)
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning — keeps all versions of uploaded files
# If a user re-uploads a file, the old version is preserved
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encrypt all objects at rest using AES-256 (AWS-managed keys)
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CORS (Cross-Origin Resource Sharing) configuration
# This allows the BROWSER to upload files directly to S3 via presigned URLs.
# Without CORS, the browser would block the upload (same-origin policy).
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]          # Allow any request headers
    allowed_methods = ["GET", "PUT"] # GET for downloads, PUT for uploads
    allowed_origins = [
      "https://web.neu-study.online", # Production frontend
      "http://localhost:3000",         # Local development
    ]
    expose_headers  = ["ETag"]       # Allow browser to see ETag header
    max_age_seconds = 3600           # Cache CORS preflight for 1 hour
  }
}

# ── Assets Bucket (static shared files) ─────────────────────────────────────
resource "aws_s3_bucket" "assets" {
  bucket        = "${var.project_name}-assets-${var.environment}" # "ielts-ai-assets-prod"
  force_destroy = true

  tags = { Name = "${var.project_name}-assets" }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
