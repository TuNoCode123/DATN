# ElastiCache Module — Outputs

output "endpoint" {
  description = "Redis endpoint in host:port format — used to build REDIS_URL"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
  # Example: "ielts-ai-redis.abcdef.0001.apse2.cache.amazonaws.com:6379"
  #
  # cache_nodes[0] — we only have 1 node (num_cache_nodes = 1)
  # .address = hostname, .port = 6379
  #
  # In ECS task definition, this becomes:
  #   REDIS_URL = redis://<this endpoint>
}

output "address" {
  description = "Redis hostname only (without port)"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "port" {
  description = "Redis port (6379)"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}
