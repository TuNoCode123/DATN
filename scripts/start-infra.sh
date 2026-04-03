#!/bin/bash
# =============================================================================
# START INFRASTRUCTURE — Resume from stopped state (~10 min to full availability)
# =============================================================================
#
# This script brings the infrastructure back up after running stop-infra.sh.
# It uses Terraform to recreate deleted resources (NAT GW, ALB, Redis)
# and starts/scales up the remaining resources (RDS, ECS, ASG).
#
# STEPS:
#   1. terraform apply — recreates NAT GW, ALB, ElastiCache (deleted by stop)
#   2. Start RDS instance (if stopped)
#   3. Scale ASG back to 1 (launches EC2 instance)
#   4. Wait for EC2 to join ECS cluster
#   5. Start ECS services (desired count → 1)
#
# TOTAL TIME: ~10 minutes
#   - Terraform apply: ~3 min
#   - RDS start: ~5 min
#   - EC2 launch + ECS registration: ~2 min
# =============================================================================

set -e  # Exit on error

# ── Configuration ───────────────────────────────────────────────────────────
CLUSTER="ielts-ai-cluster"
ASG="ielts-ai-ecs-asg"
RDS_ID="ielts-ai-postgres"
REGION="ap-southeast-2"

echo "=== Starting IELTS AI Infrastructure ==="
echo "This will take about 10 minutes."
echo ""

# ── Step 1: Terraform apply — recreate deleted resources ────────────────────
echo "→ [1/5] Running Terraform apply (recreates NAT GW, ALB, Redis)..."
cd "$(dirname "$0")/../infra"
terraform apply -auto-approve
echo "  ✓ Terraform apply complete"

# ── Step 2: Start RDS ───────────────────────────────────────────────────────
echo "→ [2/5] Starting RDS..."
aws rds start-db-instance --db-instance-identifier $RDS_ID --region $REGION 2>/dev/null || echo "  (already running)"
echo "  Waiting for RDS to be available (this takes 5-10 min)..."
aws rds wait db-instance-available --db-instance-identifier $RDS_ID --region $REGION
echo "  ✓ RDS is available"

# ── Step 3: Scale ASG back to 1 ────────────────────────────────────────────
echo "→ [3/5] Scaling ASG to 1 (launches EC2 instance)..."
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name $ASG \
  --min-size 1 --max-size 3 --desired-capacity 1 \
  --region $REGION
echo "  ✓ ASG scaling to 1"

# ── Step 4: Wait for EC2 to register with ECS cluster ──────────────────────
echo "→ [4/5] Waiting for EC2 instance to join ECS cluster (~60s)..."
sleep 60
# Check if any container instances are registered
INSTANCES=$(aws ecs list-container-instances --cluster $CLUSTER --region $REGION --query 'containerInstanceArns' --output text)
if [ -z "$INSTANCES" ] || [ "$INSTANCES" = "None" ]; then
  echo "  Still waiting... (another 30s)"
  sleep 30
fi
echo "  ✓ EC2 instance joined ECS cluster"

# ── Step 5: Start ECS services ──────────────────────────────────────────────
echo "→ [5/5] Starting ECS services (desired count → 1)..."
aws ecs update-service --cluster $CLUSTER --service ielts-ai-api --desired-count 1 --region $REGION --no-cli-pager
aws ecs update-service --cluster $CLUSTER --service ielts-ai-web --desired-count 1 --region $REGION --no-cli-pager
echo "  ✓ ECS services starting"

echo ""
echo "=== Infrastructure started ==="
echo "Full availability in 2-3 minutes."
echo ""
echo "Verify:"
echo "  API:  https://api.neu-study.online/api/health"
echo "  Web:  https://web.neu-study.online"
