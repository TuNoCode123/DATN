# =============================================================================
# DNS MODULE — Cloud DNS managed zone
# =============================================================================
# Replaces infra/modules/dns + dns-records (AWS Route 53). Split differently
# here: this module only creates the zone. Actual A/CNAME records get added
# by a future dns-records-equivalent step once the load balancer exists
# (Phase 5) — same dependency order as the AWS stack (dns → ... → alb →
# dns_records), just not needed yet in Phase 1.
#
# IMPORTANT — this does NOT touch your domain registrar:
# --------------------------------------------------------
# Creating this zone doesn't move traffic anywhere. Cloud DNS only becomes
# authoritative for neu-study.online once you update the NS records at your
# registrar to the `name_servers` output — and per the migration spec (§7),
# that happens right before launch, not now. Until then this zone just sits
# here, unused, costing a few cents a month.
# =============================================================================

resource "google_dns_managed_zone" "primary" {
  project     = var.project_id
  name        = replace(var.domain_name, ".", "-") # zone resource names can't contain dots: "neu-study.online" -> "neu-study-online"
  dns_name    = "${var.domain_name}."              # DNS zone names need the trailing dot
  description = "Managed zone for ${var.domain_name} (GCP migration)"

  labels = {
    project = var.project_name
  }
}
