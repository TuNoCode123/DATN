# =============================================================================
# VERTEX AI MODULE — IAM for Vertex AI (Claude), Speech-to-Text, Text-to-Speech
# =============================================================================
# No AWS equivalent module — Bedrock/Transcribe/Polly access on the AWS side
# was granted inline via the ECS task role, not a dedicated Terraform module.
# This one just grants the API's runtime service account (from the storage
# module) the roles it needs; the actual API clients (Anthropic Vertex SDK,
# @google-cloud/speech, @google-cloud/text-to-speech) run inside apps/api,
# authenticating via that service account's Application Default Credentials.
#
# TEXT-TO-SPEECH ROLE — flagged, not fully verified:
# -----------------------------------------------------------------------
# roles/texttospeech.editor is the only Text-to-Speech predefined role that
# exists, but it's ALPHA-stage and `gcloud iam roles describe` shows it with
# no visible included permissions — Vertex AI (roles/aiplatform.user) and
# Speech-to-Text (roles/speech.client) are both standard, confirmed-working
# roles by comparison. If TTS calls 403 once Phase 5 is live, that's the
# first thing to check — Google's own docs only state the required OAuth
# scope (cloud-platform, already covered by ADC), not a definitive role.
# =============================================================================

resource "google_project_iam_member" "api_runtime_vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${var.api_service_account_email}"
}

resource "google_project_iam_member" "api_runtime_speech_client" {
  project = var.project_id
  role    = "roles/speech.client"
  member  = "serviceAccount:${var.api_service_account_email}"
}

resource "google_project_iam_member" "api_runtime_texttospeech_editor" {
  project = var.project_id
  role    = "roles/texttospeech.editor"
  member  = "serviceAccount:${var.api_service_account_email}"
}
