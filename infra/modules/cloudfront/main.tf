# =============================================================================
# CLOUDFRONT MODULE — CDN for web.neu-study.online
# =============================================================================
#
# CloudFront is AWS's Content Delivery Network (CDN). It caches content at
# "edge locations" (data centers) around the world. When a user in Vietnam
# requests your website, CloudFront serves it from a nearby edge location
# instead of going all the way to Sydney — much faster!
#
# WHY ONLY FOR WEB (not API)?
# - API has WebSocket connections that need persistent TCP connections to ALB
# - API requests are dynamic (user-specific) and can't be cached
# - Web has static assets (/_next/static/*) that benefit greatly from caching
#
# BEHAVIOR MAP:
#   /_next/static/*  → CACHED for 365 days (immutable, content-hashed filenames)
#   /favicon.ico     → CACHED for 1 day
#   /* (default)     → NOT CACHED (SSR pages need fresh data every request)
#
# ORIGIN:
#   CloudFront → ALB → ECS Web containers
#   CloudFront sends requests to the ALB, which forwards to Next.js containers.
# =============================================================================

# ── CloudFront Distribution ─────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "web" {
  enabled         = true                        # Distribution is active (set false to disable without deleting)
  is_ipv6_enabled = true                        # Support IPv6 connections
  comment         = "CDN for ${var.web_domain}" # Description shown in AWS Console

  # CNAME: which domain names this distribution serves
  # Without this, CloudFront only responds to its default domain (d1234.cloudfront.net)
  aliases = [var.web_domain] # ["web.neu-study.online"]

  # ── Origin: Where CloudFront fetches content from ─────────────────────────
  # An "origin" is the source server. CloudFront forwards requests here
  # when it doesn't have a cached copy (cache miss).
  origin {
    domain_name = var.alb_dns_name # ALB hostname (e.g., ielts-ai-alb-xxx.elb.amazonaws.com)
    origin_id   = "alb-web"        # A label we give this origin (referenced by behaviors)

    # How CloudFront connects to the ALB
    custom_origin_config {
      http_port              = 80           # ALB HTTP port (for redirect)
      https_port             = 443          # ALB HTTPS port (actual traffic)
      origin_protocol_policy = "https-only" # Always use HTTPS to talk to ALB
      # "https-only" = CloudFront → ALB is encrypted
      # "match-viewer" = use whatever the viewer (browser) used
      # "http-only" = unencrypted (never use this in production)
      origin_ssl_protocols = ["TLSv1.2"] # Minimum TLS version to ALB
    }
  }

  # ── Default Cache Behavior (/* — SSR pages) ──────────────────────────────
  # This handles ALL requests that don't match a specific path pattern.
  # For Next.js SSR, we DON'T cache — every request hits the origin (ALB).
  default_cache_behavior {
    target_origin_id = "alb-web" # Route to our ALB origin
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    # Allow all HTTP methods (SSR pages may need POST for forms)
    cached_methods         = ["GET", "HEAD"]     # Only cache GET and HEAD responses
    viewer_protocol_policy = "redirect-to-https" # Force HTTPS
    # "redirect-to-https" = if user visits http://, redirect to https://
    # "https-only" = block HTTP entirely (returns 403)
    # "allow-all" = serve both HTTP and HTTPS (insecure)

    # Forward ALL headers, cookies, and query strings to the origin
    # This effectively DISABLES caching for SSR pages (each request is unique)
    forwarded_values {
      query_string = true  # Forward query strings (?page=2&search=ielts)
      headers      = ["*"] # Forward ALL headers (this disables caching!)
      # Forwarding all headers means CloudFront treats every request as unique
      # → no cache → every request goes to ALB → SSR works correctly

      cookies {
        forward = "all" # Forward all cookies (needed for auth sessions)
      }
    }

    min_ttl     = 0    # Minimum cache time: 0 seconds (don't force caching)
    default_ttl = 0    # Default cache time: 0 seconds (don't cache)
    max_ttl     = 0    # Maximum cache time: 0 seconds (never cache)
    compress    = true # Enable gzip/brotli compression (saves bandwidth)
  }

  # ── Ordered Cache Behavior: /_next/static/* (immutable assets) ────────────
  # Next.js generates static files with content-hashed filenames:
  #   /_next/static/chunks/abc123.js → filename changes if content changes
  # These are SAFE to cache forever because the filename IS the cache key.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*" # Match Next.js static assets
    target_origin_id       = "alb-web"
    allowed_methods        = ["GET", "HEAD"] # Static assets are read-only
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false    # No query strings for static files
      headers      = ["Host"] # Forward Host header so ALB/Next.js receives
      # the correct hostname (web.neu-study.online) instead of ALB's internal DNS.
      # Without this, CloudFront sends ALB's DNS name as Host, causing 502 errors.
      # Cache efficiency is unaffected since we only have one hostname.

      cookies {
        forward = "none" # No cookies needed for static files
      }
    }

    min_ttl     = 31536000 # 365 days in seconds
    default_ttl = 31536000 # Cache for 1 year by default
    max_ttl     = 31536000 # Maximum 1 year
    compress    = true     # Compress JS/CSS files (significant bandwidth savings)
  }

  # ── SSL Certificate ──────────────────────────────────────────────────────
  # CloudFront REQUIRES the ACM certificate to be in us-east-1
  # (this is why we created a separate ACM module for CloudFront)
  viewer_certificate {
    acm_certificate_arn = var.acm_certificate_arn # Must be us-east-1!
    ssl_support_method  = "sni-only"              # SNI (Server Name Indication)
    # "sni-only" = free, works with modern browsers (99.9%+)
    # "vip" = dedicated IP per edge location ($600/month!) — only for legacy clients
    minimum_protocol_version = "TLSv1.2_2021" # Minimum TLS 1.2 (secure)
  }

  # ── Geo restrictions ─────────────────────────────────────────────────────
  # You can block or allow specific countries. We allow all.
  restrictions {
    geo_restriction {
      restriction_type = "none" # No geographic restrictions
    }
  }

  # ── Price class ──────────────────────────────────────────────────────────
  # Controls which edge locations CloudFront uses (more locations = higher cost)
  # "PriceClass_200" = North America, Europe, Asia, Middle East, Africa
  # "PriceClass_100" = North America + Europe only (cheapest)
  # "PriceClass_All" = all 400+ edge locations worldwide (most expensive)
  price_class = "PriceClass_200" # Good coverage for SE Asia users

  tags = { Name = "${var.project_name}-web-cdn" }
}
