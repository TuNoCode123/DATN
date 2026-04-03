# CloudFront Module — Outputs

output "domain_name" {
  description = "CloudFront distribution domain name (e.g., d1234.cloudfront.net)"
  value       = aws_cloudfront_distribution.web.domain_name
  # Route 53 alias record maps web.neu-study.online → this CloudFront domain
}

output "hosted_zone_id" {
  description = "CloudFront's hosted zone ID — required for Route 53 alias record"
  value       = aws_cloudfront_distribution.web.hosted_zone_id
  # All CloudFront distributions use the same zone ID: Z2FDTNDATAQYW2
  # But it's better to reference the resource than hardcode it
}

output "distribution_id" {
  description = "CloudFront distribution ID — used for cache invalidation"
  value       = aws_cloudfront_distribution.web.id
  # After deploying new code, you can invalidate the cache:
  #   aws cloudfront create-invalidation --distribution-id <this ID> --paths "/*"
}
