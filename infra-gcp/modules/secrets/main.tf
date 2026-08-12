# =============================================================================
# SECRETS MODULE — Secret Manager for the API's sensitive env vars
# =============================================================================
# The AWS side injected plain env vars into the ECS task def, unencrypted at
# rest in the task definition itself. Secret Manager + Cloud Run's native
# secret-ref env support tightens this — see the migration spec's §2 note.
# Only genuinely sensitive values live here (DB password baked into a
# connection string, Redis AUTH baked into a connection string, PayPal's
# client secret); PAYPAL_CLIENT_ID/PAYPAL_BASE_URL/bucket names etc. are
# identifiers, not secrets, and stay as plain Cloud Run env vars.
# =============================================================================

resource "google_secret_manager_secret" "database_url" {
  project   = var.project_id
  secret_id = "${var.project_name}-database-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${var.db_username}:${var.db_password}@${var.db_host}:5432/${var.db_name}"
}

resource "google_secret_manager_secret" "redis_url" {
  project   = var.project_id
  secret_id = "${var.project_name}-redis-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret      = google_secret_manager_secret.redis_url.id
  secret_data = "redis://:${var.redis_auth_string}@${var.redis_host}:${var.redis_port}"
}

resource "google_secret_manager_secret" "paypal_client_secret" {
  project   = var.project_id
  secret_id = "${var.project_name}-paypal-client-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "paypal_client_secret" {
  secret      = google_secret_manager_secret.paypal_client_secret.id
  secret_data = var.paypal_client_secret != "" ? var.paypal_client_secret : "unset"
}

# Lets the API's runtime service account read these secrets at container
# startup — Cloud Run resolves secret-ref env vars using this identity.
resource "google_secret_manager_secret_iam_member" "database_url_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "redis_url_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.redis_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "paypal_client_secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.paypal_client_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_service_account_email}"
}
