output "database_url_secret_id" {
  value = google_secret_manager_secret.database_url.secret_id
}

output "redis_url_secret_id" {
  value = google_secret_manager_secret.redis_url.secret_id
}

output "paypal_client_secret_secret_id" {
  value = google_secret_manager_secret.paypal_client_secret.secret_id
}
