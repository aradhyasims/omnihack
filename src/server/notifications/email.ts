// Email provider abstraction. Messages are first written to the EmailOutbox table (durable,
// de-duplicated by dedupeKey) and delivered by the background worker with retries.
import nodemailer, { type Transporter } from "nodemailer";
import { brand } from "@/config/brand";
import { db } from "../db";

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Development provider: records delivery and logs the message (including links) to the server console. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage) {
    if (process.env.NODE_ENV !== "test") {
      console.info(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    }
  }
}

/**
 * SMTP delivery (works with any SMTP service, including Amazon SES's SMTP interface).
 * Env: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" for implicit TLS on 465), SMTP_USER, SMTP_PASS.
 * STARTTLS is required unless SMTP_ALLOW_INSECURE=true (local testing only).
 */
class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  constructor(private transporter: Transporter) {}
  async send(message: EmailMessage) {
    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? `${brand.name} <no-reply@omnihack.example>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/** Fails loudly (messages end up FAILED in the outbox) instead of pretending to send. */
class UnconfiguredProvider implements EmailProvider {
  constructor(
    readonly name: string,
    private reason: string,
  ) {}
  async send(): Promise<void> {
    throw new Error(this.reason);
  }
}

let smtpCache: { key: string; transporter: Transporter } | null = null;

function smtpProvider(): EmailProvider {
  const host = process.env.SMTP_HOST;
  if (!host) return new UnconfiguredProvider("smtp", "EMAIL_PROVIDER=smtp but SMTP_HOST is not set");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const key = [host, port, secure, user, process.env.SMTP_ALLOW_INSECURE].join("|");
  if (smtpCache?.key !== key) {
    smtpCache = {
      key,
      transporter: nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !secure && process.env.SMTP_ALLOW_INSECURE !== "true",
        auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
        pool: true,
        maxConnections: 3,
        connectionTimeout: 15_000,
        tls: process.env.SMTP_ALLOW_INSECURE === "true" ? { rejectUnauthorized: false } : undefined,
      }),
    };
  }
  return new SmtpEmailProvider(smtpCache.transporter);
}

let override: EmailProvider | null = null;
/** Test hook to inject a failing or capturing provider. */
export function setEmailProviderForTesting(p: EmailProvider | null) {
  override = p;
}

export function emailProvider(): EmailProvider {
  if (override) return override;
  const name = process.env.EMAIL_PROVIDER ?? "console";
  if (name === "console") return new ConsoleEmailProvider();
  if (name === "smtp") return smtpProvider();
  return new UnconfiguredProvider(name, `Unknown EMAIL_PROVIDER "${name}"`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderEmail(opts: { title: string; body: string; ctaLabel?: string; ctaUrl?: string }) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = opts.ctaUrl ? (opts.ctaUrl.startsWith("http") ? opts.ctaUrl : `${appUrl}${opts.ctaUrl}`) : undefined;
  const text = [opts.title, "", opts.body, url ? `\n${opts.ctaLabel ?? "Open"}: ${url}` : "", "", `— ${brand.name}`].join("\n");
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0b1020">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3e5f0">
<tr><td style="background:#0b1020;padding:20px 28px;color:#fff;font-weight:800;font-size:20px;letter-spacing:-0.02em">
<span style="color:#818cf8">◆</span> ${brand.name}</td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(opts.title)}</h1>${paragraphs}
${url ? `<p style="margin:22px 0 0"><a href="${escapeHtml(url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(opts.ctaLabel ?? "Open")}</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eef0f6;color:#6b7085;font-size:12px">You received this email because of activity on your ${brand.name} account.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

export async function queueEmail(opts: { to: string; subject: string; title?: string; body: string; ctaLabel?: string; ctaUrl?: string; dedupeKey?: string }) {
  const { text, html } = renderEmail({ title: opts.title ?? opts.subject, body: opts.body, ctaLabel: opts.ctaLabel, ctaUrl: opts.ctaUrl });
  await db.emailOutbox.createMany({
    data: [{ toEmail: opts.to, subject: `${opts.subject} · ${brand.name}`, text, html, dedupeKey: opts.dedupeKey }],
    skipDuplicates: true,
  });
}

const MAX_ATTEMPTS = 5;

/** Deliver queued emails. Failures are retried; after MAX_ATTEMPTS they are marked FAILED with the error kept. */
export async function drainOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  const provider = emailProvider();
  const batch = await db.emailOutbox.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const msg of batch) {
    try {
      await provider.send({ to: msg.toEmail, subject: msg.subject, text: msg.text, html: msg.html });
      await db.emailOutbox.update({
        where: { id: msg.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, provider: provider.name, lastError: null },
      });
      sent++;
    } catch (e) {
      const attempts = msg.attempts + 1;
      await db.emailOutbox.update({
        where: { id: msg.id },
        data: {
          attempts,
          lastError: String(e instanceof Error ? e.message : e).slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
          provider: provider.name,
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}
