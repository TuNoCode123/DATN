# =============================================================================
# DNS RECORDS MODULE — A records pointing at the load balancer
# =============================================================================
# Replaces infra/modules/dns-records (AWS Route 53 alias records). Simpler
# here: one global LB with one static IP serves both hostnames (host-based
# routing inside the URL map, see modules/load-balancer), so both records
# point at the same address — no separate ALB vs CloudFront targets to alias.
#
# Creating these records does NOT move traffic by itself — Cloud DNS isn't
# authoritative for neu-study.online until the registrar's NS delegation
# points here (spec §7, a manual step only you can do, at your registrar).
# =============================================================================

resource "google_dns_record_set" "api" {
  project      = var.project_id
  managed_zone = var.zone_name
  name         = "api.${var.domain_name}."
  type         = "A"
  ttl          = 300 # short while confirming the cutover works; raise once stable
  rrdatas      = [var.lb_ip_address]
}

resource "google_dns_record_set" "web" {
  project      = var.project_id
  managed_zone = var.zone_name
  name         = "web.${var.domain_name}."
  type         = "A"
  ttl          = 300
  rrdatas      = [var.lb_ip_address]
}
