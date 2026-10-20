# Operations: backups, recovery, monitoring and incidents

## Recovery objectives (proposed — confirm with the product owner)

| Objective          | Proposed target              | Mechanism                                                                 |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| RPO (data loss)    | ≤ 5 minutes                  | RDS automated backups with point-in-time recovery (14 days in production) |
| RTO (restore time) | ≤ 2 hours                    | PITR to a new instance and repoint `DATABASE_URL`                         |
| Files              | No loss of committed uploads | S3 versioning (STORAGE_DRIVER=s3); volume snapshots for local storage     |

These targets are proposals, not guarantees; they need sign-off and a timed restore drill on real infrastructure.

## Backups

1. **Production (primary):** RDS automated snapshots and PITR (Terraform `backup_retention_period`), plus a weekly `pg_dump -Fc` exported to a separate, access-restricted S3 bucket for long-term retention and cross-account safety.
2. **Logical backup tool (all environments):** `npm run backup -- <file>` writes every table to a gzip JSON file plus a SHA-256 checksum file. `npm run restore -- <file> --verify` restores into an **empty, migrated** database. It refuses to restore into a non-empty database, checks the checksum and migration list, and verifies row counts.
3. **Uploaded files:** back up `STORAGE_LOCAL_DIR` (or rely on S3 versioning) alongside the database. Attachment rows reference storage keys.

### Restore drill — executed 2026-10-20 (development)

```
npx tsx scripts/backup.ts backup-test.json.gz
→ {"tables":50,"rows":425,"sha256":"c250d605…"}
DATABASE_URL=…/omnihack_restore_check npx prisma migrate deploy   → 2 migrations applied
npx tsx scripts/restore.ts backup-test.json.gz --verify              → "Verified 50 tables, 425 rows." "Restore complete."
npx tsx scripts/restore.ts backup-test.json.gz (second run)          → refused: "Target database is not empty"
```

A PITR drill on RDS has **not** been performed (no AWS account). Schedule one per quarter: restore to a timestamp, run `/api/health` and the read-only smoke tests, and record the time taken.

## Monitoring and alerting

- **Health:** `GET /api/health` checks database connectivity (used by the ALB, ECS and Docker HEALTHCHECK).
- **Logs:** structured to stdout → CloudWatch (`/ecs/omnihack-<env>`). Server-action failures log a reference id that is also shown to the user (`Ref XXXXXX`). Every response carries `x-request-id`.
- **Recommended alarms:** ALB 5xx rate > 1% for 5 minutes; p95 latency > 1.5 s; RDS CPU > 80%, free storage < 20%, connections > 80%; ECS task restarts; **failed jobs > 0** and **failed emails > 0** (also visible under Admin → System); WAF blocked-request spikes.
- **Error tracking:** add Sentry (or similar) by wrapping `runAction` and the API helper. This is not included in this build.

## Dependency failures (behaviour)

| Dependency down | Behaviour                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Database        | Pages show the error page with a reference; `/api/health` returns 503; no partial writes, because writes are transactional |
| Email provider  | Messages stay in the outbox, retry up to 5 times with backoff, then are marked FAILED; admins can re-queue them            |
| Worker stopped  | Jobs and emails wait in the queue; jobs stuck in RUNNING for more than 10 minutes are reclaimed                            |
| Storage         | Upload fails before any database write; files written before a failed transaction are deleted                              |
| Payments / AI   | Disabled with explicit messages; the webhook returns 503                                                                   |

## Incident response

1. **Detect & triage:** alarm, user report or audit anomaly. Open an incident record (time, reporter, scope).
2. **Contain:** suspend accounts (Admin → Users); revoke sessions (`DELETE FROM "Session" WHERE "userId" = …`, or all sessions); rotate `APP_SECRET` (invalidates signed links); disable public access with a maintenance page if needed; block IPs in WAF.
3. **Investigate:** filter `AuditLog` by actor, competition or action; review CloudWatch logs by `x-request-id`.
4. **Recover:** fix forward, or PITR to a pre-incident timestamp in a new instance and reconcile.
5. **Notify:** affected users and organizers; regulators within statutory deadlines where personal data is involved (for example GDPR 72 hours, India DPDP Act rules). Legal counsel decides.
6. **Post-mortem:** within 5 working days, with action items tracked.

## Routine maintenance

- Weekly: review failed jobs and emails, and WAF and 5xx trends.
- Monthly: `npm audit`, dependency updates through PRs, and review admin accounts and MFA status.
- Quarterly: restore drill, access review and secret rotation plan.
- Before end of support: plan framework upgrades (Next.js, Prisma, Node LTS, PostgreSQL major).
