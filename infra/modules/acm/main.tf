# =============================================================================
# ACM MODULE — AWS Certificate Manager (Free SSL/TLS Certificates)
# =============================================================================
#
# This "required_providers" block tells Terraform that this module uses the
# "aws" provider. This is needed because the root module passes a provider
# alias (aws.us_east_1) when calling this module for CloudFront certs.
# Without this, Terraform shows a warning about undefined provider references.
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

# =============================================================================
#
# ACM provides FREE SSL certificates for your domain. These enable HTTPS
# (the padlock icon in the browser). Without SSL:
#   - Browsers show "Not Secure" warning
#   - WebSocket connections may be blocked
#   - No data encryption in transit
#
# We create a WILDCARD certificate: *.neu-study.online
# This covers ALL subdomains:
#   - api.neu-study.online ✓
#   - web.neu-study.online ✓
#   - admin.neu-study.online ✓ (future)
#   - anything.neu-study.online ✓
#
# DNS VALIDATION:
# ACM needs to verify you own the domain. It creates a special CNAME record
# in Route 53. When ACM sees the record, it issues the certificate.
# This is fully automated — no manual email verification needed.
#
# THIS MODULE IS CALLED TWICE:
#   1. Default region (ap-southeast-2) → for ALB (api.neu-study.online)
#   2. us-east-1 region → for CloudFront (web.neu-study.online)
#      CloudFront REQUIRES its cert to be in us-east-1 (AWS limitation).
# =============================================================================

# ── SSL Certificate Request ─────────────────────────────────────────────────
resource "aws_acm_certificate" "wildcard" {
  # The primary domain on the certificate
  domain_name = var.domain_name # "neu-study.online"

  # Subject Alternative Names (SANs) — additional domains on the same cert
  # The wildcard *.neu-study.online covers all subdomains
  subject_alternative_names = ["*.${var.domain_name}"] # "*.neu-study.online"

  # How to validate domain ownership:
  # "DNS" = ACM creates a CNAME record, we add it to Route 53, ACM verifies
  # "EMAIL" = ACM sends an email to admin@domain — less automated
  validation_method = "DNS"

  tags = { Name = "${var.domain_name}-wildcard-cert" }

  # Create new cert before destroying old one during updates
  # This prevents HTTPS downtime when the cert is being replaced
  lifecycle {
    create_before_destroy = true
  }
}

# ── DNS Validation Records ──────────────────────────────────────────────────
# ACM provides a CNAME record that must exist in Route 53 to prove ownership.
# This resource creates those DNS records automatically.
#
# "for_each" iterates over validation options — usually just 1-2 records.
# We use a map comprehension to deduplicate (wildcard + root share one record).
resource "aws_route53_record" "cert_validation" {
  # "for_each" creates one DNS record per unique validation option
  # This is Terraform's way of looping: for each item, create a resource
  for_each = {
    # Create a map where each key is the domain name
    # and the value is the validation record details
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name  # The CNAME record name ACM wants
      record = dvo.resource_record_value # The CNAME record value ACM wants
      type   = dvo.resource_record_type  # Always "CNAME" for DNS validation
    }
  }

  zone_id = var.zone_id         # Route 53 hosted zone ID
  name    = each.value.name     # e.g., "_abc123.neu-study.online"
  type    = each.value.type     # "CNAME"
  records = [each.value.record] # e.g., "_xyz789.acm-validations.aws"
  ttl     = 60                  # Time-to-live in seconds (how long DNS caches this)

  # Allow overwriting if the record already exists (from a previous cert)
  allow_overwrite = true
}

# ── Wait for Validation ─────────────────────────────────────────────────────
# This resource doesn't create anything — it WAITS until ACM confirms the
# certificate is validated. Without this, other resources might try to use
# the cert before it's ready, which would fail.
#
# ACM checks the DNS record every few minutes. Validation usually takes
# 5-30 minutes on the first run.
resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn = aws_acm_certificate.wildcard.arn

  # List of DNS record FQDNs (Fully Qualified Domain Names) that validate the cert
  validation_record_fqdns = [
    for record in aws_route53_record.cert_validation : record.fqdn
  ]
}
