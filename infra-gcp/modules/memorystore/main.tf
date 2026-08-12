# =============================================================================
# MEMORYSTORE MODULE — Managed Redis
# =============================================================================
# Replaces infra/modules/elasticache (AWS ElastiCache Redis). Same three uses
# as the AWS side: Socket.IO Redis adapter, presence, typing indicators (see
# docs/plans/gcp-migration-spec.md §1 — unread counts are Postgres-backed,
# not Redis, on both sides).
#
# TIER — "BASIC" is a single node, no replica, matching the AWS side's single
# cache.t3.micro (no Multi-AZ/replication either). "STANDARD_HA" exists if
# you later want a replica + automatic failover.
#
# AUTH — Memorystore generates its own auth string when auth_enabled = true;
# nothing to generate ourselves. Traffic stays inside the VPC peering (PSA,
# from the network module) either way — auth is defense-in-depth, not the
# only protection.
# =============================================================================

resource "google_redis_instance" "cache" {
  project        = var.project_id
  name           = "${var.project_name}-redis"
  region         = var.region
  tier           = "BASIC"
  memory_size_gb = var.memory_size_gb
  redis_version  = "REDIS_7_0"

  authorized_network = var.vpc_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  auth_enabled       = true
}
