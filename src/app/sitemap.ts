import type { MetadataRoute } from "next";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Only PUBLIC, published competitions and approved showcase projects are listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const staticPaths = [
    "",
    "/competitions",
    "/host",
    "/about",
    "/contact",
    "/resources",
    "/faq",
    "/winners",
    "/projects",
    "/privacy",
    "/terms",
    "/verify",
    "/opportunities",
    "/hire",
  ];
  const [competitions, projects] = await Promise.all([
    db.competition.findMany({
      where: { status: { in: ["PUBLISHED", "COMPLETED"] }, visibility: "PUBLIC" },
      select: { slug: true, updatedAt: true, resultsStatus: true },
    }),
    db.project.findMany({
      where: { showcaseStatus: "PUBLISHED", status: "ACTIVE", competition: { visibility: "PUBLIC" } },
      select: { id: true, updatedAt: true },
    }),
  ]);
  return [
    ...staticPaths.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const })),
    ...competitions.flatMap((c) => [
      { url: `${base}/competitions/${c.slug}`, lastModified: c.updatedAt },
      ...(c.resultsStatus === "PUBLISHED" ? [{ url: `${base}/competitions/${c.slug}/results`, lastModified: c.updatedAt }] : []),
    ]),
    ...projects.map((p) => ({ url: `${base}/projects/${p.id}`, lastModified: p.updatedAt })),
  ];
}
