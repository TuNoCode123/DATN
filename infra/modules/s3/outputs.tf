# S3 Module — Outputs

output "uploads_bucket_name" {
  description = "Uploads S3 bucket name — used by the API for presigned URLs"
  value       = aws_s3_bucket.uploads.id
}

output "uploads_bucket_arn" {
  description = "Uploads S3 bucket ARN"
  value       = aws_s3_bucket.uploads.arn
}

output "assets_bucket_name" {
  description = "Assets S3 bucket name"
  value       = aws_s3_bucket.assets.id
}
