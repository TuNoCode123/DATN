# =============================================================================
# IAM MODULE — Workload Identity Federation for GitHub Actions
# =============================================================================
# Replaces infra/modules/iam (AWS OIDC role). Same no-stored-keys pattern:
#   1. GitHub Actions presents its OIDC token to Google
#   2. Google verifies it against this pool/provider, checking the token's
#      `repository` claim matches ours
#   3. Google lets the verified caller impersonate the github_actions service
#      account for a short-lived token — no JSON key file ever exists
#
# SCOPE — one service account, broad permissions, mirrors the AWS side's own
# documented tradeoff:
# ---------------------------------------------------------------------------
# infra/modules/iam's own comment calls its Terraform policy "the most
# permissive policy — use with care" and grants near-full access to every
# service it touches. This does the same rather than pretending a
# thesis-scale CI setup needs (or benefits from) hand-curated least-privilege
# roles per workflow — one SA covers both the deploy workflows and the
# infra.yml Terraform pipeline.
# =============================================================================

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "${var.project_name}-github-pool"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Only tokens whose `repository` claim matches ours can impersonate the SA
  # below — the WIF equivalent of the AWS role's `StringLike` condition on
  # the OIDC subject.
  attribute_condition = "assertion.repository == \"${var.github_org}/${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_actions" {
  project      = var.project_id
  account_id   = "${var.project_name}-github-actions"
  display_name = "GitHub Actions CI/CD"
}

# Lets any workflow run from TuNoCode123/DATN impersonate this SA.
resource "google_service_account_iam_member" "wif_binding" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# -----------------------------------------------------------------------------
# Deploy permissions — push images, deploy/execute Cloud Run
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "github_actions_artifact_registry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Deploying a revision that runs as api_service_account_email requires the
# deploying principal to be allowed to "act as" that identity.
resource "google_service_account_iam_member" "github_actions_actas_api_runtime" {
  service_account_id = var.api_service_account_name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions.email}"
}

# -----------------------------------------------------------------------------
# infra.yml Terraform pipeline — broad, see header note
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "github_actions_editor" {
  project = var.project_id
  role    = "roles/editor"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# IAM management (google_project_iam_member/google_service_account_iam_member
# resources across every module) is deliberately excluded from roles/editor —
# grant it explicitly, same as the AWS policy's blanket `"iam:*"`.
resource "google_project_iam_member" "github_actions_project_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Terraform state bucket lives outside this project's default resources
# (created by bootstrap/) — Editor alone covers most storage APIs, this just
# makes bucket-level ACL/IAM operations explicit rather than assumed.
resource "google_project_iam_member" "github_actions_storage_admin" {
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}
