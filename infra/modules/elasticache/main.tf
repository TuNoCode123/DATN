# =============================================================================
# ELASTICACHE MODULE — Managed Redis (Chat WebSocket + Presence)
# =============================================================================
#
# ElastiCache is AWS's managed caching service (supports Redis and Memcached).
# We use Redis for the CHAT MODULE specifically:
#
#   1. Socket.IO Redis Adapter — when API scales to 2+ ECS tasks, messages
#      sent to Task 1 need to reach users connected to Task 2. The Redis
#      Pub/Sub adapter broadcasts events across all tasks automatically.
#
#   2. User Presence — "is user X online?" stored as a key with TTL 120s.
#      Refreshed every 30s by heartbeat. If heartbeat stops → key expires
#      → user is considered offline. Much faster than querying PostgreSQL.
#
#   3. Room Members — Redis SET tracking who's currently connected to each
#      chat room. Used for "online members" indicator and unread count logic.
#
#   4. Typing Indicators — "user X is typing in room Y" with TTL 3s.
#      No database write needed — purely ephemeral, auto-expires.
#
#   5. Unread Counts — fast integer counter per user per conversation.
#      Incremented when a message arrives while user is offline.
#
# All Redis data is EPHEMERAL — if Redis restarts, all data is lost.
# This is fine because:
#   - Messages are in PostgreSQL (permanent)
#   - Presence/typing will rebuild as users reconnect
#   - Unread counts will reset (minor inconvenience)
# =============================================================================

# ── Redis Subnet Group ──────────────────────────────────────────────────────
# Similar to RDS subnet group — tells ElastiCache which subnets to use.
# Must be in private subnets (not internet-accessible).
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids # [private-a, private-b]

  tags = { Name = "${var.project_name}-redis-subnet-group" }
}

# =============================================================================
# REDIS CLUSTER — Single-node (no replication, demo-appropriate)
# =============================================================================
resource "aws_elasticache_cluster" "redis" {
  # "cluster_id" is the unique name for this ElastiCache cluster
  # Must be lowercase, max 40 chars, hyphens allowed
  cluster_id = "${var.project_name}-redis" # "ielts-ai-redis"

  # ── Engine settings ───────────────────────────────────────────────────────
  engine         = "redis" # Could be "memcached" — we use Redis for pub/sub
  engine_version = "7.1"   # Redis 7.1 — latest stable version

  # ── Instance size ─────────────────────────────────────────────────────────
  node_type = var.node_type # "cache.t3.micro" — 0.5 GB RAM
  # Free tier: 750 hours/month of cache.t3.micro for 12 months
  # 0.5 GB RAM is plenty for:
  #   - Socket.IO pub/sub channels (very small memory footprint)
  #   - A few thousand presence keys (~200 bytes each)
  #   - Typing indicators (auto-expire in 3s)
  #   - Unread counters (8 bytes per counter)

  num_cache_nodes = 1 # Single node (no replicas)
  # For production: use a "replication group" with 1 primary + 1 replica
  # for automatic failover. We skip this for cost savings.

  port = 6379 # Standard Redis port

  # ── Network ───────────────────────────────────────────────────────────────
  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [var.redis_security_group_id] # Only ECS can connect

  # ── Encryption ────────────────────────────────────────────────────────────
  # NOTE: at_rest_encryption and transit_encryption are only available on
  # "aws_elasticache_replication_group" (multi-node). For a single-node
  # aws_elasticache_cluster, encryption is not supported by the AWS API.
  # If you need encryption, switch to a replication group (even with 1 node).
  # For this demo, we skip encryption — Redis only stores ephemeral chat data.

  # ── Maintenance ───────────────────────────────────────────────────────────
  maintenance_window = "sun:05:00-sun:06:00" # Sunday 5-6 AM UTC
  # AWS may restart the Redis node during this window for patching.
  # Since our Redis data is ephemeral, brief downtime is acceptable.

  # ── Backups ───────────────────────────────────────────────────────────────
  snapshot_retention_limit = 0 # No snapshots (0 = disabled)
  # Redis backups are unnecessary because all our Redis data is ephemeral.
  # Messages are in PostgreSQL. Presence/typing rebuild on reconnect.

  tags = { Name = "${var.project_name}-redis" }
}
