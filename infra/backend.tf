# =============================================================================
# BACKEND CONFIGURATION — Where Terraform stores its state
# =============================================================================
#
# This tells Terraform: "Don't store state locally. Instead, store it in S3
# and use file-based locking (a .tflock file in S3) to prevent concurrent runs."
#
# The S3 bucket was created by infra/bootstrap/main.tf.
# You MUST run the bootstrap first before this backend will work.
#
# IMPORTANT: You cannot use variables in this block! These values must be
# hardcoded because Terraform reads this BEFORE it processes any variables.
# =============================================================================

terraform {
  backend "s3" {
    bucket       = "ielts-ai-terraform-state" # S3 bucket name (from bootstrap)
    key          = "infra/terraform.tfstate"  # Path inside the bucket where state is stored
    region       = "ap-southeast-2"           # AWS region where the bucket lives
    use_lockfile = true                       # Use S3-native .tflock file for locking
    # (replaces the old dynamodb_table approach — no DynamoDB table needed!)
    encrypt = true # Encrypt the state file in S3
  }
}
