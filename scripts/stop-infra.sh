#!/bin/bash
# =============================================================================
# STOP INFRASTRUCTURE — Reduce monthly cost from ~$110/mo to ~$1/mo
# =============================================================================
#
# This script STOPS expensive AWS resources when you're not demoing.
# Resources that cost money when idle: NAT Gateway, ALB, RDS, ElastiCache, EC2.
#
# WHAT STAYS RUNNING (~$1/mo):
#   - VPC, subnets, security groups, IGW → free
#   - Route 53 hosted zone → $0.50/mo
#   - ECR repositories → ~$0.20/mo
#   - S3 buckets → ~$0.10/mo
#   - ACM certificates → free
#   - IAM roles → free
#   - ECS cluster (empty) → free
#
# WHAT GETS STOPPED/DELETED (~$110/mo → $0/mo):
#   - NAT Gateway → DELETED ($32/mo saved)
#   - ALB → DELETED ($18/mo saved)
#   - EC2 instances → scaled to 0 ($30/mo saved)
#   - RDS → STOPPED ($13/mo saved)
#   - ElastiCache Redis → DELETED ($13/mo saved, data is ephemeral)
#   - ECS services → scaled to 0
#
# TO RESUME: run scripts/start-infra.sh (~10 min to full availability)
# =============================================================================

set -e  # Exit immediately if any command fails

# ── Configuration ───────────────────────────────────────────────────────────
CLUSTER="ielts-ai-cluster"
ASG="ielts-ai-ecs-asg"
RDS_ID="ielts-ai-postgres"
REDIS_ID="ielts-ai-redis"
REGION="ap-southeast-2"
# Update this after first deploy (find in AWS Console → CloudFront → Distributions)
CF_DIST_ID="YOUR_DISTRIBUTION_ID"

echo "=== Stopping IELTS AI Infrastructure ==="
echo "This will reduce costs from ~\$110/mo to ~\$1/mo"
echo ""

# ── Step 1: Scale ECS services to 0 tasks ──────────────────────────────────
echo "→ [1/7] Scaling ECS services to 0..."
aws ecs update-service --cluster $CLUSTER --service ielts-ai-api --desired-count 0 --region $REGION --no-cli-pager
aws ecs update-service --cluster $CLUSTER --service ielts-ai-web --desired-count 0 --region $REGION --no-cli-pager
echo "  ✓ ECS services scaled to 0"

# ── Step 2: Scale ASG to 0 (terminates EC2 instances) ──────────────────────
echo "→ [2/7] Scaling ASG to 0 (terminates EC2 instances)..."
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name $ASG \
  --min-size 0 --max-size 0 --desired-capacity 0 \
  --region $REGION
echo "  ✓ ASG scaled to 0 (EC2 instances will terminate)"

# ── Step 3: Stop RDS instance ──────────────────────────────────────────────
echo "→ [3/7] Stopping RDS..."
aws rds stop-db-instance --db-instance-identifier $RDS_ID --region $REGION 2>/dev/null || echo "  (already stopped)"
echo "  ✓ RDS stopping (NOTE: AWS auto-restarts after 7 days — re-stop if needed)"

# ── Step 4: Delete ElastiCache Redis ────────────────────────────────────────
echo "→ [4/7] Deleting ElastiCache Redis (ephemeral data, no backup needed)..."
aws elasticache delete-cache-cluster --cache-cluster-id $REDIS_ID --region $REGION 2>/dev/null || echo "  (already deleted)"
echo "  ✓ Redis deleting"

# ── Step 5: Delete NAT Gateway + release EIP ($32/mo savings) ──────────────
echo "→ [5/7] Deleting NAT Gateway..."
NAT_GW_ID=$(aws ec2 describe-nat-gateways \
  --filter "Name=tag:Name,Values=ielts-ai-nat" "Name=state,Values=available" \
  --query 'NatGateways[0].NatGatewayId' --output text --region $REGION)

if [ "$NAT_GW_ID" != "None" ] && [ -n "$NAT_GW_ID" ]; then
  EIP_ALLOC=$(aws ec2 describe-nat-gateways \
    --nat-gateway-ids $NAT_GW_ID \
    --query 'NatGateways[0].NatGatewayAddresses[0].AllocationId' \
    --output text --region $REGION)
  aws ec2 delete-nat-gateway --nat-gateway-id $NAT_GW_ID --region $REGION
  echo "  Waiting for NAT GW deletion (30s)..."
  sleep 30
  aws ec2 release-address --allocation-id $EIP_ALLOC --region $REGION 2>/dev/null || true
  echo "  ✓ NAT Gateway deleted + EIP released"
else
  echo "  (NAT Gateway already deleted)"
fi

# ── Step 6: Delete ALB ($18/mo savings) ─────────────────────────────────────
echo "→ [6/7] Deleting ALB..."
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names ielts-ai-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text --region $REGION 2>/dev/null)

if [ "$ALB_ARN" != "None" ] && [ -n "$ALB_ARN" ]; then
  # Delete listeners first (required before deleting ALB)
  for LISTENER_ARN in $(aws elbv2 describe-listeners \
    --load-balancer-arn $ALB_ARN \
    --query 'Listeners[*].ListenerArn' --output text --region $REGION); do
    aws elbv2 delete-listener --listener-arn $LISTENER_ARN --region $REGION
  done
  aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN --region $REGION
  # Delete target groups
  for TG_ARN in $(aws elbv2 describe-target-groups \
    --query "TargetGroups[?starts_with(TargetGroupName,'ielts-ai')].TargetGroupArn" \
    --output text --region $REGION); do
    aws elbv2 delete-target-group --target-group-arn $TG_ARN --region $REGION 2>/dev/null || true
  done
  echo "  ✓ ALB deleted"
else
  echo "  (ALB already deleted)"
fi

# ── Step 7: Disable CloudFront ──────────────────────────────────────────────
echo "→ [7/7] Disabling CloudFront distribution..."
if [ "$CF_DIST_ID" != "YOUR_DISTRIBUTION_ID" ]; then
  ETAG=$(aws cloudfront get-distribution-config --id $CF_DIST_ID --query 'ETag' --output text)
  aws cloudfront get-distribution-config --id $CF_DIST_ID --query 'DistributionConfig' > /tmp/cf-config.json
  python3 -c "import json; c=json.load(open('/tmp/cf-config.json')); c['Enabled']=False; json.dump(c,open('/tmp/cf-config.json','w'))"
  aws cloudfront update-distribution --id $CF_DIST_ID --if-match $ETAG --distribution-config file:///tmp/cf-config.json 2>/dev/null || true
  echo "  ✓ CloudFront disabled"
else
  echo "  (skipped — update CF_DIST_ID in this script after first deploy)"
fi

echo ""
echo "=== Infrastructure stopped ==="
echo "Cost reduced from ~\$110/mo to ~\$1/mo"
echo ""
echo "To resume: run scripts/start-infra.sh"
