output "zone_name" {
  description = "Cloud DNS managed zone name — used by later modules (e.g. certs, dns-records) that need to reference this zone"
  value       = google_dns_managed_zone.primary.name
}

output "name_servers" {
  description = "Cloud DNS name servers — set these as NS records at your domain registrar right before launch (§7), not now"
  value       = google_dns_managed_zone.primary.name_servers
}
