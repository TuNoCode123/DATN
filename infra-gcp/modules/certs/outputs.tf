output "certificate_id" {
  description = "Managed SSL certificate self_link — used by the load balancer's target HTTPS proxy (Phase 5)"
  value       = google_compute_managed_ssl_certificate.default.id
}

output "certificate_name" {
  description = "Managed SSL certificate name"
  value       = google_compute_managed_ssl_certificate.default.name
}
