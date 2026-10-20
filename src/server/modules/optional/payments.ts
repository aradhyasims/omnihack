// Optional payment module. It stays disabled until PAYMENTS_PROVIDER and PAYMENTS_WEBHOOK_SECRET are set
// AND a provider adapter is implemented. Registrations are never marked paid based on browser state:
// only a verified, signed webhook may change Payment/Registration status.
import crypto from "node:crypto";
import { db } from "../../db";
import { AppError } from "../../errors";
import { features } from "../../env";

export interface PaymentProvider {
  readonly name: string;
  /** Verify the provider signature over the raw body; return the parsed event or throw. */
  verifyWebhook(rawBody: string, signature: string | null): { id: string; type: string; reference: string; status: "PAID" | "FAILED" | "REFUNDED" };
}

/** HMAC-SHA256 verifier used as the reference adapter shape (provider-specific adapters plug in here). */
export function hmacVerifier(secret: string): PaymentProvider["verifyWebhook"] {
  return (raw, signature) => {
    if (!signature) throw new AppError("FORBIDDEN", "Missing signature");
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new AppError("FORBIDDEN", "Invalid signature");
    return JSON.parse(raw);
  };
}

export function paymentStatus() {
  return features.payments()
    ? { enabled: false, reason: `Provider "${process.env.PAYMENTS_PROVIDER}" is configured, but no adapter is implemented in this build.` }
    : { enabled: false, reason: "No payment provider configured." };
}

/** Idempotent webhook processing (unique provider+eventId). */
export async function processPaymentWebhook(provider: PaymentProvider, rawBody: string, signature: string | null) {
  const event = provider.verifyWebhook(rawBody, signature);
  const existing = await db.webhookEvent.findUnique({ where: { provider_eventId: { provider: provider.name, eventId: event.id } } });
  if (existing?.processedAt) return { duplicate: true };
  await db.$transaction(async (tx) => {
    await tx.webhookEvent.upsert({
      where: { provider_eventId: { provider: provider.name, eventId: event.id } },
      create: { provider: provider.name, eventId: event.id, payload: JSON.parse(rawBody), processedAt: new Date() },
      update: { processedAt: new Date() },
    });
    const payment = await tx.payment.findUnique({ where: { providerRef: event.reference } });
    if (!payment) return;
    await tx.payment.update({ where: { id: payment.id }, data: { status: event.status } });
    await tx.registration.update({ where: { id: payment.registrationId }, data: { paymentStatus: event.status } });
  });
  return { duplicate: false };
}
