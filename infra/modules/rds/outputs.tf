# RDS Module — Outputs

output "endpoint" {
  description = "RDS endpoint in host:port format — used to build DATABASE_URL"
  value       = "${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}"
  # Example: "ielts-ai-postgres.abcdef123456.ap-southeast-2.rds.amazonaws.com:5432"
  # The ECS module uses this to construct:
  #   DATABASE_URL=postgresql://user:pass@<this endpoint>/ielts_platform
}

output "address" {
  description = "RDS hostname only (without port)"
  value       = aws_db_instance.postgres.address
}

output "port" {
  description = "RDS port (usually 5432)"
  value       = aws_db_instance.postgres.port
}
