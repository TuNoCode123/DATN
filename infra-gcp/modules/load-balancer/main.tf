# =============================================================================
# LOAD BALANCER MODULE — External HTTPS LB with Serverless NEGs
# =============================================================================
# Replaces infra/modules/alb + cloudfront (AWS). One global LB does both
# jobs: the URL map does host-based routing (api.* -> API NEG, web.*/default
# -> Web NEG) the way ALB did, and Cloud CDN on the web backend replaces
# CloudFront — single static IP, single managed cert (from the certs module,
# Phase 1) instead of ALB's regional cert + CloudFront's separate us-east-1
# cert.
# =============================================================================

resource "google_compute_global_address" "lb_ip" {
  project = var.project_id
  name    = "${var.project_name}-lb-ip"
}

# -----------------------------------------------------------------------------
# Serverless NEGs — point at the Cloud Run services from the cloud-run module
# -----------------------------------------------------------------------------

resource "google_compute_region_network_endpoint_group" "api" {
  project               = var.project_id
  name                  = "${var.project_name}-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.api_service_name
  }
}

resource "google_compute_region_network_endpoint_group" "web" {
  project               = var.project_id
  name                  = "${var.project_name}-web-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.web_service_name
  }
}

# -----------------------------------------------------------------------------
# Backend services — Cloud CDN only on web (matches CloudFront's original
# scope: it fronted web.* only, not the API, since WebSocket needs a direct
# path)
# -----------------------------------------------------------------------------

resource "google_compute_backend_service" "api" {
  project               = var.project_id
  name                  = "${var.project_name}-api-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

resource "google_compute_backend_service" "web" {
  project               = var.project_id
  name                  = "${var.project_name}-web-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"
  enable_cdn            = true

  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }

  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC" # honors Next.js's own Cache-Control on /_next/static/* (immutable, hashed filenames); default (dynamic) responses aren't cached
    client_ttl  = 3600
    default_ttl = 3600
    max_ttl     = 86400

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = true
    }
  }
}

# -----------------------------------------------------------------------------
# URL map — host-based routing, api.* -> API backend, everything else -> web
# -----------------------------------------------------------------------------

resource "google_compute_url_map" "default" {
  project         = var.project_id
  name            = "${var.project_name}-url-map"
  default_service = google_compute_backend_service.web.id

  host_rule {
    hosts        = ["api.${var.domain_name}"]
    path_matcher = "api"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.api.id
  }
}

# -----------------------------------------------------------------------------
# HTTPS listener — Google-managed cert from the certs module (Phase 1)
# -----------------------------------------------------------------------------

resource "google_compute_target_https_proxy" "default" {
  project          = var.project_id
  name             = "${var.project_name}-https-proxy"
  url_map          = google_compute_url_map.default.id
  ssl_certificates = [var.certificate_id]
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${var.project_name}-https-forwarding-rule"
  ip_address            = google_compute_global_address.lb_ip.id
  ip_protocol           = "TCP"
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.default.id
}

# -----------------------------------------------------------------------------
# HTTP -> HTTPS redirect — same static IP, port 80
# -----------------------------------------------------------------------------

resource "google_compute_url_map" "https_redirect" {
  project = var.project_id
  name    = "${var.project_name}-https-redirect"

  default_url_redirect {
    https_redirect = true
    strip_query    = false
  }
}

resource "google_compute_target_http_proxy" "default" {
  project = var.project_id
  name    = "${var.project_name}-http-proxy"
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project_id
  name                  = "${var.project_name}-http-forwarding-rule"
  ip_address            = google_compute_global_address.lb_ip.id
  ip_protocol           = "TCP"
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.default.id
}
