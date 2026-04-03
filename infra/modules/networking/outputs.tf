# =============================================================================
# NETWORKING MODULE — Outputs
# =============================================================================
# These values are used by other modules. For example:
#   module.networking.vpc_id        → used by ALB, ECS modules
#   module.networking.private_subnet_ids → used by RDS, ElastiCache, ECS
#
# Outputs are like "return values" of a function.

output "vpc_id" {
  description = "VPC ID — needed by ALB, ECS, and other modules"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs — used by ALB (must be in 2+ AZs)"
  value       = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

output "private_subnet_ids" {
  description = "List of private subnet IDs — used by ECS, RDS, ElastiCache"
  value       = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

output "alb_security_group_id" {
  description = "ALB security group ID — attached to the ALB"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "ECS security group ID — attached to EC2 instances in the cluster"
  value       = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  description = "RDS security group ID — attached to the PostgreSQL instance"
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "Redis security group ID — attached to ElastiCache cluster"
  value       = aws_security_group.redis.id
}

output "lambda_security_group_id" {
  description = "Lambda security group ID — for future Lambda functions in VPC"
  value       = aws_security_group.lambda.id
}
