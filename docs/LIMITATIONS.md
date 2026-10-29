# Known limitations, required services and future work

## External services and credentials required for production

The code for each integration below is implemented and tested. What remains is the **owner's account and credentials**, which must be created under the owner's control and were not created by this build.

| Service                               | Needed for                                      | Status in this build                                                                                                                                                                                    | What to supply                                                                             |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Managed PostgreSQL (AWS RDS)          | All data                                        | ✅ Standard `DATABASE_URL`; Terraform defines the instance                                                                                                                                              | AWS account, then `terraform apply`                                                        |
| Object storage (AWS S3)               | Uploaded files with more than one web instance  | ✅ `S3Driver`: KMS encryption, no-overwrite puts, 60-second pre-signed downloads issued only after authorization. Tested against a mocked AWS client, **not yet against a real bucket**                 | Bucket (Terraform creates it) and the ECS task role; set `STORAGE_DRIVER=s3`, `S3_BUCKET`  |
| Email delivery (Resend or any SMTP)   | Verification, reset, invitations, notifications | ✅ SMTP provider (nodemailer, pooled, STARTTLS required). Tested end to end against a real local SMTP server                                                                                            | Resend API key (or SMTP credentials), a verified sender domain, SPF/DKIM/DMARC            |
| Malware scanning (ClamAV)             | Upload safety                                   | ✅ clamd INSTREAM client, background scan job, downloads blocked until CLEAN, infected files deleted and the uploader notified. Tested against a protocol-compatible server using the EICAR test string | A ClamAV (`clamd`) sidecar or service with `CLAMAV_HOST`/`PORT`, and freshclam updates     |
| Payment gateway                       | Paid registrations                              | ⛔ Disabled. The signed-webhook verifier and idempotent processing exist, but there is no provider adapter                                                                                              | The business choice of provider (Razorpay or Stripe), account, keys and receipt rules      |
| AI provider                           | Optional assistance                             | ⛔ Disabled ("unavailable" state)                                                                                                                                                                       | Provider choice, key, data-processing agreement                                            |
| Domain and TLS (ACM)                  | HTTPS                                           | IaC references them                                                                                                                                                                                     | Domain and certificates                                                                    |
| AWS account and GitHub repository     | CI/CD                                           | Workflows written; Terraform passes `validate`                                                                                                                                                          | OIDC deploy role, environments, secrets                                                    |
| Error tracking (for example Sentry)   | Monitoring                                      | Not included                                                                                                                                                                                            | DSN, then wire into `runAction` and the API helper                                         |

## Functional limitations

- **No SSO** (Google, Microsoft or institutional SAML/OIDC). Each identity provider needs client credentials registered by the owner. Email and password plus TOTP MFA work today.
- **Payments and AI** are intentionally off until the owner selects providers (business and legal decisions).
- **Content management:** public page content lives in code; there is no CMS editor or blog (not in the approved scope).
- **REST API writes** cover registration and notifications; other writes use Server Actions (same services). There are no API tokens for third-party integrations yet.
- **Excel export:** CSV only (UTF-8 with BOM, opens in Excel).
- **Challenge supporting documents:** reference links only, no file uploads.
- **Account deletion:** export and deactivation are self-service; full deletion is handled through the privacy contact. Retention purges run daily (see SECURITY).
- **Rate limiting** is per instance (in memory). Use the WAF rate rule (in Terraform) for multi-instance deployments.
- **Camera QR scanning** relies on the browser BarcodeDetector API (Chromium-based browsers); handheld scanners and typed codes work everywhere.
- **Demo data:** clearly labelled and excluded from platform statistics. The seed refuses to run in production.

## Dependency notes

- Production dependencies: `npm audit --omit=dev` reports **0 vulnerabilities** (PostCSS and `deepmerge-ts` are pinned to patched versions via `overrides`).
- Dev-only tooling: `braces` (used through `eslint-config-next` → `fast-glob`/`micromatch`) has an advisory with **no patched release**. It only matches glob patterns from our own lint configuration at development time and is never shipped. Re-check with each Next.js release.

## Engineering follow-ups (priority order)

1. Create the owner's AWS account and repository, run `terraform plan/apply` for staging, run CI and deploy, and verify S3 and Resend against real services.
2. Run a PITR restore drill and a load test on staging hardware (the local results are in TEST-RESULTS).
3. Professional security review and penetration test; enable `REQUIRE_ADMIN_MFA`.
4. Add error tracking and the alarms in OPERATIONS.
5. Planned upgrades: Next.js 16 and Prisma 7 (config-file migration).
6. Backlog: SSO, payments (also needed for recruitment success-fee billing), ATS and calendar integrations for hiring, API tokens, an SQS-backed queue implementation, AI features with human-in-the-loop controls.
