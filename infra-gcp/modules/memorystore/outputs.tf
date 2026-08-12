output "host" {
  description = "Redis private IP — host part of REDIS_URL"
  value       = google_redis_instance.cache.host
}

output "port" {
  description = "Redis port"
  value       = google_redis_instance.cache.port
}

output "auth_string" {
  description = "Redis AUTH password — Memorystore-generated, sensitive"
  value       = google_redis_instance.cache.auth_string
  sensitive   = true
}
