output "api_service_name" {
  value = google_cloud_run_v2_service.api.name
}

output "web_service_name" {
  value = google_cloud_run_v2_service.web.name
}

output "api_service_uri" {
  description = "Cloud Run's own *.run.app URL — not reachable from outside due to INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER, but useful for debugging via gcloud"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_service_uri" {
  value = google_cloud_run_v2_service.web.uri
}

output "migrate_job_name" {
  value = google_cloud_run_v2_job.migrate.name
}
