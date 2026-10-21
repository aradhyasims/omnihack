// Serves only uploaded *public* files from the public/ storage prefix: competition banners/logos, mentor photos,
// and event catalogs / final reports (PDF). PDFs open inline but sandboxed, so they can't script this origin.
import { storage } from "@/server/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (key[0] !== "public" || path.includes("..")) return new Response("Not found", { status: 404 });
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext]) return new Response("Not found", { status: 404 });
  try {
    const data = await storage().get(path);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[ext],
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        ...(ext === "pdf" ? { "Content-Disposition": "inline", "Content-Security-Policy": "sandbox" } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
