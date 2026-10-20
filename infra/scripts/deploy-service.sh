#!/usr/bin/env bash
# Register new task definitions with the given image and roll the web + worker services.
# ECS deployment circuit breaker rolls back automatically if new tasks fail health checks.
# Manual rollback: re-run this script with the previous image tag.
# Usage: deploy-service.sh <environment> <image>
set -euo pipefail
ENV="$1"; IMAGE="$2"; CLUSTER="omnihack-${ENV}"
for SVC in web worker; do
  FAMILY="omnihack-${ENV}-${SVC}"
  DEF=$(aws ecs describe-task-definition --task-definition "$FAMILY" --query 'taskDefinition' --output json \
    | jq --arg img "$IMAGE" '.containerDefinitions[0].image=$img | {family, networkMode, requiresCompatibilities, cpu, memory, executionRoleArn, taskRoleArn, containerDefinitions}')
  ARN=$(aws ecs register-task-definition --cli-input-json "$DEF" --query 'taskDefinition.taskDefinitionArn' --output text)
  aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --task-definition "$ARN" >/dev/null
done
aws ecs wait services-stable --cluster "$CLUSTER" --services web worker
echo "Deployed $IMAGE to $ENV."
