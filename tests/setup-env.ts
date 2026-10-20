// Test environment: always the dedicated test database, never the development one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://omnihack:omnihack@localhost:5433/omnihack_test?schema=public";
process.env.APP_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL = "http://localhost:3000";
process.env.EMAIL_PROVIDER = "console";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./.data/test-storage";
process.env.RUN_WORKER_IN_PROCESS = "false";
(process.env as Record<string, string>).NODE_ENV = "test";
