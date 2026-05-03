import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./prisma/test.db",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000",
  OPERATOR_SESSION_SECRET: process.env.OPERATOR_SESSION_SECRET ?? "tablecapture-test-secret",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "tablecapture-test-session-secret",
};

const result = spawnSync("npx", ["prisma", "db", "push", "--force-reset"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

if (result.status === 0) {
  process.exit(0);
}

const devDb = resolve("prisma/dev.db");
const testDb = resolve("prisma/test.db");

if (existsSync(devDb)) {
  mkdirSync(dirname(testDb), { recursive: true });
  copyFileSync(devDb, testDb);
  console.warn("Prisma db push failed; copied prisma/dev.db to prisma/test.db as a schema fallback.");
  process.exit(0);
}

process.exit(result.status ?? 1);
