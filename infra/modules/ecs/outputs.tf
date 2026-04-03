# ECS Module — Outputs

output "cluster_name" {
  description = "ECS cluster name — used in deploy scripts and CI/CD"
  value       = aws_ecs_cluster.main.name
}

output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "api_service_name" {
  description = "API ECS service name — used for deployments"
  value       = aws_ecs_service.api.name
}

output "web_service_name" {
  description = "Web ECS service name — used for deployments"
  value       = aws_ecs_service.web.name
}
