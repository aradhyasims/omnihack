import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().default(""),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  SESSION_MAX_DAYS: z.coerce.number().int().positive().default(14),
  REQUIRE_ADMIN_MFA: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("OmniHack <no-reply@omnihack.example>"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  MALWARE_SCANNER: z.enum(["none", "clamav"]).default("none"),
  PAYMENTS_PROVIDER: z.string().default(""),
  PAYMENTS_WEBHOOK_SECRET: z.string().default(""),
  AI_PROVIDER: z.string().default(""),
  AI_API_KEY: z.string().default(""),
  RUN_WORKER_IN_PROCESS: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    if (parsed.data.NODE_ENV === "production" && parsed.data.APP_SECRET.startsWith("dev-only")) {
      throw new Error("Refusing to start: development APP_SECRET used in production");
    }
    cached = parsed.data;
  }
  return cached;
}

export const features = {
  payments: () => Boolean(env().PAYMENTS_PROVIDER && env().PAYMENTS_WEBHOOK_SECRET),
  ai: () => Boolean(env().AI_PROVIDER && env().AI_API_KEY),
};
