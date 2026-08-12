# =============================================================================
# NETWORK MODULE — VPC + subnet foundation
# =============================================================================
# Replaces infra/modules/networking (AWS). Much smaller than the AWS version
# on purpose: Cloud Run is serverless, so there's no ASG/EC2/launch template,
# no public/private subnet split, and no NAT Gateway needed by default.
#
# What this creates:
#   - A custom-mode VPC (we pick our own subnet ranges, not GCP's defaults)
#   - One regional subnet — used later for Cloud Run "Direct VPC egress",
#     which lets Cloud Run reach private-IP resources (Cloud SQL, Memorystore)
#     without a separate VPC Access Connector
#   - A firewall rule allowing traffic within the subnet (Cloud SQL/Memorystore
#     reachability) — the GCP equivalent of an AWS security group
#
#   - Private Service Access (PSA) peering — resolves the §8 open question:
#     both Cloud SQL and Memorystore go on PRIVATE IP, reached via Cloud Run's
#     Direct VPC egress through this same subnet. Memorystore has no public-IP
#     option at all, so a VPC path is required regardless; putting Cloud SQL
#     on the same path avoids running two different connectivity mechanisms
#     (Cloud SQL Auth Proxy + a separate VPC connector for Redis) side by side.
#
# Still deliberately NOT created: Cloud NAT. Direct VPC egress is set to
# "private-ranges-only" (configured on the Cloud Run service in Phase 5), so
# Cloud Run keeps reaching the public internet (Vertex AI, GCS, ...) directly
# and only routes RFC1918 traffic (Cloud SQL/Memorystore) through the VPC —
# NAT is only needed for "all traffic" egress mode, which we're not using.
# =============================================================================

resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "${var.project_name}-vpc"
  auto_create_subnetworks = false # we define our own subnet below, not GCP's default /20s per region
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "subnet" {
  project       = var.project_id
  name          = "${var.project_name}-subnet-${var.region}"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.subnet_cidr

  # Lets resources in this subnet reach Google APIs (Vertex AI, GCS, Speech,
  # Text-to-Speech, Secret Manager, ...) using an internal path instead of
  # needing a public IP or NAT — relevant once Cloud Run uses this subnet for
  # Direct VPC egress.
  private_ip_google_access = true
}

resource "google_compute_firewall" "allow_internal" {
  project = var.project_id
  name    = "${var.project_name}-allow-internal"
  network = google_compute_network.vpc.id

  direction = "INGRESS"
  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "udp"
  }
  allow {
    protocol = "icmp"
  }

  # Only trust traffic that originates inside our own subnet — this is the
  # GCP equivalent of an AWS security group's "allow from within the VPC" rule.
  source_ranges = [var.subnet_cidr]
}

# =============================================================================
# PRIVATE SERVICE ACCESS (PSA) — lets Cloud SQL and Memorystore live on
# private IPs inside this VPC
# =============================================================================
# Cloud SQL and Memorystore aren't actually "in" your VPC — they live on
# Google-managed infrastructure that gets peered into it. PSA is the
# mechanism: reserve an IP range, then create a VPC peering connection to
# Google's service producer network using that range. Both the cloud-sql and
# memorystore modules depend on this being in place before they can request
# a private IP.
# =============================================================================

resource "google_compute_global_address" "private_service_range" {
  project       = var.project_id
  name          = "${var.project_name}-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20 # 4096 addresses — no "address" set, so GCP auto-picks a free block that doesn't overlap the subnet above
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_service_access" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
}
