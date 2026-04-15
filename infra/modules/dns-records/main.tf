# =============================================================================
# DNS-RECORDS MODULE — Route 53 A Records (api → ALB, web → CloudFront)
# =============================================================================
#
# This module creates the DNS records that map pretty domain names to
# AWS resources:
#
#   api.neu-study.online → ALB (direct, for WebSocket support)
#   web.neu-study.online → CloudFront (CDN, for static asset caching)
#
# ALIAS RECORDS:
# These are "alias" A records, not regular A records. The difference:
#   - Regular A record: points to a fixed IP address (e.g., 52.1.2.3)
#   - Alias A record: points to an AWS resource (e.g., ALB, CloudFront)
#
# Why alias?
#   1. AWS resources don't have fixed IPs — ALB IPs change constantly
#   2. Alias records resolve INSIDE AWS DNS (faster, no extra DNS query)
#   3. Alias to ALB/CloudFront is FREE (regular records cost per query)
#   4. Works at zone apex (e.g., neu-study.online) — CNAME doesn't
# =============================================================================

# ── api.neu-study.online → ALB (direct) ────────────────────────────────────
# The API connects directly to the ALB (NOT through CloudFront) because:
#   - WebSocket needs a persistent TCP connection (CloudFront would break it)
#   - API responses are user-specific and can't be cached
#   - Lower latency for API calls (one fewer hop)
resource "aws_route53_record" "api" {
  zone_id = var.zone_id              # Route 53 hosted zone
  name    = "api.${var.domain_name}" # "api.neu-study.online"
  type    = "A"                      # A record (maps hostname to IPv4)

  # Alias configuration: point to the ALB
  alias {
    name                   = var.alb_dns_name # ALB hostname
    zone_id                = var.alb_zone_id  # ALB's Route 53 zone ID
    evaluate_target_health = true             # Route 53 health checks the ALB
    # If evaluate_target_health = true and ALB has no healthy targets,
    # Route 53 won't return this record (DNS-level failover)
  }
}

# ── web.neu-study.online → CloudFront (CDN) ────────────────────────────────
# The web frontend goes through CloudFront for:
#   - Edge caching of /_next/static/* assets (365-day cache)
#   - Gzip/Brotli compression (smaller downloads)
#   - DDoS protection via AWS Shield Standard (free)
#   - Global edge locations (faster for users worldwide)
resource "aws_route53_record" "web" {
  zone_id = var.zone_id
  name    = "web.${var.domain_name}" # "web.neu-study.online"
  type    = "A"

  alias {
    name                   = var.cloudfront_domain  # CloudFront domain (d1234.cloudfront.net)
    zone_id                = var.cloudfront_zone_id # CloudFront zone ID
    evaluate_target_health = false                  # CloudFront handles its own health
    # CloudFront manages health checking internally, so we don't need
    # Route 53 to evaluate it (would add unnecessary DNS latency)
  }
}
