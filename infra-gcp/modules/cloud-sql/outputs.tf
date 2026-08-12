output "private_ip_address" {
  description = "Cloud SQL instance's private IP — host part of DATABASE_URL"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "connection_name" {
  description = "Cloud SQL instance connection name (project:region:instance) — useful for gcloud/proxy debugging"
  value       = google_sql_database_instance.postgres.connection_name
}

output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.postgres.name
}

output "db_name" {
  description = "Database name"
  value       = google_sql_database.app.name
}

output "db_username" {
  description = "Database user name"
  value       = google_sql_user.app.name
}

output "db_password" {
  description = "Database user password — Terraform-generated, sensitive"
  value       = random_password.db_password.result
  sensitive   = true
}
