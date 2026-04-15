# =============================================================================
# DNS MODULE — Look up existing Route 53 Hosted Zone
# =============================================================================
#
# Route 53 is AWS's DNS service. A "hosted zone" is a container for DNS records
# for a domain (e.g., neu-study.online).
#
# We do NOT create the hosted zone here — it already exists (created when you
# registered the domain or manually in AWS Console). We just LOOK IT UP
# using a "data source" to get its zone ID.
#
# DATA SOURCE vs RESOURCE:
#   - "resource" = Terraform CREATES and MANAGES this thing
#   - "data" = Terraform READS an existing thing (doesn't create or manage it)
#
# The zone ID is needed by:
#   - ACM module (for DNS validation records)
#   - DNS-records module (for A records pointing to ALB and CloudFront)
# =============================================================================

# Look up the existing hosted zone by domain name
data "aws_route53_zone" "main" {
  name         = var.domain_name # "neu-study.online"
  private_zone = false           # This is a PUBLIC hosted zone (not VPC-private)
  # public zone = resolves for everyone on the internet
  # private zone = resolves only within a specific VPC
}
