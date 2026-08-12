output "vpc_id" {
  description = "VPC self_link — used by later modules (Cloud SQL, Memorystore, Cloud Run) to attach to this network"
  value       = google_compute_network.vpc.id
}

output "vpc_name" {
  description = "VPC name — useful for debugging in GCP Console"
  value       = google_compute_network.vpc.name
}

output "subnet_id" {
  description = "Subnet self_link — used by Cloud Run's Direct VPC egress config"
  value       = google_compute_subnetwork.subnet.id
}

output "subnet_name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.subnet.name
}

output "subnet_cidr" {
  description = "Subnet CIDR range — needed later to size Private Service Access peering ranges without overlapping"
  value       = google_compute_subnetwork.subnet.ip_cidr_range
}

output "private_vpc_connection_peering" {
  description = "PSA peering connection name — not consumed directly, but referencing it from a downstream module creates an implicit dependency so Cloud SQL/Memorystore don't try to get a private IP before the peering exists"
  value       = google_service_networking_connection.private_service_access.peering
}
