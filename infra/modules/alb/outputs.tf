# ALB Module — Outputs

output "dns_name" {
  description = "ALB DNS name — used by Route 53 alias record and CloudFront origin"
  value       = aws_lb.main.dns_name
  # Example: "ielts-ai-alb-123456789.ap-southeast-2.elb.amazonaws.com"
  # This is a long, ugly hostname. Route 53 alias records map pretty
  # domain names (api.neu-study.online) to this ALB hostname.
}

output "zone_id" {
  description = "ALB's hosted zone ID — required for Route 53 alias records"
  value       = aws_lb.main.zone_id
  # Every ALB has an associated hosted zone. Route 53 alias records need
  # both the dns_name AND zone_id to create the alias.
}

output "arn" {
  description = "ALB ARN — used for monitoring and other references"
  value       = aws_lb.main.arn
}

output "api_target_group_arn" {
  description = "API target group ARN — ECS service registers containers here"
  value       = aws_lb_target_group.api.arn
}

output "web_target_group_arn" {
  description = "Web target group ARN — ECS service registers containers here"
  value       = aws_lb_target_group.web.arn
}
