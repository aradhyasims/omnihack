import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { InlineAction } from "@/components/ui/confirm";
import { requireAdminUser } from "@/server/auth/current";
import { systemQueues } from "@/server/modules/admin/service";
import { aiStatus } from "@/server/modules/optional/ai";
import { formatDateTime } from "@/lib/time";
import { retryEmailsAction } from "../actions";

export default async function SystemPage() {
  const admin = await requireAdminUser();
  const q = await systemQueues(admin);
  const integrations = [
    [
      "Email provider",
      process.env.EMAIL_PROVIDER === "resend"
        ? process.env.RESEND_API_KEY
          ? `Resend API from ${process.env.EMAIL_FROM ?? "no-reply@omnihack.tech"}`
          : "Resend selected but RESEND_API_KEY is missing — emails will fail"
        : process.env.EMAIL_PROVIDER === "smtp"
          ? process.env.SMTP_HOST
            ? `SMTP via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}`
            : "SMTP selected but SMTP_HOST is missing — emails will fail"
          : "Console (development) — emails are logged, not delivered",
      process.env.EMAIL_PROVIDER === "resend"
        ? process.env.RESEND_API_KEY
          ? "success"
          : "danger"
        : process.env.EMAIL_PROVIDER === "smtp"
          ? process.env.SMTP_HOST
            ? "success"
            : "danger"
          : "warning",
    ],
    [
      "File storage",
      process.env.STORAGE_DRIVER === "s3"
        ? `Amazon S3 bucket ${process.env.S3_BUCKET ?? "(S3_BUCKET missing)"}`
        : "Local private disk (single instance / shared volume only)",
      process.env.STORAGE_DRIVER === "s3" ? (process.env.S3_BUCKET ? "success" : "danger") : "warning",
    ],
    [
      "Malware scanning",
      process.env.MALWARE_SCANNER === "clamav"
        ? `ClamAV at ${process.env.CLAMAV_HOST ?? "127.0.0.1"}:${process.env.CLAMAV_PORT ?? 3310}`
        : "Not configured — uploads marked “not scanned”",
      process.env.MALWARE_SCANNER === "clamav" ? "success" : "warning",
    ],
    ["Payments", "Bank transfer with manual verification — hosting fees by OmniHack (Admin → Payments), entry fees by organizers", "neutral"],
    ["AI assistance", aiStatus().reason, "neutral"],
    [
      "Admin MFA enforcement",
      process.env.REQUIRE_ADMIN_MFA === "true" ? "Required" : "Not enforced (enable REQUIRE_ADMIN_MFA in production)",
      process.env.REQUIRE_ADMIN_MFA === "true" ? "success" : "warning",
    ],
  ] as const;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Integrations" description="Truthful status of external services in this deployment." />
        <ul className="divide-y divide-ink-100 text-sm">
          {integrations.map(([k, v, tone]) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="font-semibold">{k}</span>
              <Badge tone={tone}>{v}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Email outbox (latest 50)" action={<InlineAction action={retryEmailsAction}>Retry failed</InlineAction>} />
        <div className="overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {q.emails.map((e) => (
                <tr key={e.id}>
                  <td className="text-xs">{e.toEmail}</td>
                  <td className="text-xs">{e.subject}</td>
                  <td>
                    <Badge tone={e.status === "SENT" ? "success" : e.status === "FAILED" ? "danger" : "warning"}>{e.status.toLowerCase()}</Badge>
                    {e.lastError ? <span className="block text-[11px] text-rose-700">{e.lastError}</span> : null}
                  </td>
                  <td className="text-xs">{e.attempts}</td>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Background jobs (latest 50)" />
        <div className="overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Run at</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {q.jobs.map((j) => (
                <tr key={j.id}>
                  <td className="font-mono text-xs">{j.type}</td>
                  <td>
                    <Badge tone={j.status === "DONE" ? "success" : j.status === "FAILED" ? "danger" : "warning"}>{j.status.toLowerCase()}</Badge>
                  </td>
                  <td className="text-xs">
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(j.runAt)}</td>
                  <td className="text-xs text-rose-700">{j.lastError}</td>
                </tr>
              ))}
              {q.jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center">
                    No jobs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
