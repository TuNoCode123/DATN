# DNS-Records Module — Outputs

output "api_fqdn" {
  description = "Fully qualified domain name for the API"
  value       = aws_route53_record.api.fqdn
  # "api.neu-study.online" — the full hostname that users/browsers use
}

output "web_fqdn" {
  description = "Fully qualified domain name for the web frontend"
  value       = aws_route53_record.web.fqdn
}
