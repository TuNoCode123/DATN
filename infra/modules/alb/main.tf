# =============================================================================
# ALB MODULE — Application Load Balancer (Traffic Router)
# =============================================================================
#
# The ALB is the single entry point for all web traffic. It sits in PUBLIC
# subnets and distributes requests to ECS containers in PRIVATE subnets.
#
# KEY CONCEPTS:
#
#   Listener: "Listen on port 443 (HTTPS)"
#      ↓
#   Rules: "If hostname is api.neu-study.online → send to API target group"
#          "Otherwise (default) → send to Web target group"
#      ↓
#   Target Group: A pool of ECS containers that can handle requests
#      ↓
#   Health Check: ALB regularly pings /api/health to ensure containers are alive
#
# HOST-BASED ROUTING:
# One ALB handles BOTH api and web traffic using hostname matching:
#   api.neu-study.online → API service (NestJS on port 4000)
#   * (default)          → Web service (Next.js on port 3000)
#
# This saves ~$18/month compared to having 2 separate ALBs.
#
# STICKY SESSIONS (for WebSocket/Socket.IO):
# Socket.IO starts with long-polling (HTTP), then upgrades to WebSocket.
# ALL requests during handshake must hit the SAME ECS task.
# The ALB sets an AWSALB cookie to "pin" a client to one task.
# =============================================================================

# ── The ALB itself ──────────────────────────────────────────────────────────
resource "aws_lb" "main" {
  name     = "${var.project_name}-alb" # "ielts-ai-alb"
  internal = false                     # "external" — accessible from internet
  # internal = true would make it VPC-only (for internal microservice communication)
  load_balancer_type = "application" # ALB (Layer 7 — understands HTTP/HTTPS)
  # Alternative: "network" (NLB, Layer 4 — faster but no host/path routing)
  security_groups = [var.alb_security_group_id] # Firewall: allow 80/443 from internet
  subnets         = var.public_subnet_ids       # Must be in 2+ AZs (public subnets)

  tags = { Name = "${var.project_name}-alb" }
}

# =============================================================================
# TARGET GROUPS — Pools of ECS containers that handle requests
# =============================================================================
# A target group is a set of targets (ECS containers) that the ALB forwards
# traffic to. ECS automatically registers/deregisters containers as they
# start/stop (called "dynamic service discovery").

# ── API Target Group ────────────────────────────────────────────────────────
resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg" # "ielts-ai-api-tg"
  port        = 4000                         # Container port (NestJS listens on 4000)
  protocol    = "HTTP"                       # ALB → ECS communication is HTTP (SSL terminates at ALB)
  vpc_id      = var.vpc_id                   # Must be in the same VPC as the containers
  target_type = "instance"                   # Targets are EC2 instances (ECS EC2 launch type)
  # Alternative: "ip" (for Fargate or awsvpc networking mode)

  # ── Health Check ──────────────────────────────────────────────────────────
  # ALB periodically sends requests to this path to check if the container
  # is healthy. If a container fails health checks, ALB stops sending traffic.
  health_check {
    path                = "/api/health" # The URL path to check
    healthy_threshold   = 2             # 2 consecutive successes → mark healthy
    unhealthy_threshold = 3             # 3 consecutive failures → mark unhealthy
    interval            = 30            # Check every 30 seconds
    timeout             = 5             # Wait 5 seconds for response
    # If /api/health returns 200 OK → healthy
    # If it returns 5xx or times out → unhealthy
  }

  # ── Sticky Sessions ──────────────────────────────────────────────────────
  # Required for Socket.IO WebSocket connections!
  #
  # Problem: Socket.IO handshake involves multiple HTTP requests (long-polling)
  # before upgrading to WebSocket. All these requests must hit the SAME task.
  #
  # Solution: ALB sets an "AWSALB" cookie on the first response.
  # All subsequent requests from that client include the cookie,
  # and ALB routes them to the same target.
  stickiness {
    type            = "lb_cookie" # ALB generates the cookie (not the app)
    cookie_duration = 86400       # Cookie lasts 24 hours (in seconds)
    enabled         = true        # Turn on sticky sessions
  }

  # Time to wait before deregistering a target (during deployments)
  # This gives in-flight requests time to complete before the container stops
  deregistration_delay = 30 # 30 seconds (default is 300 — too long for us)

  tags = { Name = "${var.project_name}-api-tg" }
}

# ── Web Target Group ────────────────────────────────────────────────────────
resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-web-tg" # "ielts-ai-web-tg"
  port        = 3000                         # Container port (Next.js listens on 3000)
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/" # Next.js root page
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }

  # No sticky sessions needed for web — SSR pages are stateless
  deregistration_delay = 30

  tags = { Name = "${var.project_name}-web-tg" }
}

# =============================================================================
# LISTENERS — How the ALB processes incoming traffic
# =============================================================================

