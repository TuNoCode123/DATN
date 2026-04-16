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

# Public access controls for the uploads bucket.
# We allow a PUBLIC-READ BUCKET POLICY on the "uploads/*" prefix so that
# question images/audio referenced in the DB (stored as direct S3 URLs,
# e.g. https://<bucket>.s3.<region>.amazonaws.com/uploads/images/...)
# can be fetched by the browser and Next.js image optimizer without
# presigning. Writes still require IAM credentials (API task role).
#
# - block_public_acls / ignore_public_acls = true  → ACLs are legacy;
#   we never want a rogue ACL to change visibility.
# - block_public_policy = false  → needed so the bucket policy below
#   (which grants anonymous s3:GetObject on uploads/*) is NOT blocked.
# - restrict_public_buckets = false → needed so the public policy
#   actually takes effect; with true, AWS ignores public policies even
#   if present.
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

# Bucket policy: allow anonymous GET on the "uploads/*" prefix only.
# This lets <img>, <audio>, and the Next.js image optimizer fetch objects
# directly by URL. Listing the bucket and reading other prefixes remains
# denied (no s3:ListBucket, no "*" on the whole bucket).
#
# depends_on ensures the public access block is updated FIRST — otherwise
# AWS rejects the policy with "blocked by BlockPublicPolicy".
resource "aws_s3_bucket_policy" "uploads_public_read" {
  bucket = aws_s3_bucket.uploads.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadUploadsPrefix"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.uploads.arn}/uploads/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.uploads]
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
      "http://localhost:3000",        # Local development
    ]
    expose_headers  = ["ETag"] # Allow browser to see ETag header
    max_age_seconds = 3600     # Cache CORS preflight for 1 hour
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
