# =============================================================================
# CERTS MODULE — Google-managed SSL certificate
# =============================================================================
# Replaces infra/modules/acm (AWS ACM, created twice — once per region because
# CloudFront needs us-east-1). One cert here covers both hostnames because the
# target architecture uses a single global External HTTPS Load Balancer
# (§2 of the migration spec) instead of ALB + CloudFront as two separate
# regional/global services.
#
# TIMING — this cert will NOT finish issuing yet:
# --------------------------------------------------
# Google-managed certs are validated by DNS resolution: Google's servers
# check that api.neu-study.online / web.neu-study.online actually resolve to
# the load balancer's IP before they'll sign the cert. Since we haven't
# created the load balancer (Phase 5) or moved DNS (Phase 7/§7) yet, this
# resource will sit in PROVISIONING status for a while — that's expected,
# not a bug. Re-check status with:
#   gcloud compute ssl-certificates describe <name> --global
# =============================================================================

resource "google_compute_managed_ssl_certificate" "default" {
  project = var.project_id
  name    = "${var.project_name}-cert"

  managed {
    domains = var.domains
  }
}
