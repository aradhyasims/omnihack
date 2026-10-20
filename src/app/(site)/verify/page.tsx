import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Confirm that an OmniHack certificate is genuine and has not been revoked.",
  alternates: { canonical: "/verify" },
};

async function go(fd: FormData) {
  "use server";
  const code = String(fd.get("code") ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  redirect(`/verify/${encodeURIComponent(code || "-")}`);
}

export default function VerifyPage() {
  return (
    <>
      <PageHero
        eyebrow="Certificate verification"
        title="Verify a certificate"
        description="Enter the certificate ID printed on the certificate (for example OH-7K2M-9QXD-4TPL), or scan its QR code."
      />
      <div className="container-page max-w-xl py-14">
        <form action={go} className="card flex gap-2 p-4">
          <label htmlFor="code" className="sr-only">
            Certificate ID
          </label>
          <input
            id="code"
            name="code"
            required
            placeholder="OH-XXXX-XXXX-XXXX"
            className="h-11 flex-1 rounded-lg border border-ink-200 px-3 font-mono uppercase tracking-wider"
            autoComplete="off"
          />
          <button className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">Verify</button>
        </form>
      </div>
    </>
  );
}
