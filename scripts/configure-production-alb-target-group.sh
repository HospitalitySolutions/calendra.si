#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <target-group-arn>" >&2
  exit 2
fi

TARGET_GROUP_ARN="$1"
AWS_REGION="${AWS_REGION:-eu-central-1}"

# Match the application's real readiness probe rather than only checking Caddy.
aws elbv2 modify-target-group \
  --region "$AWS_REGION" \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --health-check-protocol HTTP \
  --health-check-port traffic-port \
  --health-check-path /api/actuator/health/readiness \
  --health-check-interval-seconds 15 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --matcher HttpCode=200

# Google OAuth/signup still stores short-lived authorization/signup state in the
# node-local HttpSession. ALB-generated cookie stickiness keeps that flow on the
# same EC2 target until Spring Session is externalized later.
aws elbv2 modify-target-group-attributes \
  --region "$AWS_REGION" \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --attributes \
    Key=stickiness.enabled,Value=true \
    Key=stickiness.type,Value=lb_cookie \
    Key=stickiness.lb_cookie.duration_seconds,Value=3600

echo "Configured readiness health checks and 1-hour ALB cookie stickiness for:"
echo "$TARGET_GROUP_ARN"
