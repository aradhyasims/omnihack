#!/usr/bin/env bash
# Run `prisma migrate deploy` as a one-off ECS task using the new image, before shifting traffic.
# Usage: run-migrations.sh <environment> <image>
set -euo pipefail
ENV="$1"; IMAGE="$2"; CLUSTER="omnihack-${ENV}"
TASK_DEF=$(aws ecs describe-task-definition --task-definition "omnihack-${ENV}-web" --query 'taskDefinition' --output json \
  | jq --arg img "$IMAGE" '.containerDefinitions[0].image=$img | {family, networkMode, requiresCompatibilities, cpu, memory, executionRoleArn, taskRoleArn, containerDefinitions}')
ARN=$(aws ecs register-task-definition --cli-input-json "$TASK_DEF" --query 'taskDefinition.taskDefinitionArn' --output text)
NET=$(aws ecs describe-services --cluster "$CLUSTER" --services web --query 'services[0].networkConfiguration' --output json)
TASK=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$ARN" --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"web","command":["node","migrator/node_modules/prisma/build/index.js","migrate","deploy","--schema","./prisma/schema.prisma"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK"
CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
[ "$CODE" = "0" ] || { echo "Migration task failed with exit code $CODE"; exit 1; }
echo "Migrations applied."
