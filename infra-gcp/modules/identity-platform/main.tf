# =============================================================================
# IDENTITY PLATFORM MODULE — Managed authentication
# =============================================================================
# Replaces infra/modules/cognito (AWS Cognito User Pool). Identity Platform is
# Firebase Auth under the hood — the browser talks to it via the Firebase
# Auth SDK (spec decision: custom UI, not FirebaseUI or a hand-rolled OIDC
# flow), and the API verifies ID tokens itself (no ALB-style OIDC gate exists
# on GCP load balancers).
#
# SCOPE — email/password only for now, Google Sign-In deferred:
# -------------------------------------------------------------------
# Google Sign-In needs an OAuth 2.0 Client ID, which (like Cognito's Google
# IdP on the AWS side — see infra/variables.tf's google_client_id/secret,
# also no default) requires a manual step: creating an OAuth consent screen +
# Web application OAuth client in the GCP Console. There's no Terraform
# resource for that step. The google_identity_platform_default_supported_idp_config
# resource below is written and ready, but gated off (count = 0) until you
# provide real credentials — flip it on later without touching anything else.
# =============================================================================

resource "google_identity_platform_config" "default" {
  project = var.project_id

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = true
    }
  }

  mfa {
    state             = var.mfa_state # default "DISABLED" — no MFA for now
    enabled_providers = var.mfa_state == "DISABLED" ? [] : ["PHONE_SMS"]
  }

  # Domains allowed to receive OAuth/email-link redirects. Explicit list
  # because Terraform manages this as the full set, not an additive one —
  # anything not listed here gets removed if it was previously authorized.
  authorized_domains = concat(
    [
      "localhost",                         # local dev
      "${var.project_id}.firebaseapp.com", # Firebase's own default domain
      "${var.project_id}.web.app",         # Firebase's own default domain
    ],
    [for d in var.additional_authorized_domains : d]
  )

  lifecycle {
    ignore_changes = [
      multi_tenant,            # phantom block — API always returns { allow_tenants = false } even though nothing here sets it
      sign_in[0].phone_number, # same: API always returns { enabled = false, test_phone_numbers = {} }
    ]
  }
}

# Google Sign-In — gated off until you provide OAuth credentials (see header
# comment). Set google_client_id/google_client_secret in terraform.tfvars and
# re-apply to turn this on; nothing else in this module needs to change.
resource "google_identity_platform_default_supported_idp_config" "google" {
  count = var.google_client_id != "" && var.google_client_secret != "" ? 1 : 0

  project       = var.project_id
  idp_id        = "google.com"
  client_id     = var.google_client_id
  client_secret = var.google_client_secret
  enabled       = true
}

# Lets the API's runtime service account manage users server-side (the
# firebase-admin SDK, targeting this GCP project — spec §4's replacement for
# @aws-sdk/client-cognito-identity-provider calls).
resource "google_project_iam_member" "api_runtime_firebase_admin" {
  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:${var.api_service_account_email}"
}

# =============================================================================
# BROWSER API KEY — for the Next.js Firebase Auth SDK
# =============================================================================
# The Firebase Auth JS SDK needs an API key in its client config (alongside
# authDomain/projectId). This is NOT a secret in the way JWT_SECRET or a DB
# password are — it identifies the project to Google's servers, it doesn't
# grant privileged access (that's enforced by Identity Platform itself), and
# Firebase's own docs say it's fine to ship in client-side JS. It's still
# scoped here to only the two services the Auth SDK actually calls, as
# defense-in-depth against unrelated API abuse if the key ever leaks further
# than intended.
# =============================================================================

resource "google_apikeys_key" "web" {
  project      = var.project_id
  name         = "${var.project_name}-web-auth-key"
  display_name = "Identity Platform Web SDK key (Next.js)"

  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com" # sign-up/sign-in/account calls
    }
    api_targets {
      service = "securetoken.googleapis.com" # ID token refresh
    }
  }
}
