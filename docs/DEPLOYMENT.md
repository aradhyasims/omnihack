# Installation and deployment

## 1. Local installation

See the README quick start. On Windows without Node on PATH, prefix commands with the Node install directory (for example `$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;" + $env:Path`).

## 2. Environment variables

| Variable                                       | Required     | Description                                                                                                                                                                        |
| ---------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                     | yes          | `development` \| `test` \| `production`                                                                                                                                            |
| `APP_URL`                                      | yes          | Public base URL (canonical URLs, emails, QR codes, sitemap)                                                                                                                        |
| `DATABASE_URL`                                 | yes          | PostgreSQL connection string (production: `sslmode=require`)                                                                                                                       |
| `APP_SECRET`                                   | yes          | ≥32 random characters; signs file URLs and hashes IPs. Production refuses the development value. Rotating it invalidates outstanding signed links.                                 |
| `ENCRYPTION_KEY`                               | for MFA      | 32 bytes, base64; AES-256-GCM key for MFA secrets. **Do not rotate without re-encrypting** (users would have to set up MFA again).                                                 |
| `SESSION_TTL_HOURS` / `SESSION_MAX_DAYS`       | no           | Sliding and absolute session lifetime (12 / 14)                                                                                                                                    |
| `REQUIRE_ADMIN_MFA`                            | prod: `true` | Enforce MFA for platform admins                                                                                                                                                    |
| `EMAIL_PROVIDER` / `EMAIL_FROM`                | yes          | `console` (development) or `smtp` (production: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`; works with Amazon SES SMTP). STARTTLS is required.               |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR`         | yes          | `local` (a private directory; mount a persistent volume) or `s3` (`S3_BUCKET`, `S3_REGION`, `S3_SSE`, optional `S3_KMS_KEY_ID`/`S3_ENDPOINT`; credentials from the ECS task role). |
| `MAX_UPLOAD_MB`                                | no           | Per-file upload limit (default 25)                                                                                                                                                 |
| `MALWARE_SCANNER`                              | no           | `none` (files are labelled "not scanned") or `clamav` (`CLAMAV_HOST`, `CLAMAV_PORT`; files are blocked until scanned clean)                                                        |
| `PAYMENTS_PROVIDER`, `PAYMENTS_WEBHOOK_SECRET` | no           | Payments stay disabled unless both are set **and** an adapter exists                                                                                                               |
| `AI_PROVIDER`, `AI_API_KEY`                    | no           | AI stays disabled unless configured **and** an adapter exists                                                                                                                      |
| `RUN_WORKER_IN_PROCESS`                        | no           | `true` (default) runs the worker inside the web process; set `false` when running the worker container                                                                             |
| `SEED_ADMIN_PASSWORD`                          | dev only     | Password for demo accounts                                                                                                                                                         |

## 3. Database migrations

- Create: `npx prisma migrate dev --name <change>`, then review the generated SQL in `prisma/migrations/` and commit it.
- Apply in staging and production: `npx prisma migrate deploy` (one-off task **before** new code takes traffic).
- CI checks that the migrations reproduce `schema.prisma` (`prisma migrate diff --exit-code`).
- Prefer additive, backward-compatible migrations (expand → deploy → contract) so the previous release keeps working during a rollback.
- Current migrations: `init` (complete schema) and `media_fields` (banner and logo keys).

## 4. Single-host deployment (Docker Compose)

```bash
cp .env.example .env   # set APP_URL, APP_SECRET, ENCRYPTION_KEY, REQUIRE_ADMIN_MFA=true, NODE_ENV=production
docker compose up --build -d   # postgres → migrate (one-off) → web + worker
```

Put a TLS-terminating reverse proxy (Caddy, nginx or a cloud load balancer) in front of port 3000, and back up the `pgdata` and `storage` volumes. _Note: Docker was not available in the build environment, so this path has not been executed. See TEST-RESULTS._

## 5. AWS production deployment (target architecture)

Terraform in `infra/terraform` (**not yet applied**) provisions: a VPC with private subnets; RDS PostgreSQL 17 (encrypted, Multi-AZ in production, 14-day PITR, deletion protection); a private, versioned, KMS-encrypted S3 bucket; an ECR repository (immutable tags, scan on push); an ECS Fargate cluster with **web** and **worker** services (deployment circuit breaker with automatic rollback); an ALB over TLS 1.3; CloudFront with a WAF (AWS managed common rules and an IP rate limit); an SQS queue with a dead-letter queue; Secrets Manager; and CloudWatch logs.

Steps:

1. Create the state bucket and lock table, configure the backend, and create ACM certificates (regional for the ALB, us-east-1 for CloudFront).
2. `terraform init && terraform plan -var environment=staging -var app_url=... -var image_tag=... -var acm_certificate_arn=... -var cloudfront_certificate_arn=...`
3. Put `APP_SECRET` and `ENCRYPTION_KEY` into the Secrets Manager secret `omnihack-<env>/app`.
4. Configure GitHub: an OIDC deploy role (`AWS_DEPLOY_ROLE_ARN`), `AWS_REGION`, and staging/production URLs; add required reviewers to the `production` environment (manual approval gate).
5. Tag a release (`v1.2.3`): `.github/workflows/deploy.yml` builds and pushes the image, runs migrations as a one-off ECS task, deploys staging, smoke-tests `/api/health`, waits for approval, then deploys production.

**Before production:** set `STORAGE_DRIVER=s3` (required with multiple web tasks, since local disk is not shared), `EMAIL_PROVIDER=smtp` with SES SMTP credentials, and `MALWARE_SCANNER=clamav` with a clamd sidecar; enable `REQUIRE_ADMIN_MFA`; and complete a security review. Optional `RETENTION_*_DAYS` variables tune the daily purge.

## 6. Low-cost hosting: Render + Supabase (current live setup)

| Piece        | Where                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web app      | Render web service `omnihack` (Docker, Singapore, free plan). Defined in `render.yaml`.                                                                                        |
| Worker       | Inside the web process (`src/instrumentation.ts`). On the free plan it pauses while the service sleeps.                                                                        |
| Database     | Supabase project `omnihack` (`ap-southeast-1`). Uses the `omnihack` schema, owned by the dedicated `omnihack_app` role. The schema is not exposed through Supabase's REST API. |
| File storage | Supabase Storage private bucket `omnihack-files`, accessed through its S3-compatible API.                                                                                      |

**Connection string.** Use the session pooler, which is IPv4 and supports prepared statements:

```
postgresql://omnihack_app.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=omnihack&sslmode=require&connection_limit=5
```

**Migrations** run on every start: `prisma migrate deploy && node server.js`. Migrations are expand-only, so this is safe.

**File storage.** Create S3 access keys in Supabase Dashboard → Storage → S3 Connection, then set these on Render:

```
STORAGE_DRIVER=s3
S3_BUCKET=omnihack-files
S3_REGION=ap-southeast-1
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_FORCE_PATH_STYLE=true
S3_SSE=none
S3_CONDITIONAL_PUT=false
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
```

Until then, uploads use local disk. That disk is wiped whenever Render restarts or redeploys the service.

**Email.** Set `EMAIL_PROVIDER=smtp` and the `SMTP_*` settings (for example Brevo, Resend, SendGrid, or Gmail with an app password). Otherwise verification and notification emails are only written to the Render logs.

**Free-plan limits:**

- The service sleeps after 15 minutes without traffic, so the first request then takes about 30–60 seconds.
- Supabase free projects pause after a week of inactivity.
- Use paid plans for real events.

## 7. Rollback

- **Application:** ECS circuit breaker rolls back failed deployments automatically. For a manual rollback, run `infra/scripts/deploy-service.sh <env> <previous-image>`.
- **Database:** migrations are expand-only by policy, so the previous image runs against the new schema. For a destructive mistake, restore from point-in-time recovery (OPERATIONS).
