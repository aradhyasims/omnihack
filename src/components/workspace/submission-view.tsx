// Read-only rendering of submitted content (used by judges, mentors and organizers).
import { resolveFields } from "@/server/modules/submissions/fields";
import { signedFileUrl } from "@/server/modules/submissions/service";
import type { SubmissionTemplate } from "@prisma/client";
import { Badge } from "@/components/ui/primitives";

type Sub = {
  id: string;
  version: number;
  isLate: boolean;
  submittedAt: Date | null;
  content: unknown;
  stage: { name: string; submissionTemplate: SubmissionTemplate; submissionFields: unknown };
  attachments: { id: string; fieldKey: string; fileName: string; sizeBytes: number; scanStatus: string }[];
};

const SCAN_LABEL: Record<string, string> = {
  NOT_SCANNED: " · not malware-scanned",
  PENDING: " · malware scan in progress",
  CLEAN: " · scanned clean",
  INFECTED: " · BLOCKED: failed malware scan",
};

export function SubmissionView({ submission }: { submission: Sub }) {
  const fields = resolveFields(submission.stage.submissionTemplate, submission.stage.submissionFields);
  const content = (submission.content ?? {}) as Record<string, string | boolean>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{submission.stage.name}</h3>
        <Badge tone="success">v{submission.version}</Badge>
        {submission.isLate ? <Badge tone="warning">Late</Badge> : null}
        {submission.submittedAt ? <span className="text-xs text-ink-500">Submitted {submission.submittedAt.toUTCString()}</span> : null}
      </div>
      <dl className="space-y-4">
        {fields.map((f) => {
          if (f.type === "file" || f.type === "images") {
            const files = submission.attachments.filter((a) => a.fieldKey === f.key);
            if (!files.length) return null;
            return (
              <div key={f.key}>
                <dt className="text-sm font-semibold text-ink-800">{f.label}</dt>
                <dd className="mt-1 space-y-1">
                  {files.map((a) => (
                    <a key={a.id} href={signedFileUrl(a.id)} className="flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                      {a.fileName}{" "}
                      <span className="text-xs text-ink-400">
                        ({(a.sizeBytes / 1024).toFixed(0)} KB{SCAN_LABEL[a.scanStatus] ?? ""})
                      </span>
                    </a>
                  ))}
                </dd>
              </div>
            );
          }
          const v = content[f.key];
          if (v === undefined || v === "") return null;
          return (
            <div key={f.key}>
              <dt className="text-sm font-semibold text-ink-800">{f.type === "checkbox" ? "Declaration" : f.label}</dt>
              <dd className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-700">
                {f.type === "url" ? (
                  <a href={String(v)} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-brand-700 hover:underline">
                    {String(v)}
                  </a>
                ) : f.type === "checkbox" ? (
                  v ? (
                    "✓ " + f.label
                  ) : (
                    "Not confirmed"
                  )
                ) : (
                  String(v)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
