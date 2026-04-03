# DNS Module — Outputs

output "zone_id" {
  description = "Route 53 hosted zone ID — used by ACM and DNS-records modules"
  value       = data.aws_route53_zone.main.zone_id
  # This is the unique identifier for the neu-study.online hosted zone.
  # Example: "Z1234567890ABC"
}

output "name_servers" {
  description = "Route 53 name servers — these should be set at your domain registrar"
  value       = data.aws_route53_zone.main.name_servers
  # Example: ["ns-123.awsdns-45.com", "ns-678.awsdns-90.net", ...]
  # Your domain registrar (Namecheap, GoDaddy, etc.) must point NS records
  # to these AWS name servers for Route 53 to control DNS.
}
