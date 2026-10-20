import { db } from "@/server/db";

// Liveness/readiness probe for load balancers (no sensitive data).
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
