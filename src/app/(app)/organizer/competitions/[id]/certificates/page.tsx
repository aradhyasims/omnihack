import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { ActionForm, Checkbox, SubmitButton, TextInput } from "@/components/ui/form";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { db } from "@/server/db";
import { CERT_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { issueCertificatesAction, reissueCertificateAction, revokeCertificateAction, templateAction } from "../../../actions";
import { loadManaged } from "../load";

export default async function CertificatesAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { competition: c, can } = await loadManaged(id);
  if (!can("certificate.issue")) redirect(`/organizer/competitions/${id}`);
  const [certs, template] = await Promise.all([
    db.certificate.findMany({ where: { competitionId: id }, orderBy: [{ category: "asc" }, { recipientName: "asc" }] }),
    db.certificateTemplate.findUnique({ where: { competitionId: id } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bulk issue" description="Recipients are derived from recorded data. Re-running only adds missing certificates." />
          <ActionForm action={issueCertificatesAction.bind(null, id)} className="space-y-3 p-5">
            {Object.entries(CERT_LABEL).map(([k, l]) => (
              <Checkbox
                key={k}
                name="categories"
                value={k}
                label={l}
                hint={
                  k === "PARTICIPANT"
                    ? "Approved participants whose project submitted at least one stage"
                    : k === "FINALIST"
                      ? "Projects in the final judged stage (requires published results)"
                      : k === "WINNER"
                        ? "Members of prize-winning projects (requires published results)"
                        : undefined
                }
                defaultChecked={k === "PARTICIPANT"}
              />
            ))}
            {c.resultsStatus !== "PUBLISHED" ? (
              <p className="text-xs text-amber-700">Results are not published yet; finalist and winner certificates are unavailable.</p>
            ) : null}
            <SubmitButton>Issue certificates</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Template" description="OmniHack branding with your competition details. Leave signatory empty to omit it." />
          <ActionForm action={templateAction.bind(null, id)} className="grid gap-4 p-5 sm:grid-cols-2">
            <TextInput label="Heading" name="heading" defaultValue={template?.heading ?? "Certificate of Achievement"} className="sm:col-span-2" />
            <TextInput label="Additional line" name="bodyText" defaultValue={template?.bodyText ?? ""} className="sm:col-span-2" />
            <TextInput label="Signatory name" name="signatoryName" defaultValue={template?.signatoryName ?? ""} />
            <TextInput label="Signatory title" name="signatoryTitle" defaultValue={template?.signatoryTitle ?? ""} />
            <TextInput label="Accent colour" name="accentColor" type="color" defaultValue={template?.accentColor ?? "#4F46E5"} />
            <div className="sm:col-span-2">
              <SubmitButton variant="outline">Save template</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
      <Card>
        <CardHeader title={`Issued certificates (${certs.filter((x) => !x.revokedAt).length} valid)`} />
        <div className="overflow-x-auto">
          <table className="table-om">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Category</th>
                <th>Certificate ID</th>
                <th>Issued</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {certs.map((x) => (
                <tr key={x.id}>
                  <td className="font-semibold text-ink-900">{x.recipientName}</td>
                  <td>
                    {CERT_LABEL[x.category]}
                    {x.distinction && !x.distinction.includes("#") ? ` · ${x.distinction}` : ""}
                  </td>
                  <td>
                    <Link href={`/verify/${x.code}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {x.code}
                    </Link>
                    {x.revokedAt ? (
                      <Badge tone="danger" className="ml-2">
                        Revoked
                      </Badge>
                    ) : null}
                    {x.revokedReason ? <span className="block text-xs">{x.revokedReason}</span> : null}
                  </td>
                  <td className="text-xs">{formatDate(x.issuedAt, c.timezone)}</td>
                  <td className="whitespace-nowrap text-right">
                    {!x.revokedAt ? (
                      <span className="inline-flex gap-1">
                        <a href={`/api/v1/certificates/${x.code}/pdf`} className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                          PDF
                        </a>
                        <InlineAction action={reissueCertificateAction.bind(null, x.id)} variant="ghost">
                          Reissue
                        </InlineAction>
                        <ConfirmAction
                          action={revokeCertificateAction.bind(null, x.id)}
                          label="Revoke"
                          variant="ghost"
                          title={`Revoke ${x.code}?`}
                          description="Verification will show this certificate as revoked."
                          reasonLabel="Reason"
                          reasonRequired
                          confirmLabel="Revoke"
                        />
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {certs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center">
                    No certificates issued yet.
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
