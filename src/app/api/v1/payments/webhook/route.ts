// Payment provider webhook. Disabled until a provider adapter and secret are configured.
// When enabled it must verify the provider signature over the raw body (see processPaymentWebhook).
import { features } from "@/server/env";

export async function POST() {
  if (!features.payments()) {
    return Response.json({ error: { code: "UNAVAILABLE", message: "Payments are not enabled on this platform." } }, { status: 503 });
  }
  return Response.json({ error: { code: "UNAVAILABLE", message: "No payment provider adapter is implemented in this build." } }, { status: 503 });
}
