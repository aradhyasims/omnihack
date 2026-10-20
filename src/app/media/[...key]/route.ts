// Serves only uploaded *public* images (competition banners/logos) from the public/ storage prefix.
import { storage } from "@/server/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (key[0] !== "public" || path.includes("..")) return new Response("Not found", { status: 404 });
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext]) return new Response("Not found", { status: 404 });
  try {
    const data = await storage().get(path);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