# ── HTTPS Listener (port 443) — Main entry point ───────────────────────────
# This listener receives ALL HTTPS traffic and decides where to send it.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn # Attach to our ALB
  port              = 443             # Listen on HTTPS port
  protocol          = "HTTPS"         # HTTPS protocol (encrypted)

  # SSL/TLS policy — determines which TLS versions and ciphers are supported
  # "ELBSecurityPolicy-TLS13-1-2-2021-06" supports TLS 1.2 and 1.3
  # TLS 1.3 is the newest, fastest, most secure version
  # TLS 1.0 and 1.1 are deprecated (insecure)
  ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  # The ACM wildcard certificate for *.neu-study.online
  certificate_arn = var.acm_certificate_arn

  # DEFAULT action: if no listener rules match, send to Web target group
  # This handles web.neu-study.online and any other hostname
  default_action {
    type             = "forward"                   # Forward to a target group
    target_group_arn = aws_lb_target_group.web.arn # → Next.js containers
  }
}

# ── Pure public (no auth at all) ─────────────────────────────────────────────
# Paths that never need authentication. Forwarded directly without ALB
# processing session cookies. Health check is critical — ALB itself needs it.
resource "aws_lb_listener_rule" "api_public" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 3

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }

  condition {
    path_pattern {
      values = [
        "/api/health",
        "/api/payments/paypal/webhook",
      ]
    }
  }
}

# ── Optional auth (allow unauthenticated) ────────────────────────────────────
# Content endpoints that work for both authenticated and unauthenticated users.
# ALB adds x-amzn-oidc-data header IF the user has a valid session cookie,
# but passes the request through if they don't (on_unauthenticated = "allow").
# This is needed so authenticated users get their identity on POST endpoints
# (e.g., creating comments) while unauthenticated users can still read content.
resource "aws_lb_listener_rule" "api_optional_auth" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 5

  action {
    type  = "authenticate-cognito"
    order = 1

    authenticate_cognito {
      user_pool_arn       = var.cognito_user_pool_arn
      user_pool_client_id = var.cognito_alb_client_id
      user_pool_domain    = var.cognito_domain_prefix

      session_cookie_name        = "AWSELBAuthSessionCookie"
      session_timeout            = 604800
      on_unauthenticated_request = "allow"
      scope                      = "openid email profile"
    }
  }

  action {
    type             = "forward"
    order            = 2
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }

  condition {
    path_pattern {
      # ALB limit: max 5 condition values across ALL conditions in a rule.
      # host_header uses 1, so we have 4 slots for path patterns.
      values = [
        "/api/tests*",
        "/api/tags*",
        "/api/blog*",
        "/api/comments/*",
      ]
    }
  }
}

# ── Optional auth (overflow rule for additional paths) ───────────────────────
# Split from api_optional_auth due to ALB's 5 condition-value limit per rule.
resource "aws_lb_listener_rule" "api_optional_auth_extra" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 6

  action {
    type  = "authenticate-cognito"
    order = 1

    authenticate_cognito {
      user_pool_arn       = var.cognito_user_pool_arn
      user_pool_client_id = var.cognito_alb_client_id
      user_pool_domain    = var.cognito_domain_prefix

      session_cookie_name        = "AWSELBAuthSessionCookie"
      session_timeout            = 604800
      on_unauthenticated_request = "allow"
      scope                      = "openid email profile"
    }
  }

  action {
    type             = "forward"
    order            = 2
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }

  condition {
    path_pattern {
      values = [
        "/api/hsk-vocabulary*",
      ]
    }
  }
}

# ── Required auth (redirect unauthenticated to Cognito) ──────────────────────
# All other API paths require authentication. ALB redirects unauthenticated
# users to Cognito Hosted UI, handles the OIDC flow, and sets session cookies.
resource "aws_lb_listener_rule" "api_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  # Step 1: Authenticate via Cognito OIDC
  action {
    type  = "authenticate-cognito"
    order = 1

    authenticate_cognito {
      user_pool_arn       = var.cognito_user_pool_arn
      user_pool_client_id = var.cognito_alb_client_id
      user_pool_domain    = var.cognito_domain_prefix

      session_cookie_name = "AWSELBAuthSessionCookie"
      session_timeout     = 604800 # 7 days

      # Phase 2: "authenticate" — redirect unauthenticated users to Cognito.
      # ALB handles the full OIDC flow and sets AWSELBAuthSessionCookie.
      on_unauthenticated_request = "authenticate"

      scope = "openid email profile"
    }
  }

  # Step 2: Forward to API target group
  action {
    type             = "forward"
    order            = 2
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}

# ── HTTP Listener (port 80) — Redirect to HTTPS ────────────────────────────
# All HTTP traffic is automatically redirected to HTTPS.
# This ensures users always use encrypted connections.
# If someone types "http://api.neu-study.online", they get redirected to HTTPS.
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect" # Redirect (not forward)

    redirect {
      port        = "443"      # Redirect to port 443
      protocol    = "HTTPS"    # Redirect to HTTPS
      status_code = "HTTP_301" # 301 = Permanent redirect (browsers cache this)
      # 302 would be temporary redirect (browsers don't cache)
    }
  }
}
