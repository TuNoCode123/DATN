# ACM Module — Outputs

output "certificate_arn" {
  description = "ARN of the validated SSL certificate — used by ALB and CloudFront"
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
  # We output the VALIDATION resource's ARN (not the certificate's ARN)
  # because this ensures downstream resources wait until the cert is validated.
  # If we used aws_acm_certificate.wildcard.arn directly, ALB/CloudFront might
  # try to use the cert before it's ready and fail.
}
