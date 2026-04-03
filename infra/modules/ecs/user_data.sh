#!/bin/bash
# =============================================================================
# ECS EC2 INSTANCE USER DATA — Runs on first boot of each EC2 instance
# =============================================================================
#
# "User data" is a shell script that AWS runs automatically when an EC2
# instance first starts. It's used to configure the instance before it
# joins the ECS cluster.
#
# The ECS-optimized AMI already has the ECS agent pre-installed.
# We just need to tell it WHICH cluster to join.
# =============================================================================

# Tell the ECS agent which cluster this instance belongs to
# Without this, the instance won't join any cluster and ECS can't schedule tasks on it
echo "ECS_CLUSTER=${cluster_name}" >> /etc/ecs/ecs.config

# Enable container metadata endpoint (useful for debugging inside containers)
echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config

# Enable IAM roles for tasks (allows each container to have its own permissions)
echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config
